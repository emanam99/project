<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Antrian balasan handshake WA (link/username) + jadwal pesan maaf 15 menit
 * jika mesin gagal mengirim setelah ack «sedang diproses».
 */
final class AuthWaFollowupQueue extends AbstractMigration
{
    public function up(): void
    {
        $this->addFollowupColumns('mybeddian_auth_wa_tokens');
        $this->addFollowupColumns('daftar_santri_wa_tokens');

        if ($this->hasTable('mybeddian_auth_wa_tokens')) {
            $this->execute(
                "UPDATE `mybeddian_auth_wa_tokens`
                 SET `apology_after` = DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                 WHERE `wa_verified_at` IS NOT NULL
                   AND `followup_sent_at` IS NULL
                   AND `apology_sent_at` IS NULL
                   AND `purpose` IN ('daftar', 'lupa_password', 'lupa_username')
                   AND `wa_verified_at` >= DATE_SUB(NOW(), INTERVAL 2 DAY)"
            );
        }
        if ($this->hasTable('daftar_santri_wa_tokens')) {
            $this->execute(
                "UPDATE `daftar_santri_wa_tokens`
                 SET `apology_after` = DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                 WHERE `wa_verified_at` IS NOT NULL
                   AND `followup_sent_at` IS NULL
                   AND `apology_sent_at` IS NULL
                   AND `used_at` IS NULL
                   AND `wa_verified_at` >= DATE_SUB(NOW(), INTERVAL 2 DAY)"
            );
        }
    }

    public function down(): void
    {
        $this->dropFollowupColumns('mybeddian_auth_wa_tokens');
        $this->dropFollowupColumns('daftar_santri_wa_tokens');
    }

    private function addFollowupColumns(string $table): void
    {
        if (!$this->hasTable($table)) {
            return;
        }
        $t = $this->table($table);
        if (!$t->hasColumn('pending_followup')) {
            $t->addColumn('pending_followup', 'text', ['null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('followup_jid')) {
            $t->addColumn('followup_jid', 'string', ['limit' => 80, 'null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('followup_source')) {
            $t->addColumn('followup_source', 'string', ['limit' => 40, 'null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('followup_sent_at')) {
            $t->addColumn('followup_sent_at', 'datetime', ['null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('apology_sent_at')) {
            $t->addColumn('apology_sent_at', 'datetime', ['null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('apology_after')) {
            $t->addColumn('apology_after', 'datetime', ['null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('followup_claim')) {
            $t->addColumn('followup_claim', 'string', ['limit' => 32, 'null' => true, 'default' => null]);
        }
        if (!$t->hasColumn('followup_claimed_at')) {
            $t->addColumn('followup_claimed_at', 'datetime', ['null' => true, 'default' => null]);
        }
        if ($table === 'mybeddian_auth_wa_tokens') {
            if (!$t->hasColumn('followup_bind_table')) {
                $t->addColumn('followup_bind_table', 'string', ['limit' => 64, 'null' => true, 'default' => null]);
            }
            if (!$t->hasColumn('followup_bind_id')) {
                $t->addColumn('followup_bind_id', 'integer', ['null' => true, 'default' => null, 'signed' => false]);
            }
        }
        $t->update();
    }

    private function dropFollowupColumns(string $table): void
    {
        if (!$this->hasTable($table)) {
            return;
        }
        $t = $this->table($table);
        foreach (['pending_followup', 'followup_jid', 'followup_source', 'followup_sent_at', 'apology_sent_at', 'apology_after', 'followup_bind_table', 'followup_bind_id', 'followup_claim', 'followup_claimed_at'] as $col) {
            if ($t->hasColumn($col)) {
                $t->removeColumn($col);
            }
        }
        $t->update();
    }
}
