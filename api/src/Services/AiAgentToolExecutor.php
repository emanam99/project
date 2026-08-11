<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiAgentAccessHelper;
use App\Helpers\AiRencanaPengeluaranChatContextHelper;
use App\Helpers\PsaKalenderMasehiToHijriHelper;
use App\Helpers\RoleHelper;
use App\Helpers\SantriRombelHelper;
use App\Helpers\TahunAjaranActiveHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Controllers\PengeluaranController;

/**
 * Eksekusi tool tulis agen setelah konfirmasi pengguna.
 */
final class AiAgentToolExecutor
{
    /** @var list<string> */
    private const USERS_ROLLBACK_COLS = ['ai_chat_mode_pref', 'email'];

    /** @var list<string> */
    private const PENGURUS_ROLLBACK_COLS = ['nama'];

    public function __construct(private \PDO $db)
    {
    }

    /**
     * @param list<array{tool_id: string, arguments: array<string, mixed>}> $actions
     * @param array{users_id: int, pengurus_id: int, user_payload: array} $ctx
     *
     * @return list<int> snapshot ids created (for updating after_json)
     *
     * @throws \RuntimeException
     */
    public function executeWrites(int $jobId, array $actions, array $ctx, AiAgentJobRepository $jobs): array
    {
        $usersId = (int) $ctx['users_id'];
        $pengurusId = (int) $ctx['pengurus_id'];
        $userPayload = $ctx['user_payload'];
        $snapshotIds = [];

        foreach ($actions as $action) {
            $toolId = (string) ($action['tool_id'] ?? '');
            $args = is_array($action['arguments'] ?? null) ? $action['arguments'] : [];
            if ($toolId === 'set_ai_chat_mode') {
                $snapshotIds[] = $this->toolSetAiChatMode($jobId, $usersId, $userPayload, $args, $jobs);
            } elseif ($toolId === 'update_own_profile_field') {
                $snapshotIds[] = $this->toolUpdateOwnProfile($jobId, $usersId, $pengurusId, $args, $jobs);
            } elseif ($toolId === 'create_rencana_pengeluaran') {
                $snapshotIds[] = $this->toolCreateRencanaPengeluaran($jobId, $ctx, $args, $jobs);
            } else {
                throw new \RuntimeException('Tool tidak dikenal: ' . $toolId);
            }
        }

        return $snapshotIds;
    }

    /**
     * Pulihkan dari snapshot (kolom di-whitelist saja).
     *
     * @param array{table_key: string, row_key: string, before_json: array<string, mixed>} $snap
     */
    public function restoreSnapshotRow(array $snap): void
    {
        $table = $snap['table_key'];
        $rowKey = $snap['row_key'];
        $before = $snap['before_json'];
        if ($table === 'users') {
            $this->applyWhitelistedUpdate('users', (int) $rowKey, $before, self::USERS_ROLLBACK_COLS, 'id');

            return;
        }
        if ($table === 'pengurus') {
            $this->applyWhitelistedUpdate('pengurus', (int) $rowKey, $before, self::PENGURUS_ROLLBACK_COLS, 'id');

            return;
        }
        if ($table === 'pengeluaran___rencana') {
            $op = (string) ($before['operation'] ?? '');
            $rid = (int) ($before['id'] ?? 0);
            if ($op === 'insert' && $rid > 0) {
                $d = $this->db->prepare('DELETE FROM pengeluaran___rencana_detail WHERE id_pengeluaran_rencana = ?');
                $d->execute([$rid]);
                $d2 = $this->db->prepare('DELETE FROM pengeluaran___rencana WHERE id = ?');
                $d2->execute([$rid]);
            }

            return;
        }
        throw new \RuntimeException('Tabel rollback tidak didukung.');
    }

    /**
     * @param array<string, mixed> $data
     */
    private function applyWhitelistedUpdate(string $table, int $pk, array $data, array $whitelist, string $pkCol): void
    {
        $sets = [];
        $vals = [];
        foreach ($whitelist as $col) {
            if (!array_key_exists($col, $data)) {
                continue;
            }
            $sets[] = '`' . str_replace('`', '``', $col) . '` = ?';
            $vals[] = $data[$col];
        }
        if ($sets === []) {
            return;
        }
        $vals[] = $pk;
        $sql = 'UPDATE `' . str_replace('`', '``', $table) . '` SET ' . implode(', ', $sets) . ' WHERE `' . str_replace('`', '``', $pkCol) . '` = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($vals);
    }

