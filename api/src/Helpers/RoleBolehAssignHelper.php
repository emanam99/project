<?php

namespace App\Helpers;

/**
 * Matriks role___boleh_assign_role: role_id (pemilik wewenang) → assignable_role_id (boleh ditugaskan ke pengurus lain).
 * Tanpa baris untuk role pemanggil = tidak dibatasi (perilaku lama). Ada baris = hanya union assignable_role_id.
 */
final class RoleBolehAssignHelper
{
    public const FITUR_ASSIGN_SEMUA = 'action.pengurus.role.assign_semua';

    /**
     * @return null|list<int> null = semua role di tabel `role` boleh ditugaskan; [] = tidak ada yang boleh; non-empty = id role yang boleh
     */
    public static function resolveAssignableRoleIds(\PDO $db, array $user): ?array
    {
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return null;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::FITUR_ASSIGN_SEMUA)) {
            return null;
        }

        $actorId = RoleHelper::getPengurusIdFromPayload($user);
        // Fallback: token kadang tidak punya id_pengurus / user_id tidak ter-resolve, tapi users_id masih valid.
        if ($actorId === null || $actorId <= 0) {
            $usersId = isset($user['users_id']) ? (int) $user['users_id'] : 0;
            if ($usersId > 0) {
                $stmt = $db->prepare('SELECT id FROM pengurus WHERE id_user = ? LIMIT 1');
                $stmt->execute([$usersId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row && !empty($row['id'])) {
                    $actorId = (int) $row['id'];
                }
            }
        }
        if ($actorId === null || $actorId <= 0) {
            return [];
        }

        // Gabungkan role_id dari pengurus___role dengan id hasil `role.key` dari JWT (multi_role: primary key bukan baris di tabel `role`, jadi jangan hanya salah satu sumber).
        $actorRoleIdsMap = [];
        $stmt = $db->prepare('SELECT DISTINCT role_id FROM pengurus___role WHERE pengurus_id = ?');
        $stmt->execute([$actorId]);
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $rid = isset($row['role_id']) ? (int) $row['role_id'] : 0;
            if ($rid > 0) {
                $actorRoleIdsMap[$rid] = true;
            }
        }
        $keys = RoleHelper::normalizeTokenRoleKeysUnion($user);
        // `multi_role` adalah label token untuk banyak role, bukan `role.key` di DB — jangan ikut ke IN (...).
        $keys = array_values(array_filter(
            $keys,
            static function ($k): bool {
                $s = strtolower(trim((string) $k));

                return $s !== '' && $s !== 'multi_role';
            }
        ));
        if ($keys !== []) {
            $placeholders = implode(',', array_fill(0, \count($keys), '?'));
            $stmt = $db->prepare("SELECT DISTINCT id FROM `role` WHERE `key` IN ({$placeholders})");
            $stmt->execute($keys);
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $rid = isset($row['id']) ? (int) $row['id'] : 0;
                if ($rid > 0) {
                    $actorRoleIdsMap[$rid] = true;
                }
            }
        }
        $actorRoleIds = array_keys($actorRoleIdsMap);
        if ($actorRoleIds === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, \count($actorRoleIds), '?'));
        $chk = $db->prepare("SELECT COUNT(*) FROM role___boleh_assign_role WHERE role_id IN ({$placeholders})");
        $chk->execute($actorRoleIds);
        if ((int) $chk->fetchColumn() === 0) {
            return null;
        }

        $sel = $db->prepare("SELECT DISTINCT assignable_role_id FROM role___boleh_assign_role WHERE role_id IN ({$placeholders})");
        $sel->execute($actorRoleIds);
        $out = [];
        while ($row = $sel->fetch(\PDO::FETCH_ASSOC)) {
            $aid = isset($row['assignable_role_id']) ? (int) $row['assignable_role_id'] : 0;
            if ($aid > 0) {
                $out[$aid] = true;
            }
        }

        $candidate = array_keys($out);
        if ($candidate === []) {
            return [];
        }
        // Buang id yang sudah tidak ada di `role` (matriks yatim) agar GET assignable-list tidak data=[] dengan restricted=true.
        $placeholders = implode(',', array_fill(0, \count($candidate), '?'));
        $exist = $db->prepare("SELECT id FROM `role` WHERE id IN ({$placeholders})");
        $exist->execute($candidate);
        $existing = [];
        while ($row = $exist->fetch(\PDO::FETCH_ASSOC)) {
            $rid = isset($row['id']) ? (int) $row['id'] : 0;
            if ($rid > 0) {
                $existing[$rid] = true;
            }
        }

        return array_keys($existing);
    }

    /**
     * @param null|list<int> $allowed dari resolveAssignableRoleIds
     */
    public static function roleIdAllowed(?array $allowed, int $roleId): bool
    {
        if ($allowed === null) {
            return true;
        }

        return \in_array($roleId, $allowed, true);
    }

}
