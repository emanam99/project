<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Katalog domain pemaduan data santri — satu sumber kebenaran tabel/kolom terkait santri.id.
 */
final class SantriMergeCatalog
{
    /**
     * @return list<array{
     *   mode: string,
     *   label: string,
     *   description: string,
     *   group: string,
     *   supports_move: bool,
     *   supports_copy: bool,
     *   tables: list<array{table: string, column: string}>
     * }>
     */
    public static function domains(): array
    {
        return [
            [
                'mode' => 'biodata',
                'label' => 'Biodata & identitas',
                'description' => 'Gabung field di tabel santri (strategi isi kosong / utama / pembanding). Bukan duplikasi baris.',
                'group' => 'intinya',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri', 'column' => 'id']],
            ],
            [
                'mode' => 'registrasi',
                'label' => 'Registrasi & transaksi PSB',
                'description' => 'psb___registrasi, detail, transaksi, payment PSB. Bentrok tahun: registrasi sumber dihapus.',
                'group' => 'psb',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [
                    ['table' => 'psb___registrasi', 'column' => 'id_santri'],
                    ['table' => 'psb___transaksi', 'column' => 'id_santri'],
                ],
            ],
            [
                'mode' => 'psb_tes',
                'label' => 'Tes masuk (psb___tes)',
                'description' => 'Nilai & keputusan rapor tes Madrasah Diniyah.',
                'group' => 'psb',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'psb___tes', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'berkas',
                'label' => 'Berkas santri',
                'description' => 'Dokumen PSB di santri___berkas.',
                'group' => 'psb',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___berkas', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'uwaba',
                'label' => 'UWABA / syahriah / tunggakan / khusus',
                'description' => 'Tagihan & histori pembayaran UWABA (disarankan dipindah sebelum hapus santri).',
                'group' => 'keuangan',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [
                    ['table' => 'uwaba', 'column' => 'id_santri'],
                    ['table' => 'uwaba___bayar', 'column' => 'id_santri'],
                    ['table' => 'uwaba___tunggakan', 'column' => 'id_santri'],
                    ['table' => 'uwaba___bayar_tunggakan', 'column' => 'id_santri'],
                    ['table' => 'uwaba___khusus', 'column' => 'id_santri'],
                    ['table' => 'uwaba___bayar_khusus', 'column' => 'id_santri'],
                ],
            ],
            [
                'mode' => 'referensi',
                'label' => 'Payment, ijin, boyong, juara, WhatsApp',
                'description' => 'Referensi umum ke santri.id agar konsisten sebelum hapus duplikat.',
                'group' => 'lainnya',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [
                    ['table' => 'payment', 'column' => 'id_santri'],
                    ['table' => 'santri___ijin', 'column' => 'id_santri'],
                    ['table' => 'santri___boyong', 'column' => 'id_santri'],
                    ['table' => 'santri___juara', 'column' => 'id_santri'],
                    ['table' => 'whatsapp', 'column' => 'id_santri'],
                    ['table' => 'whatsapp___pending', 'column' => 'id_santri'],
                ],
            ],
            [
                'mode' => 'rombel',
                'label' => 'Rombel & riwayat kelas',
                'description' => 'Riwayat penempatan rombel diniyah/formal.',
                'group' => 'akademik',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___rombel', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'kamar',
                'label' => 'Kamar & riwayat penempatan',
                'description' => 'Riwayat kamar asrama.',
                'group' => 'asrama',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___kamar', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'status_riwayat',
                'label' => 'Riwayat status santri',
                'description' => 'Baris di santri___status.',
                'group' => 'akademik',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___status', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'lulusan',
                'label' => 'Data kelulusan',
                'description' => 'santri___lulusan per lembaga & tahun ajaran.',
                'group' => 'akademik',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___lulusan', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'nilai',
                'label' => 'Nilai santri',
                'description' => 'Rekap nilai per tahun/lembaga.',
                'group' => 'akademik',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___nilai', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'pelanggaran',
                'label' => 'Pelanggaran',
                'description' => 'Catatan pelanggaran santri.',
                'group' => 'kedisiplinan',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___pelanggaran', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'catatan',
                'label' => 'Catatan internal',
                'description' => 'Catatan boyong / administrasi di santri___catatan.',
                'group' => 'kedisiplinan',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___catatan', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'shohifah',
                'label' => 'Shohifah',
                'description' => 'Data shohifah per tahun ajaran.',
                'group' => 'asrama',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___shohifah', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'lttq',
                'label' => 'LTTQ',
                'description' => 'Penempatan tingkatan LTTQ.',
                'group' => 'akademik',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___lttq', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'ugt',
                'label' => 'UGT (laporan koordinator, GT, PJGT, masalah, guru tugas)',
                'description' => 'Semua tabel laporan & penugasan UGT yang mengacu ke santri.',
                'group' => 'ugt',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [
                    ['table' => 'ugt___koordonator', 'column' => 'id_santri'],
                    ['table' => 'ugt___gt', 'column' => 'id_santri'],
                    ['table' => 'ugt___pjgt', 'column' => 'id_santri'],
                    ['table' => 'ugt___masalah', 'column' => 'id_santri'],
                    ['table' => 'ugt___guru_tugas_tugasan', 'column' => 'id_santri'],
                ],
            ],
            [
                'mode' => 'ujian',
                'label' => 'Peserta ujian',
                'description' => 'Keikutsertaan ujian online/modul.',
                'group' => 'akademik',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'ujian___peserta', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'cashless',
                'label' => 'Cashless / kantin',
                'description' => 'Batas harian & transaksi detail cashless.',
                'group' => 'keuangan',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [
                    ['table' => 'cashless___batas_harian_santri', 'column' => 'santri_id'],
                    ['table' => 'cashless___transaksi_detail', 'column' => 'santri_id'],
                ],
            ],
            [
                'mode' => 'bisyaroh',
                'label' => 'Bisyaroh potong kewajiban',
                'description' => 'Data potong bisyaroh per santri.',
                'group' => 'keuangan',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [
                    ['table' => 'bisyaroh___potong_santri', 'column' => 'id_santri'],
                    ['table' => 'santri___potong_uwaba_bulan', 'column' => 'id_santri'],
                    ['table' => 'bisyaroh___potong_uwaba_log', 'column' => 'id_santri'],
                ],
            ],
            [
                'mode' => 'role_santri',
                'label' => 'Role akses santri (myBeddien)',
                'description' => 'Penugasan role di santri___role.',
                'group' => 'akses',
                'supports_move' => true,
                'supports_copy' => true,
                'tables' => [['table' => 'santri___role', 'column' => 'santri_id']],
            ],
            [
                'mode' => 'chat',
                'label' => 'Chat (id_santri)',
                'description' => 'Percakapan yang terhubung ke santri.',
                'group' => 'komunikasi',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [['table' => 'chat', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'nis_pengajuan',
                'label' => 'Pengajuan NIS myBeddien',
                'description' => 'mybeddian___nis_pengajuan yang sudah terhubung ke santri.',
                'group' => 'psb',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [['table' => 'mybeddian___nis_pengajuan', 'column' => 'id_santri']],
            ],
            [
                'mode' => 'aktivitas',
                'label' => 'Log aktivitas user (santri)',
                'description' => 'Riwayat aksi yang dicatat dengan santri_id.',
                'group' => 'lainnya',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [['table' => 'user___aktivitas', 'column' => 'santri_id']],
            ],
            [
                'mode' => 'manage_wa',
                'label' => 'Antrian WA massal (Manage Data)',
                'description' => 'Item job kirim WA massal per santri.',
                'group' => 'komunikasi',
                'supports_move' => true,
                'supports_copy' => false,
                'tables' => [['table' => 'manage_wa_bulk_item', 'column' => 'id_santri']],
            ],
        ];
    }

    /** @return list<string> */
    public static function allModes(): array
    {
        return array_column(self::domains(), 'mode');
    }

  /** Mode parsial (tanpa full) untuk bulk pindah semua. */
    public static function partialMoveModes(): array
    {
        return array_values(array_filter(self::allModes(), static fn (string $m) => $m !== 'biodata'));
    }

    public static function findDomain(string $mode): ?array
    {
        foreach (self::domains() as $d) {
            if ($d['mode'] === $mode) {
                return $d;
            }
        }

        return null;
    }

    /**
     * @return array<string, array{total: int, tables: array<string, int>}>
     */
    public static function countPreview(PDO $db, int $idSantri): array
    {
        $out = [];
        foreach (self::domains() as $domain) {
            if ($domain['mode'] === 'biodata') {
                $out['biodata'] = ['total' => 1, 'tables' => ['santri' => 1]];
                continue;
            }
            $tables = [];
            $total = 0;
            foreach ($domain['tables'] as $t) {
                $n = self::countTableRows($db, $t['table'], $t['column'], $idSantri);
                if ($n > 0) {
                    $tables[$t['table']] = $n;
                    $total += $n;
                }
            }
            $out[$domain['mode']] = ['total' => $total, 'tables' => $tables];
        }

        return $out;
    }

    public static function countTableRows(PDO $db, string $table, string $column, int $idSantri): int
    {
        if (!self::tableExists($db, $table)) {
            return 0;
        }
        if (!self::columnExists($db, $table, $column)) {
            return 0;
        }
        $table = self::sanitizeIdent($table);
        $column = self::sanitizeIdent($column);
        $stmt = $db->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$column}` = ?");
        $stmt->execute([$idSantri]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Jalankan move atau copy untuk satu domain.
     *
     * @return array{moved_rows: int, copied_rows: int, removed_registrasi_ids: list<int>}
     */
    public static function applyDomain(
        PDO $db,
        string $mode,
        int $idUtama,
        int $idSekunder,
        string $action,
        string $biodataStrategy,
        string $nikResolution
    ): array {
        $removedRegistrasiIds = [];
        $moved = 0;
        $copied = 0;

        if ($mode === 'biodata') {
            if ($action === 'copy' || $action === 'move') {
                SantriMergeHelper::mergeBiodata($db, $idUtama, $idSekunder, $biodataStrategy, $nikResolution);
            }

            return ['moved_rows' => 1, 'copied_rows' => 0, 'removed_registrasi_ids' => []];
        }

        if ($mode === 'registrasi') {
            if ($action !== 'move') {
                throw new \InvalidArgumentException('Registrasi PSB hanya mendukung pindah (bukan salin duplikat).');
            }
            $removedRegistrasiIds = SantriMergeHelper::moveRegistrasi($db, $idUtama, $idSekunder);

            return ['moved_rows' => 1, 'copied_rows' => 0, 'removed_registrasi_ids' => $removedRegistrasiIds];
        }

        if ($mode === 'uwaba') {
            if ($action !== 'move') {
                throw new \InvalidArgumentException('UWABA hanya mendukung pindah (bukan salin tagihan).');
            }
            SantriMergeHelper::moveUwabaFamily($db, $idUtama, $idSekunder);

            return ['moved_rows' => 1, 'copied_rows' => 0, 'removed_registrasi_ids' => []];
        }

        if ($mode === 'referensi') {
            if ($action === 'move') {
                SantriMergeHelper::moveOtherSantriReferences($db, $idUtama, $idSekunder);
                $moved = 1;
            } else {
                $copied = self::copyDomainTables($db, $mode, $idUtama, $idSekunder);
            }

            return ['moved_rows' => $moved, 'copied_rows' => $copied, 'removed_registrasi_ids' => []];
        }

        if ($mode === 'berkas') {
            if ($action === 'move') {
                SantriMergeHelper::moveBerkas($db, $idUtama, $idSekunder);
                $moved = 1;
            } else {
                $copied = self::copyDomainTables($db, $mode, $idUtama, $idSekunder);
            }

            return ['moved_rows' => $moved, 'copied_rows' => $copied, 'removed_registrasi_ids' => []];
        }

        $domain = self::findDomain($mode);
        if ($domain === null) {
            throw new \InvalidArgumentException('Mode tidak dikenal: ' . $mode);
        }

        if ($action === 'copy' && !$domain['supports_copy']) {
            throw new \InvalidArgumentException('Domain "' . $mode . '" tidak mendukung salin; gunakan pindah.');
        }

        if ($action === 'move') {
            $moved = self::moveDomainTables($db, $domain, $idUtama, $idSekunder);
        } elseif ($action === 'copy') {
            $copied = self::copyDomainTables($db, $mode, $idUtama, $idSekunder);
        } else {
            throw new \InvalidArgumentException('action harus move atau copy');
        }

        return ['moved_rows' => $moved, 'copied_rows' => $copied, 'removed_registrasi_ids' => $removedRegistrasiIds];
    }

    /**
     * @param array{mode: string, tables: list<array{table: string, column: string}>} $domain
     */
    private static function moveDomainTables(PDO $db, array $domain, int $idUtama, int $idSekunder): int
    {
        $total = 0;
        foreach ($domain['tables'] as $t) {
            $total += self::moveTableRows($db, $t['table'], $t['column'], $idUtama, $idSekunder);
        }

        return $total;
    }

    public static function moveTableRows(PDO $db, string $table, string $column, int $idUtama, int $idSekunder): int
    {
        if (!self::tableExists($db, $table) || !self::columnExists($db, $table, $column)) {
            return 0;
        }
        $table = self::sanitizeIdent($table);
        $column = self::sanitizeIdent($column);
        $stmt = $db->prepare("UPDATE `{$table}` SET `{$column}` = ? WHERE `{$column}` = ?");
        $stmt->execute([$idUtama, $idSekunder]);

        return $stmt->rowCount();
    }

    public static function copyDomainTables(PDO $db, string $mode, int $idUtama, int $idSekunder): int
    {
        $domain = self::findDomain($mode);
        if ($domain === null) {
            return 0;
        }
        $total = 0;
        foreach ($domain['tables'] as $t) {
            $total += self::copyTableRows($db, $t['table'], $t['column'], $idUtama, $idSekunder);
        }

        return $total;
    }

    public static function copyTableRows(PDO $db, string $table, string $column, int $idUtama, int $idSekunder): int
    {
        if (!self::tableExists($db, $table) || !self::columnExists($db, $table, $column)) {
            return 0;
        }
        $table = self::sanitizeIdent($table);
        $column = self::sanitizeIdent($column);

        $pk = self::primaryKeyColumn($db, $table);
        $cols = self::listColumns($db, $table);
        if ($cols === []) {
            return 0;
        }

        $insertCols = [];
        foreach ($cols as $c) {
            if ($pk !== null && $c === $pk) {
                continue;
            }
            $insertCols[] = $c;
        }
        if ($insertCols === []) {
            return 0;
        }

        $selectParts = [];
        foreach ($insertCols as $c) {
            if ($c === $column) {
                $selectParts[] = (string) $idUtama;
            } else {
                $selectParts[] = '`' . self::sanitizeIdent($c) . '`';
            }
        }

        $colList = implode('`, `', array_map([self::class, 'sanitizeIdent'], $insertCols));
        $sql = "INSERT IGNORE INTO `{$table}` (`{$colList}`) SELECT " . implode(', ', $selectParts)
            . " FROM `{$table}` WHERE `{$column}` = ?";
        $stmt = $db->prepare($sql);
        $stmt->execute([$idSekunder]);

        return $stmt->rowCount();
    }

    /** @return list<int> */
    public static function applyFullMove(
        PDO $db,
        int $idUtama,
        int $idSekunder,
        string $biodataStrategy,
        string $nikResolution
    ): array {
        $allRemoved = [];
        $order = [
            'registrasi', 'psb_tes', 'berkas', 'uwaba',
            'rombel', 'kamar', 'status_riwayat', 'lulusan', 'nilai',
            'pelanggaran', 'catatan', 'shohifah', 'lttq', 'ugt', 'ujian',
            'cashless', 'bisyaroh', 'role_santri', 'chat', 'nis_pengajuan',
            'aktivitas', 'manage_wa', 'referensi',
        ];
        foreach ($order as $mode) {
            $r = self::applyDomain($db, $mode, $idUtama, $idSekunder, 'move', $biodataStrategy, $nikResolution);
            if (!empty($r['removed_registrasi_ids'])) {
                $allRemoved = array_merge($allRemoved, $r['removed_registrasi_ids']);
            }
        }
        self::applyDomain($db, 'biodata', $idUtama, $idSekunder, 'move', $biodataStrategy, $nikResolution);
        SantriMergeHelper::deleteSantriSekunder($db, $idSekunder);

        return array_values(array_unique(array_map('intval', $allRemoved)));
    }

    private static function tableExists(PDO $db, string $table): bool
    {
        $stmt = $db->prepare(
            'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1'
        );
        $stmt->execute([$table]);

        return $stmt->fetchColumn() !== false;
    }

    private static function columnExists(PDO $db, string $table, string $column): bool
    {
        $stmt = $db->prepare(
            'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1'
        );
        $stmt->execute([$table, $column]);

        return $stmt->fetchColumn() !== false;
    }

    /** @return list<string> */
    private static function listColumns(PDO $db, string $table): array
    {
        $stmt = $db->prepare(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION'
        );
        $stmt->execute([$table]);
        $cols = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $cols[] = (string) ($row['COLUMN_NAME'] ?? '');
        }

        return $cols;
    }

    private static function primaryKeyColumn(PDO $db, string $table): ?string
    {
        $stmt = $db->prepare(
            "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
             ORDER BY ORDINAL_POSITION LIMIT 1"
        );
        $stmt->execute([$table]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }

        return (string) ($row['COLUMN_NAME'] ?? '') ?: null;
    }

    private static function sanitizeIdent(string $name): string
    {
        $clean = preg_replace('/[^a-zA-Z0-9_]/', '', $name);

        return $clean !== '' ? $clean : 'x';
    }
}
