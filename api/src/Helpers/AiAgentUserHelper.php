<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Konteks user JWT untuk agen (selaras dengan DeepseekController::resolveUsersId).
 */
final class AiAgentUserHelper
{
    /**
     * Payload minimal seperti JWT untuk RBAC agen (WA terverifikasi, tanpa token).
     *
     * @return array<string, mixed>|null
     */
    public static function buildPayloadForAgentFromUsersId(\PDO $db, int $usersId): ?array
    {
        if ($usersId < 1) {
            return null;
        }
        try {
            $stmt = $db->prepare(
                'SELECT u.id AS users_id, u.username, p.id AS pengurus_id '
                . 'FROM users u LEFT JOIN pengurus p ON p.id_user = u.id WHERE u.id = ? LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return null;
            }
            $pengurusId = (int) ($row['pengurus_id'] ?? 0);
            $allRoles = [];
            if ($pengurusId > 0) {
                foreach (RoleHelper::getUserRoles($pengurusId) as $r) {
                    $k = str_replace(' ', '_', strtolower(trim((string) ($r['role_key'] ?? ''))));
                    if ($k !== '') {
                        $allRoles[$k] = true;
                    }
                }
            }
            $allRoleKeys = array_keys($allRoles);
            sort($allRoleKeys);
            $primary = $allRoleKeys[0] ?? '';

            return [
                'users_id' => $usersId,
                'user_id' => $pengurusId > 0 ? $pengurusId : $usersId,
                'id_pengurus' => $pengurusId > 0 ? $pengurusId : null,
                'username' => trim((string) ($row['username'] ?? '')),
                'role_key' => $primary,
                'user_role' => $primary,
                'all_roles' => $allRoleKeys,
                'is_real_super_admin' => in_array('super_admin', $allRoleKeys, true),
            ];
        } catch (\Throwable $e) {
            error_log('AiAgentUserHelper::buildPayloadForAgentFromUsersId ' . $e->getMessage());

            return null;
        }
    }

    public static function resolveUsersId(array $payload, \PDO $db): ?int
    {
        $userIdFromToken = (int) ($payload['user_id'] ?? $payload['id'] ?? 0);

        if (isset($payload['users_id']) && (int) $payload['users_id'] > 0) {
            $resolved = (int) $payload['users_id'];
        } elseif ($userIdFromToken > 0) {
            $stmt = $db->prepare('SELECT id_user FROM pengurus WHERE id = ? LIMIT 1');
            $stmt->execute([$userIdFromToken]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $resolved = ($row && !empty($row['id_user'])) ? (int) $row['id_user'] : $userIdFromToken;
        } else {
            return null;
        }

        if ($resolved < 1) {
            return null;
        }

        $stmt = $db->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$resolved]);

        return $stmt->fetch(\PDO::FETCH_ASSOC) ? $resolved : null;
    }

    public static function resolvePengurusId(array $payload): int
    {
        $v = (int) ($payload['user_id'] ?? $payload['id'] ?? 0);

        return $v > 0 ? $v : 0;
    }

    /**
     * @return array{userName: string, userEmail: string}
     */
    public static function fetchDisplay(\PDO $db, int $usersId): array
    {
        try {
            $su = $db->prepare(
                'SELECT u.email AS email, u.username AS username, '
                . 'COALESCE(NULLIF(TRIM(p.nama), \'\'), NULLIF(TRIM(s.nama), \'\')) AS nama '
                . 'FROM users u '
                . 'LEFT JOIN pengurus p ON p.id_user = u.id '
                . 'LEFT JOIN santri s ON s.id_user = u.id '
                . 'WHERE u.id = ? LIMIT 1'
            );
            $su->execute([$usersId]);
            $ur = $su->fetch(\PDO::FETCH_ASSOC);
            if (!$ur) {
                return ['userName' => '', 'userEmail' => ''];
            }
            $userEmail = trim((string) ($ur['email'] ?? ''));
            $n = trim((string) ($ur['nama'] ?? ''));
            $u = trim((string) ($ur['username'] ?? ''));
            $userName = $n !== '' ? ($u !== '' ? $n . ' @' . $u : $n) : ($u !== '' ? $u : '');

            return ['userName' => $userName, 'userEmail' => $userEmail];
        } catch (\Throwable $e) {
            error_log('AiAgentUserHelper::fetchDisplay ' . $e->getMessage());

            return ['userName' => '', 'userEmail' => ''];
        }
    }
}
