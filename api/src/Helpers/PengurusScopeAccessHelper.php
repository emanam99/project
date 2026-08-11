<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Cakupan lembaga & izin edit biodata pengurus (selaras ManageUsersController).
 */
final class PengurusScopeAccessHelper
{
    public const FITUR_PENGURUS_FILTER_LEMBAGA_SEMUA = 'action.pengurus.filter.lembaga_semua';
    public const FITUR_PENGURUS_EDIT = 'action.pengurus.edit';

    /**
     * @return null|list<string> null = tanpa filter; [] = tidak ada akses; non-empty = batasi ke id lembaga
     */
    public static function resolvePengurusListLembagaScopeIds(PDO $db, Request $request): ?array
    {
        $user = $request->getAttribute('user');
        if (!\is_array($user)) {
            return [];
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return null;
        }
        if (RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::FITUR_PENGURUS_FILTER_LEMBAGA_SEMUA)) {
            return null;
        }
        $pid = RoleHelper::getPengurusIdFromPayload($user);
        if ($pid === null || $pid <= 0) {
            return [];
        }
        $scope = RoleHelper::computeLembagaAccessUnion($pid);
        if ($scope['lembaga_scope_all']) {
            return null;
        }
        $allowed = $scope['lembaga_ids'];
        if ($allowed === []) {
            return [];
        }

        return \array_values($allowed);
    }

    /**
     * @param list<string> $scopeIds
     *
     * @return array{clause: string, params: list<mixed>}
     */
    public static function buildPengurusLembagaScopeWhere(int $viewerPengurusId, array $scopeIds): array
    {
        $placeholders = implode(',', array_fill(0, \count($scopeIds), '?'));
        $clause = "(
            p.id = ?
            OR EXISTS (
                SELECT 1 FROM pengurus___jabatan pj_sc
                INNER JOIN jabatan j_sc ON pj_sc.jabatan_id = j_sc.id
                WHERE pj_sc.pengurus_id = p.id
                AND (pj_sc.status = 'aktif' OR pj_sc.status = 'active' OR pj_sc.status IS NULL OR TRIM(COALESCE(pj_sc.status, '')) = '')
                AND COALESCE(NULLIF(TRIM(pj_sc.lembaga_id), ''), j_sc.lembaga_id) IN ({$placeholders})
            )
            OR EXISTS (
                SELECT 1 FROM pengurus___role pr_sc
                WHERE pr_sc.pengurus_id = p.id
                AND pr_sc.lembaga_id IS NOT NULL AND TRIM(pr_sc.lembaga_id) != ''
                AND pr_sc.lembaga_id IN ({$placeholders})
            )
        )";
        $params = \array_merge([$viewerPengurusId], $scopeIds, $scopeIds);

        return ['clause' => $clause, 'params' => $params];
    }

    public static function pengurusTargetVisibleInScope(PDO $db, Request $request, string $targetPengurusId): bool
    {
        $scopeIds = self::resolvePengurusListLembagaScopeIds($db, $request);
        if ($scopeIds === null) {
            return true;
        }
        if ($scopeIds === []) {
            return false;
        }
        $user = $request->getAttribute('user');
        $viewer = RoleHelper::getPengurusIdFromPayload(\is_array($user) ? $user : []);
        if ($viewer !== null && (string) $viewer === (string) $targetPengurusId) {
            return true;
        }
        $w = self::buildPengurusLembagaScopeWhere((int) $viewer, $scopeIds);
        $sql = 'SELECT 1 FROM pengurus p WHERE p.id = ? AND ' . $w['clause'] . ' LIMIT 1';
        $params = \array_merge([$targetPengurusId], $w['params']);
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return (bool) $stmt->fetchColumn();
    }

    /** Biodata lengkap: profil sendiri, super_admin, atau action.pengurus.edit + cakupan lembaga. */
    public static function canEditPengurusBiodata(PDO $db, Request $request, int $targetPengurusId): bool
    {
        $user = $request->getAttribute('user');
        if (!\is_array($user)) {
            return false;
        }
        $currentId = RoleHelper::getPengurusIdFromPayload($user);
        if ($currentId !== null && $currentId === $targetPengurusId) {
            return true;
        }
        if (RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])) {
            return true;
        }
        // Jangan izinkan role legacy (mis. admin_ugt) membaca biodata orang lain tanpa fitur edit + scope.
        if (!RoleHelper::tokenHasEbeddienFiturCode($db, $user, self::FITUR_PENGURUS_EDIT)) {
            return false;
        }

        return self::pengurusTargetVisibleInScope($db, $request, (string) $targetPengurusId);
    }
}
