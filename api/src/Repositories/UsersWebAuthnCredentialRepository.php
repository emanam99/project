<?php

declare(strict_types=1);

namespace App\Repositories;

use PDO;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialSourceRepository;
use Webauthn\PublicKeyCredentialUserEntity;

/**
 * Satu kredensial WebAuthn per baris users (kolom webauthn_*).
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
            'SELECT webauthn_credential_json FROM users WHERE webauthn_credential_id = ? LIMIT 1'
        );
        $stmt->execute([$publicKeyCredentialId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['webauthn_credential_json'] === null || $row['webauthn_credential_json'] === '') {
            return null;
        }

        $data = json_decode((string) $row['webauthn_credential_json'], true, 512, JSON_THROW_ON_ERROR);

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
            'SELECT webauthn_credential_json FROM users WHERE id = ? AND webauthn_credential_json IS NOT NULL AND webauthn_credential_json != \'\' LIMIT 1'
        );
        $stmt->execute([$usersId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return [];
        }
        $data = json_decode((string) $row['webauthn_credential_json'], true, 512, JSON_THROW_ON_ERROR);

        return [PublicKeyCredentialSource::createFromArray($data)];
    }

    public function saveCredentialSource(PublicKeyCredentialSource $publicKeyCredentialSource): void
    {
        $json = json_encode($publicKeyCredentialSource->jsonSerialize(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $credId = $publicKeyCredentialSource->getPublicKeyCredentialId();
        $pk = $publicKeyCredentialSource->getCredentialPublicKey();
        $counter = $publicKeyCredentialSource->getCounter();

        $stmt = $this->db->prepare(
            'UPDATE users SET webauthn_public_key = ?, webauthn_counter = ?, webauthn_credential_json = ? WHERE webauthn_credential_id = ?'
        );
        $stmt->execute([$pk, $counter, $json, $credId]);
    }

    public function saveNewCredentialForUser(int $usersId, PublicKeyCredentialSource $publicKeyCredentialSource): void
    {
        $json = json_encode($publicKeyCredentialSource->jsonSerialize(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $id = $publicKeyCredentialSource->getPublicKeyCredentialId();
        $pk = $publicKeyCredentialSource->getCredentialPublicKey();
        $counter = $publicKeyCredentialSource->getCounter();

        $upd = $this->db->prepare(
            'UPDATE users SET webauthn_credential_id = ?, webauthn_public_key = ?, webauthn_counter = ?, webauthn_credential_json = ? WHERE id = ?'
        );
        $upd->execute([$id, $pk, $counter, $json, $usersId]);
    }
}
