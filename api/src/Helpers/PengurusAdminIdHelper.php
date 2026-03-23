<?php

namespace App\Helpers;

use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Resolusi id_admin / pengurus untuk pencatatan keuangan: cegah pemalsuan dari body,
 * selaras super_admin vs token pengurus.
 */
class PengurusAdminIdHelper
{
    /** @return array<string, mixed> */
    public static function userArrayFromRequest(Request $request): array
    {
        $u = $request->getAttribute('user');

        return is_array($u) ? $u : [];
    }

    public static function resolveFromRequest(Request $request, $requestedRaw): ?int
    {
        return self::resolveEffectivePengurusId(self::userArrayFromRequest($request), $requestedRaw);
    }

    /** Super_admin boleh mencatat atas nama id_admin lain; selain itu hanya pengurus dari token. */
    public static function actorMayUseRequestedPengurusId(array $uArr, int $requestedAdminId): bool
    {
        if ($requestedAdminId <= 0) {
            return false;
        }
        if (RoleHelper::tokenHasAnyRoleKey($uArr, ['super_admin'])) {
            return true;
        }
        $pid = RoleHelper::getPengurusIdFromPayload($uArr);
        if ($pid !== null && $pid > 0 && RoleHelper::pengurusHasSuperAdminRole($pid)) {
            return true;
        }
        $tokenId = isset($uArr['user_id']) ? (int) $uArr['user_id'] : (int) ($uArr['id'] ?? 0);

        return $tokenId > 0 && $tokenId === $requestedAdminId;
    }

    /** id_admin efektif untuk insert/update; null = token tidak mengidentifikasi pengurus. */
    public static function resolveEffectivePengurusId(?array $userArr, $requestedRaw): ?int
    {
        $uArr = is_array($userArr) ? $userArr : [];
        $requested = (is_int($requestedRaw) || (is_string($requestedRaw) && is_numeric($requestedRaw))) ? (int) $requestedRaw : 0;
        $tokenId = isset($uArr['user_id']) ? (int) $uArr['user_id'] : (int) ($uArr['id'] ?? 0);
        if ($requested > 0 && self::actorMayUseRequestedPengurusId($uArr, $requested)) {
            return $requested;
        }
        if ($tokenId > 0) {
            return $tokenId;
        }

        return null;
    }

    public static function fetchPengurusNama(PDO $db, int $pengurusId): ?string
    {
        if ($pengurusId <= 0) {
            return null;
        }
        try {
            $stmt = $db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                return null;
            }
            $n = trim((string) ($row['nama'] ?? ''));

            return $n !== '' ? $n : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /** Hapus/modifikasi baris yang punya id_admin pemilik: pemilik baris atau super_admin. */
    public static function actorMayModifyRowPengurusId(array $uArr, $rowIdAdmin): bool
    {
        $rowId = (int) $rowIdAdmin;
        if (RoleHelper::tokenHasAnyRoleKey($uArr, ['super_admin'])) {
            return true;
        }
        $pid = RoleHelper::getPengurusIdFromPayload($uArr);
        if ($pid !== null && $pid > 0 && RoleHelper::pengurusHasSuperAdminRole($pid)) {
            return true;
        }
        $tokenId = isset($uArr['user_id']) ? (int) $uArr['user_id'] : (int) ($uArr['id'] ?? 0);

        return $tokenId > 0 && $rowId > 0 && $tokenId === $rowId;
    }
}
