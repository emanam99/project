<?php

declare(strict_types=1);

namespace App\Helpers;

use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\CollectedClientData;

/**
 * Android WebView (WEB_AUTHENTICATION_SUPPORT_FOR_APP) mengirim origin
 * `android:apk-key-hash:...` di clientDataJSON, bukan https://domain.
 * Library webauthn-lib menolak origin itu — normalisasi ke origin web
 * untuk cek host, sambil mempertahankan raw clientData (hash tanda tangan tetap valid).
 */
final class AndroidWebAuthnOrigin
{
    /**
     * Hash SHA-256 sertifikat (base64url) untuk com.mybeddien:
     * Play App Signing, debug keystore, upload keystore.
     *
     * @var list<string>
     */
    private const ALLOWED_APK_KEY_HASHES = [
        '9niP-Bjb4ioulaIOG2h7oY4Pg_FgMHQvYMGm8T8oVfs', // Play deployment
        'IW193tYzqPta6WiFWb7lPDZXuDB-zxhQ6jlydnvOB5M', // Android debug
        'WLHbULfmtxMNApp1za2lfdp0iCanG2Jspjed1YkjtFo', // Upload key
    ];

    public static function isAllowedAndroidOrigin(string $origin): bool
    {
        $origin = trim($origin);
        if (!str_starts_with($origin, 'android:apk-key-hash:')) {
            return false;
        }
        $hash = substr($origin, strlen('android:apk-key-hash:'));

        return in_array($hash, self::ALLOWED_APK_KEY_HASHES, true);
    }

    /**
     * @return array{origin: string, rewritten: bool}
     */
    public static function inspect(CollectedClientData $clientData): array
    {
        $origin = (string) $clientData->getOrigin();

        return [
            'origin' => $origin,
            'rewritten' => self::isAllowedAndroidOrigin($origin),
        ];
    }

    public static function rewriteClientDataForWebRp(
        CollectedClientData $clientData,
        string $httpsWebOrigin
    ): CollectedClientData {
        $raw = $clientData->getRawData();
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($data)) {
            throw new \InvalidArgumentException('clientDataJSON tidak valid');
        }
        $current = isset($data['origin']) ? (string) $data['origin'] : '';
        if (!self::isAllowedAndroidOrigin($current)) {
            return $clientData;
        }
        $data['origin'] = $httpsWebOrigin;

        // rawData asli tetap dipakai agar clientDataJSONHash / signature cocok
        return new CollectedClientData($raw, $data);
    }

    public static function normalizeAttestationResponse(
        AuthenticatorAttestationResponse $response,
        string $httpsWebOrigin
    ): AuthenticatorAttestationResponse {
        $info = self::inspect($response->getClientDataJSON());
        if (!$info['rewritten']) {
            return $response;
        }

        return new AuthenticatorAttestationResponse(
            self::rewriteClientDataForWebRp($response->getClientDataJSON(), $httpsWebOrigin),
            $response->getAttestationObject()
        );
    }

    public static function normalizeAssertionResponse(
        AuthenticatorAssertionResponse $response,
        string $httpsWebOrigin
    ): AuthenticatorAssertionResponse {
        $info = self::inspect($response->getClientDataJSON());
        if (!$info['rewritten']) {
            return $response;
        }

        $ref = new \ReflectionClass($response);
        $prop = $ref->getProperty('userHandle');
        $prop->setAccessible(true);
        /** @var string|null $rawUserHandle */
        $rawUserHandle = $prop->getValue($response);

        return new AuthenticatorAssertionResponse(
            self::rewriteClientDataForWebRp($response->getClientDataJSON(), $httpsWebOrigin),
            $response->getAuthenticatorData(),
            $response->getSignature(),
            $rawUserHandle
        );
    }

    public static function httpsOriginForRpId(string $rpId): string
    {
        $rpId = strtolower(trim($rpId));
        if ($rpId === '' || $rpId === 'localhost' || $rpId === '127.0.0.1') {
            return 'http://' . ($rpId !== '' ? $rpId : 'localhost');
        }

        return 'https://' . $rpId;
    }
}
