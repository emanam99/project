<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\MadrasahEditPengajuanHelper;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Review pengajuan edit profil madrasah (eBeddien UGT).
 */
class MadrasahEditPengajuanController
{
    private $db;
    private string $uploadsBasePath;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
        $config = require __DIR__ . '/../../config.php';
        $root = rtrim($config['uploads_base_path'] ?? __DIR__ . '/../..', '/\\');
        $folder = $config['uploads_folder'] ?? 'uploads';
        $uploadsDir = $root . DIRECTORY_SEPARATOR . trim($folder, '/\\');
        $this->uploadsBasePath = rtrim(realpath($uploadsDir) ?: $uploadsDir, DIRECTORY_SEPARATOR . '/');
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function denyIfCannotReview(array $userArr): ?array
    {
        if (!MadrasahEditPengajuanHelper::canReviewPengajuan($this->db, $userArr)) {
            return ['success' => false, 'message' => 'Tidak punya akses meninjau pengajuan edit madrasah'];
        }

        return null;
    }

    private function mapRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'id_madrasah' => (int) $row['id_madrasah'],
            'id_users_pengaju' => (int) $row['id_users_pengaju'],
            'status' => (string) $row['status'],
            'data_lama' => MadrasahEditPengajuanHelper::decodeJson($row['data_lama'] ?? null),
            'data_baru' => MadrasahEditPengajuanHelper::decodeJson($row['data_baru'] ?? null),
            'foto_path_baru' => $row['foto_path_baru'] ?? null,
            'logo_path_baru' => $row['logo_path_baru'] ?? null,
            'catatan_pengaju' => $row['catatan_pengaju'] ?? null,
            'catatan_reviewer' => $row['catatan_reviewer'] ?? null,
            'id_pengurus_reviewer' => isset($row['id_pengurus_reviewer']) ? (int) $row['id_pengurus_reviewer'] : null,
            'reviewed_at' => $row['reviewed_at'] ?? null,
            'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
            'tanggal_update' => $row['tanggal_update'] ?? null,
            'madrasah_nama' => $row['madrasah_nama'] ?? null,
            'pengaju_nama' => $row['pengaju_nama'] ?? null,
        ];
    }

    private function assertMadrasahInScope(array $userArr, int $idMadrasah): bool
    {
        if (!RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr)) {
            return true;
        }
        $pengurusId = isset($userArr['user_id']) ? (int) $userArr['user_id'] : 0;
        $stmt = $this->db->prepare('SELECT id_koordinator FROM madrasah WHERE id = ? LIMIT 1');
        $stmt->execute([$idMadrasah]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) {
            return false;
        }

        return (int) ($row['id_koordinator'] ?? 0) === $pengurusId;
    }

    private function fetchPengajuan(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT p.*, m.nama AS madrasah_nama, u.username AS pengaju_nama
             FROM ugt___madrasah_edit_pengajuan p
             LEFT JOIN madrasah m ON m.id = p.id_madrasah
             LEFT JOIN users u ON u.id = p.id_users_pengaju
             WHERE p.id = ? LIMIT 1"
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    private function promoteStagingMedia(?string $relativePath): ?string
    {
        $norm = MadrasahEditPengajuanHelper::normalizeUploadPath($relativePath);
        if ($norm === null) {
            return null;
        }
        $relNoUpload = preg_replace('#^uploads/#', '', $norm) ?? $norm;
        $src = $this->uploadsBasePath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relNoUpload);
        $real = realpath($src);
        if ($real === false || !is_file($real)) {
            return $norm;
        }
        if (strpos($relNoUpload, 'ugt/pengajuan_madrasah/') !== 0) {
            return $norm;
        }
        $ext = pathinfo($real, PATHINFO_EXTENSION) ?: 'jpg';
        $destName = 'madrasah_' . uniqid('', true) . '.' . strtolower($ext);
        $destDir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'ugt';
        if (!is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }
        $dest = $destDir . DIRECTORY_SEPARATOR . $destName;
        if (!@copy($real, $dest)) {
            return $norm;
        }

        return 'uploads/ugt/' . $destName;
    }

    private function applyToMadrasah(int $madrasahId, array $dataBaru, ?string $fotoPath, ?string $logoPath): void
    {
        $stmtOld = $this->db->prepare('SELECT * FROM madrasah WHERE id = ?');
        $stmtOld->execute([$madrasahId]);
        $old = $stmtOld->fetch(\PDO::FETCH_ASSOC);
        if (!$old) {
            throw new \RuntimeException('Madrasah tidak ditemukan');
        }

        $snap = MadrasahEditPengajuanHelper::snapshotFromMadrasahRow(array_merge($old, $dataBaru));
        $fotoFinal = $fotoPath !== null ? $this->promoteStagingMedia($fotoPath) : ($old['foto_path'] ?? null);
        $logoFinal = $logoPath !== null ? $this->promoteStagingMedia($logoPath) : ($old['logo_path'] ?? null);

        $stmt = $this->db->prepare("
            UPDATE madrasah SET
                identitas = ?, nama = ?, kategori = ?,
                id_alamat = ?, dusun = ?, rt = ?, rw = ?,
                desa = ?, kecamatan = ?, kabupaten = ?, provinsi = ?, kode_pos = ?,
                nama_pengasuh = ?, no_pengasuh = ?, nama_pjgt = ?, no_pjgt = ?,
                tingkatan = ?, kelas_tertinggi = ?, kurikulum = ?, jumlah_murid = ?,
                foto_path = ?, logo_path = ?,
                kepala = ?, sekretaris = ?, bendahara = ?,
                kegiatan_pagi = ?, kegiatan_sore = ?, kegiatan_malam = ?,
                kegiatan_mulai = ?, kegiatan_sampai = ?,
                kegiatan_pagi_mulai = ?, kegiatan_pagi_sampai = ?,
                kegiatan_sore_mulai = ?, kegiatan_sore_sampai = ?,
                kegiatan_malam_mulai = ?, kegiatan_malam_sampai = ?,
                tempat = ?, berdiri_tahun = ?, keterangan = ?,
                banin_banat = ?, seragam = ?, syahriah = ?, pengelola = ?,
                gedung_madrasah = ?, kantor = ?, bangku = ?, kamar_mandi_murid = ?,
                kamar_gt = ?, kamar_mandi_gt = ?, km_bersifat = ?, konsumsi = ?,
                kamar_gt_jarak = ?, masyarakat = ?, alumni = ?, jarak_md_lain = ?
            WHERE id = ?
        ");
        $stmt->execute([
            $snap['identitas'], $snap['nama'], $snap['kategori'],
            $snap['id_alamat'], $snap['dusun'], $snap['rt'], $snap['rw'],
            $snap['desa'], $snap['kecamatan'], $snap['kabupaten'], $snap['provinsi'], $snap['kode_pos'],
            $snap['nama_pengasuh'], $snap['no_pengasuh'], $snap['nama_pjgt'], $snap['no_pjgt'],
            $snap['tingkatan'], $snap['kelas_tertinggi'], $snap['kurikulum'], $snap['jumlah_murid'],
            $fotoFinal, $logoFinal,
            $snap['kepala'], $snap['sekretaris'], $snap['bendahara'],
            $snap['kegiatan_pagi'], $snap['kegiatan_sore'], $snap['kegiatan_malam'],
            $snap['kegiatan_mulai'], $snap['kegiatan_sampai'],
            $snap['kegiatan_pagi_mulai'], $snap['kegiatan_pagi_sampai'],
            $snap['kegiatan_sore_mulai'], $snap['kegiatan_sore_sampai'],
            $snap['kegiatan_malam_mulai'], $snap['kegiatan_malam_sampai'],
            $snap['tempat'], $snap['berdiri_tahun'], $snap['keterangan'],
            $snap['banin_banat'], $snap['seragam'], $snap['syahriah'], $snap['pengelola'],
            $snap['gedung_madrasah'], $snap['kantor'], $snap['bangku'], $snap['kamar_mandi_murid'],
            $snap['kamar_gt'], $snap['kamar_mandi_gt'], $snap['km_bersifat'], $snap['konsumsi'],
            $snap['kamar_gt_jarak'], $snap['masyarakat'], $snap['alumni'], $snap['jarak_md_lain'],
            $madrasahId,
        ]);
    }

    /** GET /api/ugt/madrasah-edit-pengajuan */
    public function getAll(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if ($deny = $this->denyIfCannotReview($userArr)) {
                return $this->json($response, $deny, 403);
            }

            $params = $request->getQueryParams();
            $status = isset($params['status']) ? trim((string) $params['status']) : '';
            $idMadrasah = isset($params['id_madrasah']) ? (int) $params['id_madrasah'] : 0;

            $sql = "SELECT p.*, m.nama AS madrasah_nama, u.username AS pengaju_nama
                    FROM ugt___madrasah_edit_pengajuan p
                    LEFT JOIN madrasah m ON m.id = p.id_madrasah
                    LEFT JOIN users u ON u.id = p.id_users_pengaju
                    WHERE 1=1";
            $bind = [];
            if ($status !== '' && in_array($status, ['menunggu', 'disetujui', 'ditolak'], true)) {
                $sql .= ' AND p.status = ?';
                $bind[] = $status;
            }
            if ($idMadrasah > 0) {
                $sql .= ' AND p.id_madrasah = ?';
                $bind[] = $idMadrasah;
            }
            if (RoleHelper::tokenMadrasahDataApplyKoordinatorScope($this->db, $userArr)) {
                $pengurusId = (int) ($userArr['user_id'] ?? 0);
                $sql .= ' AND m.id_koordinator = ?';
                $bind[] = $pengurusId;
            }
            $sql .= ' ORDER BY FIELD(p.status, \'menunggu\', \'disetujui\', \'ditolak\'), p.id DESC LIMIT 500';

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => array_map(fn ($r) => $this->mapRow($r), $rows),
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahEditPengajuanController::getAll ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat pengajuan'], 500);
        }
    }

    /** GET /api/ugt/madrasah-edit-pengajuan/{id} */
    public function getById(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if ($deny = $this->denyIfCannotReview($userArr)) {
                return $this->json($response, $deny, 403);
            }
            $id = (int) ($args['id'] ?? 0);
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }
            $row = $this->fetchPengajuan($id);
            if (!$row || !$this->assertMadrasahInScope($userArr, (int) $row['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan tidak ditemukan'], 404);
            }

            $stmtM = $this->db->prepare('SELECT * FROM madrasah WHERE id = ? LIMIT 1');
            $stmtM->execute([(int) $row['id_madrasah']]);
            $madrasah = $stmtM->fetch(\PDO::FETCH_ASSOC) ?: null;

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'pengajuan' => $this->mapRow($row),
                    'madrasah' => $madrasah,
                    'madrasah_snapshot' => $madrasah
                        ? MadrasahEditPengajuanHelper::snapshotFromMadrasahRow($madrasah)
                        : null,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahEditPengajuanController::getById ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat detail'], 500);
        }
    }

    /** PUT /api/ugt/madrasah-edit-pengajuan/{id} — ubah draft data_baru sebelum putusan */
    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if ($deny = $this->denyIfCannotReview($userArr)) {
                return $this->json($response, $deny, 403);
            }
            $id = (int) ($args['id'] ?? 0);
            $row = $id > 0 ? $this->fetchPengajuan($id) : null;
            if (!$row || !$this->assertMadrasahInScope($userArr, (int) $row['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan tidak ditemukan'], 404);
            }
            if (($row['status'] ?? '') !== 'menunggu') {
                return $this->json($response, ['success' => false, 'message' => 'Hanya pengajuan menunggu yang bisa diubah'], 400);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, []) : [];
            $dataLama = MadrasahEditPengajuanHelper::decodeJson($row['data_lama'] ?? null);
            $dataBaruCurrent = MadrasahEditPengajuanHelper::decodeJson($row['data_baru'] ?? null);

            $payloadSource = isset($body['data_baru']) && is_array($body['data_baru']) ? $body['data_baru'] : $body;
            $extracted = MadrasahEditPengajuanHelper::extractPayload($payloadSource, false);
            if (!$extracted['ok']) {
                return $this->json($response, ['success' => false, 'message' => $extracted['message'] ?? 'Data tidak valid'], 400);
            }
            $merged = MadrasahEditPengajuanHelper::mergeDataBaru(
                $dataBaruCurrent !== [] ? $dataBaruCurrent : $dataLama,
                $extracted['data']
            );
            if (isset($merged['nama']) && trim((string) $merged['nama']) === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nama madrasah wajib diisi'], 400);
            }

            $foto = $row['foto_path_baru'] ?? null;
            $logo = $row['logo_path_baru'] ?? null;
            if (array_key_exists('foto_path_baru', $body)) {
                $foto = $body['foto_path_baru'] === null || $body['foto_path_baru'] === ''
                    ? null
                    : MadrasahEditPengajuanHelper::normalizeUploadPath((string) $body['foto_path_baru']);
            }
            if (array_key_exists('logo_path_baru', $body)) {
                $logo = $body['logo_path_baru'] === null || $body['logo_path_baru'] === ''
                    ? null
                    : MadrasahEditPengajuanHelper::normalizeUploadPath((string) $body['logo_path_baru']);
            }
            $catatan = array_key_exists('catatan_reviewer', $body)
                ? (trim((string) $body['catatan_reviewer']) === '' ? null : substr(trim((string) $body['catatan_reviewer']), 0, 2000))
                : ($row['catatan_reviewer'] ?? null);

            $upd = $this->db->prepare(
                "UPDATE ugt___madrasah_edit_pengajuan SET data_baru = ?, foto_path_baru = ?, logo_path_baru = ?, catatan_reviewer = ?, tanggal_update = NOW() WHERE id = ?"
            );
            $upd->execute([
                MadrasahEditPengajuanHelper::encodeJson($merged),
                $foto,
                $logo,
                $catatan,
                $id,
            ]);

            $fresh = $this->fetchPengajuan($id);

            return $this->json($response, [
                'success' => true,
                'message' => 'Draft pengajuan diperbarui',
                'data' => $fresh ? $this->mapRow($fresh) : null,
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahEditPengajuanController::update ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui draft'], 500);
        }
    }

    /** POST /api/ugt/madrasah-edit-pengajuan/{id}/approve */
    public function approve(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if ($deny = $this->denyIfCannotReview($userArr)) {
                return $this->json($response, $deny, 403);
            }
            $id = (int) ($args['id'] ?? 0);
            $row = $id > 0 ? $this->fetchPengajuan($id) : null;
            if (!$row || !$this->assertMadrasahInScope($userArr, (int) $row['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan tidak ditemukan'], 404);
            }
            if (($row['status'] ?? '') !== 'menunggu') {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan sudah diputus'], 400);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, []) : [];

            $dataLama = MadrasahEditPengajuanHelper::decodeJson($row['data_lama'] ?? null);
            $dataBaru = MadrasahEditPengajuanHelper::decodeJson($row['data_baru'] ?? null);
            $payloadSource = isset($body['data_baru']) && is_array($body['data_baru']) ? $body['data_baru'] : $body;
            $extracted = MadrasahEditPengajuanHelper::extractPayload($payloadSource, false);
            if ($extracted['ok'] && $extracted['data'] !== []) {
                $dataBaru = MadrasahEditPengajuanHelper::mergeDataBaru(
                    $dataBaru !== [] ? $dataBaru : $dataLama,
                    $extracted['data']
                );
            }
            if (trim((string) ($dataBaru['nama'] ?? '')) === '') {
                return $this->json($response, ['success' => false, 'message' => 'Nama madrasah wajib diisi'], 400);
            }

            $fotoPath = $row['foto_path_baru'] ?? null;
            $logoPath = $row['logo_path_baru'] ?? null;
            if (array_key_exists('foto_path_baru', $body)) {
                $fotoPath = $body['foto_path_baru'] === null || $body['foto_path_baru'] === ''
                    ? null
                    : MadrasahEditPengajuanHelper::normalizeUploadPath((string) $body['foto_path_baru']);
            }
            if (array_key_exists('logo_path_baru', $body)) {
                $logoPath = $body['logo_path_baru'] === null || $body['logo_path_baru'] === ''
                    ? null
                    : MadrasahEditPengajuanHelper::normalizeUploadPath((string) $body['logo_path_baru']);
            }
            $catatan = array_key_exists('catatan_reviewer', $body)
                ? (trim((string) $body['catatan_reviewer']) === '' ? null : substr(trim((string) $body['catatan_reviewer']), 0, 2000))
                : ($row['catatan_reviewer'] ?? null);

            $madrasahId = (int) $row['id_madrasah'];
            $pengurusId = isset($userArr['user_id']) ? (int) $userArr['user_id'] : null;

            $this->db->beginTransaction();
            try {
                $stmtOld = $this->db->prepare('SELECT * FROM madrasah WHERE id = ?');
                $stmtOld->execute([$madrasahId]);
                $oldMadrasah = $stmtOld->fetch(\PDO::FETCH_ASSOC);

                $updDraft = $this->db->prepare(
                    "UPDATE ugt___madrasah_edit_pengajuan SET data_baru = ?, foto_path_baru = ?, logo_path_baru = ? WHERE id = ? AND status = 'menunggu'"
                );
                $updDraft->execute([
                    MadrasahEditPengajuanHelper::encodeJson($dataBaru),
                    $fotoPath,
                    $logoPath,
                    $id,
                ]);

                $this->applyToMadrasah($madrasahId, $dataBaru, $fotoPath, $logoPath);

                $upd = $this->db->prepare(
                    "UPDATE ugt___madrasah_edit_pengajuan SET
                        status = 'disetujui', catatan_reviewer = ?, id_pengurus_reviewer = ?, reviewed_at = NOW(), tanggal_update = NOW()
                     WHERE id = ? AND status = 'menunggu'"
                );
                $upd->execute([$catatan, $pengurusId, $id]);
                if ($upd->rowCount() === 0) {
                    throw new \RuntimeException('Pengajuan sudah diputus');
                }

                $this->db->commit();

                if ($oldMadrasah && $pengurusId) {
                    $stmtNew = $this->db->prepare('SELECT * FROM madrasah WHERE id = ?');
                    $stmtNew->execute([$madrasahId]);
                    $newMadrasah = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                    if ($newMadrasah) {
                        UserAktivitasLogger::log(
                            null,
                            $pengurusId,
                            UserAktivitasLogger::ACTION_UPDATE,
                            'madrasah',
                            $madrasahId,
                            $oldMadrasah,
                            $newMadrasah,
                            $request
                        );
                    }
                }
            } catch (\Throwable $e) {
                if ($this->db->inTransaction()) {
                    $this->db->rollBack();
                }
                throw $e;
            }

            $fresh = $this->fetchPengajuan($id);

            return $this->json($response, [
                'success' => true,
                'message' => 'Pengajuan disetujui dan data madrasah diperbarui',
                'data' => $fresh ? $this->mapRow($fresh) : null,
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahEditPengajuanController::approve ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyetujui pengajuan'], 500);
        }
    }

    /** POST /api/ugt/madrasah-edit-pengajuan/{id}/reject */
    public function reject(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if ($deny = $this->denyIfCannotReview($userArr)) {
                return $this->json($response, $deny, 403);
            }
            $id = (int) ($args['id'] ?? 0);
            $row = $id > 0 ? $this->fetchPengajuan($id) : null;
            if (!$row || !$this->assertMadrasahInScope($userArr, (int) $row['id_madrasah'])) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan tidak ditemukan'], 404);
            }
            if (($row['status'] ?? '') !== 'menunggu') {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan sudah diputus'], 400);
            }

            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, []) : [];
            $catatan = isset($body['catatan_reviewer']) ? trim((string) $body['catatan_reviewer']) : '';
            $catatan = $catatan === '' ? null : substr($catatan, 0, 2000);
            $pengurusId = isset($userArr['user_id']) ? (int) $userArr['user_id'] : null;

            $upd = $this->db->prepare(
                "UPDATE ugt___madrasah_edit_pengajuan SET
                    status = 'ditolak', catatan_reviewer = ?, id_pengurus_reviewer = ?, reviewed_at = NOW(), tanggal_update = NOW()
                 WHERE id = ? AND status = 'menunggu'"
            );
            $upd->execute([$catatan, $pengurusId, $id]);
            if ($upd->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Pengajuan sudah diputus'], 400);
            }

            $fresh = $this->fetchPengajuan($id);

            return $this->json($response, [
                'success' => true,
                'message' => 'Pengajuan ditolak',
                'data' => $fresh ? $this->mapRow($fresh) : null,
            ], 200);
        } catch (\Exception $e) {
            error_log('MadrasahEditPengajuanController::reject ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menolak pengajuan'], 500);
        }
    }
}
