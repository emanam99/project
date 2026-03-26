<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Token aktivasi AI WhatsApp: diterbitkan untuk user yang login; divalidasi saat pesan masuk WA.
 */
final class AiWaActivationTokenService
{
    private const DEFAULT_TTL_MINUTES = 15;

    /** Jeda minimum antar penerbitan token *baru* (detik); token masih valid dipakai ulang tanpa jeda. */
    private const DEFAULT_ISSUE_COOLDOWN_SECONDS = 600;

    /** @var bool|null */
    private static $tokenPlainColumnExists = null;

    public static function tableExists(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'ai___aktivasi'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function ttlMinutes(): int
    {
        $v = getenv('AI_WA_ACTIVATION_TOKEN_TTL_MINUTES');
        if ($v === false || $v === '') {
            return self::DEFAULT_TTL_MINUTES;
        }
        $n = (int) $v;

        return $n >= 5 && $n <= 120 ? $n : self::DEFAULT_TTL_MINUTES;
    }

    public static function issueCooldownSeconds(): int
    {
        $v = getenv('AI_WA_ACTIVATION_ISSUE_COOLDOWN_SECONDS');
        if ($v === false || $v === '') {
            return self::DEFAULT_ISSUE_COOLDOWN_SECONDS;
        }
        $n = (int) $v;

        return $n >= 60 && $n <= 7200 ? $n : self::DEFAULT_ISSUE_COOLDOWN_SECONDS;
    }

    private static function tokenPlainColumnExists(\PDO $db): bool
    {
        if (self::$tokenPlainColumnExists !== null) {
            return self::$tokenPlainColumnExists;
        }
        try {
            $st = $db->query("SHOW COLUMNS FROM ai___aktivasi LIKE 'token_plain'");
            self::$tokenPlainColumnExists = $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            self::$tokenPlainColumnExists = false;
        }

        return self::$tokenPlainColumnExists;
    }

    /**
     * Token belum dipakai + belum kedaluwarsa + ada plaintext tersimpan (butuh migrasi kolom token_plain).
     *
     * @return array{plain: string, expires_at: string, expires_at_ts: int}|null
     */
    private static function findReusablePlainRow(\PDO $db, int $usersId): ?array
    {
        if (!self::tokenPlainColumnExists($db)) {
            return null;
        }
        try {
            $stmt = $db->prepare(
                'SELECT token_plain, expires_at FROM ai___aktivasi WHERE users_id = ? AND used_at IS NULL '
                . 'AND expires_at > NOW() AND token_plain IS NOT NULL AND TRIM(token_plain) != \'\' '
                . 'ORDER BY id DESC LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!is_array($row) || empty($row['token_plain'])) {
                return null;
            }
            $plain = trim((string) $row['token_plain']);
            $ex = trim((string) ($row['expires_at'] ?? ''));
            if ($plain === '' || $ex === '') {
                return null;
            }
            $ts = strtotime($ex);

            return [
                'plain' => $plain,
                'expires_at' => $ex,
                'expires_at_ts' => $ts !== false ? $ts : 0,
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Waktu pembuatan baris terakhir user (untuk cooldown token baru).
     */
    private static function lastCreatedTimestampForUser(\PDO $db, int $usersId): ?int
    {
        try {
            $stmt = $db->prepare('SELECT UNIX_TIMESTAMP(created_at) AS ts FROM ai___aktivasi WHERE users_id = ? ORDER BY id DESC LIMIT 1');
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!is_array($row) || !isset($row['ts'])) {
                return null;
            }
            $t = (int) $row['ts'];

            return $t > 0 ? $t : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Pakai ulang token valid bila ada; jika perlu token baru, terapkan jeda antar penerbitan.
     *
     * @return array{ok: true, plain: string, expires_at: string, expires_at_ts: int, reused: bool}|array{ok: false, error: string, retry_after_seconds?: int}
     */
    public static function ensurePlainTokenForUser(\PDO $db, int $usersId): array
    {
        if (!self::tableExists($db)) {
            return ['ok' => false, 'error' => 'Tabel token aktivasi belum ada. Jalankan migrasi database terbaru.'];
        }
        $reuse = self::findReusablePlainRow($db, $usersId);
        if ($reuse !== null) {
            return [
                'ok' => true,
                'plain' => $reuse['plain'],
                'expires_at' => $reuse['expires_at'],
                'expires_at_ts' => $reuse['expires_at_ts'],
                'reused' => true,
            ];
        }
        $cd = self::issueCooldownSeconds();
        $lastTs = self::lastCreatedTimestampForUser($db, $usersId);
        if ($lastTs !== null) {
            $elapsed = time() - $lastTs;
            if ($elapsed < $cd) {
                $wait = $cd - $elapsed;

                return [
                    'ok' => false,
                    'error' => 'Token baru bisa diminta lagi dalam ' . (int) ceil($wait / 60) . ' menit.',
                    'retry_after_seconds' => $wait,
                ];
            }
        }
        $issued = self::issue($db, $usersId);
        if ($issued === null) {
            return ['ok' => false, 'error' => 'Gagal membuat token. Coba lagi.'];
        }

        return [
            'ok' => true,
            'plain' => $issued['plain'],
            'expires_at' => $issued['expires_at'],
            'expires_at_ts' => $issued['expires_at_ts'],
            'reused' => false,
        ];
    }

    /**
     * Nama tampilan untuk baris "Nama:" di pesan WA (pengurus/santri/username).
     *
     * @return array{0: string, 1: string} [namaTampilan, usernameLabel untuk baris Username]
     */
    public static function fetchActivationLabels(\PDO $db, int $usersId): array
    {
        $stmt = $db->prepare(
            'SELECT u.username AS username, u.email AS email, '
            . 'COALESCE(NULLIF(TRIM(p.nama), \'\'), NULLIF(TRIM(s.nama), \'\')) AS nama '
            . 'FROM users u '
            . 'LEFT JOIN pengurus p ON p.id_user = u.id '
            . 'LEFT JOIN santri s ON s.id_user = u.id '
            . 'WHERE u.id = ? LIMIT 1'
        );
        $stmt->execute([$usersId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $username = trim((string) ($row['username'] ?? ''));
        $nama = trim((string) ($row['nama'] ?? ''));
        $email = trim((string) ($row['email'] ?? ''));
        if ($nama === '') {
            $nama = $username !== '' ? $username : ($email !== '' && strpos($email, '@') !== false ? substr($email, 0, (int) strpos($email, '@')) : '');
        }
        $usernameLabel = $username;
        if ($usernameLabel === '' && $email !== '' && strpos($email, '@') !== false) {
            $usernameLabel = substr($email, 0, (int) strpos($email, '@'));
        }

        return [$nama, $usernameLabel];
    }

    /**
     * Buat token baru; batalkan token belum terpakai sebelumnya untuk user ini.
     *
     * @return array{plain: string, expires_at: string, expires_at_ts: int}|null
     */
    public static function issue(\PDO $db, int $usersId): ?array
    {
        if (!self::tableExists($db)) {
            return null;
        }
        try {
            $plain = bin2hex(random_bytes(20));
            $hash = hash('sha256', $plain);
            $ttl = self::ttlMinutes();
            $expires = new \DateTimeImmutable('+' . $ttl . ' minutes');
            $expiresStr = $expires->format('Y-m-d H:i:s');

            $db->beginTransaction();
            if (self::tokenPlainColumnExists($db)) {
                $inv = $db->prepare('UPDATE ai___aktivasi SET used_at = NOW(), token_plain = NULL WHERE users_id = ? AND used_at IS NULL');
                $inv->execute([$usersId]);
                $ins = $db->prepare(
                    'INSERT INTO ai___aktivasi (users_id, token_hash, token_plain, expires_at) VALUES (?, ?, ?, ?)'
                );
                $ins->execute([$usersId, $hash, $plain, $expiresStr]);
            } else {
                $inv = $db->prepare('UPDATE ai___aktivasi SET used_at = NOW() WHERE users_id = ? AND used_at IS NULL');
                $inv->execute([$usersId]);
                $ins = $db->prepare(
                    'INSERT INTO ai___aktivasi (users_id, token_hash, expires_at) VALUES (?, ?, ?)'
                );
                $ins->execute([$usersId, $hash, $expiresStr]);
            }
            $db->commit();

            return [
                'plain' => $plain,
                'expires_at' => $expiresStr,
                'expires_at_ts' => $expires->getTimestamp(),
            ];
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log('AiWaActivationTokenService::issue ' . $e->getMessage());

            return null;
        }
    }

    /**
     * Bangun teks pesan lengkap untuk wa.me (termasuk token; jangan simpan di log publik).
     */
    public static function buildActivationMessage(string $nama, string $usernameLabel, string $nomor62, string $plainToken): string
    {
        $lines = [
            'Aktifkan eBeddien AI WhatsApp.',
            '',
            'Nama: ' . $nama,
            'Username: ' . $usernameLabel,
            'Nomor: ' . $nomor62,
            'Token: ' . $plainToken,
        ];

        return implode("\n", $lines);
    }

    /**
     * Cari baris token yang valid (belum dipakai, belum kedaluwarsa).
     *
     * @return array{id: int, users_id: int}|null
     */
    public static function findValidByPlain(\PDO $db, string $plainToken): ?array
    {
        if (!self::tableExists($db) || trim($plainToken) === '') {
            return null;
        }
        $hash = hash('sha256', trim($plainToken));
        try {
            $stmt = $db->prepare(
                'SELECT id, users_id FROM ai___aktivasi '
                . 'WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1'
            );
            $stmt->execute([$hash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return is_array($row) && !empty($row['id']) ? [
                'id' => (int) $row['id'],
                'users_id' => (int) $row['users_id'],
            ] : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Cek baris ada tapi kedaluwarsa / sudah dipakai (untuk pesan error spesifik).
     *
     * @return 'invalid'|'expired'|'used'|null null = tidak ada hash sama sekali
     */
    public static function classifyPlainToken(\PDO $db, string $plainToken): ?string
    {
        if (!self::tableExists($db) || trim($plainToken) === '') {
            return 'invalid';
        }
        $hash = hash('sha256', trim($plainToken));
        try {
            $stmt = $db->prepare(
                'SELECT used_at, expires_at FROM ai___aktivasi WHERE token_hash = ? LIMIT 1'
            );
            $stmt->execute([$hash]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!is_array($row)) {
                return 'invalid';
            }
            if (!empty($row['used_at'])) {
                return 'used';
            }
            $ex = strtotime((string) ($row['expires_at'] ?? ''));
            if ($ex !== false && $ex < time()) {
                return 'expired';
            }

            return null;
        } catch (\Throwable $e) {
            return 'invalid';
        }
    }

    public static function markUsed(\PDO $db, int $tokenRowId): void
    {
        try {
            if (self::tokenPlainColumnExists($db)) {
                $stmt = $db->prepare('UPDATE ai___aktivasi SET used_at = NOW(), token_plain = NULL WHERE id = ? AND used_at IS NULL');
            } else {
                $stmt = $db->prepare('UPDATE ai___aktivasi SET used_at = NOW() WHERE id = ? AND used_at IS NULL');
            }
            $stmt->execute([$tokenRowId]);
        } catch (\Throwable $e) {
            error_log('AiWaActivationTokenService::markUsed ' . $e->getMessage());
        }
    }
}
