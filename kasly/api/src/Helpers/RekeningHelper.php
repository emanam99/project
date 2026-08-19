<?php

namespace App\Helpers;

use App\Controllers\KategoriController;
use PDO;

class RekeningHelper
{
    public static function normalizeTipe(?string $tipe): ?string
    {
        $tipe = strtolower(trim((string) $tipe));
        return in_array($tipe, ['bank', 'ewallet', 'cash'], true) ? $tipe : null;
    }

    public static function cashId(PDO $db): int
    {
        $id = (int) $db->query("SELECT id FROM rekening WHERE tipe = 'cash' AND is_system = 1 LIMIT 1")->fetchColumn();
        if ($id > 0) {
            return $id;
        }
        $db->exec("INSERT INTO rekening (nama, tipe, nomor, is_system, aktif, sort_order) VALUES ('Cash', 'cash', NULL, 1, 1, 0)");
        return (int) $db->lastInsertId();
    }

    /** Catatan pengeluaran untuk biaya admin pindah dana, dialokasikan ke rekening asal. */
    public static function createKeluarBiayaAdmin(
        PDO $db,
        string $tanggal,
        int $rekeningId,
        float $jumlah,
        string $keterangan,
        ?int $userId
    ): int {
        $jumlah = round($jumlah, 2);
        if ($jumlah <= 0) {
            throw new \InvalidArgumentException('Biaya admin harus lebih dari 0');
        }

        $kategori = 'Biaya admin';
        KategoriController::ensureKategori($db, $kategori, 'keluar');

        $ins = $db->prepare(
            'INSERT INTO belanja (tanggal, jenis, keterangan, kategori, total, created_by)
             VALUES (?, \'keluar\', ?, ?, ?, ?)'
        );
        $ins->execute([
            $tanggal,
            $keterangan !== '' ? $keterangan : null,
            $kategori,
            $jumlah,
            $userId,
        ]);
        $belanjaId = (int) $db->lastInsertId();

        $item = $db->prepare(
            'INSERT INTO belanja_item (belanja_id, nama_barang, qty, satuan, harga_satuan, subtotal, catatan)
             VALUES (?, ?, 1, ?, ?, ?, NULL)'
        );
        $item->execute([$belanjaId, 'Biaya admin pindah dana', 'kali', $jumlah, $jumlah]);

        self::saveAlokasi($db, $belanjaId, [
            ['rekening_id' => $rekeningId, 'jumlah' => $jumlah],
        ], $jumlah);

        return $belanjaId;
    }

    public static function rekeningAktif(PDO $db, int $id): ?array
    {
        $stmt = $db->prepare('SELECT * FROM rekening WHERE id = ? AND aktif = 1 LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /** @return array<int, float> */
    public static function saldoMap(PDO $db): array
    {
        $ids = $db->query('SELECT id FROM rekening')->fetchAll(PDO::FETCH_COLUMN);
        $map = [];
        foreach ($ids as $id) {
            $map[(int) $id] = 0.0;
        }

        $alokasi = $db->query(
            "SELECT a.rekening_id,
                    COALESCE(SUM(CASE WHEN b.jenis = 'masuk' THEN a.jumlah ELSE 0 END), 0) AS masuk,
                    COALESCE(SUM(CASE WHEN b.jenis = 'keluar' THEN a.jumlah ELSE 0 END), 0) AS keluar
             FROM belanja_alokasi a
             INNER JOIN belanja b ON b.id = a.belanja_id
             GROUP BY a.rekening_id"
        )->fetchAll();
        foreach ($alokasi as $row) {
            $id = (int) $row['rekening_id'];
            $map[$id] = ($map[$id] ?? 0) + (float) $row['masuk'] - (float) $row['keluar'];
        }

        $keluarTf = $db->query(
            'SELECT dari_rekening_id AS id, COALESCE(SUM(jumlah), 0) AS total FROM rekening_transfer GROUP BY dari_rekening_id'
        )->fetchAll();
        foreach ($keluarTf as $row) {
            $id = (int) $row['id'];
            $map[$id] = ($map[$id] ?? 0) - (float) $row['total'];
        }

        $masukTf = $db->query(
            'SELECT ke_rekening_id AS id, COALESCE(SUM(jumlah), 0) AS total FROM rekening_transfer GROUP BY ke_rekening_id'
        )->fetchAll();
        foreach ($masukTf as $row) {
            $id = (int) $row['id'];
            $map[$id] = ($map[$id] ?? 0) + (float) $row['total'];
        }

        return $map;
    }

    public static function listWithSaldo(PDO $db, bool $aktifOnly = false): array
    {
        $sql = 'SELECT * FROM rekening';
        if ($aktifOnly) {
            $sql .= ' WHERE aktif = 1';
        }
        $sql .= ' ORDER BY FIELD(tipe, "cash", "bank", "ewallet"), sort_order ASC, nama ASC';
        $rows = $db->query($sql)->fetchAll();
        $saldo = self::saldoMap($db);
        foreach ($rows as &$row) {
            $row['saldo'] = round($saldo[(int) $row['id']] ?? 0, 2);
        }
        unset($row);
        return $rows;
    }

    public static function listAlokasiMany(PDO $db, array $belanjaIds): array
    {
        $belanjaIds = array_values(array_filter(array_map('intval', $belanjaIds)));
        if ($belanjaIds === []) {
            return [];
        }
        $in = implode(',', $belanjaIds);
        $rows = $db->query(
            "SELECT a.id, a.belanja_id, a.rekening_id, a.jumlah, r.nama AS rekening_nama, r.tipe AS rekening_tipe
             FROM belanja_alokasi a
             INNER JOIN rekening r ON r.id = a.rekening_id
             WHERE a.belanja_id IN ($in)
             ORDER BY a.id ASC"
        )->fetchAll();
        $grouped = [];
        foreach ($rows as $row) {
            $grouped[(int) $row['belanja_id']][] = $row;
        }
        return $grouped;
    }

    public static function listAlokasi(PDO $db, int $belanjaId): array
    {
        $stmt = $db->prepare(
            'SELECT a.id, a.belanja_id, a.rekening_id, a.jumlah, r.nama AS rekening_nama, r.tipe AS rekening_tipe
             FROM belanja_alokasi a
             INNER JOIN rekening r ON r.id = a.rekening_id
             WHERE a.belanja_id = ?
             ORDER BY a.id ASC'
        );
        $stmt->execute([$belanjaId]);
        return $stmt->fetchAll();
    }

    public static function alokasiLabel(array $alokasi): string
    {
        $parts = [];
        foreach ($alokasi as $row) {
            $nama = (string) ($row['rekening_nama'] ?? '');
            $jumlah = (float) ($row['jumlah'] ?? 0);
            if ($nama === '') {
                continue;
            }
            $parts[] = $nama . ' ' . number_format($jumlah, 0, ',', '.');
        }
        return implode(' · ', $parts);
    }

    /**
     * @param list<array{rekening_id?:mixed,jumlah?:mixed}> $rows
     */
    public static function saveAlokasi(PDO $db, int $belanjaId, array $rows, float $expectedTotal): void
    {
        $merged = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rid = (int) ($row['rekening_id'] ?? 0);
            $jumlah = round((float) ($row['jumlah'] ?? 0), 2);
            if ($rid <= 0 || $jumlah <= 0) {
                continue;
            }
            if (!self::rekeningAktif($db, $rid)) {
                throw new \InvalidArgumentException('Rekening tidak ditemukan atau tidak aktif');
            }
            $merged[$rid] = ($merged[$rid] ?? 0) + $jumlah;
        }

        $expectedTotal = round($expectedTotal, 2);
        if ($merged === []) {
            if ($expectedTotal <= 0) {
                $db->prepare('DELETE FROM belanja_alokasi WHERE belanja_id = ?')->execute([$belanjaId]);
                return;
            }
            $merged[self::cashId($db)] = $expectedTotal;
        }

        $sum = round(array_sum($merged), 2);
        if (abs($sum - $expectedTotal) > 0.009) {
            throw new \InvalidArgumentException(
                'Jumlah alokasi rekening (' . number_format($sum, 0, ',', '.')
                . ') harus sama dengan total catatan (' . number_format($expectedTotal, 0, ',', '.') . ')'
            );
        }

        $db->prepare('DELETE FROM belanja_alokasi WHERE belanja_id = ?')->execute([$belanjaId]);
        $ins = $db->prepare('INSERT INTO belanja_alokasi (belanja_id, rekening_id, jumlah) VALUES (?, ?, ?)');
        foreach ($merged as $rid => $jumlah) {
            $ins->execute([$belanjaId, $rid, $jumlah]);
        }
    }

    public static function syncAlokasiToTotal(PDO $db, int $belanjaId): void
    {
        $total = (float) $db->query('SELECT total FROM belanja WHERE id = ' . (int) $belanjaId)->fetchColumn();
        $rows = self::listAlokasi($db, $belanjaId);
        if ($rows === []) {
            self::saveAlokasi($db, $belanjaId, [], $total);
            return;
        }
        if (count($rows) === 1) {
            self::saveAlokasi($db, $belanjaId, [[
                'rekening_id' => (int) $rows[0]['rekening_id'],
                'jumlah' => $total,
            ]], $total);
            return;
        }

        $oldSum = 0.0;
        foreach ($rows as $row) {
            $oldSum += (float) $row['jumlah'];
        }
        $scaled = [];
        if ($oldSum <= 0 || $total <= 0) {
            $scaled[] = ['rekening_id' => (int) $rows[0]['rekening_id'], 'jumlah' => $total];
        } else {
            $assigned = 0.0;
            $last = count($rows) - 1;
            foreach ($rows as $i => $row) {
                if ($i === $last) {
                    $jumlah = round($total - $assigned, 2);
                } else {
                    $jumlah = round(((float) $row['jumlah'] / $oldSum) * $total, 2);
                    $assigned += $jumlah;
                }
                if ($jumlah > 0) {
                    $scaled[] = ['rekening_id' => (int) $row['rekening_id'], 'jumlah' => $jumlah];
                }
            }
        }
        self::saveAlokasi($db, $belanjaId, $scaled, $total);
    }

    public static function ringkasByTipe(array $rekeningRows): array
    {
        $out = ['bank' => 0.0, 'ewallet' => 0.0, 'cash' => 0.0];
        foreach ($rekeningRows as $row) {
            $tipe = (string) ($row['tipe'] ?? '');
            if (isset($out[$tipe])) {
                $out[$tipe] += (float) ($row['saldo'] ?? 0);
            }
        }
        return [
            'bank' => round($out['bank'], 2),
            'ewallet' => round($out['ewallet'], 2),
            'cash' => round($out['cash'], 2),
        ];
    }
}
