<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Label fitur Chat AI: menyebut "Tab" agar selaras dengan tab di halaman /chat-ai.
 */
final class ChatAiTabFiturLabels extends AbstractMigration
{
    public function up(): void
    {
        $map = [
            'action.chat_ai.page.training_bank' => 'Chat AI · Tab · Bank Q&A',
            'action.chat_ai.page.training_chat' => 'Chat AI · Tab · Training Chat',
            'action.chat_ai.page.dashboard' => 'Chat AI · Tab · Dashboard',
            'action.chat_ai.page.riwayat' => 'Chat AI · Tab · Riwayat',
        ];
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare(
            'UPDATE `app___fitur` SET `label` = ? WHERE `id_app` = 1 AND `type` = \'action\' AND `code` = ? LIMIT 1'
        );
        foreach ($map as $code => $label) {
            $stmt->execute([$label, $code]);
        }
    }

    public function down(): void
    {
        $map = [
            'action.chat_ai.page.training_bank' => 'Chat AI · Bank Q&A',
            'action.chat_ai.page.training_chat' => 'Chat AI · Training Chat',
            'action.chat_ai.page.dashboard' => 'Chat AI · Dashboard',
            'action.chat_ai.page.riwayat' => 'Chat AI · Riwayat',
        ];
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare(
            'UPDATE `app___fitur` SET `label` = ? WHERE `id_app` = 1 AND `type` = \'action\' AND `code` = ? LIMIT 1'
        );
        foreach ($map as $code => $label) {
            $stmt->execute([$label, $code]);
        }
    }
}
