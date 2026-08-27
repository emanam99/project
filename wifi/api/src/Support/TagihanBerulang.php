<?php

namespace App\Support;

use App\Config\Database;
use PDO;

/**
 * Template tagihan bulanan + generator untuk cron tanggal 1.
 */
final class TagihanBerulang
{
    public static function pdo(): PDO
    {
        return Database::getInstance();
    }

    public static function labelPeriode(int $bulan, int $tahun): string
    {
        static $names = [
            1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April',
            5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus',
            9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
        ];
        return ($names[$bulan] ?? (string) $bulan) . ' ' . $tahun;
    }

    public static function computeJatuhTempo(int $bulan, int $tahun, int $hari): string
    {
        $hari = max(1, min(31, $hari));
        $last = (int) (new \DateTimeImmutable(sprintf('%04d-%02d-01', $tahun, $bulan)))
            ->modify('last day of this month')
            ->format('j');
        $day = min($hari, $last);
        return sprintf('%04d-%02d-%02d', $tahun, $bulan, $day);
    }

    /**
     * @param list<int> $pelangganIds
     * @return list<int> id template berulang
     */
    public static function upsertTemplates(
        array $pelangganIds,
        float $nominal,
        ?string $keterangan,
        int $jatuhTempoHari,
        ?int $createdBy
    ): array {
        $pdo = self::pdo();
        $jatuhTempoHari = max(1, min(31, $jatuhTempoHari));
        $ket = $keterangan !== null && trim($keterangan) !== '' ? trim($keterangan) : null;

        $find = $pdo->prepare(
            'SELECT id FROM tagihan_berulang
             WHERE pelanggan_id = ? AND nominal = ? AND aktif = 1
             LIMIT 1'
        );
        $upd = $pdo->prepare(
            'UPDATE tagihan_berulang
             SET keterangan = ?, jatuh_tempo_hari = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );
        $ins = $pdo->prepare(
            'INSERT INTO tagihan_berulang (pelanggan_id, nominal, keterangan, jatuh_tempo_hari, aktif, created_by)
             VALUES (?, ?, ?, ?, 1, ?)'
        );

        $ids = [];
        foreach ($pelangganIds as $pid) {
            $pid = (int) $pid;
            if ($pid <= 0) {
                continue;
            }
            $find->execute([$pid, $nominal]);
            $row = $find->fetch();
            if ($row) {
                $id = (int) $row['id'];
                $upd->execute([$ket, $jatuhTempoHari, $id]);
                $ids[] = $id;
            } else {
                $ins->execute([$pid, $nominal, $ket, $jatuhTempoHari, $createdBy]);
                $ids[] = (int) $pdo->lastInsertId();
            }
        }
        return $ids;
    }

    /** Map pelanggan_id => berulang_id untuk set yang baru di-upsert. */
    public static function mapPelangganToBerulangId(array $berulangIds): array
    {
        if (!$berulangIds) {
            return [];
        }
        $pdo = self::pdo();
        $ph = implode(',', array_fill(0, count($berulangIds), '?'));
        $stmt = $pdo->prepare("SELECT id, pelanggan_id FROM tagihan_berulang WHERE id IN ($ph)");
        $stmt->execute(array_values($berulangIds));
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[(int) $row['pelanggan_id']] = (int) $row['id'];
        }
        return $map;
    }

    /**
     * Buat tagihan untuk semua template aktif pada periode tertentu (idempotent).
     *
     * @return array{created:int,skipped:int,errors:list<string>,periode:string}
     */
    public static function generateForPeriod(int $bulan, int $tahun): array
    {
        $pdo = self::pdo();
        $periodeKey = sprintf('%04d-%02d', $tahun, $bulan);
        $nama = self::labelPeriode($bulan, $tahun);

        $stmt = $pdo->query(
            'SELECT b.* FROM tagihan_berulang b
             INNER JOIN pelanggan p ON p.id = b.pelanggan_id
             WHERE b.aktif = 1 AND p.aktif = 1
             ORDER BY b.id ASC'
        );
        $templates = $stmt->fetchAll();

        $exists = $pdo->prepare(
            'SELECT id FROM tagihan
             WHERE berulang_id = ? AND periode_bulan = ? AND periode_tahun = ?
             LIMIT 1'
        );
        $ins = $pdo->prepare(
            'INSERT INTO tagihan (pelanggan_id, nama, nominal, periode_bulan, periode_tahun, jatuh_tempo, keterangan, berulang_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $mark = $pdo->prepare(
            'UPDATE tagihan_berulang SET last_run_periode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );

        $created = 0;
        $skipped = 0;
        $errors = [];

        foreach ($templates as $t) {
            $bid = (int) $t['id'];
            try {
                $exists->execute([$bid, $bulan, $tahun]);
                if ($exists->fetch()) {
                    $skipped++;
                    $mark->execute([$periodeKey, $bid]);
                    continue;
                }
                $hari = (int) ($t['jatuh_tempo_hari'] ?? 10);
                $jatuh = self::computeJatuhTempo($bulan, $tahun, $hari);
                $ins->execute([
                    (int) $t['pelanggan_id'],
                    $nama,
                    (float) $t['nominal'],
                    $bulan,
                    $tahun,
                    $jatuh,
                    $t['keterangan'],
                    $bid,
                ]);
                $mark->execute([$periodeKey, $bid]);
                $created++;
            } catch (\Throwable $e) {
                $errors[] = 'berulang #' . $bid . ': ' . $e->getMessage();
            }
        }

        return [
            'created' => $created,
            'skipped' => $skipped,
            'errors' => $errors,
            'periode' => $periodeKey,
            'templates' => count($templates),
        ];
    }

    public static function listForPelanggan(?int $pelangganId = null): array
    {
        $pdo = self::pdo();
        $sql = '
            SELECT b.*, p.nama AS nama_pelanggan
            FROM tagihan_berulang b
            INNER JOIN pelanggan p ON p.id = b.pelanggan_id
            WHERE b.aktif = 1
        ';
        $bind = [];
        if ($pelangganId !== null && $pelangganId > 0) {
            $sql .= ' AND b.pelanggan_id = :pid';
            $bind['pid'] = $pelangganId;
        }
        $sql .= ' ORDER BY p.nama ASC, b.id ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($bind);
        return array_map(static function ($r) {
            return [
                'id' => (int) $r['id'],
                'pelanggan_id' => (int) $r['pelanggan_id'],
                'nama_pelanggan' => $r['nama_pelanggan'],
                'nominal' => (float) $r['nominal'],
                'keterangan' => $r['keterangan'],
                'jatuh_tempo_hari' => (int) $r['jatuh_tempo_hari'],
                'aktif' => (bool) $r['aktif'],
                'last_run_periode' => $r['last_run_periode'],
                'created_at' => $r['created_at'],
            ];
        }, $stmt->fetchAll());
    }

    public static function deactivate(int $id): bool
    {
        $stmt = self::pdo()->prepare(
            'UPDATE tagihan_berulang SET aktif = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND aktif = 1'
        );
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }
}
