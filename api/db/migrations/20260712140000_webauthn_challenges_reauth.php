<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah purpose 'reauth' untuk step-up WebAuthn (mis. ubah PIN kartu).
 */
final class WebauthnChallengesReauth extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "ALTER TABLE `webauthn_challenges`
             MODIFY COLUMN `purpose` enum('registration','authentication','reauth') NOT NULL"
        );
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `webauthn_challenges` WHERE `purpose` = 'reauth'"
        );
        $this->execute(
            "ALTER TABLE `webauthn_challenges`
             MODIFY COLUMN `purpose` enum('registration','authentication') NOT NULL"
        );
    }
}
