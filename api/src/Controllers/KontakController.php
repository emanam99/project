<?php

namespace App\Controllers;

use App\Database;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Daftar kontak WA (whatsapp___kontak). Super_admin only.
 * GET /api/kontak - list dengan pagination & search
 * PATCH /api/kontak/{id} - update siap_terima_notif
 * POST /api/kontak/{id}/resolve-lid - ambil LID dari server WA (Baileys) lalu simpan ke nomor_kanonik
 * DELETE /api/kontak/{id} - hapus kontak
 */
class KontakController
{
    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/kontak - Daftar kontak (nomor unik, siap_terima_notif, nomor_kanonik/LID). Pagination & search.
     */
    public function getList(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $page = max(1, (int) ($params['page'] ?? 1));
        $limit = min(100, max(1, (int) ($params['limit'] ?? 20)));
        $search = isset($params['search']) ? trim((string) $params['search']) : '';

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => ['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit],
                ], 200);
            }

            $hasNamaCol = false;
            try {
                $namaCheck = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nama'");
                $hasNamaCol = $namaCheck !== false && $namaCheck->rowCount() > 0;
            } catch (\Throwable $e) {
                $hasNamaCol = false;
            }
            $where = '1=1';
            $bind = [];
            if ($search !== '') {
                $where .= ' AND (nomor LIKE ? OR nomor LIKE ? OR nomor_kanonik LIKE ?';
                $bind[] = '%' . $search . '%';
                $bind[] = '%' . preg_replace('/\D/', '', $search) . '%';
                $bind[] = '%' . $search . '%';
                if ($hasNamaCol) {
                    $where .= ' OR nama LIKE ?';
                    $bind[] = '%' . $search . '%';
                }
                $where .= ')';
            }

            $countStmt = $db->prepare("SELECT COUNT(*) FROM whatsapp___kontak WHERE {$where}");
            $countStmt->execute($bind);
            $total = (int) $countStmt->fetchColumn();

            $offset = ($page - 1) * $limit;
            $order = 'ORDER BY updated_at DESC, id DESC';
            $selectNama = $hasNamaCol ? 'nama,' : 'NULL AS nama,';
            $listStmt = $db->prepare("SELECT id, nomor, {$selectNama} nomor_kanonik, siap_terima_notif, created_at, updated_at FROM whatsapp___kontak WHERE {$where} {$order} LIMIT {$limit} OFFSET {$offset}");
            $listStmt->execute($bind);

            $items = [];
            while ($row = $listStmt->fetch(\PDO::FETCH_ASSOC)) {
                $items[] = [
                    'id' => (int) $row['id'],
                    'nomor' => $row['nomor'],
                    'nama' => $row['nama'] ?? null,
                    'nomor_kanonik' => $row['nomor_kanonik'] ?? null,
                    'siap_terima_notif' => (int) $row['siap_terima_notif'] === 1,
                    'created_at' => $row['created_at'],
                    'updated_at' => $row['updated_at'],
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'items' => $items,
                    'total' => $total,
                    'page' => $page,
                    'limit' => $limit,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::getList: ' . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar kontak',
            ], 500);
        }
    }

    /**
     * PATCH /api/kontak/{id} - Update kontak.
     * Body (minimal satu): { "siap_terima_notif": true|false, "nama"?: string, "nomor_kanonik"?: string|null }
     */
    public function update(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }

        $body = (array) $request->getParsedBody();
        $hasSiap = array_key_exists('siap_terima_notif', $body);
        $hasNama = array_key_exists('nama', $body);
        $hasKanonik = array_key_exists('nomor_kanonik', $body);
        if (!$hasSiap && !$hasNama && !$hasKanonik) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Kirim minimal satu field: siap_terima_notif, nama, atau nomor_kanonik'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel kontak belum ada'], 404);
            }

            $hasNamaCol = false;
            $hasKanonikCol = false;
            try {
                $hasNamaCol = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nama'")->rowCount() > 0;
                $hasKanonikCol = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nomor_kanonik'")->rowCount() > 0;
            } catch (\Throwable $e) {
                /* ignore */
            }

            $sets = [];
            $bind = [];
            if ($hasSiap) {
                $sets[] = 'siap_terima_notif = ?';
                $bind[] = !empty($body['siap_terima_notif']) ? 1 : 0;
            }
            if ($hasNamaCol && $hasNama) {
                $sets[] = 'nama = ?';
                $bind[] = trim((string) $body['nama']);
            }
            if ($hasKanonikCol && $hasKanonik) {
                $nk = $body['nomor_kanonik'];
                $sets[] = 'nomor_kanonik = ?';
                $bind[] = ($nk === null || $nk === '') ? null : trim((string) $nk);
            }
            if ($sets === []) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tidak ada kolom yang bisa diperbarui'], 400);
            }
            $sets[] = 'updated_at = NOW()';
            $bind[] = $id;
            $sql = 'UPDATE whatsapp___kontak SET ' . implode(', ', $sets) . ' WHERE id = ?';
            $stmt = $db->prepare($sql);
            $stmt->execute($bind);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kontak tidak ditemukan'], 404);
            }

            $selectNamaOut = $hasNamaCol ? 'nama,' : 'NULL AS nama,';
            $stmt = $db->prepare("SELECT id, nomor, {$selectNamaOut} nomor_kanonik, siap_terima_notif, created_at, updated_at FROM whatsapp___kontak WHERE id = ? LIMIT 1");
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $out = [
                'id' => (int) $row['id'],
                'nomor' => $row['nomor'],
                'nama' => $row['nama'] ?? null,
                'nomor_kanonik' => $row['nomor_kanonik'] ?? null,
                'siap_terima_notif' => (int) ($row['siap_terima_notif'] ?? 0) === 1,
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Pengaturan kontak diperbarui',
                'data' => $out,
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::update: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal memperbarui kontak'], 500);
        }
    }

    /**
     * POST /api/kontak/{id}/resolve-lid
     * Body opsional: { "session_id": "default" } — sesuai slot WA di server Node.
     */
    public function resolveLid(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }
        $body = (array) $request->getParsedBody();
        $sessionId = isset($body['session_id']) ? trim((string) $body['session_id']) : 'default';
        if ($sessionId === '') {
            $sessionId = 'default';
        }

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel kontak belum ada'], 404);
            }
            $hasKanonikCol = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nomor_kanonik'")->rowCount() > 0;
            if (!$hasKanonikCol) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kolom nomor_kanonik tidak ada'], 400);
            }

            $stmt = $db->prepare('SELECT id, nomor FROM whatsapp___kontak WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row === false) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kontak tidak ditemukan'], 404);
            }
            $nomor = trim((string) ($row['nomor'] ?? ''));
            if ($nomor === '') {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Nomor kontak kosong'], 400);
            }

            $resolved = WhatsAppService::resolveJidsFromWaNode($nomor, $sessionId);
            $jids = $resolved['jids'] ?? [];
            $jidSource = $resolved['source'] ?? null;
            if (!$resolved['success']) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => $resolved['message'] ?? 'Gagal mengambil JID dari server WA',
                    'data' => ['jids' => $jids, 'reason' => $resolved['reason'] ?? null, 'source' => $jidSource],
                ], 200);
            }

            $lidDigits = WhatsAppService::extractLidDigitsFromJids($jids);
            if ($lidDigits === null) {
                if ($jidSource === 'puppeteer') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Digit LID (@lid) hanya tersedia dari koneksi Baileys (scan QR Langkah 2). Slot Anda saat ini hanya WhatsApp Web (Langkah 1) — kirim tes sudah bisa, tetapi server tidak mengembalikan @lid. Selesaikan Langkah 2 (Baileys) di halaman Koneksi WA jika perlu menyimpan LID.',
                        'data' => ['jids' => $jids, 'reason' => $resolved['reason'] ?? null, 'source' => 'puppeteer'],
                    ], 200);
                }
                if (WhatsAppService::hasPnUserJidInJids($jids)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Baileys sudah terhubung dan nomor ini terdaftar di WhatsApp (terlihat dari JID …@s.whatsapp.net), tetapi mapping tidak menyertakan @lid. Itu wajar: banyak kontak hanya punya JID PN, bukan LID. Notifikasi ke nomor HP tetap bisa; kolom LID bisa terisi otomatis bila orang ini mengirim pesan masuk ke nomor WA Anda.',
                        'data' => ['jids' => $jids, 'reason' => 'no_lid_in_mapping', 'source' => $jidSource],
                    ], 200);
                }
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Server WA tidak mengembalikan JID @lid untuk nomor ini. Pastikan Baileys (Langkah 2) terhubung dan nomor terdaftar di WhatsApp.',
                    'data' => ['jids' => $jids, 'reason' => $resolved['reason'] ?? null, 'source' => $jidSource],
                ], 200);
            }

            $upd = $db->prepare('UPDATE whatsapp___kontak SET nomor_kanonik = ?, updated_at = NOW() WHERE id = ?');
            $upd->execute([$lidDigits, $id]);

            $hasNamaColOut = false;
            try {
                $hasNamaColOut = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nama'")->rowCount() > 0;
            } catch (\Throwable $e) {
                $hasNamaColOut = false;
            }
            $selectNamaOut = $hasNamaColOut ? 'nama,' : 'NULL AS nama,';
            $stmt = $db->prepare("SELECT id, nomor, {$selectNamaOut} nomor_kanonik, siap_terima_notif, created_at, updated_at FROM whatsapp___kontak WHERE id = ? LIMIT 1");
            $stmt->execute([$id]);
            $outRow = $stmt->fetch(\PDO::FETCH_ASSOC);

            $kontakOut = null;
            if ($outRow) {
                $kontakOut = [
                    'id' => (int) $outRow['id'],
                    'nomor' => $outRow['nomor'],
                    'nama' => $outRow['nama'] ?? null,
                    'nomor_kanonik' => $outRow['nomor_kanonik'] ?? null,
                    'siap_terima_notif' => (int) ($outRow['siap_terima_notif'] ?? 0) === 1,
                    'created_at' => $outRow['created_at'],
                    'updated_at' => $outRow['updated_at'],
                ];
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'LID disimpan ke kontak',
                'data' => [
                    'kontak' => $kontakOut,
                    'jids' => $jids,
                    'lid' => $lidDigits,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::resolveLid: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal mengambil LID'], 500);
        }
    }

    /**
     * DELETE /api/kontak/{id} - Hapus kontak berdasarkan ID
     */
    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0) {
            return $this->jsonResponse($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
        }

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Tabel kontak belum ada'], 404);
            }

            $stmt = $db->prepare('DELETE FROM whatsapp___kontak WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Kontak tidak ditemukan'], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kontak berhasil dihapus',
            ], 200);
        } catch (\Throwable $e) {
            error_log('KontakController::delete: ' . $e->getMessage());
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Gagal menghapus kontak'], 500);
        }
    }
}
