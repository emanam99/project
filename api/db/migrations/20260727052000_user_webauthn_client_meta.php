<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Meta klien saat daftar passkey: perangkat, browser, OS, aplikasi (eBeddien/myBeddien).
 */
final class UserWebauthnClientMeta extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('user___webauthn')) {
            return;
        }
        $table = $this->table('user___webauthn');
        if (!$table->hasColumn('device_type')) {
            $table->addColumn('device_type', 'string', [
                'limit' => 32,
                'null' => true,
                'default' => null,
                'comment' => 'mobile|tablet|desktop|bot',
                'after' => 'credential_json',
            ]);
        }
        if (!$table->hasColumn('browser_name')) {
            $table->addColumn('browser_name', 'string', [
                'limit' => 64,
                'null' => true,
                'default' => null,
                'after' => 'device_type',
            ]);
        }
        if (!$table->hasColumn('os_name')) {
            $table->addColumn('os_name', 'string', [
                'limit' => 64,
                'null' => true,
                'default' => null,
                'after' => 'browser_name',
            ]);
        }
        if (!$table->hasColumn('client_app')) {
            $table->addColumn('client_app', 'string', [
                'limit' => 32,
                'null' => true,
                'default' => null,
                'comment' => 'ebeddien|mybeddien',
                'after' => 'os_name',
            ]);
        }
        if (!$table->hasColumn('user_agent')) {
            $table->addColumn('user_agent', 'string', [
                'limit' => 500,
                'null' => true,
                'default' => null,
                'after' => 'client_app',
            ]);
        }
        $table->update();
    }

    public function down(): void
    {
        if (!$this->hasTable('user___webauthn')) {
            return;
        }
        $table = $this->table('user___webauthn');
        foreach (['user_agent', 'client_app', 'os_name', 'browser_name', 'device_type'] as $col) {
            if ($table->hasColumn($col)) {
                $table->removeColumn($col);
            }
        }
        $table->update();
    }
}