    /**
     * @param array<string, mixed> $args
     */
    private function toolSetAiChatMode(int $jobId, int $usersId, array $userPayload, array $args, AiAgentJobRepository $jobs): int
    {
        if (!AiAgentQuotaHelper::columnExists($this->db, 'users', 'ai_chat_mode_pref')) {
            throw new \RuntimeException('Kolom preferensi mode belum tersedia.');
        }
        $mode = strtolower(trim((string) ($args['mode'] ?? '')));
        if ($mode !== 'api' && $mode !== 'proxy') {
            throw new \RuntimeException('Mode obrolan harus api atau proxy.');
        }
        if ($mode === 'proxy' && !AiAgentAccessHelper::canUseAlternativeChatMode($this->db, $userPayload)) {
            throw new \RuntimeException('Mode alternatif tidak diizinkan untuk akun Anda.');
        }

        $stmt = $this->db->prepare('SELECT ai_chat_mode_pref FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$usersId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            throw new \RuntimeException('User tidak ditemukan.');
        }
        $before = ['ai_chat_mode_pref' => (string) ($row['ai_chat_mode_pref'] ?? 'api')];

        $jobs->insertSnapshot($jobId, 'users', (string) $usersId, $before, null);
        $snapId = (int) $this->db->lastInsertId();

        $up = $this->db->prepare('UPDATE users SET ai_chat_mode_pref = ? WHERE id = ?');
        $up->execute([$mode, $usersId]);

        $stmt2 = $this->db->prepare('SELECT ai_chat_mode_pref FROM users WHERE id = ? LIMIT 1');
        $stmt2->execute([$usersId]);
        $afterRow = $stmt2->fetch(\PDO::FETCH_ASSOC) ?: [];

        $jobs->updateSnapshotAfter($snapId, ['ai_chat_mode_pref' => (string) ($afterRow['ai_chat_mode_pref'] ?? $mode)]);

        return $snapId;
    }

    /**
     * @param array<string, mixed> $args
     */
    private function toolUpdateOwnProfile(int $jobId, int $usersId, int $pengurusId, array $args, AiAgentJobRepository $jobs): int
    {
        if ($pengurusId < 1) {
            throw new \RuntimeException('Profil pengurus tidak terhubung pada sesi ini.');
        }
        $field = strtolower(trim((string) ($args['field'] ?? '')));
        $valueRaw = isset($args['value']) ? trim((string) $args['value']) : '';

        if ($field === 'nama') {
            $nama = TextSanitizer::cleanText($valueRaw);
            if ($nama === '') {
                throw new \RuntimeException('Nama tidak boleh kosong.');
            }
            if (mb_strlen($nama) > 255) {
                throw new \RuntimeException('Nama terlalu panjang.');
            }

            $stmt = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                throw new \RuntimeException('Data pengurus tidak ditemukan.');
            }
            $before = ['nama' => (string) ($row['nama'] ?? '')];
            $jobs->insertSnapshot($jobId, 'pengurus', (string) $pengurusId, $before, null);
            $snapId = (int) $this->db->lastInsertId();

            $up = $this->db->prepare('UPDATE pengurus SET nama = ? WHERE id = ?');
            $up->execute([$nama, $pengurusId]);

            $stmt2 = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
            $stmt2->execute([$pengurusId]);
            $afterRow = $stmt2->fetch(\PDO::FETCH_ASSOC) ?: [];

            $jobs->updateSnapshotAfter($snapId, ['nama' => (string) ($afterRow['nama'] ?? $nama)]);

            return $snapId;
        }

