<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Penerima notifikasi WA rencana/pengeluaran: berdasarkan aksi fitur per role + cakupan lembaga.
 * - action.pengeluaran.notif.semua_lembaga → semua rencana/pengeluaran (bukan draft).
 * - action.pengeluaran.notif.lembaga_sesuai_role → hanya jika lembaga rencana sama dengan pengurus___role.lembaga_id untuk penugasan role yang punya aksi itu.
 * - action.pengeluaran.draft.notif.lembaga_sesuai_role → hanya untuk rencana berstatus draft; hanya lembaga sesuai role (tidak ada varian semua lembaga).
 * Tanpa aksi yang relevan di role yang dipakai pengurus, tidak ikut daftar penerima.
 */
final class PengeluaranWaNotifRecipientHelper
{
    public const CODE_NOTIF_SEMUA_LEMBAGA = 'action.pengeluaran.notif.semua_lembaga';

    public const CODE_NOTIF_LEMBAGA_SESUAI_ROLE = 'action.pengeluaran.notif.lembaga_sesuai_role';

    public const CODE_NOTIF_DRAFT_LEMBAGA_SESUAI_ROLE = 'action.pengeluaran.draft.notif.lembaga_sesuai_role';

    /**
     * Hanya role dengan aksi notif semua lembaga (bukan draft).
     *
     * @return list<array{id:int, nama:string, whatsapp:string}>
     */
    public static function fetchNotifSemuaLembagaPengurusWithWa(\PDO $db): array
    {
        $sql = 'SELECT DISTINCT p.id, p.nama, COALESCE(u.no_wa, \'\') AS whatsapp
            FROM pengurus p
            LEFT JOIN users u ON u.id = p.id_user
            WHERE CHAR_LENGTH(COALESCE(u.no_wa, \'\')) > 0
            AND (
                p.status IS NULL
                OR LOWER(TRIM(COALESCE(p.status, \'\'))) NOT IN (\'tidak aktif\', \'inactive\')
            )
            AND EXISTS (
                SELECT 1 FROM pengurus___role pr
                INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                INNER JOIN app___fitur af ON af.id = rf.fitur_id
                    AND af.type = \'action\'
                    AND af.code = ?
                WHERE pr.pengurus_id = p.id
            )
            ORDER BY p.nama ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute([self::CODE_NOTIF_SEMUA_LEMBAGA]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        return self::rowsToRecipientList($rows);
    }

    /**
     * Hanya role dengan aksi notif lembaga sesuai penugasan; wajib cocok dengan lembaga rencana/pengeluaran.
     *
     * @return list<array{id:int, nama:string, whatsapp:string}>
     */
    public static function fetchNotifLembagaSesuaiRolePengurusWithWa(\PDO $db, ?string $lembagaId): array
    {
        $lembagaId = $lembagaId !== null ? trim($lembagaId) : '';
        if ($lembagaId === '') {
            return [];
        }

        $sql = 'SELECT DISTINCT p.id, p.nama, COALESCE(u.no_wa, \'\') AS whatsapp
            FROM pengurus p
            LEFT JOIN users u ON u.id = p.id_user
            WHERE CHAR_LENGTH(COALESCE(u.no_wa, \'\')) > 0
            AND (
                p.status IS NULL
                OR LOWER(TRIM(COALESCE(p.status, \'\'))) NOT IN (\'tidak aktif\', \'inactive\')
            )
            AND EXISTS (
                SELECT 1 FROM pengurus___role pr
                INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                INNER JOIN app___fitur af ON af.id = rf.fitur_id
                    AND af.type = \'action\'
                    AND af.code = ?
                WHERE pr.pengurus_id = p.id
                AND pr.lembaga_id IS NOT NULL AND CHAR_LENGTH(TRIM(pr.lembaga_id)) > 0
                AND CONVERT(TRIM(pr.lembaga_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                    = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
            )
            ORDER BY p.nama ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute([self::CODE_NOTIF_LEMBAGA_SESUAI_ROLE, $lembagaId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        return self::rowsToRecipientList($rows);
    }

    /**
     * @return array{notif_semua_lembaga: list<array{id:int, nama:string, whatsapp:string}>, notif_lembaga_sesuai_role: list<array{id:int, nama:string, whatsapp:string}>}
     */
    public static function fetchRecipientGroupsWithWa(\PDO $db, ?string $lembagaId, bool $draftWaOnly = false): array
    {
        if ($draftWaOnly) {
            $draftList = self::fetchEligiblePengurusWithWaDraftLembagaOnly($db, $lembagaId);

            return [
                'notif_semua_lembaga' => [],
                'notif_lembaga_sesuai_role' => $draftList,
            ];
        }

        $semua = self::fetchNotifSemuaLembagaPengurusWithWa($db);
        $semuaIds = [];
        foreach ($semua as $r) {
            if ($r['id'] > 0) {
                $semuaIds[$r['id']] = true;
            }
        }

        $lembagaFull = self::fetchNotifLembagaSesuaiRolePengurusWithWa($db, $lembagaId);
        $lembagaOnly = [];
        foreach ($lembagaFull as $r) {
            if ($r['id'] > 0 && !isset($semuaIds[$r['id']])) {
                $lembagaOnly[] = $r;
            }
        }

        return [
            'notif_semua_lembaga' => $semua,
            'notif_lembaga_sesuai_role' => $lembagaOnly,
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     *
     * @return list<array{id:int, nama:string, whatsapp:string}>
     */
    private static function rowsToRecipientList(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => (int) ($row['id'] ?? 0),
                'nama' => (string) ($row['nama'] ?? ''),
                'whatsapp' => trim((string) ($row['whatsapp'] ?? '')),
            ];
        }

        return $out;
    }

    /**
     * Gabung unik by id (urutan: semua dulu, lalu lembaga), sort nama.
     *
     * @param list<array{id:int, nama:string, whatsapp:string}> $a
     * @param list<array{id:int, nama:string, whatsapp:string}> $b
     *
     * @return list<array{id:int, nama:string, whatsapp:string}>
     */
    public static function mergeRecipientListsUnique(array $a, array $b): array
    {
        $byId = [];
        foreach (array_merge($a, $b) as $r) {
            $id = (int) ($r['id'] ?? 0);
            if ($id < 1) {
                continue;
            }
            if (!isset($byId[$id])) {
                $byId[$id] = $r;
            }
        }
        $merged = array_values($byId);
        usort($merged, static function (array $x, array $y): int {
            return strcasecmp((string) ($x['nama'] ?? ''), (string) ($y['nama'] ?? ''));
        });

        return $merged;
    }

    /**
     * @return list<array{id:int, nama:string, whatsapp:string}>
     */
    public static function fetchEligiblePengurusWithWa(\PDO $db, ?string $lembagaId, bool $draftWaOnly = false): array
    {
        if ($draftWaOnly) {
            return self::fetchEligiblePengurusWithWaDraftLembagaOnly($db, $lembagaId);
        }

        $g = self::fetchRecipientGroupsWithWa($db, $lembagaId, false);

        return self::mergeRecipientListsUnique($g['notif_semua_lembaga'], $g['notif_lembaga_sesuai_role']);
    }

    /**
     * Penerima WA khusus draft: role dengan CODE_NOTIF_DRAFT_LEMBAGA_SESUAI_ROLE dan
     * pengurus___role.lembaga_id = lembaga rencana; plus super_admin yang punya aksi itu (tanpa syarat lembaga di penugasan).
     *
     * @return list<array{id:int, nama:string, whatsapp:string}>
     */
    private static function fetchEligiblePengurusWithWaDraftLembagaOnly(\PDO $db, ?string $lembagaId): array
    {
        $lembagaId = $lembagaId !== null ? trim($lembagaId) : '';
        if ($lembagaId === '') {
            return [];
        }

        $sql = 'SELECT DISTINCT p.id, p.nama, COALESCE(u.no_wa, \'\') AS whatsapp
            FROM pengurus p
            LEFT JOIN users u ON u.id = p.id_user
            WHERE CHAR_LENGTH(COALESCE(u.no_wa, \'\')) > 0
            AND (
                p.status IS NULL
                OR LOWER(TRIM(COALESCE(p.status, \'\'))) NOT IN (\'tidak aktif\', \'inactive\')
            )
            AND (
                EXISTS (
                    SELECT 1 FROM pengurus___role pr
                    INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                    INNER JOIN app___fitur af ON af.id = rf.fitur_id
                        AND af.type = \'action\'
                        AND af.code = ?
                    WHERE pr.pengurus_id = p.id
                    AND pr.lembaga_id IS NOT NULL AND CHAR_LENGTH(TRIM(pr.lembaga_id)) > 0
                    AND CONVERT(TRIM(pr.lembaga_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                        = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
                )
                OR EXISTS (
                    SELECT 1 FROM pengurus___role pr
                    INNER JOIN `role` ro ON ro.id = pr.role_id AND ro.`key` = \'super_admin\'
                    INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                    INNER JOIN app___fitur af ON af.id = rf.fitur_id
                        AND af.type = \'action\'
                        AND af.code = ?
                    WHERE pr.pengurus_id = p.id
                )
            )
            ORDER BY p.nama ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute([
            self::CODE_NOTIF_DRAFT_LEMBAGA_SESUAI_ROLE,
            $lembagaId,
            self::CODE_NOTIF_DRAFT_LEMBAGA_SESUAI_ROLE,
        ]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => (int) ($row['id'] ?? 0),
                'nama' => (string) ($row['nama'] ?? ''),
                'whatsapp' => trim((string) ($row['whatsapp'] ?? '')),
            ];
        }

        return $out;
    }

    /**
     * @param list<array<string, mixed>> $recipients
     * @return list<array{id:int, whatsapp:string}>
     */
    public static function filterRecipients(\PDO $db, ?string $lembagaId, array $recipients, bool $draftWaOnly = false): array
    {
        $allowed = [];
        foreach (self::fetchEligiblePengurusWithWa($db, $lembagaId, $draftWaOnly) as $row) {
            if ($row['id'] > 0) {
                $allowed[$row['id']] = true;
            }
        }

        $out = [];
        foreach ($recipients as $r) {
            if (!\is_array($r)) {
                continue;
            }
            $id = isset($r['id']) ? (int) $r['id'] : 0;
            if ($id < 1 || !isset($allowed[$id])) {
                continue;
            }
            $whatsapp = isset($r['whatsapp']) ? trim((string) $r['whatsapp']) : '';
            if ($whatsapp === '') {
                continue;
            }
            $out[] = ['id' => $id, 'whatsapp' => $whatsapp];
        }

        return $out;
    }

    /**
     * @return list<int>
     */
    public static function fetchEligiblePengurusIds(\PDO $db, ?string $lembagaId, bool $draftWaOnly = false): array
    {
        $ids = [];
        foreach (self::fetchEligiblePengurusWithWa($db, $lembagaId, $draftWaOnly) as $row) {
            if ($row['id'] > 0) {
                $ids[] = $row['id'];
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * Pengurus yang boleh menerima PWA untuk kejadian rencana (komentar / dilihat / dll.): sama seperti kebijakan notif WA,
     * tanpa mensyaratkan nomor WhatsApp (beda dengan daftar penerima WA).
     *
     * @return list<int>
     */
    public static function fetchEligiblePengurusIdsForPush(\PDO $db, ?string $lembagaId, bool $draftWaOnly = false): array
    {
        if ($draftWaOnly) {
            return self::fetchEligiblePengurusIdsDraftForPush($db, $lembagaId);
        }

        $lembagaId = $lembagaId !== null ? trim($lembagaId) : '';
        $sql = 'SELECT DISTINCT p.id
            FROM pengurus p
            WHERE (
                p.status IS NULL
                OR LOWER(TRIM(COALESCE(p.status, \'\'))) NOT IN (\'tidak aktif\', \'inactive\')
            )
            AND (
                EXISTS (
                    SELECT 1 FROM pengurus___role pr
                    INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                    INNER JOIN app___fitur af ON af.id = rf.fitur_id
                        AND af.type = \'action\'
                        AND af.code = ?
                    WHERE pr.pengurus_id = p.id
                )
                OR (
                    CHAR_LENGTH(?) > 0 AND EXISTS (
                        SELECT 1 FROM pengurus___role pr
                        INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                        INNER JOIN app___fitur af ON af.id = rf.fitur_id
                            AND af.type = \'action\'
                            AND af.code = ?
                        WHERE pr.pengurus_id = p.id
                        AND pr.lembaga_id IS NOT NULL AND CHAR_LENGTH(TRIM(pr.lembaga_id)) > 0
                        AND CONVERT(TRIM(pr.lembaga_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                            = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
                    )
                )
            )
            ORDER BY p.id ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute([
            self::CODE_NOTIF_SEMUA_LEMBAGA,
            $lembagaId,
            self::CODE_NOTIF_LEMBAGA_SESUAI_ROLE,
            $lembagaId,
        ]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $ids = [];
        foreach ($rows as $row) {
            $id = (int) ($row['id'] ?? 0);
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * @return list<int>
     */
    private static function fetchEligiblePengurusIdsDraftForPush(\PDO $db, ?string $lembagaId): array
    {
        $lembagaId = $lembagaId !== null ? trim($lembagaId) : '';
        if ($lembagaId === '') {
            return [];
        }

        $sql = 'SELECT DISTINCT p.id
            FROM pengurus p
            WHERE (
                p.status IS NULL
                OR LOWER(TRIM(COALESCE(p.status, \'\'))) NOT IN (\'tidak aktif\', \'inactive\')
            )
            AND (
                EXISTS (
                    SELECT 1 FROM pengurus___role pr
                    INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                    INNER JOIN app___fitur af ON af.id = rf.fitur_id
                        AND af.type = \'action\'
                        AND af.code = ?
                    WHERE pr.pengurus_id = p.id
                    AND pr.lembaga_id IS NOT NULL AND CHAR_LENGTH(TRIM(pr.lembaga_id)) > 0
                    AND CONVERT(TRIM(pr.lembaga_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                        = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
                )
                OR EXISTS (
                    SELECT 1 FROM pengurus___role pr
                    INNER JOIN `role` ro ON ro.id = pr.role_id AND ro.`key` = \'super_admin\'
                    INNER JOIN role___fitur rf ON rf.role_id = pr.role_id
                    INNER JOIN app___fitur af ON af.id = rf.fitur_id
                        AND af.type = \'action\'
                        AND af.code = ?
                    WHERE pr.pengurus_id = p.id
                )
            )
            ORDER BY p.id ASC';

        $stmt = $db->prepare($sql);
        $stmt->execute([
            self::CODE_NOTIF_DRAFT_LEMBAGA_SESUAI_ROLE,
            $lembagaId,
            self::CODE_NOTIF_DRAFT_LEMBAGA_SESUAI_ROLE,
        ]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $ids = [];
        foreach ($rows as $row) {
            $id = (int) ($row['id'] ?? 0);
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return array_values(array_unique($ids));
    }
}
