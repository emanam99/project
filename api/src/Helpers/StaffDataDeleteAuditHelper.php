<?php

namespace App\Helpers;

use App\Services\WhatsAppService;
use App\Utils\DeferredHttpTask;
use PDO;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Notifikasi WA ke admin saat staff menghapus data sensitif (pembayaran, biodata PSB, dll.).
 */
class StaffDataDeleteAuditHelper
{
    public static function formatRupiah($amount): string
    {
        return 'Rp ' . number_format((float) $amount, 0, ',', '.');
    }

    /**
     * @param int[] $ids
     * @return string ringkasan singkat untuk pesan WA
     */
    public static function fetchSantriSummaries(PDO $db, array $ids): string
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), function ($x) {
            return $x > 0;
        })));
        if ($ids === []) {
            return '-';
        }
        try {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->prepare("SELECT id, nama, nis FROM santri WHERE id IN ($placeholders) ORDER BY id ASC");
            $stmt->execute($ids);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $parts = [];
            foreach ($rows as $r) {
                $nama = trim((string) ($r['nama'] ?? ''));
                $nis = trim((string) ($r['nis'] ?? ''));
                $id = (int) ($r['id'] ?? 0);
                $parts[] = ($nama !== '' ? $nama : '?') . ' (id ' . $id . ($nis !== '' ? ', NIS ' . $nis : '') . ')';
            }

            return $parts !== [] ? implode('; ', $parts) : '-';
        } catch (\Throwable $e) {
            return 'id: ' . implode(', ', $ids);
        }
    }

    public static function formatActor(PDO $db, Request $request): string
    {
        $u = PengurusAdminIdHelper::userArrayFromRequest($request);
        $namaJwt = trim((string) ($u['user_name'] ?? ''));
        $uid = isset($u['user_id']) ? (int) $u['user_id'] : (int) ($u['id'] ?? 0);
        $namaDb = $uid > 0 ? PengurusAdminIdHelper::fetchPengurusNama($db, $uid) : null;
        $nama = $namaJwt !== '' ? $namaJwt : ($namaDb ?? 'tidak diketahui');
        $role = trim((string) ($u['role_key'] ?? $u['user_role'] ?? ''));
        $s = $nama . ' (id pengurus ' . ($uid > 0 ? (string) $uid : '?') . ')';
        if ($role !== '') {
            $s .= ', role: ' . $role;
        }

        return $s;
    }

    /**
     * @param array<string, string|int|float> $detail Baris label => nilai (tampilan teks)
     */
    public static function notify(Request $request, PDO $db, string $judulAksi, array $detail): void
    {
        try {
            $config = require __DIR__ . '/../../config.php';
            $wa = trim((string) (($config['security'] ?? [])['data_delete_alert_wa'] ?? ''));
            if ($wa === '') {
                return;
            }

            $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('d/m/Y H:i:s');
            $actor = self::formatActor($db, $request);
            $lines = [
                '🗑️ *eBeddien — penghapusan data*',
                'Waktu: ' . $waktu,
                'User: ' . $actor,
                'Aksi: ' . $judulAksi,
                '---',
            ];
            foreach ($detail as $label => $value) {
                $lines[] = $label . ': ' . $value;
            }
            $message = implode("\n", $lines);

            $logContext = [
                'id_santri' => null,
                'id_pengurus' => null,
                'tujuan' => 'admin',
                'id_pengurus_pengirim' => null,
                'kategori' => 'staff_data_delete_audit',
                'sumber' => 'ebeddien_audit',
            ];

            // Jangan blokir response JSON: kirim WA setelah klien menerima respons (Evolution/Watzap bisa beberapa detik).
            DeferredHttpTask::runAfterResponse(static function () use ($wa, $message, $logContext): void {
                try {
                    WhatsAppService::sendMessage($wa, $message, null, $logContext);
                } catch (\Throwable $e) {
                    error_log('StaffDataDeleteAuditHelper::notify (WA tertunda): ' . $e->getMessage());
                }
            });
        } catch (\Throwable $e) {
            error_log('StaffDataDeleteAuditHelper::notify: ' . $e->getMessage());
        }
    }
}