        if ($field === 'email') {
            $emailVal = TextSanitizer::cleanText($valueRaw);
            if ($emailVal === '') {
                throw new \RuntimeException('Email tidak boleh kosong.');
            }
            if (!filter_var($emailVal, FILTER_VALIDATE_EMAIL)) {
                throw new \RuntimeException('Format email tidak valid.');
            }

            $stmt = $this->db->prepare(
                'SELECT u.id AS users_pk, u.email FROM pengurus p INNER JOIN users u ON u.id = p.id_user WHERE p.id = ? LIMIT 1'
            );
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['users_pk'])) {
                throw new \RuntimeException('Akun users tidak terhubung dengan pengurus.');
            }
            $usersPk = (int) $row['users_pk'];
            if ($usersPk !== $usersId) {
                throw new \RuntimeException('Konsistensi akun tidak valid.');
            }
            $before = ['email' => (string) ($row['email'] ?? '')];
            $jobs->insertSnapshot($jobId, 'users', (string) $usersPk, $before, null);
            $snapId = (int) $this->db->lastInsertId();

            try {
                $prevNorm = strtolower(trim((string) ($row['email'] ?? '')));
                $nextNorm = strtolower(trim($emailVal));
                if ($prevNorm !== $nextNorm) {
                    try {
                        $this->db->prepare('UPDATE users SET email = ?, email_verified_at = NULL, email_reminder_snoozed_until = NULL WHERE id = ?')->execute([$emailVal, $usersPk]);
                    } catch (\Throwable $e) {
                        $this->db->prepare('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?')->execute([$emailVal, $usersPk]);
                    }
                    try {
                        $this->db->prepare('DELETE FROM user___email_verify_tokens WHERE user_id = ?')->execute([$usersPk]);
                    } catch (\Throwable $e) {
                    }
                } else {
                    $this->db->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$emailVal, $usersPk]);
                }
            } catch (\PDOException $e) {
                $dup = $this->duplicateMessage($e);
                if ($dup !== null) {
                    throw new \RuntimeException($dup);
                }
                throw $e;
            }

            $stmt2 = $this->db->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
            $stmt2->execute([$usersPk]);
            $afterRow = $stmt2->fetch(\PDO::FETCH_ASSOC) ?: [];

            $jobs->updateSnapshotAfter($snapId, ['email' => (string) ($afterRow['email'] ?? $emailVal)]);

            return $snapId;
        }

        throw new \RuntimeException('Field profil tidak didukung. Gunakan nama atau email.');
    }

    /**
     * @param array<string, mixed> $ctx
     * @param array<string, mixed> $args
     */
    private function toolCreateRencanaPengeluaran(int $jobId, array $ctx, array $args, AiAgentJobRepository $jobs): int
    {
        $userPayload = $ctx['user_payload'];
        $pengurusId = (int) $ctx['pengurus_id'];
        if ($pengurusId < 1) {
            throw new \RuntimeException('Akun pengurus tidak valid untuk membuat rencana.');
        }

        $keterangan = TextSanitizer::cleanText(trim((string) ($args['keterangan'] ?? '')));
        if ($keterangan === '') {
            throw new \RuntimeException('Keterangan wajib diisi.');
        }

        $lembaga = trim((string) ($args['lembaga'] ?? ''));
        if (RoleHelper::tokenPengeluaranApplyLembagaScope($this->db, $userPayload, 'rencana')) {
            if ($lembaga === '') {
                throw new \RuntimeException('Lembaga wajib dipilih sesuai akses Anda.');
            }
            $allowed = RoleHelper::tokenPengeluaranLembagaIdsFromUser($userPayload);
            if (!in_array($lembaga, $allowed, true)) {
                throw new \RuntimeException('Lembaga tidak diizinkan untuk akun Anda.');
            }
        } elseif ($lembaga === '') {
            throw new \RuntimeException('Lembaga wajib diisi.');
        }

        $status = strtolower(trim((string) ($args['status'] ?? 'draft')));
        if ($status !== 'draft' && $status !== 'pending') {
            $status = 'draft';
        }
        $ketRow = $status === 'pending' ? 'pending' : 'draft';
        $actionCode = $ketRow === 'draft'
            ? 'action.pengeluaran.rencana.simpan_draft'
            : 'action.pengeluaran.rencana.simpan';
        if (!RoleHelper::tokenPengeluaranActionAllowed($this->db, $userPayload, $actionCode)) {
            throw new \RuntimeException('Tidak ada izin untuk menyimpan rencana dengan status ini.');
        }

        $katRaw = isset($args['kategori']) ? trim((string) $args['kategori']) : '';
        $kategori = $katRaw === '' ? null : $katRaw;
        if ($kategori !== null && !in_array($kategori, AiRencanaPengeluaranChatContextHelper::KATEGORI_VALID, true)) {
            throw new \RuntimeException('Kategori tidak valid.');
        }

        // Kebijakan AI: sumber selalu Cash; TA hijriyah & tanggal hijri dari server (bukan argumen model).
        $sumberUang = 'Cash';

        $masehiToday = date('Y-m-d');
        $waktuServer = date('H:i:s');
        $taRow = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($this->db, $masehiToday);
        $tahunAjaran = $taRow['tahun_ajaran'] ?? null;
        if ($tahunAjaran === null || $tahunAjaran === '') {
            $tahunAjaran = SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
        }
        if ($tahunAjaran === '') {
            $tahunAjaran = null;
        }

        $hijriyah = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($this->db, $masehiToday, $waktuServer);
        if ($hijriyah === null || $hijriyah === '' || $hijriyah === '0000-00-00') {
            $hijriyah = null;
        }

        $details = $args['details'] ?? [];
        if (!is_array($details) || $details === []) {
            throw new \RuntimeException('Detail item wajib diisi.');
        }
        if (count($details) > 40) {
            throw new \RuntimeException('Terlalu banyak baris item.');
        }

        $itemNames = [];
        $totalNominal = 0.0;
        $normalized = [];
        foreach ($details as $row) {
            if (!is_array($row)) {
                throw new \RuntimeException('Format detail tidak valid.');
            }
            $item = TextSanitizer::cleanText(trim((string) ($row['item'] ?? '')));
            if ($item === '' || mb_strlen($item, 'UTF-8') > 255) {
                throw new \RuntimeException('Nama item tidak valid.');
            }
            if (isset($itemNames[$item])) {
                throw new \RuntimeException('Item duplikat: ' . $item);
            }
            $itemNames[$item] = true;
            $harga = (float) ($row['harga'] ?? 0);
            $jumlah = (int) ($row['jumlah'] ?? 1);
            if ($harga < 0 || $harga > 1e13 || $jumlah < 1 || $jumlah > 1000000) {
                throw new \RuntimeException('Harga atau jumlah tidak valid.');
            }
            $nominal = $harga * $jumlah;
            $totalNominal += $nominal;
            $normalized[] = ['item' => $item, 'harga' => $harga, 'jumlah' => $jumlah, 'nominal' => $nominal];
        }

        $sqlRencana = 'INSERT INTO pengeluaran___rencana (keterangan, kategori, lembaga, sumber_uang, id_admin, nominal, hijriyah, tahun_ajaran, ket) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmtRencana = $this->db->prepare($sqlRencana);
        $stmtRencana->execute([
            $keterangan,
            $kategori,
            $lembaga,
            $sumberUang,
            $pengurusId,
            $totalNominal,
            $hijriyah,
            $tahunAjaran,
            $ketRow,
        ]);
        $idRencana = (int) $this->db->lastInsertId();
        if ($idRencana < 1) {
            throw new \RuntimeException('Gagal membuat rencana.');
        }

        $sqlDetail = 'INSERT INTO pengeluaran___rencana_detail '
            . '(id_pengeluaran_rencana, item, harga, jumlah, nominal, versi, id_admin, rejected) '
            . 'VALUES (?, ?, ?, ?, ?, 1, ?, 0)';
        $stmtDetail = $this->db->prepare($sqlDetail);
        foreach ($normalized as $d) {
            $stmtDetail->execute([
                $idRencana,
                $d['item'],
                $d['harga'],
                $d['jumlah'],
                $d['nominal'],
                $pengurusId,
            ]);
        }

        $stmtR = $this->db->prepare('SELECT * FROM pengeluaran___rencana WHERE id = ?');
        $stmtR->execute([$idRencana]);
        $newRencana = $stmtR->fetch(\PDO::FETCH_ASSOC);

        $jobs->insertSnapshot(
            $jobId,
            'pengeluaran___rencana',
            (string) $idRencana,
            ['operation' => 'insert', 'id' => $idRencana],
            ['created' => true]
        );
        $snapPk = (int) $this->db->lastInsertId();

        if (is_array($newRencana)) {
            UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'pengeluaran___rencana', $idRencana, null, $newRencana, null);
        }

        if ($ketRow === 'draft' && self::effectiveKirimNotifikasiDraft($args, $userPayload, $this->db)) {
            (new PengeluaranController())->scheduleNotifOnDraftSaved(
                $idRencana,
                $lembaga !== '' ? $lembaga : null,
                $pengurusId,
                $keterangan,
                false
            );
        }

        return $snapPk;
    }

    /**
     * @param array<string, mixed> $args
     * @param array<string, mixed> $userPayload
     */
    private static function effectiveKirimNotifikasiDraft(array $args, array $userPayload, \PDO $db): bool
    {
        if (!array_key_exists('kirim_notifikasi_draft', $args)) {
            return true;
        }
        $raw = $args['kirim_notifikasi_draft'];
        if (is_bool($raw)) {
            $want = $raw;
        } else {
            $tmp = filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($tmp !== null) {
                $want = $tmp;
            } elseif (is_string($raw)) {
                $s = strtolower(trim($raw));
                $want = !in_array($s, ['0', 'false', 'no', 'tidak', 'off'], true);
            } else {
                $want = (bool) $raw;
            }
        }
        if ($want === false && !RoleHelper::tokenMayToggleDraftNotifOnSave($db, $userPayload)) {
            return true;
        }

        return $want;
    }

    private function duplicateMessage(\PDOException $e): ?string
    {
        $info = $e->errorInfo ?? [];
        $driverCode = isset($info[1]) ? (int) $info[1] : 0;
        if ($driverCode !== 1062) {
            return null;
        }
        $errorText = strtolower((string) ($info[2] ?? ''));

        return str_contains($errorText, 'email') ? 'Email sudah dipakai' : 'Data akun bentrok';
    }
}
