<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialSourceRepository;
use Webauthn\PublicKeyCredentialUserEntity;

/**
 * Banyak kredensial WebAuthn per user (tabel user___webauthn).
 */
final class UsersWebAuthnCredentialRepository implements PublicKeyCredentialSourceRepository
{
    public function __construct(
        private PDO $db
    ) {
    }

    public static function userHandleForUsersId(int $usersId): string
    {
        return pack('N', $usersId);
    }

    public static function usersIdFromUserHandle(string $handle): ?int
    {
        if (strlen($handle) !== 4) {
            return null;
        }
        $u = unpack('Nuid', $handle);

        return isset($u['uid']) ? (int) $u['uid'] : null;
    }

    public function findOneByCredentialId(string $publicKeyCredentialId): ?PublicKeyCredentialSource
    {
        $stmt = $this->db->prepare(
            'SELECT credential_json FROM user___webauthn WHERE credential_id = ? LIMIT 1'
        );
        $stmt->execute([$publicKeyCredentialId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['credential_json'] === null || $row['credential_json'] === '') {
            return null;
        }

        $data = json_decode((string) $row['credential_json'], true, 512, JSON_THROW_ON_ERROR);

        return PublicKeyCredentialSource::createFromArray($data);
    }

    /**
     * @return PublicKeyCredentialSource[]
     */
    public function findAllForUserEntity(PublicKeyCredentialUserEntity $publicKeyCredentialUserEntity): array
    {
        $usersId = self::usersIdFromUserHandle($publicKeyCredentialUserEntity->getId());
        if ($usersId === null || $usersId <= 0) {
            return [];
        }
        $stmt = $this->db->prepare(
            'SELECT credential_json FROM user___webauthn WHERE users_id = ? ORDER BY id ASC'
        );
        $stmt->execute([$usersId]);
        $out = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if ($row['credential_json'] === null || $row['credential_json'] === '') {
                continue;
            }
            $data = json_decode((string) $row['credential_json'], true, 512, JSON_THROW_ON_ERROR);
            $out[] = PublicKeyCredentialSource::createFromArray($data);
        }

        return $out;
    }

    public function saveCredentialSource(PublicKeyCredentialSource $publicKeyCredentialSource): void
    {
        $json = json_encode($publicKeyCredentialSource->jsonSerialize(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $credId = $publicKeyCredentialSource->getPublicKeyCredentialId();
        $pk = $publicKeyCredentialSource->getCredentialPublicKey();
        $counter = $publicKeyCredentialSource->getCounter();

        $stmt = $this->db->prepare(
            'UPDATE user___webauthn SET public_key = ?, counter = ?, credential_json = ?, updated_at = NOW() WHERE credential_id = ?'
        );
        $stmt->execute([$pk, $counter, $json, $credId]);
    }

    public function saveNewCredentialForUser(int $usersId, PublicKeyCredentialSource $publicKeyCredentialSource): void
    {
        $json = json_encode($publicKeyCredentialSource->jsonSerialize(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $id = $publicKeyCredentialSource->getPublicKeyCredentialId();
        $pk = $publicKeyCredentialSource->getCredentialPublicKey();
        $counter = $publicKeyCredentialSource->getCounter();

        $ins = $this->db->prepare(
            'INSERT INTO user___webauthn (users_id, credential_id, public_key, counter, credential_json) VALUES (?, ?, ?, ?, ?)'
        );
        $ins->execute([$usersId, $id, $pk, $counter, $json]);
    }
}
