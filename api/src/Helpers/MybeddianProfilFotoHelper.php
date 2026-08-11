<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Satukan path foto profil untuk Mybeddian: kolom users.foto_profil prioritas,
 * lalu toko/santri; terakhir foto pengurus (eBeddien /api/v2/profil/foto).
 */
final class MybeddianProfilFotoHelper
{
  private static ?string $uploadsBasePath = null;

  public static function getUploadsBasePath(): string
  {
    if (self::$uploadsBasePath !== null) {
      return self::$uploadsBasePath;
    }
    $config = require __DIR__ . '/../../config.php';
    $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
    $folder = $config['uploads_folder'] ?? 'uploads';
    $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
    self::$uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');

    return self::$uploadsBasePath;
  }

  public static function resolveFullUploadPath(string $uploadsBase, string $pathFile): string
  {
    $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
    if (stripos($pathFile, 'uploads') === 0) {
      $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
    }

    return $uploadsBase . DIRECTORY_SEPARATOR . $pathFile;
  }

  /** Path hanya jika file benar-benar ada di disk (hindari 404 di klien). */
  public static function resolveDisplayPathIfFileExists(\PDO $db, array $payload): ?string
  {
    $path = self::resolveDisplayPath($db, $payload);
    if (!$path || trim($path) === '') {
      return null;
    }
    $full = self::resolveFullUploadPath(self::getUploadsBasePath(), $path);

    return is_file($full) ? $path : null;
  }

    public static function resolveDisplayPath(\PDO $db, array $payload): ?string
    {
        $userId = 0;
        if (!empty($payload['users_id'])) {
            $userId = (int) $payload['users_id'];
        } elseif (!empty($payload['user_id'])) {
            $userId = (int) $payload['user_id'];
        }

        if ($userId > 0) {
            $stmt = $db->prepare('SELECT foto_profil FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && isset($row['foto_profil'])) {
                $p = trim((string) $row['foto_profil']);
                if ($p !== '') {
                    return $row['foto_profil'];
                }
            }
        }

        $tokoId = isset($payload['toko_id']) ? (int) $payload['toko_id'] : 0;
        if ($tokoId > 0 && $userId > 0) {
            $stmt = $db->prepare('SELECT foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1');
            $stmt->execute([$tokoId, $userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && isset($row['foto_path'])) {
                $p = trim((string) $row['foto_path']);
                if ($p !== '') {
                    return $row['foto_path'];
                }
            }
        }

        $santriId = isset($payload['santri_id']) ? (int) $payload['santri_id'] : 0;
        if ($santriId > 0) {
            $stmt = $db->prepare('SELECT foto_profil FROM santri WHERE id = ? LIMIT 1');
            $stmt->execute([$santriId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && isset($row['foto_profil'])) {
                $p = trim((string) $row['foto_profil']);
                if ($p !== '') {
                    return $row['foto_profil'];
                }
            }
        }

        if (RoleHelper::tokenIsSantriDaftarContext($payload)) {
            $sid = (int) ($payload['user_id'] ?? $payload['id'] ?? 0);
            if ($sid > 0) {
                $stmt = $db->prepare('SELECT foto_profil FROM santri WHERE id = ? LIMIT 1');
                $stmt->execute([$sid]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row && isset($row['foto_profil'])) {
                    $p = trim((string) $row['foto_profil']);
                    if ($p !== '') {
                        return $row['foto_profil'];
                    }
                }
            }
        }

        if ($userId > 0) {
            $stmt = $db->prepare('SELECT foto_profil FROM pengurus WHERE id_user = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row && isset($row['foto_profil'])) {
                $p = trim((string) $row['foto_profil']);
                if ($p !== '') {
                    return $row['foto_profil'];
                }
            }
        }

        return null;
    }
}
