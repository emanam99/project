<?php

declare(strict_types=1);

use App\Helpers\AlumniHelper;
use App\Helpers\NikHelper;
use Phinx\Migration\AbstractMigration;

/**
 * Tabel alumni + seed dari santri___boyong (NIK 16 digit + TTL valid).
 */
final class AlumniTableAndSeedBoyong extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('alumni')) {
            $this->table('alumni', ['id' => false, 'primary_key' => ['id']])
                ->addColumn('id', 'integer', ['identity' => true, 'signed' => true])
                ->addColumn('id_alumni', 'integer', ['limit' => 7, 'signed' => true, 'null' => false])
                ->addColumn('nama', 'string', ['limit' => 255, 'null' => false])
                ->addColumn('nik', 'string', ['limit' => 16, 'null' => false])
                ->addColumn('gender', 'string', ['limit' => 20, 'null' => true])
                ->addColumn('nomor_hp', 'string', ['limit' => 20, 'null' => true])
                ->addColumn('tempat_lahir', 'string', ['limit' => 100, 'null' => true])
                ->addColumn('tanggal_lahir', 'date', ['null' => true])
                ->addColumn('dusun', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('rt', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('rw', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('desa', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('kecamatan', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('kabupaten', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('provinsi', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('kode_pos', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('ayah', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('ibu', 'string', ['limit' => 255, 'null' => true])
                ->addColumn('tahun_masuk_masehi', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('tahun_masuk_hijriyah', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('tahun_boyong_masehi', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('tahun_boyong_hijriyah', 'string', ['limit' => 10, 'null' => true])
                ->addColumn('id_santri', 'integer', ['signed' => true, 'null' => true])
                ->addColumn('tanggal_dibuat', 'timestamp', ['default' => 'CURRENT_TIMESTAMP', 'null' => false])
                ->addColumn('tanggal_update', 'timestamp', [
                    'default' => 'CURRENT_TIMESTAMP',
                    'update' => 'CURRENT_TIMESTAMP',
                    'null' => false,
                ])
                ->addIndex(['id_alumni'], ['unique' => true, 'name' => 'uniq_alumni_id_alumni'])
                ->addIndex(['nik'], ['unique' => true, 'name' => 'uniq_alumni_nik'])
                ->addIndex(['id_santri'], ['name' => 'idx_alumni_id_santri'])
                ->create();
        }

        $this->seedFromBoyong();
    }

    private function seedFromBoyong(): void
    {
        if (!$this->hasTable('santri___boyong') || !$this->hasTable('santri') || !$this->hasTable('alumni')) {
            return;
        }

        $pdo = $this->getAdapter()->getConnection();

        $sql = <<<'SQL'
SELECT b.id_santri, b.tahun_hijriyah, b.tahun_masehi, b.tanggal_dibuat,
       s.nama, s.nik, s.gender, s.tempat_lahir, s.tanggal_lahir, s.no_telpon,
       s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kabupaten, s.provinsi, s.kode_pos,
       s.ayah, s.ibu
FROM santri___boyong b
INNER JOIN santri s ON s.id = b.id_santri
INNER JOIN (
  SELECT id_santri, MAX(id) AS max_id
  FROM santri___boyong
  GROUP BY id_santri
) latest ON latest.max_id = b.id
ORDER BY b.id ASC
SQL;

        $rows = $pdo->query($sql)->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            return;
        }

        $checkNik = $pdo->prepare('SELECT id FROM alumni WHERE nik = ? LIMIT 1');
        $insert = $pdo->prepare(
            'INSERT INTO alumni (
                id_alumni, nama, nik, gender, nomor_hp, tempat_lahir, tanggal_lahir,
                dusun, rt, rw, desa, kecamatan, kabupaten, provinsi, kode_pos,
                ayah, ibu, tahun_masuk_masehi, tahun_masuk_hijriyah,
                tahun_boyong_masehi, tahun_boyong_hijriyah, id_santri
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?
            )'
        );

        foreach ($rows as $row) {
            $nikRaw = (string) ($row['nik'] ?? '');
            $nikCheck = NikHelper::validate($nikRaw);
            if (!$nikCheck['valid'] || $nikCheck['normalized'] === null) {
                continue;
            }
            $nik = $nikCheck['normalized'];

            $checkNik->execute([$nik]);
            if ($checkNik->fetch(\PDO::FETCH_ASSOC)) {
                continue;
            }

            $nama = trim((string) ($row['nama'] ?? ''));
            if ($nama === '') {
                continue;
            }

            $gender = AlumniHelper::normalizeGender($row['gender'] ?? null)
                ?? AlumniHelper::inferGenderFromNik($nik);
            if ($gender === null) {
                continue;
            }

            $tahunBoyongH = AlumniHelper::normalizeYear($row['tahun_hijriyah'] ?? null);
            $tahunBoyongM = AlumniHelper::normalizeYear($row['tahun_masehi'] ?? null);

            // Hijriyah diprioritaskan (sumber boyong sering punya TA masehi salah, mis. 2029-2030).
            if ($tahunBoyongH !== null && (int) $tahunBoyongH > 1300) {
                $derivedM = AlumniHelper::hijriyahYearToMasehiYear($pdo, (int) $tahunBoyongH);
                if (
                    $tahunBoyongM === null
                    || !AlumniHelper::isMasehiConsistentWithHijriyah((int) $tahunBoyongM, (int) $tahunBoyongH)
                ) {
                    $tahunBoyongM = $derivedM;
                }
            } elseif ($tahunBoyongM !== null) {
                $tahunBoyongH = AlumniHelper::masehiYearToHijriyahYear($pdo, (int) $tahunBoyongM);
            }
            if ($tahunBoyongH === null && !empty($row['tanggal_dibuat'])) {
                $created = substr((string) $row['tanggal_dibuat'], 0, 10);
                if (preg_match('/^(\d{4})/', $created, $ym)) {
                    $tahunBoyongM = $tahunBoyongM ?? $ym[1];
                    $tahunBoyongH = AlumniHelper::masehiYearToHijriyahYear($pdo, (int) $ym[1]);
                }
            }
            if ($tahunBoyongH === null) {
                continue;
            }

            try {
                $pdo->beginTransaction();
                $prefix = AlumniHelper::parsePrefixFromGenderAndTahun($gender, $tahunBoyongH);
                $idAlumni = AlumniHelper::generateNextIdAlumni($pdo, $prefix);

                $tglLahir = $row['tanggal_lahir'] ?? null;
                if ($tglLahir === '' || $tglLahir === '0000-00-00') {
                    $tglLahir = null;
                }

                $insert->execute([
                    (int) $idAlumni,
                    $nama,
                    $nik,
                    $gender,
                    $row['no_telpon'] !== null && trim((string) $row['no_telpon']) !== ''
                        ? trim((string) $row['no_telpon']) : null,
                    $row['tempat_lahir'] !== null && trim((string) $row['tempat_lahir']) !== ''
                        ? trim((string) $row['tempat_lahir']) : null,
                    $tglLahir,
                    $this->nullIfEmpty($row['dusun'] ?? null),
                    $this->nullIfEmpty($row['rt'] ?? null),
                    $this->nullIfEmpty($row['rw'] ?? null),
                    $this->nullIfEmpty($row['desa'] ?? null),
                    $this->nullIfEmpty($row['kecamatan'] ?? null),
                    $this->nullIfEmpty($row['kabupaten'] ?? null),
                    $this->nullIfEmpty($row['provinsi'] ?? null),
                    $this->nullIfEmpty($row['kode_pos'] ?? null),
                    $this->nullIfEmpty($row['ayah'] ?? null),
                    $this->nullIfEmpty($row['ibu'] ?? null),
                    null,
                    null,
                    $tahunBoyongM,
                    $tahunBoyongH,
                    (int) $row['id_santri'],
                ]);
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('Alumni seed boyong skip: ' . $e->getMessage());
            }
        }
    }

    private function nullIfEmpty($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        return $s === '' ? null : $s;
    }

    public function down(): void
    {
        if ($this->hasTable('alumni')) {
            $this->table('alumni')->drop()->save();
        }
    }
}
