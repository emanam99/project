<?php

namespace App\Helpers;

use App\Database;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Mencatat aktivitas user ke user___aktivitas (audit trail + data untuk rollback).
 * Panggil sebelum/setelah perubahan data agar old_data dan new_data tercatat.
 *
 * Contoh:
 *   UserAktivitasLogger::log($userId, $pengurusId, 'update', 'pengeluaran', $id, $oldRow, $newRow, $request);
 *   UserAktivitasLogger::log($userId, $pengurusId, 'rollback', 'pengeluaran', $id, $currentRow, $restoredRow, $request, $refAktivitasId);
 */
class UserAktivitasLogger
{
    public const ACTION_CREATE = 'create';
    public const ACTION_UPDATE = 'update';
    public const ACTION_DELETE = 'delete';
    public const ACTION_ROLLBACK = 'rollback';
    /** Aksi baca/unduh data (export) - entity_id bisa id atau deskripsi (mis. "pendaftar") */
    public const ACTION_EXPORT = 'export';

    private static function getDb(): ?\PDO
    {
        try {
            return Database::getInstance()->getConnection();
        } catch (\Throwable $e) {
            error_log('UserAktivitasLogger::getDb ' . $e->getMessage());
            return null;
        }
    }

    /** Resolve users.id dari pengurus.id (untuk token JWT yang pakai pengurus id). */
    private static function resolveUserId(?\PDO $db, ?int $pengurusId): ?int
    {
        if ($db === null || $pengurusId === null) {
            return null;
        }
        try {
            $stmt = $db->prepare("SELECT id_user FROM pengurus WHERE id = ? LIMIT 1");
            $stmt->execute([$pengurusId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $row && !empty($row['id_user']) ? (int) $row['id_user'] : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private static function getIpAndAgent($request): array
    {
        $ip = 'unknown';
        $ua = null;
        if ($request instanceof ServerRequestInterface) {
            $params = $request->getServerParams();
            $ip = $params['REMOTE_ADDR'] ?? 'unknown';
            if (!empty($params['HTTP_X_FORWARDED_FOR'])) {
                $ips = explode(',', $params['HTTP_X_FORWARDED_FOR']);
                $ip = trim($ips[0]);
            }
            $ua = $request->getHeaderLine('User-Agent');
            if ($ua !== '' && strlen($ua) > 500) {
                $ua = substr($ua, 0, 500);
            }
        }
        return [$ip, $ua ?: null];
    }

    /** Nilai actor_entity_type: pengurus, santri, madrasah (arah aktor). */
    public const ACTOR_PENGURUS = 'pengurus';
    public const ACTOR_SANTRI = 'santri';
    public const ACTOR_MADRASAH = 'madrasah';

    /**
     * Catat satu aktivitas.
     *
     * @param int|null $userId users.id (null = sistem/anon atau pendaftaran tanpa akun)
     * @param int|null $pengurusId pengurus.id untuk tampilan nama (backward compat)
     * @param string $action create|update|delete|rollback|export
     * @param string $entityType Nama tabel/entitas (pengeluaran, pemasukan, psb___registrasi, santri, uwaba___bayar, dll.)
     * @param string|int $entityId Nilai primary key
     * @param array|object|null $oldData Snapshot sebelum (untuk rollback = restore ini)
     * @param array|object|null $newData Snapshot setelah
     * @param ServerRequestInterface|null $request Untuk ambil IP dan User-Agent
     * @param int|null $refAktivitasId Untuk action=rollback, id baris user___aktivitas yang di-revert
     * @param int|null $santriId santri.id jika aksi oleh santri (backward compat; bisa digantikan actor_*)
     * @param string|null $actorEntityType Keterangan arah aktor: pengurus|santri|madrasah (kolom dinamis)
     * @param int|null $actorEntityId Id di tabel sesuai actor_entity_type (kolom dinamis)
     */
    public static function log(
        ?int $userId,
        ?int $pengurusId,
        string $action,
        string $entityType,
        $entityId,
        $oldData = null,
        $newData = null,
        ?ServerRequestInterface $request = null,
        ?int $refAktivitasId = null,
        ?int $santriId = null,
        ?string $actorEntityType = null,
        ?int $actorEntityId = null
    ): void {
        $db = self::getDb();
        if (!$db) {
            return;
        }

        // Derive pengurus_id/santri_id from actor when provided (untuk JOIN tampilan)
        if ($actorEntityType !== null && $actorEntityId !== null) {
            if ($actorEntityType === self::ACTOR_PENGURUS) {
                $pengurusId = $pengurusId ?? $actorEntityId;
            } elseif ($actorEntityType === self::ACTOR_SANTRI) {
                $santriId = $santriId ?? $actorEntityId;
            }
        }

        if ($userId === null && $pengurusId !== null) {
            $userId = self::resolveUserId($db, $pengurusId);
        }

        $entityIdStr = is_scalar($entityId) ? (string) $entityId : json_encode($entityId);
        $oldJson = $oldData !== null ? json_encode($oldData, JSON_UNESCAPED_UNICODE) : null;
        $newJson = $newData !== null ? json_encode($newData, JSON_UNESCAPED_UNICODE) : null;
        [$ip, $userAgent] = self::getIpAndAgent($request);

        $actorTypeNorm = ($actorEntityType !== null && $actorEntityType !== '') ? trim($actorEntityType) : null;

        try {
            $stmt = $db->prepare("
                INSERT INTO user___aktivitas (user_id, pengurus_id, santri_id, actor_entity_type, actor_entity_id, action, entity_type, entity_id, old_data, new_data, ref_aktivitas_id, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $userId,
                $pengurusId,
                $santriId,
                $actorTypeNorm,
                $actorEntityId,
                $action,
                $entityType,
                $entityIdStr,
                $oldJson,
                $newJson,
                $refAktivitasId,
                $ip,
                $userAgent,
            ]);
        } catch (\Throwable $e) {
            if (strpos($e->getMessage(), 'actor_entity') !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
                try {
                    $stmt = $db->prepare("
                        INSERT INTO user___aktivitas (user_id, pengurus_id, santri_id, action, entity_type, entity_id, old_data, new_data, ref_aktivitas_id, ip_address, user_agent)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $stmt->execute([
                        $userId,
                        $pengurusId,
                        $santriId,
                        $action,
                        $entityType,
                        $entityIdStr,
                        $oldJson,
                        $newJson,
                        $refAktivitasId,
                        $ip,
                        $userAgent,
                    ]);
                } catch (\Throwable $e2) {
                    error_log('UserAktivitasLogger::log (fallback) ' . $e2->getMessage());
                }
            } elseif (strpos($e->getMessage(), "santri_id") !== false || strpos($e->getMessage(), 'Unknown column') !== false) {
                try {
                    $stmt = $db->prepare("
                        INSERT INTO user___aktivitas (user_id, pengurus_id, action, entity_type, entity_id, old_data, new_data, ref_aktivitas_id, ip_address, user_agent)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $stmt->execute([
                        $userId,
                        $pengurusId,
                        $action,
                        $entityType,
                        $entityIdStr,
                        $oldJson,
                        $newJson,
                        $refAktivitasId,
                        $ip,
                        $userAgent,
                    ]);
                } catch (\Throwable $e2) {
                    error_log('UserAktivitasLogger::log (fallback) ' . $e2->getMessage());
                }
            } else {
                error_log('UserAktivitasLogger::log ' . $e->getMessage());
            }
        }
    }
}
