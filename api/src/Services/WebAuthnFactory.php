<?php

declare(strict_types=1);

namespace App\Services;

use Cose\Algorithm\Manager;
use Cose\Algorithm\Signature\ECDSA\ES256;
use Cose\Algorithm\Signature\ECDSA\ES384;
use Cose\Algorithm\Signature\RSA\RS256;
use Webauthn\AttestationStatement\AndroidKeyAttestationStatementSupport;
use Webauthn\AttestationStatement\AppleAttestationStatementSupport;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\AttestationObjectLoader;
use Webauthn\AttestationStatement\FidoU2FAttestationStatementSupport;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AttestationStatement\PackedAttestationStatementSupport;
use Webauthn\AttestationStatement\TPMAttestationStatementSupport;
use Webauthn\PublicKeyCredentialLoader;

final class WebAuthnFactory
{
    public static function createCoseAlgorithmManager(): Manager
    {
        return Manager::create()
            ->add(ES256::create(), ES384::create(), RS256::create());
    }

    public static function createAttestationStatementSupportManager(): AttestationStatementSupportManager
    {
        $cose = self::createCoseAlgorithmManager();
        $m = AttestationStatementSupportManager::create();
        $m->add(NoneAttestationStatementSupport::create());
        $m->add(PackedAttestationStatementSupport::create($cose));
        $m->add(FidoU2FAttestationStatementSupport::create());
        $m->add(AndroidKeyAttestationStatementSupport::create());
        $m->add(TPMAttestationStatementSupport::create());
        $m->add(AppleAttestationStatementSupport::create());

        return $m;
    }

    public static function createPublicKeyCredentialLoader(): PublicKeyCredentialLoader
    {
        $loader = AttestationObjectLoader::create(self::createAttestationStatementSupportManager());

        return PublicKeyCredentialLoader::create($loader);
    }
}
