<?php

declare(strict_types=1);

namespace App\Helpers;

use App\Auth\JwtAuth;
use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Otorisasi akses data santri berdasarkan JWT, view token, atau konteks staff.
 */
final class SantriJwtAccessHelper
{
    /** Kolom PII yang disembunyikan pada akses publik anonim. */
    private const PUBLIC_REDACT_KEYS = [
        'nik', 'nik_ayah', 'nik_ibu', 'nik_wali',
        'no_telpon', 'email', 'no_wa_santri', 'no_telpon_wali',
        'penghasilan_ayah', 'penghasilan_ibu', 'penghasilan_wali',
    ];

    public static function resolveJwtBoundSantriId(PDO $db, ?array $user): ?int
    {
        if ($user === null || $user === []) {
            return null;
        }
        if (!empty($user['santri_id']) && (int) $user['santri_id'] > 0) {
            return (int) $user['santri_id'];
        }
        if (RoleHelper::tokenIsSantriDaftarContext($user)) {
            $fromToken = SantriHelper::resolveSantriIdFromDaftarToken($db, $user);

            return $fromToken !== null && $fromToken > 0 ? $fromToken : null;
        }

        return null;
    }

    public static function extractOptionalJwtUser(Request $request): ?array
    {
        $auth = trim($request->getHeaderLine('Authorization'));
        if (!preg_match('/^Bearer\s+(\S+)/i', $auth, $m)) {
            return null;
        }
        $jwt = new JwtAuth();
        $payload = $jwt->validateToken($m[1]);

        return is_array($payload) ? $payload : null;
    }

    public static function extractViewToken(Request $request): ?string
    {
        $params = $request->getQueryParams();
        $fromQuery = isset($params['view_token']) ? trim((string) $params['view_token']) : '';
        if ($fromQuery !== '') {
            return $fromQuery;
        }
        $fromQuery = isset($params['token']) ? trim((string) $params['token']) : '';
        if ($fromQuery !== '' && PublicSantriViewTokenHelper::verify($fromQuery) !== null) {
            return $fromQuery;
        }
        $header = trim($request->getHeaderLine('X-Public-Santri-View-Token'));

        return $header !== '' ? $header : null;
    }

    /**
     * @return array{id_santri: int, scope: string}|null
     */
    public static function verifyViewTokenForSantri(Request $request, int $santriId, string $requiredScope): ?array
    {
        $raw = self::extractViewToken($request);
        if ($raw === null) {
            return null;
        }
        $payload = PublicSantriViewTokenHelper::verify($raw);
        if ($payload === null) {
            return null;
        }
        if ((int) $payload['id_santri'] !== $santriId) {
            return null;
        }
        if (!PublicSantriViewTokenHelper::scopeAllows((string) $payload['scope'], $requiredScope)) {
            return null;
        }

        return $payload;
    }

    public static function canAccessFullSantriData(PDO $db, Request $request, int $santriId, string $scope): bool
    {
        if (self::verifyViewTokenForSantri($request, $santriId, $scope) !== null) {
            return true;
        }

        $user = $request->getAttribute('user');
        if (!is_array($user) || $user === []) {
            $user = self::extractOptionalJwtUser($request);
        }
        if (!is_array($user) || $user === []) {
            return false;
        }

        $bound = self::resolveJwtBoundSantriId($db, $user);
        if ($bound !== null && $bound === $santriId) {
            return true;
        }

        if (RoleHelper::getPengurusIdFromPayload($user) !== null) {
            return RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])
                || RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($db, $user);
        }

        return false;
    }

    /**
     * Santri portal / daftar: wajib milik sendiri. Staff pengurus: boleh jika punya assignment eBeddien.
     *
     * @param int|null $santriId null bila hanya id_registrasi (staff saja)
     */
    public static function canAccessSantriPayment(PDO $db, Request $request, ?int $santriId): bool
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            return false;
        }

        $bound = self::resolveJwtBoundSantriId($db, $user);
        if ($bound !== null) {
            return $santriId !== null && $santriId > 0 && $bound === $santriId;
        }

        $pengurusId = RoleHelper::getPengurusIdFromPayload($user);
        if ($pengurusId !== null && $pengurusId > 0) {
            return RoleHelper::tokenHasAnyRoleKey($user, ['super_admin'])
                || RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($db, $user);
        }

        return false;
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    public static function redactPublicSantriRow(array $row): array
    {
        foreach (self::PUBLIC_REDACT_KEYS as $key) {
            unset($row[$key]);
        }

        return $row;
    }

    /**
     * @param list<array<string, mixed>> $rows
     *
     * @return list<array<string, mixed>>
     */
    public static function redactPublicIjinRows(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            unset($row['admin_ijin'], $row['admin_kembali'], $row['admin_ijin_nama'], $row['admin_kembali_nama']);
            $out[] = $row;
        }

        return $out;
    }

    public static function assertPasswordTargetAllowed(Request $request, int $targetPengurusId): bool
    {
        $user = $request->getAttribute('user');
        if (!is_array($user)) {
            return false;
        }
        $currentId = RoleHelper::getPengurusIdFromPayload($user);
        if ($currentId !== null && $currentId === $targetPengurusId) {
            return true;
        }

        return false;
    }
}
