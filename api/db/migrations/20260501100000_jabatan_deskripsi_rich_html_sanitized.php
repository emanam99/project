<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Backfill sanitasi deskripsi jabatan untuk menghapus tag/atribut berbahaya (XSS hardening).
 * Aman dijalankan ulang: baris hanya di-update jika hasil sanitasi berbeda.
 */
final class JabatanDeskripsiRichHtmlSanitized extends AbstractMigration
{
    private const ALLOWED_RICH_HTML_TAGS = '<p><br><strong><b><em><i><u><ul><ol><li>';

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $select = $conn->prepare('SELECT `id`, `deskripsi` FROM `jabatan` WHERE `deskripsi` IS NOT NULL AND TRIM(`deskripsi`) <> \'\'');
        $select->execute();
        $rows = $select->fetchAll(\PDO::FETCH_ASSOC);
        if (!is_array($rows) || $rows === []) {
            return;
        }

        $update = $conn->prepare('UPDATE `jabatan` SET `deskripsi` = ? WHERE `id` = ?');
        foreach ($rows as $row) {
            $id = isset($row['id']) ? (int) $row['id'] : 0;
            if ($id <= 0) {
                continue;
            }

            $original = isset($row['deskripsi']) ? (string) $row['deskripsi'] : '';
            $sanitized = $this->sanitizeRichHtmlOrNull($original);
            $sanitizedValue = $sanitized ?? '';

            if ($sanitizedValue !== $original) {
                $update->execute([$sanitized, $id]);
            }
        }
    }

    public function down(): void
    {
        // Tidak dapat rollback ke data HTML lama secara aman.
    }

    private function sanitizeRichHtmlOrNull(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $value = mb_convert_encoding((string) $value, 'UTF-8', 'UTF-8');
        if ($value === false) {
            return null;
        }

        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
        $value = str_replace("\xEF\xBF\xBD", '', $value);
        $value = preg_replace('/[\x{E000}-\x{F8FF}]/u', '', $value) ?? $value;
        $value = preg_replace('/<(script|style|iframe|object|embed|svg|math)[^>]*>.*?<\/\1>/is', '', $value) ?? $value;
        $value = strip_tags($value, self::ALLOWED_RICH_HTML_TAGS);
        $value = preg_replace('/<([a-z0-9]+)(\s+[^>]*)>/i', '<$1>', $value) ?? $value;
        $value = str_replace('&nbsp;', ' ', $value);
        $value = trim($value);

        $plainText = trim(strip_tags($value));
        return $plainText === '' ? null : $value;
    }
}
