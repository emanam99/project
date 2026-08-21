<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\MadrasahTingkatanHelper;
use App\Helpers\MybeddianProfilFotoHelper;
use App\Helpers\RoleHelper;
use App\Helpers\SantriStatusHelper;
use App\Helpers\ShohifahWindowHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Controller profil santri, toko, atau akun portal (PJGT/madrasah) untuk aplikasi Mybeddian.
 * Santri: santri_id dari JWT, data/foto dari tabel santri (uploads/santri/).
 * Toko: toko_id dari JWT, data/foto dari cashless___pedagang (uploads/cashless/).
 * PJGT / portal: uploads/mybeddian_user/ di users.foto_profil.
 * Path tampilan disatukan lewat MybeddianProfilFotoHelper (users → toko/santri → pengurus eBeddien).
 */
class MybeddianProfilController
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

    /** Ambil santri_id dari JWT. */
    private function getSantriIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        $santriId = isset($payload['santri_id']) ? (int) $payload['santri_id'] : 0;
        return $santriId > 0 ? $santriId : null;
    }

    /** Ambil toko_id dari JWT (cashless___pedagang.id). */
    private function getTokoIdFromRequest(Request $request): ?int
    {
        $payload = $request->getAttribute('user');
        $tokoId = isset($payload['toko_id']) ? (int) $payload['toko_id'] : 0;
        return $tokoId > 0 ? $tokoId : null;
    }

    private function getSantriUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'santri';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function getCashlessUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'cashless';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function getMybeddianUserUploadDir(): string
    {
        $dir = $this->uploadsBasePath . DIRECTORY_SEPARATOR . 'mybeddian_user';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    private function resolveFilePath(string $pathFile): string
    {
        $pathFile = trim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $pathFile), DIRECTORY_SEPARATOR);
        if (stripos($pathFile, 'uploads') === 0) {
            $pathFile = trim(substr($pathFile, strlen('uploads')), DIRECTORY_SEPARATOR);
        }
        return $this->uploadsBasePath . DIRECTORY_SEPARATOR . $pathFile;
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/mybeddian/v2/profil - Data profil dari tabel user (username, email, no_wa, no_wa_verified_at)
     * plus nama dan foto_profil dari santri untuk tampilan header.
     */
    public function getProfil(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (empty($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Autentikasi diperlukan'], 403);
            }
            $pArr = is_array($payload) ? $payload : [];
            $santriId = isset($payload['santri_id']) ? (int) $payload['santri_id'] : null;
            $tokoId = isset($payload['toko_id']) ? (int) $payload['toko_id'] : null;
            $hasPjgtRole = RoleHelper::tokenHasAnyRoleKey($pArr, ['pjgt']);
            $userId = isset($payload['users_id']) && (int) $payload['users_id'] > 0
                ? (int) $payload['users_id']
                : (int) ($payload['user_id'] ?? 0);
            if ($userId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            $params = $request->getQueryParams();
            $prefer = strtolower(trim((string) ($params['akses'] ?? $params['prefer'] ?? '')));
            if (!in_array($prefer, ['santri', 'toko', 'pjgt', 'wali'], true)) {
                $prefer = '';
            }
            // Multi-akses: jangan otomatis mengutamakan toko hanya karena toko_id di JWT.
            // Default: santri → toko → pjgt (bisa diganti query ?akses=toko|pjgt|santri).
            $useToko = false;
            $useSantri = false;
            $usePjgt = false;
            if ($prefer === 'toko' && $tokoId > 0) {
                $useToko = true;
            } elseif ($prefer === 'santri' && ($santriId > 0 || RoleHelper::tokenIsSantriDaftarContext($pArr))) {
                $useSantri = true;
            } elseif ($prefer === 'pjgt' && $hasPjgtRole) {
                $usePjgt = true;
            } elseif ($prefer === '' || $prefer === 'wali') {
                if ($santriId > 0 || RoleHelper::tokenIsSantriDaftarContext($pArr)) {
                    $useSantri = true;
                } elseif ($tokoId > 0) {
                    $useToko = true;
                } elseif ($hasPjgtRole) {
                    $usePjgt = true;
                }
            }

            $stmt = $this->db->prepare("
                SELECT username, email, COALESCE(no_wa, '') AS no_wa, no_wa_verified_at
                FROM users
                WHERE id = ?
            ");
            $stmt->execute([$userId]);
            $userRow = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$userRow) {
                return $this->json($response, ['success' => false, 'message' => 'Data user tidak ditemukan'], 404);
            }

            $nama = null;
            /** @var array{nama_pengasuh: ?string, nama_pjgt: ?string}|null */
            $madrasahMeta = null;
            if ($useToko && $tokoId > 0) {
                $stmtToko = $this->db->prepare("SELECT nama_toko, foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmtToko->execute([$tokoId, $userId]);
                $tokoRow = $stmtToko->fetch(\PDO::FETCH_ASSOC);
                if ($tokoRow) {
                    $nama = $tokoRow['nama_toko'];
                }
            } elseif ($useSantri) {
                $sid = $santriId > 0 ? $santriId : (int) ($payload['user_id'] ?? $payload['id'] ?? 0);
                if ($sid > 0) {
                    $stmtSantri = $this->db->prepare("SELECT nama, foto_profil FROM santri WHERE id = ?");
                    $stmtSantri->execute([$sid]);
                    $santriRow = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                    if ($santriRow) {
                        $nama = $santriRow['nama'];
                    }
                }
            } elseif ($usePjgt) {
                $mid = isset($pArr['madrasah_id']) ? (int) $pArr['madrasah_id'] : 0;
                if ($mid > 0) {
                    $stmtM = $this->db->prepare(
                        'SELECT id, nama, nama_pengasuh, nama_pjgt, no_pengasuh, no_pjgt,
                                kategori, identitas, status,
                                desa, kecamatan, kabupaten, provinsi, kode_pos
                         FROM madrasah WHERE id = ? LIMIT 1'
                    );
                    $stmtM->execute([$mid]);
                    $mrow = $stmtM->fetch(\PDO::FETCH_ASSOC);
                    if ($mrow) {
                        $nama = $mrow['nama'];
                        $madrasahMeta = $this->buildMadrasahMetaFromRow($mrow, $mid);
                    }
                }
            } else {
                $pengurusId = RoleHelper::getPengurusIdFromPayload($pArr);
                if ($pengurusId !== null && $pengurusId > 0) {
                    $stmtP = $this->db->prepare('SELECT nama FROM pengurus WHERE id = ? LIMIT 1');
                    $stmtP->execute([$pengurusId]);
                    $prow = $stmtP->fetch(\PDO::FETCH_ASSOC);
                    if ($prow && isset($prow['nama']) && trim((string) $prow['nama']) !== '') {
                        $nama = (string) $prow['nama'];
                    }
                }
            }

            /** Multi-akun santri + PJGT: cabang santri di atas mengisi `nama` tetapi tidak mengisi madrasah — lampirkan untuk UI PJGT */
            if ($madrasahMeta === null && $hasPjgtRole) {
                $midExtra = isset($pArr['madrasah_id']) ? (int) $pArr['madrasah_id'] : 0;
                if ($midExtra > 0) {
                    $stmtMx = $this->db->prepare(
                        'SELECT id, nama, nama_pengasuh, nama_pjgt, no_pengasuh, no_pjgt,
                                kategori, identitas, status,
                                desa, kecamatan, kabupaten, provinsi, kode_pos
                         FROM madrasah WHERE id = ? LIMIT 1'
                    );
                    $stmtMx->execute([$midExtra]);
                    $mrowX = $stmtMx->fetch(\PDO::FETCH_ASSOC);
                    if ($mrowX) {
                        $madrasahMeta = $this->buildMadrasahMetaFromRow($mrowX, $midExtra);
                    }
                }
            }

            $pForFoto = array_merge($pArr, ['users_id' => $userId]);
            $foto_profil = MybeddianProfilFotoHelper::resolveDisplayPathIfFileExists($this->db, $pForFoto);

            if ($nama === null || trim((string) $nama) === '') {
                $fromToken = trim((string) ($pArr['user_name'] ?? $pArr['nama'] ?? ''));
                $nama = $fromToken !== '' ? $fromToken : (string) ($userRow['username'] ?? '');
            }

            $userRow['no_wa_verified_at'] = $userRow['no_wa_verified_at'] ?? null;
            $out = [
                'success' => true,
                'user' => $userRow,
                'nama' => $nama,
                'foto_profil' => $foto_profil,
            ];
            if ($madrasahMeta !== null) {
                $out['madrasah'] = $madrasahMeta;
            }
            return $this->json($response, $out, 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::getProfil ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/biodata - Biodata santri lengkap (sama struktur dengan public santri di Uwaba).
     * Hanya untuk santri yang login; santri_id dari JWT.
     */
    public function getBiodata(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $checkColumn = $this->db->query("SHOW COLUMNS FROM santri LIKE 'no_telpon_wali'");
            $hasNoTelponWali = $checkColumn->rowCount() > 0;

            // Selaras dengan SantriController::getSantriById (kolom tabel santri + rombel/kamar)
            $sql = "SELECT 
                s.id, s.nis, s.nama, s.nik, s.tempat_lahir, s.tanggal_lahir, s.gender, s.nisn, s.no_kk, s.kepala_keluarga,
                s.anak_ke, s.jumlah_saudara, s.saudara_di_pesantren, s.hobi, s.cita_cita, s.kebutuhan_khusus,
                s.ayah, s.status_ayah, s.nik_ayah, s.tempat_lahir_ayah, s.tanggal_lahir_ayah,
                s.pekerjaan_ayah, s.pendidikan_ayah, s.penghasilan_ayah,
                s.ibu, s.status_ibu, s.nik_ibu, s.tempat_lahir_ibu, s.tanggal_lahir_ibu,
                s.pekerjaan_ibu, s.pendidikan_ibu, s.penghasilan_ibu,
                s.hubungan_wali, s.wali, s.nik_wali, s.tempat_lahir_wali, s.tanggal_lahir_wali,
                s.pekerjaan_wali, s.pendidikan_wali, s.penghasilan_wali,
                s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kode_pos, s.kabupaten, s.provinsi,
                s.madrasah, s.nama_madrasah, s.alamat_madrasah, s.lulus_madrasah,
                s.sekolah, s.nama_sekolah, s.alamat_sekolah, s.lulus_sekolah, s.npsn, s.nsm,
                s.no_telpon, s.email, s.riwayat_sakit, s.ukuran_baju, s.kip, s.pkh, s.kks,
                s.status_nikah, s.pekerjaan, s.no_wa_santri" .
                ($hasNoTelponWali ? ", s.no_telpon_wali" : "") . ",
                s.status_pendaftar, s.status_murid, COALESCE(st.status_santri, s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, '') AS kategori, d.daerah, dk.kamar, dk.id_daerah, s.id_kamar,
                s.id_diniyah, rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, s.nim_diniyah,
                s.id_formal, rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal, s.nim_formal,
                s.id_lttq_tingkatan,
                lt.tingkatan AS lttq_tingkatan, lt.kelompok AS lttq_kelompok,
                l_lttq.nama AS lttq_lembaga
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN lttq_tingkatan lt ON lt.id = s.id_lttq_tingkatan
                LEFT JOIN lembaga l_lttq ON l_lttq.id = lt.lembaga_id
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                " . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . "
                WHERE s.id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$santriId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::getBiodata ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * PATCH /api/mybeddian/v2/biodata/email — perbarui email santri (mis. sebelum bayar iPayMu).
     */
    public function patchBiodataEmail(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }
            $email = isset($body['email']) ? trim((string) $body['email']) : '';
            if ($email === '') {
                return $this->json($response, ['success' => false, 'message' => 'Email wajib diisi'], 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->json($response, ['success' => false, 'message' => 'Format email tidak valid'], 400);
            }

            $stmtCheck = $this->db->prepare('SELECT id FROM santri WHERE id = ? LIMIT 1');
            $stmtCheck->execute([$santriId]);
            if (!$stmtCheck->fetch(\PDO::FETCH_ASSOC)) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }

            $this->db->prepare('UPDATE santri SET email = ? WHERE id = ?')->execute([$email, $santriId]);

            return $this->json($response, [
                'success' => true,
                'message' => 'Email berhasil disimpan',
                'data' => ['email' => $email],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::patchBiodataEmail ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * PATCH /api/mybeddian/v2/biodata/contact — perbarui email dan/atau no WA santri (sebelum bayar iPayMu).
     * Body: { email?: string, no_wa_santri?: string } — minimal satu field.
     */
    public function patchBiodataContact(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = [];
            }

            $hasEmail = array_key_exists('email', $body);
            $hasPhone = array_key_exists('no_wa_santri', $body) || array_key_exists('phone', $body);
            if (!$hasEmail && !$hasPhone) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Kirim email dan/atau no_wa_santri',
                ], 400);
            }

            $stmtCheck = $this->db->prepare('SELECT id, email, no_wa_santri, no_telpon FROM santri WHERE id = ? LIMIT 1');
            $stmtCheck->execute([$santriId]);
            $row = $stmtCheck->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $this->json($response, ['success' => false, 'message' => 'Data santri tidak ditemukan'], 404);
            }

            $email = $hasEmail ? trim((string) $body['email']) : (string) ($row['email'] ?? '');
            $phoneRaw = $hasPhone
                ? trim((string) ($body['no_wa_santri'] ?? $body['phone'] ?? ''))
                : trim((string) (($row['no_wa_santri'] ?? '') !== '' ? $row['no_wa_santri'] : ($row['no_telpon'] ?? '')));

            if ($hasEmail) {
                if ($email === '') {
                    return $this->json($response, ['success' => false, 'message' => 'Email wajib diisi'], 400);
                }
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    return $this->json($response, ['success' => false, 'message' => 'Format email tidak valid'], 400);
                }
            }

            $phoneStored = null;
            if ($hasPhone) {
                $digits = preg_replace('/\D+/', '', $phoneRaw) ?? '';
                if ($digits === '') {
                    return $this->json($response, ['success' => false, 'message' => 'Nomor HP/WA wajib diisi'], 400);
                }
                if (strpos($digits, '62') === 0) {
                    $digits = '0' . substr($digits, 2);
                }
                if ($digits[0] !== '0') {
                    $digits = '0' . $digits;
                }
                $forIpaymu = $digits;
                if (strpos($forIpaymu, '0') === 0) {
                    $forIpaymu = substr($forIpaymu, 1);
                }
                if (strlen($forIpaymu) < 10) {
                    return $this->json($response, [
                        'success' => false,
                        'message' => 'Nomor HP/WA tidak valid (minimal 10 digit)',
                    ], 400);
                }
                $phoneStored = $digits;
            }

            $sets = [];
            $params = [];
            if ($hasEmail) {
                $sets[] = 'email = ?';
                $params[] = $email;
            }
            if ($hasPhone && $phoneStored !== null) {
                $sets[] = 'no_wa_santri = ?';
                $params[] = $phoneStored;
            }
            if ($sets !== []) {
                $params[] = $santriId;
                $this->db->prepare('UPDATE santri SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            }

            $outPhone = $phoneStored ?? trim((string) (($row['no_wa_santri'] ?? '') !== '' ? $row['no_wa_santri'] : ($row['no_telpon'] ?? '')));

            return $this->json($response, [
                'success' => true,
                'message' => 'Kontak berhasil disimpan',
                'data' => [
                    'email' => $email,
                    'no_wa_santri' => $outPhone,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::patchBiodataContact ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/profil/foto - Stream foto profil santri atau toko.
     */
    public function serveFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (empty($payload) || !is_array($payload)) {
                return $response->withStatus(401);
            }
            $pArr = $payload;
            $userId = isset($payload['users_id']) && (int) $payload['users_id'] > 0
                ? (int) $payload['users_id']
                : (int) ($payload['user_id'] ?? 0);
            if ($userId <= 0) {
                return $response->withStatus(403);
            }
            $path = MybeddianProfilFotoHelper::resolveDisplayPathIfFileExists(
                $this->db,
                array_merge($pArr, ['users_id' => $userId])
            );

            if (!$path) {
                return $response->withStatus(204);
            }

            $fullPath = $this->resolveFilePath($path);
            if (!is_file($fullPath)) {
                return $response->withStatus(204);
            }

            $mime = @mime_content_type($fullPath) ?: 'image/jpeg';
            if (!preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }
            $response->getBody()->write(file_get_contents($fullPath));
            return $response->withHeader('Content-Type', $mime);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::serveFoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * POST /api/mybeddian/v2/profil/foto - Upload foto profil santri (uploads/santri/) atau toko (uploads/cashless/).
     */
    public function uploadFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (empty($payload) || !is_array($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Autentikasi diperlukan'], 401);
            }
            $userId = isset($payload['users_id']) && (int) $payload['users_id'] > 0
                ? (int) $payload['users_id']
                : (int) ($payload['user_id'] ?? 0);
            if ($userId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $tokoId = $this->getTokoIdFromRequest($request);
            $santriId = $this->getSantriIdFromRequest($request);

            if ($tokoId !== null) {
                $stmt = $this->db->prepare("SELECT id FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                if (!$stmt->fetch()) {
                    return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk toko Anda'], 403);
                }
            }

            $uploadedFiles = $request->getUploadedFiles();
            $file = $uploadedFiles['foto'] ?? $uploadedFiles['file'] ?? null;
            $phpFile = null;
            if (!$file && !empty($_FILES['foto']) && ($_FILES['foto']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                $phpFile = $_FILES['foto'];
            }
            if (!$file && !empty($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
                $phpFile = $_FILES['file'];
            }
            if (!$file && !empty($uploadedFiles)) {
                $file = reset($uploadedFiles);
            }
            if (!$file && !$phpFile) {
                $err = $_FILES['foto']['error'] ?? $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
                $msg = $err !== UPLOAD_ERR_NO_FILE ? $this->uploadErrorMessage((int) $err) : 'Tidak ada file foto. Kirim form dengan field "foto" (file gambar).';
                return $this->json($response, ['success' => false, 'message' => $msg], 400);
            }
            if ($file && method_exists($file, 'getError') && $file->getError() !== UPLOAD_ERR_OK) {
                return $this->json($response, ['success' => false, 'message' => $this->uploadErrorMessage($file->getError())], 400);
            }

            if ($phpFile) {
                $mediaType = $phpFile['type'] ?? 'image/jpeg';
            } else {
                $mediaType = $file->getClientMediaType();
            }
            $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!in_array($mediaType, $allowed, true)) {
                return $this->json($response, ['success' => false, 'message' => 'Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan'], 400);
            }

            $ext = preg_match('#^image/(jpeg|png|webp|gif)$#', $mediaType, $m) ? ($m[1] === 'jpeg' ? 'jpg' : $m[1]) : 'jpg';

            if ($tokoId !== null) {
                $fileName = 'toko_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getCashlessUploadDir();
                $relativePath = 'cashless/' . $fileName;
                $savePath = 'uploads/' . $relativePath;
                $filePath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . $relativePath;

                $stmt = $this->db->prepare("SELECT foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $oldPath = $row['foto_path'] ?? null;
            } elseif ($santriId !== null) {
                $fileName = $santriId . '_fotoprofil_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getSantriUploadDir();
                $relativePath = 'santri/' . $fileName;
                $savePath = 'uploads/' . $relativePath;
                $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

                $stmt = $this->db->prepare("SELECT foto_profil FROM santri WHERE id = ?");
                $stmt->execute([$santriId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $oldPath = $row['foto_profil'] ?? null;
            } else {
                $fileName = 'u' . $userId . '_fotoprofil_' . uniqid('', true) . '.' . $ext;
                $uploadDir = $this->getMybeddianUserUploadDir();
                $relativePath = 'mybeddian_user/' . $fileName;
                $savePath = 'uploads/' . $relativePath;
                $filePath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

                $stmt = $this->db->prepare('SELECT foto_profil FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $oldPath = $row['foto_profil'] ?? null;
            }

            if ($phpFile) {
                $tmpPath = $phpFile['tmp_name'] ?? '';
                if (!is_uploaded_file($tmpPath) || !move_uploaded_file($tmpPath, $filePath)) {
                    return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan file'], 400);
                }
            } else {
                $file->moveTo($filePath);
            }

            $imageInfo = @getimagesize($filePath);
            $allowedTypes = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP];
            if ($imageInfo === false || !in_array($imageInfo[2] ?? 0, $allowedTypes, true)) {
                @unlink($filePath);

                return $this->json($response, ['success' => false, 'message' => 'File bukan gambar yang valid'], 400);
            }
            $maxBytes = 512 * 1024;
            if (@filesize($filePath) > $maxBytes) {
                @unlink($filePath);

                return $this->json($response, ['success' => false, 'message' => 'Ukuran foto maksimal 500 KB'], 400);
            }

            if ($oldPath) {
                $oldFull = $this->resolveFilePath($oldPath);
                if (file_exists($oldFull)) {
                    @unlink($oldFull);
                }
            }

            if ($tokoId !== null) {
                $this->db->prepare("UPDATE cashless___pedagang SET foto_path = ? WHERE id = ? AND id_users = ?")->execute([$savePath, $tokoId, $userId]);
            } elseif ($santriId !== null) {
                $this->db->prepare("UPDATE santri SET foto_profil = ? WHERE id = ?")->execute([$savePath, $santriId]);
            } else {
                $this->db->prepare('UPDATE users SET foto_profil = ? WHERE id = ?')->execute([$savePath, $userId]);
            }
            if ($userId > 0 && ($tokoId !== null || $santriId !== null)) {
                $this->db->prepare('UPDATE users SET foto_profil = ? WHERE id = ?')->execute([$savePath, $userId]);
            }

            return $this->json($response, [
                'success' => true,
                'message' => 'Foto profil berhasil diperbarui',
                'foto_profil' => $savePath,
            ], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::uploadFoto ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengunggah foto'], 500);
        }
    }

    /**
     * DELETE /api/mybeddian/v2/profil/foto - Hapus foto profil santri atau toko.
     */
    public function deleteFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            if (empty($payload) || !is_array($payload)) {
                return $this->json($response, ['success' => false, 'message' => 'Autentikasi diperlukan'], 401);
            }
            $userId = isset($payload['users_id']) && (int) $payload['users_id'] > 0
                ? (int) $payload['users_id']
                : (int) ($payload['user_id'] ?? 0);
            if ($userId <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }
            $tokoId = $this->getTokoIdFromRequest($request);
            $santriId = $this->getSantriIdFromRequest($request);

            if ($tokoId !== null && $userId > 0) {
                $stmt = $this->db->prepare("SELECT foto_path FROM cashless___pedagang WHERE id = ? AND id_users = ? LIMIT 1");
                $stmt->execute([$tokoId, $userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_path'] ?? null;
                if ($path) {
                    $fullPath = $this->resolveFilePath($path);
                    if (file_exists($fullPath)) {
                        @unlink($fullPath);
                    }
                    $this->db->prepare("UPDATE cashless___pedagang SET foto_path = NULL WHERE id = ? AND id_users = ?")->execute([$tokoId, $userId]);
                }
                if ($userId > 0) {
                    $this->db->prepare('UPDATE users SET foto_profil = NULL WHERE id = ?')->execute([$userId]);
                }
            } elseif ($santriId !== null) {
                $stmt = $this->db->prepare("SELECT foto_profil FROM santri WHERE id = ?");
                $stmt->execute([$santriId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_profil'] ?? null;
                if ($path) {
                    $fullPath = $this->resolveFilePath($path);
                    if (file_exists($fullPath)) {
                        @unlink($fullPath);
                    }
                    $this->db->prepare("UPDATE santri SET foto_profil = NULL WHERE id = ?")->execute([$santriId]);
                }
                if ($userId > 0) {
                    $this->db->prepare('UPDATE users SET foto_profil = NULL WHERE id = ?')->execute([$userId]);
                }
            } elseif ($userId > 0) {
                $stmt = $this->db->prepare('SELECT foto_profil FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                $path = $row['foto_profil'] ?? null;
                if ($path) {
                    $fullPath = $this->resolveFilePath($path);
                    if (file_exists($fullPath)) {
                        @unlink($fullPath);
                    }
                    $this->db->prepare('UPDATE users SET foto_profil = NULL WHERE id = ?')->execute([$userId]);
                }
            } else {
                return $this->json($response, ['success' => false, 'message' => 'User tidak valid'], 403);
            }

            return $this->json($response, ['success' => true, 'message' => 'Foto profil telah dihapus'], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::deleteFoto ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus foto'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/madrasah-profil — biodata madrasah lengkap (mirror kolom + join seperti Data Madrasah eBeddien).
     * Hanya role pjgt; dibatasi ke madrasah_id di JWT.
     */
    public function getMadrasahProfil(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            if (empty($pArr) || !RoleHelper::tokenHasAnyRoleKey($pArr, ['pjgt'])) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk PJGT'], 403);
            }
            $mid = isset($pArr['madrasah_id']) ? (int) $pArr['madrasah_id'] : 0;
            if ($mid <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'Madrasah tidak terhubung pada akun'], 400);
            }
            $row = $this->fetchMadrasahDetailForPjgt($mid);
            if ($row === null) {
                return $this->json($response, ['success' => false, 'message' => 'Data madrasah tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'data' => $row], 200);
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::getMadrasahProfil ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Terjadi kesalahan'], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/madrasah-profil/foto?path=… — stream foto/logo madrasah (ugt/) jika path milik madrasah PJGT ini.
     */
    public function serveMadrasahFoto(Request $request, Response $response): Response
    {
        try {
            $payload = $request->getAttribute('user');
            $pArr = is_array($payload) ? $payload : [];
            if (empty($pArr) || !RoleHelper::tokenHasAnyRoleKey($pArr, ['pjgt'])) {
                return $response->withStatus(403);
            }
            $mid = isset($pArr['madrasah_id']) ? (int) $pArr['madrasah_id'] : 0;
            if ($mid <= 0) {
                return $response->withStatus(403);
            }

            $params = $request->getQueryParams();
            $path = isset($params['path']) ? trim((string) $params['path']) : '';
            if ($path === '' || preg_match('/\.\./', $path)) {
                return $response->withStatus(400);
            }

            $stmt = $this->db->prepare('SELECT foto_path, logo_path FROM madrasah WHERE id = ? LIMIT 1');
            $stmt->execute([$mid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return $response->withStatus(404);
            }

            $allowed = array_filter([
                $this->normalizeRelativeUploadPath((string) ($row['foto_path'] ?? '')),
                $this->normalizeRelativeUploadPath((string) ($row['logo_path'] ?? '')),
            ], static fn ($p) => $p !== '');

            $stmtP = $this->db->prepare(
                "SELECT foto_path_baru, logo_path_baru FROM ugt___madrasah_edit_pengajuan
                 WHERE id_madrasah = ? AND status = 'menunggu' ORDER BY id DESC LIMIT 1"
            );
            $stmtP->execute([$mid]);
            $pengajuan = $stmtP->fetch(\PDO::FETCH_ASSOC);
            if ($pengajuan) {
                foreach (['foto_path_baru', 'logo_path_baru'] as $pk) {
                    $np = $this->normalizeRelativeUploadPath((string) ($pengajuan[$pk] ?? ''));
                    if ($np !== '') {
                        $allowed[] = $np;
                    }
                }
            }

            $normReq = $this->normalizeRelativeUploadPath($path);
            if ($normReq === '' || !in_array($normReq, $allowed, true)) {
                return $response->withStatus(403);
            }
            if (strpos($normReq, 'ugt/') !== 0) {
                return $response->withStatus(403);
            }

            $fullPath = $this->uploadsBasePath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $normReq);
            $real = realpath($fullPath);
            if ($real === false || !is_file($real) || strpos($real, $this->uploadsBasePath) !== 0) {
                return $response->withStatus(404);
            }

            $mime = @mime_content_type($real);
            if (!$mime || !preg_match('#^image/#', $mime)) {
                $mime = 'image/jpeg';
            }

            $mtime = filemtime($real);
            $etag = '"' . md5($real . (string) $mtime . (string) filesize($real)) . '"';
            $response = $response
                ->withHeader('Content-Type', $mime)
                ->withHeader('Cache-Control', 'public, max-age=604800')
                ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', $mtime) . ' GMT')
                ->withHeader('ETag', $etag);

            $ifNoneMatch = $request->getHeaderLine('If-None-Match');
            if ($ifNoneMatch !== '' && trim($ifNoneMatch) === $etag) {
                return $response->withStatus(304);
            }

            $response->getBody()->write(file_get_contents($real));
            return $response;
        } catch (\Exception $e) {
            error_log('MybeddianProfilController::serveMadrasahFoto ' . $e->getMessage());
            return $response->withStatus(500);
        }
    }

    /**
     * Detail madrasah seperti GET /api/madrasah/{id} tanpa pengecekan scope koordinator (hanya id dari token).
     *
     * @return array<string, mixed>|null
     */
    private function fetchMadrasahDetailForPjgt(int $id): ?array
    {
        $sqlDetail = "
            SELECT m.*,
                a.nama AS alamat_nama, a.tipe AS alamat_tipe, a.kode_pos AS alamat_kode_pos,
                up.username AS pengasuh_nama, COALESCE(up.no_wa, '') AS pengasuh_wa, up.no_wa AS pengasuh_telp,
                uj.username AS pjgt_nama, COALESCE(uj.no_wa, '') AS pjgt_wa, uj.no_wa AS pjgt_telp,
                pk.nama AS koordinator_nama, COALESCE(uk.no_wa, '') AS koordinator_wa, uk.no_wa AS koordinator_telp
            FROM madrasah m
            LEFT JOIN alamat a ON a.id = m.id_alamat
            LEFT JOIN users up ON up.id = m.id_pengasuh
            LEFT JOIN users uj ON uj.id = m.id_pjgt
            LEFT JOIN pengurus pk ON pk.id = m.id_koordinator
            LEFT JOIN users uk ON uk.id = pk.id_user
            WHERE m.id = ?
        ";
        try {
            $stmt = $this->db->prepare($sqlDetail);
            $stmt->execute([$id]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return $row ? MadrasahTingkatanHelper::enrichRow($row) : null;
        } catch (\PDOException $e) {
            $msg = $e->getMessage();
            if (strpos($msg, 'Unknown column') !== false || strpos($msg, 'nip') !== false || strpos($msg, 'no_telpon') !== false) {
                $stmt = $this->db->prepare('SELECT * FROM madrasah WHERE id = ? LIMIT 1');
                $stmt->execute([$id]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                return $row ? MadrasahTingkatanHelper::enrichRow($row) : null;
            }
            throw $e;
        }
    }

    /**
     * Metadata madrasah untuk respons GET profil (PJGT).
     *
     * @param array<string, mixed> $mrow
     * @return array<string, mixed>
     */
    private function buildMadrasahMetaFromRow(array $mrow, int $fallbackId): array
    {
        $mid = (int) ($mrow['id'] ?? $fallbackId);
        $np = trim((string) ($mrow['nama_pengasuh'] ?? ''));
        $nj = trim((string) ($mrow['nama_pjgt'] ?? ''));

        return [
            'id' => $mid,
            'nama' => $mrow['nama'] ?? null,
            'nama_pengasuh' => $np !== '' ? $np : null,
            'nama_pjgt' => $nj !== '' ? $nj : null,
            'no_pengasuh' => isset($mrow['no_pengasuh']) && trim((string) $mrow['no_pengasuh']) !== ''
                ? trim((string) $mrow['no_pengasuh']) : null,
            'no_pjgt' => isset($mrow['no_pjgt']) && trim((string) $mrow['no_pjgt']) !== ''
                ? trim((string) $mrow['no_pjgt']) : null,
            'kategori' => isset($mrow['kategori']) && $mrow['kategori'] !== ''
                ? (string) $mrow['kategori'] : null,
            'identitas' => isset($mrow['identitas']) && trim((string) $mrow['identitas']) !== ''
                ? trim((string) $mrow['identitas']) : null,
            'status' => isset($mrow['status']) && trim((string) ($mrow['status'] ?? '')) !== ''
                ? trim((string) $mrow['status']) : null,
            'desa' => isset($mrow['desa']) && trim((string) ($mrow['desa'] ?? '')) !== ''
                ? trim((string) $mrow['desa']) : null,
            'kecamatan' => isset($mrow['kecamatan']) && trim((string) ($mrow['kecamatan'] ?? '')) !== ''
                ? trim((string) $mrow['kecamatan']) : null,
            'kabupaten' => isset($mrow['kabupaten']) && trim((string) ($mrow['kabupaten'] ?? '')) !== ''
                ? trim((string) $mrow['kabupaten']) : null,
            'provinsi' => isset($mrow['provinsi']) && trim((string) ($mrow['provinsi'] ?? '')) !== ''
                ? trim((string) $mrow['provinsi']) : null,
            'kode_pos' => isset($mrow['kode_pos']) && trim((string) ($mrow['kode_pos'] ?? '')) !== ''
                ? trim((string) $mrow['kode_pos']) : null,
        ];
    }

    private function normalizeRelativeUploadPath(string $path): string
    {
        $path = trim(str_replace(['/', '\\'], '/', $path));
        if ($path === '') {
            return '';
        }
        if (stripos($path, 'uploads/') === 0) {
            $path = substr($path, strlen('uploads/'));
        }
        return trim($path, '/');
    }

    /**
     * GET /api/mybeddian/v2/pelanggaran — riwayat pelanggaran santri yang login (id_santri dari JWT).
     */
    public function getRiwayatPelanggaran(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $sql = 'SELECT sp.*, pg.nama AS pelanggaran_nama, pg.kategori AS pelanggaran_kategori, p.nama AS pengurus_nama
                FROM santri___pelanggaran sp
                INNER JOIN pelanggaran pg ON pg.id = sp.id_pelanggaran
                LEFT JOIN pengurus p ON sp.id_pengurus = p.id
                WHERE sp.id_santri = ?
                ORDER BY sp.tanggal_dibuat DESC, sp.id DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$santriId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian getRiwayatPelanggaran: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memuat riwayat pelanggaran',
            ], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/riwayat-lttq — riwayat penempatan LTTQ santri (id_santri dari JWT).
     */
    public function getRiwayatLttq(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            if (!$this->tableExistsMybeddian('santri___lttq')) {
                return $this->json($response, ['success' => true, 'data' => []], 200);
            }

            $sql = "SELECT sl.id, sl.id_lttq_tingkatan, sl.id_santri, sl.nim, sl.tahun_ajaran, sl.tanggal_dibuat,
                    t.tingkatan, t.kelompok, l.nama AS lembaga_nama,
                    CONCAT(TRIM(COALESCE(t.tingkatan,'')), IF(TRIM(COALESCE(t.kelompok,''))='','',' · '), TRIM(COALESCE(t.kelompok,''))) AS tingkatan_label
                    FROM santri___lttq sl
                    JOIN lttq_tingkatan t ON t.id = sl.id_lttq_tingkatan
                    JOIN lembaga l ON l.id = t.lembaga_id
                    WHERE sl.id_santri = ?
                    ORDER BY sl.tahun_ajaran DESC, sl.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$santriId]);

            return $this->json($response, [
                'success' => true,
                'data' => $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [],
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian getRiwayatLttq: ' . $e->getMessage());

            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memuat riwayat LTTQ',
            ], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/riwayat-rombel — riwayat rombel + kelulusan santri (id_santri dari JWT).
     */
    public function getRiwayatRombel(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $rows = $this->fetchRiwayatRombelMergedLulusan($santriId);

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian getRiwayatRombel: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memuat riwayat rombel',
            ], 500);
        }
    }

    /**
     * Gabung riwayat santri___rombel + santri___lulusan (satu baris per entri; lulusan menandai is_lulus).
     *
     * @return list<array<string, mixed>>
     */
    private function fetchRiwayatRombelMergedLulusan(int $santriId): array
    {
        $rombelSql = "SELECT sr.id, sr.id_rombel, sr.id_santri, sr.nim, sr.tahun_ajaran, sr.tanggal_dibuat,
                l.nama AS lembaga_nama, l.kategori AS lembaga_kategori, r.kelas, r.kel,
                CONCAT(TRIM(COALESCE(r.kelas,'')), IF(TRIM(COALESCE(r.kel,''))='','',' '), TRIM(COALESCE(r.kel,''))) AS rombel_label,
                0 AS is_lulus
                FROM santri___rombel sr
                JOIN lembaga___rombel r ON r.id = sr.id_rombel
                JOIN lembaga l ON l.id = r.lembaga_id
                WHERE sr.id_santri = ?";
        $stmt = $this->db->prepare($rombelSql);
        $stmt->execute([$santriId]);
        $merged = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        if (!$this->tableExistsMybeddian('santri___lulusan')) {
            return $this->sortRiwayatRombelRows($merged);
        }

        $lulusSql = "SELECT sl.id, sl.id_rombel, sl.id_santri, sl.tahun_ajaran, sl.tanggal_dibuat,
                l.nama AS lembaga_nama, l.kategori AS lembaga_kategori, r.kelas, r.kel,
                CONCAT(TRIM(COALESCE(r.kelas,'')), IF(TRIM(COALESCE(r.kel,''))='','',' '), TRIM(COALESCE(r.kel,''))) AS rombel_label
                FROM santri___lulusan sl
                JOIN lembaga___rombel r ON r.id = sl.id_rombel
                JOIN lembaga l ON l.id = r.lembaga_id
                WHERE sl.id_santri = ?";
        $stmtLulus = $this->db->prepare($lulusSql);
        $stmtLulus->execute([$santriId]);
        $lulusanRows = $stmtLulus->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        $indexByKey = [];
        foreach ($merged as $i => $row) {
            $key = (string) ($row['id_rombel'] ?? '') . '|' . (string) ($row['tahun_ajaran'] ?? '');
            $indexByKey[$key] = $i;
        }

        foreach ($lulusanRows as $lulus) {
            $key = (string) ($lulus['id_rombel'] ?? '') . '|' . (string) ($lulus['tahun_ajaran'] ?? '');
            $lulusTgl = $lulus['tanggal_dibuat'] ?? null;

            if (isset($indexByKey[$key])) {
                $i = $indexByKey[$key];
                $merged[$i]['is_lulus'] = 1;
                $rombelTgl = $merged[$i]['tanggal_dibuat'] ?? null;
                if ($lulusTgl && (!$rombelTgl || strcmp((string) $lulusTgl, (string) $rombelTgl) > 0)) {
                    $merged[$i]['tanggal_dibuat'] = $lulusTgl;
                }
                continue;
            }

            $nim = null;
            foreach ($merged as $r) {
                if ((string) ($r['id_rombel'] ?? '') === (string) ($lulus['id_rombel'] ?? '')) {
                    $nim = $r['nim'] ?? null;
                    break;
                }
            }

            $merged[] = [
                'id' => 'lulus-' . ($lulus['id'] ?? ''),
                'id_rombel' => $lulus['id_rombel'],
                'id_santri' => $lulus['id_santri'],
                'nim' => $nim,
                'tahun_ajaran' => $lulus['tahun_ajaran'],
                'tanggal_dibuat' => $lulusTgl,
                'lembaga_nama' => $lulus['lembaga_nama'],
                'lembaga_kategori' => $lulus['lembaga_kategori'],
                'kelas' => $lulus['kelas'],
                'kel' => $lulus['kel'],
                'rombel_label' => $lulus['rombel_label'],
                'is_lulus' => 1,
            ];
        }

        return $this->sortRiwayatRombelRows($merged);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function sortRiwayatRombelRows(array $rows): array
    {
        usort($rows, static function ($a, $b) {
            $ta = (string) ($a['tahun_ajaran'] ?? '');
            $tb = (string) ($b['tahun_ajaran'] ?? '');
            if ($ta !== $tb) {
                return strcmp($tb, $ta);
            }
            $da = (string) ($a['tanggal_dibuat'] ?? '');
            $db = (string) ($b['tanggal_dibuat'] ?? '');
            return strcmp($db, $da);
        });

        return $rows;
    }

    /**
     * GET /api/mybeddian/v2/riwayat-kamar — kamar aktif, riwayat kamar & riwayat status santri (JWT).
     */
    public function getRiwayatKamar(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $kamarAktif = null;
            $sqlAktif = 'SELECT s.id_kamar, d.daerah, dk.kamar,
                    CONCAT(d.daerah, \'.\', dk.kamar) AS daerah_kamar,
                    COALESCE(st.status_santri, s.status_santri, \'\') AS status_santri,
                    COALESCE(d.kategori, \'\') AS kategori
                FROM santri s
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                ' . SantriStatusHelper::currentStatusJoinSql('s', 'st', 'ss') . '
                WHERE s.id = ? LIMIT 1';
            $stmtAktif = $this->db->prepare($sqlAktif);
            $stmtAktif->execute([$santriId]);
            $rowAktif = $stmtAktif->fetch(\PDO::FETCH_ASSOC);
            if ($rowAktif && !empty($rowAktif['id_kamar'])) {
                $kamarAktif = $rowAktif;
            }

            $riwayatKamar = [];
            if ($this->tableExistsMybeddian('santri___kamar')) {
                $sqlKamar = "SELECT sk.id, sk.id_kamar, sk.id_santri, sk.tahun_ajaran, sk.tanggal_dibuat,
                        COALESCE(ss.status_santri, '') AS status_santri,
                        COALESCE(d.kategori, '') AS kategori,
                        d.daerah, dk.kamar, CONCAT(d.daerah, '.', dk.kamar) AS daerah_kamar
                    FROM santri___kamar sk
                    LEFT JOIN santri___status ss ON ss.id = (
                        SELECT ss2.id
                        FROM santri___status ss2
                        WHERE ss2.id_santri = sk.id_santri
                          AND ss2.dari <= COALESCE(sk.tanggal_dibuat, CURRENT_TIMESTAMP)
                          AND (ss2.sampai IS NULL OR ss2.sampai >= COALESCE(sk.tanggal_dibuat, CURRENT_TIMESTAMP))
                        ORDER BY ss2.dari DESC, ss2.id DESC
                        LIMIT 1
                    )
                    JOIN daerah___kamar dk ON dk.id = sk.id_kamar
                    JOIN daerah d ON d.id = dk.id_daerah
                    WHERE sk.id_santri = ?
                    ORDER BY sk.tahun_ajaran DESC, sk.tanggal_dibuat DESC";
                $stmtKamar = $this->db->prepare($sqlKamar);
                $stmtKamar->execute([$santriId]);
                $riwayatKamar = $stmtKamar->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            }

            $riwayatStatus = [];
            if ($this->tableExistsMybeddian('santri___status')) {
                $sqlStatus = 'SELECT ss.id, ss.id_santri, ss.dari, ss.sampai, ss.tanggal_dibuat,
                        ss.status_santri,
                        COALESCE(d.kategori, \'\') AS kategori,
                        CASE WHEN ss.sampai IS NULL THEN 1 ELSE 0 END AS is_aktif
                    FROM santri___status ss
                    INNER JOIN santri s ON s.id = ss.id_santri
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    WHERE ss.id_santri = ?
                    ORDER BY ss.dari DESC, ss.id DESC';
                $stmtStatus = $this->db->prepare($sqlStatus);
                $stmtStatus->execute([$santriId]);
                $riwayatStatus = $stmtStatus->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            }

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'kamar_aktif' => $kamarAktif,
                    'riwayat_kamar' => $riwayatKamar,
                    'riwayat_status' => $riwayatStatus,
                ],
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian getRiwayatKamar: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memuat riwayat kamar',
            ], 500);
        }
    }

    private function tableExistsMybeddian(string $table): bool
    {
        try {
            $stmt = $this->db->prepare(
                'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1'
            );
            $stmt->execute([$table]);

            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * GET /api/mybeddian/v2/ijin — riwayat ijin santri yang login (id_santri dari JWT).
     */
    public function getRiwayatIjin(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $sql = 'SELECT *
                FROM santri___ijin
                WHERE id_santri = ?
                ORDER BY tanggal_dibuat DESC, urutan ASC, id DESC';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$santriId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

            return $this->json($response, [
                'success' => true,
                'data' => $rows,
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian getRiwayatIjin: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memuat riwayat ijin',
            ], 500);
        }
    }

    /**
     * GET /api/mybeddian/v2/shohifah — data shohifah santri login + status jendela.
     */
    public function getShohifah(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $window = ShohifahWindowHelper::statusNow($this->db);
            $q = $request->getQueryParams();
            $tahunAjaran = isset($q['tahun_ajaran']) ? trim((string) $q['tahun_ajaran']) : '';
            if ($tahunAjaran === '') {
                $tahunAjaran = (string) ($window['tahun_ajaran'] ?? '');
            }
            if ($tahunAjaran === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran tidak tersedia',
                ], 400);
            }

            $sql = 'SELECT sh.*, s.nis, s.nama
                FROM santri___shohifah sh
                INNER JOIN santri s ON sh.id_santri = s.id
                WHERE sh.id_santri = ? AND sh.tahun_ajaran = ?
                LIMIT 1';
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$santriId, $tahunAjaran]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$data) {
                $sStmt = $this->db->prepare('SELECT id, nis, nama FROM santri WHERE id = ? LIMIT 1');
                $sStmt->execute([$santriId]);
                $santri = $sStmt->fetch(\PDO::FETCH_ASSOC) ?: null;
            } else {
                $santri = [
                    'id' => $santriId,
                    'nis' => $data['nis'] ?? null,
                    'nama' => $data['nama'] ?? null,
                ];
            }

            return $this->json($response, [
                'success' => true,
                'data' => $data ?: null,
                'santri' => $santri,
                'tahun_ajaran' => $tahunAjaran,
                'window' => $window,
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian getShohifah: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal memuat shohifah',
            ], 500);
        }
    }

    /**
     * POST /api/mybeddian/v2/shohifah — simpan shohifah (hanya jendela Sya'ban–Syawal).
     */
    public function saveShohifah(Request $request, Response $response): Response
    {
        try {
            $santriId = $this->getSantriIdFromRequest($request);
            if ($santriId === null) {
                return $this->json($response, ['success' => false, 'message' => 'Akses hanya untuk santri'], 403);
            }

            $window = ShohifahWindowHelper::statusNow($this->db);
            if (!$window['active']) {
                return $this->json($response, [
                    'success' => false,
                    'message' => $window['message'],
                    'window' => $window,
                ], 403);
            }

            $data = $request->getParsedBody();
            if (!is_array($data)) {
                $data = [];
            }
            $tahunAjaran = isset($data['tahun_ajaran']) ? trim((string) $data['tahun_ajaran']) : '';
            if ($tahunAjaran === '') {
                $tahunAjaran = (string) ($window['tahun_ajaran'] ?? '');
            }
            if ($tahunAjaran === '') {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'tahun_ajaran wajib diisi',
                ], 400);
            }

            $fields = [
                'sholat_jamaah_5_waktu', 'sholat_tarawih', 'sholat_witir', 'sholat_tahajjud', 'sholat_dhuha',
                'puasa_ramadhan_status', 'puasa_ramadhan_alasan',
                'khatam_alquran_status', 'khatam_alquran_jumlah', 'khatam_alquran_tanggal',
                'kitab_a_nama', 'kitab_a_status', 'kitab_b_nama', 'kitab_b_status', 'kitab_c_nama', 'kitab_c_status',
                'berbakti_orang_tua', 'akhlaq_pergaulan',
                'syawal_kembali_hari', 'syawal_kembali_tanggal',
            ];
            $vals = [];
            foreach ($fields as $f) {
                $vals[$f] = $data[$f] ?? null;
                if ($vals[$f] === '') {
                    $vals[$f] = null;
                }
            }

            $checkSql = 'SELECT id_santri FROM santri___shohifah WHERE id_santri = ? AND tahun_ajaran = ? LIMIT 1';
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$santriId, $tahunAjaran]);
            $existing = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if ($existing) {
                $sql = 'UPDATE santri___shohifah SET
                    sholat_jamaah_5_waktu = ?, sholat_tarawih = ?, sholat_witir = ?, sholat_tahajjud = ?, sholat_dhuha = ?,
                    puasa_ramadhan_status = ?, puasa_ramadhan_alasan = ?,
                    khatam_alquran_status = ?, khatam_alquran_jumlah = ?, khatam_alquran_tanggal = ?,
                    kitab_a_nama = ?, kitab_a_status = ?, kitab_b_nama = ?, kitab_b_status = ?, kitab_c_nama = ?, kitab_c_status = ?,
                    berbakti_orang_tua = ?, akhlaq_pergaulan = ?,
                    syawal_kembali_hari = ?, syawal_kembali_tanggal = ?,
                    tanggal_update = CURRENT_TIMESTAMP
                    WHERE id_santri = ? AND tahun_ajaran = ?';
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $vals['sholat_jamaah_5_waktu'], $vals['sholat_tarawih'], $vals['sholat_witir'], $vals['sholat_tahajjud'], $vals['sholat_dhuha'],
                    $vals['puasa_ramadhan_status'], $vals['puasa_ramadhan_alasan'],
                    $vals['khatam_alquran_status'], $vals['khatam_alquran_jumlah'], $vals['khatam_alquran_tanggal'],
                    $vals['kitab_a_nama'], $vals['kitab_a_status'], $vals['kitab_b_nama'], $vals['kitab_b_status'], $vals['kitab_c_nama'], $vals['kitab_c_status'],
                    $vals['berbakti_orang_tua'], $vals['akhlaq_pergaulan'],
                    $vals['syawal_kembali_hari'], $vals['syawal_kembali_tanggal'],
                    $santriId, $tahunAjaran,
                ]);
            } else {
                $sql = 'INSERT INTO santri___shohifah (
                    id_santri, tahun_ajaran,
                    sholat_jamaah_5_waktu, sholat_tarawih, sholat_witir, sholat_tahajjud, sholat_dhuha,
                    puasa_ramadhan_status, puasa_ramadhan_alasan,
                    khatam_alquran_status, khatam_alquran_jumlah, khatam_alquran_tanggal,
                    kitab_a_nama, kitab_a_status, kitab_b_nama, kitab_b_status, kitab_c_nama, kitab_c_status,
                    berbakti_orang_tua, akhlaq_pergaulan,
                    syawal_kembali_hari, syawal_kembali_tanggal
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $santriId, $tahunAjaran,
                    $vals['sholat_jamaah_5_waktu'], $vals['sholat_tarawih'], $vals['sholat_witir'], $vals['sholat_tahajjud'], $vals['sholat_dhuha'],
                    $vals['puasa_ramadhan_status'], $vals['puasa_ramadhan_alasan'],
                    $vals['khatam_alquran_status'], $vals['khatam_alquran_jumlah'], $vals['khatam_alquran_tanggal'],
                    $vals['kitab_a_nama'], $vals['kitab_a_status'], $vals['kitab_b_nama'], $vals['kitab_b_status'], $vals['kitab_c_nama'], $vals['kitab_c_status'],
                    $vals['berbakti_orang_tua'], $vals['akhlaq_pergaulan'],
                    $vals['syawal_kembali_hari'], $vals['syawal_kembali_tanggal'],
                ]);
            }

            $get = $this->db->prepare(
                'SELECT sh.*, s.nis, s.nama FROM santri___shohifah sh
                 INNER JOIN santri s ON sh.id_santri = s.id
                 WHERE sh.id_santri = ? AND sh.tahun_ajaran = ? LIMIT 1'
            );
            $get->execute([$santriId, $tahunAjaran]);
            $saved = $get->fetch(\PDO::FETCH_ASSOC);

            return $this->json($response, [
                'success' => true,
                'message' => 'Data shohifah berhasil disimpan',
                'data' => $saved,
                'window' => $window,
            ], 200);
        } catch (\Exception $e) {
            error_log('Mybeddian saveShohifah: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'message' => 'Gagal menyimpan shohifah',
            ], 500);
        }
    }

    private function uploadErrorMessage(int $code): string
    {
        switch ($code) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'File terlalu besar';
            case UPLOAD_ERR_PARTIAL:
                return 'File hanya ter-upload sebagian';
            case UPLOAD_ERR_NO_FILE:
                return 'Tidak ada file';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Folder temporary tidak ditemukan';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Gagal menulis file';
            case UPLOAD_ERR_EXTENSION:
                return 'Upload dihentikan oleh extension';
            default:
                return 'Error upload';
        }
    }
}
