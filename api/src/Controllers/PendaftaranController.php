<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use App\Helpers\SantriKamarHelper;
use App\Helpers\SantriRombelHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Services\WhatsAppService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PendaftaranController
{
    /** Daftar jenis berkas wajib PSB (sama dengan SantriBerkasControllerV2) - semua harus ada (upload atau tandai tidak ada) */
    private const PSB_REQUIRED_BERKAS = [
        'Ijazah SD Sederajat', 'Ijazah SMP Sederajat', 'Ijazah SMA Sederajat', 'SKL',
        'KTP Santri', 'KTP Ayah', 'KTP Ibu', 'KTP Wali',
        'KK Santri', 'KK Ayah', 'KK Ibu', 'KK Wali',
        'Akta Lahir', 'KIP', 'PKH', 'KKS', 'Kartu Bantuan Lain', 'Surat Pindah'
    ];

    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function jsonResponse(Response $response, array $data, int $statusCode): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /**
     * GET /api/pendaftaran/kategori-options - Daftar kategori dari tabel daerah (distinct).
     * Tidak terpengaruh status_santri; dipakai untuk dropdown kategori di form pendaftaran.
     */
    public function getKategoriOptions(Request $request, Response $response): Response
    {
        try {
            $sql = "SELECT DISTINCT kategori FROM daerah WHERE kategori IS NOT NULL AND TRIM(kategori) <> '' ORDER BY kategori";
            $stmt = $this->db->query($sql);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = array_map(function ($r) {
                return $r['kategori'];
            }, $rows);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getKategoriOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kategori',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/daerah-options - Daftar daerah untuk dropdown (filter: kategori = banin/banat).
     * Dipakai di form pendaftaran: pilih daerah sesuai kategori santri.
     */
    public function getDaerahOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $kategori = isset($params['kategori']) ? trim((string) $params['kategori']) : null;
            if ($kategori === '') {
                $kategori = null;
            }

            $sql = "SELECT id, kategori, daerah, keterangan, status FROM daerah WHERE 1=1";
            $bind = [];
            if ($kategori !== null) {
                $sql .= " AND kategori = ?";
                $bind[] = $kategori;
            }
            $sql .= " AND (status IS NULL OR status = 'aktif') ORDER BY kategori, daerah";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getDaerahOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data daerah',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/kamar-options - Daftar kamar untuk dropdown (filter: id_daerah wajib).
     * Dipakai di form pendaftaran: pilih kamar sesuai daerah yang dipilih. Nilai yang disimpan di santri: id_kamar (id dari daerah___kamar).
     */
    public function getKamarOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $idDaerah = isset($params['id_daerah']) ? (int) $params['id_daerah'] : null;

            if ($idDaerah === null || $idDaerah <= 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [],
                    'message' => 'id_daerah wajib diisi'
                ], 200);
            }

            $sql = "SELECT dk.id, dk.id_daerah, dk.kamar, dk.keterangan, dk.status
                    FROM daerah___kamar dk
                    WHERE dk.id_daerah = ? AND (dk.status IS NULL OR dk.status = 'aktif')
                    ORDER BY dk.kamar";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idDaerah]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getKamarOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kamar',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/rombel-options - Daftar rombel untuk dropdown (filter: jenis = diniyah | formal).
     * Mengacu ke lembaga___rombel + lembaga; filter lembaga.kategori = Diniyah atau Formal.
     * Dipakai di form pendaftaran: pilih rombel diniyah/formal, yang tersimpan id_diniyah / id_formal.
     */
    public function getRombelOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $jenis = isset($params['jenis']) ? trim((string) $params['jenis']) : null;
            if ($jenis === '' || !in_array(strtolower($jenis), ['diniyah', 'formal'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter jenis wajib: diniyah atau formal',
                    'data' => []
                ], 400);
            }
            $kategoriLembaga = ucfirst(strtolower($jenis)); // Diniyah | Formal

            $sql = "SELECT r.id, r.lembaga_id, l.nama AS lembaga_nama, r.kelas, r.kel
                    FROM lembaga___rombel r
                    INNER JOIN lembaga l ON l.id = r.lembaga_id
                    WHERE l.kategori = ? AND (r.status IS NULL OR r.status = 'aktif')
                    ORDER BY l.nama, r.kelas, r.kel";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$kategoriLembaga]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getRombelOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data rombel',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/lembaga-options - Daftar lembaga untuk dropdown (filter: jenis = diniyah | formal).
     * Hanya lembaga dengan kategori Diniyah atau Formal.
     */
    public function getLembagaOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $jenis = isset($params['jenis']) ? trim((string) $params['jenis']) : null;
            if ($jenis === '' || !in_array(strtolower($jenis), ['diniyah', 'formal'], true)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter jenis wajib: diniyah atau formal',
                    'data' => []
                ], 400);
            }
            $kategori = ucfirst(strtolower($jenis));

            $sql = "SELECT id, nama FROM lembaga WHERE kategori = ? ORDER BY nama";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$kategori]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getLembagaOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data lembaga',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/kelas-options - Daftar kelas distinct untuk lembaga (dari lembaga___rombel).
     * Parameter: lembaga_id (wajib).
     */
    public function getKelasOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : null;
            if ($lembagaId === null || $lembagaId === '') {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }

            $sql = "SELECT DISTINCT r.kelas FROM lembaga___rombel r
                    WHERE r.lembaga_id = ? AND (r.status IS NULL OR r.status = 'aktif')
                    ORDER BY r.kelas";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$lembagaId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $list = array_map(function ($r) {
                return $r['kelas'] ?? '';
            }, $rows);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $list
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getKelasOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kelas',
                'data' => []
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/kel-options - Daftar kel untuk lembaga+kelas (dari lembaga___rombel).
     * Mengembalikan id (rombel id) dan kel agar saat pilih kel bisa set id_diniyah/id_formal.
     * Parameter: lembaga_id, kelas (wajib).
     */
    public function getKelOptions(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $lembagaId = isset($params['lembaga_id']) ? trim((string) $params['lembaga_id']) : null;
            $kelas = isset($params['kelas']) ? trim((string) $params['kelas']) : null;
            if ($lembagaId === null || $lembagaId === '') {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }

            $sql = "SELECT r.id, r.kel FROM lembaga___rombel r
                    WHERE r.lembaga_id = ? AND (r.status IS NULL OR r.status = 'aktif')";
            $bind = [$lembagaId];
            if ($kelas !== null && $kelas !== '') {
                $sql .= " AND r.kelas = ?";
                $bind[] = $kelas;
            } else {
                $sql .= " AND (r.kelas IS NULL OR r.kelas = '')";
            }
            $sql .= " ORDER BY r.kel";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($bind);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getKelOptions " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data kel',
                'data' => []
            ], 500);
        }
    }

    /**
     * Helper function untuk membersihkan tanggal yang tidak valid (0000-00-00) menjadi null
     */
    private function cleanInvalidDates(array &$data, array $dateFields = ['tanggal_ambil', 'tanggal_dibuat', 'tanggal_update', 'masehi']): void
    {
        foreach ($data as &$row) {
            foreach ($dateFields as $field) {
                if (isset($row[$field]) && (
                    $row[$field] === '0000-00-00 00:00:00' || 
                    $row[$field] === '0000-00-00' || 
                    $row[$field] === '0000-00-00 00:00:00.000000' ||
                    empty($row[$field])
                )) {
                    $row[$field] = null;
                }
            }
        }
        unset($row); // Hapus reference
    }

    /**
     * Helper function untuk insert ke tabel payment (induk)
     * @param string $jenisPembayaran Pendaftaran, Uwaba, Tunggakan, Khusus, Tabungan, Umroh
     * @param int $idReferensi ID dari tabel referensi
     * @param string $tabelReferensi Nama tabel referensi
     * @param array $data Data pembayaran
     * @return int|false ID payment yang baru dibuat atau false jika gagal
     */
    private function insertToPayment(string $jenisPembayaran, int $idReferensi, string $tabelReferensi, array $data): int|false
    {
        try {
            $sql = "INSERT INTO payment (
                jenis_pembayaran, id_referensi, tabel_referensi, id_santri, id_jamaah,
                nominal, metode_pembayaran, via, bank, no_rekening, bukti_pembayaran,
                keterangan, hijriyah, masehi, id_admin, admin, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $jenisPembayaran,
                $idReferensi,
                $tabelReferensi,
                $data['id_santri'] ?? null,
                $data['id_jamaah'] ?? null,
                $data['nominal'] ?? 0,
                $data['metode_pembayaran'] ?? ($data['via'] ?? 'Cash'),
                $data['via'] ?? null,
                $data['bank'] ?? null,
                $data['no_rekening'] ?? null,
                $data['bukti_pembayaran'] ?? null,
                $data['keterangan'] ?? null,
                $data['hijriyah'] ?? null,
                $data['masehi'] ?? null,
                $data['id_admin'] ?? null,
                $data['admin'] ?? null,
                $data['status'] ?? 'Success'
            ]);
            
            $idPayment = $this->db->lastInsertId();
            
            // Update id_payment di tabel referensi
            $sqlUpdate = "UPDATE {$tabelReferensi} SET id_payment = ? WHERE id = ?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$idPayment, $idReferensi]);
            
            return $idPayment;
        } catch (\Exception $e) {
            error_log("Insert to payment error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * GET /api/pendaftaran/rincian - Ambil rincian pendaftaran berdasarkan id_santri
     * Menggunakan tabel psb___registrasi (wajib, bayar, kurang).
     */
    public function getRincian(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantriParam = $queryParams['id_santri'] ?? null;

            if (!$idSantriParam) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'
                ], 400);
            }

            $sql = "SELECT id, tahun_hijriyah, tahun_masehi, wajib, bayar, kurang
                    FROM psb___registrasi
                    WHERE id_santri = ?
                    ORDER BY tahun_hijriyah DESC, tahun_masehi DESC, tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idSantri]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $rincian = [];
            $totalNominal = 0;
            $totalBayar = 0;

            foreach ($rows as $row) {
                $wajib = (int)($row['wajib'] ?? 0);
                $bayar = (int)($row['bayar'] ?? 0);
                $kurang = isset($row['kurang']) ? (int)$row['kurang'] : ($wajib - $bayar);
                $tahun = trim($row['tahun_hijriyah'] ?? '') ?: trim($row['tahun_masehi'] ?? '');
                $rincian[] = [
                    'id' => (int)$row['id'],
                    'keterangan_1' => $tahun ?: null,
                    'keterangan_2' => null,
                    'total' => $wajib,
                    'bayar' => $bayar,
                    'kurang' => $kurang,
                    'tahun_ajaran' => $tahun ?: null,
                    'lembaga' => null
                ];
                $totalNominal += $wajib;
                $totalBayar += $bayar;
            }

            $total = [
                'total' => $totalNominal,
                'bayar' => $totalBayar,
                'kurang' => $totalNominal - $totalBayar
            ];

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'rincian' => $rincian,
                    'total' => $total
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get rincian pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil rincian: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/history - Ambil history pembayaran untuk id_pendaftaran
     */
    public function getPaymentHistory(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idPendaftaran = $queryParams['id_pendaftaran'] ?? null;

            if (!$idPendaftaran) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID pendaftaran tidak valid'
                ], 400);
            }

            $sqlHistory = "SELECT id, id_pendaftaran, nominal, via, admin, hijriyah, tanggal_dibuat FROM pendaftaran___bayar WHERE id_pendaftaran=? ORDER BY tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sqlHistory);
            $stmt->execute([$idPendaftaran]);
            $history = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $history
            ], 200);

        } catch (\Exception $e) {
            error_log("Get payment history pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil riwayat pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/create-payment - Buat pembayaran baru untuk pendaftaran
     */
    public function createPayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();

            // Validasi parameter
            $requiredFields = ['amount', 'admin', 'id_admin', 'id_santri', 'hijriyah', 'via', 'id_pendaftaran'];
            $missingFields = [];

            foreach ($requiredFields as $field) {
                if (!isset($input[$field]) || $input[$field] === "") {
                    $missingFields[] = $field;
                }
            }

            if (!empty($missingFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid. Field yang hilang: ' . implode(', ', $missingFields)
                ], 400);
            }

            $idSantri = $input['id_santri'];
            $idPendaftaran = $input['id_pendaftaran'];
            $amount = (float)$input['amount'];
            $admin = $input['admin'];
            $idAdmin = $input['id_admin'];
            $hijriyah = $input['hijriyah'];
            $via = $input['via'];

            $this->db->beginTransaction();

            try {
                // Pastikan pendaftaran ada
                $sqlSelect = "SELECT total FROM pendaftaran WHERE id=? FOR UPDATE";
                $stmtSelect = $this->db->prepare($sqlSelect);
                $stmtSelect->execute([$idPendaftaran]);
                $pendaftaran = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$pendaftaran) {
                    throw new \Exception("Data pendaftaran dengan ID {$idPendaftaran} tidak ditemukan.");
                }
                $total = (float)$pendaftaran['total'];

                // Hitung total bayar saat ini
                $sqlSum = "SELECT COALESCE(SUM(nominal),0) as total_bayar FROM pendaftaran___bayar WHERE id_pendaftaran=?";
                $stmtSum = $this->db->prepare($sqlSum);
                $stmtSum->execute([$idPendaftaran]);
                $rowSum = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                $currentBayar = (float)$rowSum['total_bayar'];

                $newBayar = $currentBayar + $amount;
                if ($newBayar > $total) {
                    throw new \Exception("Pembayaran melebihi total pendaftaran.");
                }

                // Insert pembayaran ke tabel pembayaran
                $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $sqlInsert = "INSERT INTO pendaftaran___bayar (id_santri, id_pendaftaran, nominal, via, admin, id_admin, hijriyah, tanggal_dibuat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmtInsert = $this->db->prepare($sqlInsert);
                $stmtInsert->execute([$idSantri, $idPendaftaran, $amount, $via, $admin, $idAdmin, $hijriyah, $waktuIndonesia]);

                $this->db->commit();
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil disimpan.'
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Create payment pendaftaran error: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal memproses pembayaran: ' . $e->getMessage()
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Create payment pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memproses pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/delete-payment - Hapus pembayaran
     */
    public function deletePayment(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();

            if (!isset($input['id_bayar'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Pembayaran diperlukan.'
                ], 400);
            }

            $idBayar = $input['id_bayar'];

            $this->db->beginTransaction();

            try {
                // Cek apakah data pembayaran ada
                $sqlSelectBayar = "SELECT id, nominal, id_pendaftaran FROM pendaftaran___bayar WHERE id = ?";
                $stmtSelect = $this->db->prepare($sqlSelectBayar);
                $stmtSelect->execute([$idBayar]);
                $payment = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$payment) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Data pembayaran dengan ID {$idBayar} tidak ditemukan."
                    ], 404);
                }

                // Hapus pembayaran dari tabel riwayat
                $sqlDelete = "DELETE FROM pendaftaran___bayar WHERE id = ?";
                $stmtDelete = $this->db->prepare($sqlDelete);
                $stmtDelete->execute([$idBayar]);
                $deleted = $stmtDelete->rowCount();

                if ($deleted > 0) {
                    $this->db->commit();
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Pembayaran berhasil dihapus.'
                    ], 200);
                } else {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tidak ada data yang dihapus. Data mungkin sudah tidak ada.'
                    ], 404);
                }

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Delete payment pendaftaran error: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gagal menghapus pembayaran: ' . $e->getMessage()
                ], 500);
            }

        } catch (\Exception $e) {
            error_log("Delete payment pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/insert - Tambah data pendaftaran
     */
    public function insertPendaftaran(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id_santri'], $input['keterangan_1'], $input['total'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid.'
                ], 400);
            }
            
            $idSantri = $input['id_santri'];
            $keterangan1 = TextSanitizer::cleanText($input['keterangan_1'] ?? '');
            $keterangan2 = TextSanitizer::cleanTextOrNull($input['keterangan_2'] ?? null);
            $total = (float)$input['total'];
            $tahunAjaran = $input['tahun_ajaran'] ?? null;
            $lembaga = TextSanitizer::cleanTextOrNull($input['lembaga'] ?? null);
            $admin = TextSanitizer::cleanTextOrNull($input['admin'] ?? null);
            $idAdmin = $input['id_admin'] ?? null;
            $hijriyah = $input['hijriyah'] ?? null;
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            
            $sqlInsert = "INSERT INTO pendaftaran (id_santri, keterangan_1, keterangan_2, total, tahun_ajaran, lembaga, tanggal_dibuat, admin, id_admin, hijriyah) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            $stmtInsert = $this->db->prepare($sqlInsert);
            $stmtInsert->execute([$idSantri, $keterangan1, $keterangan2, $total, $tahunAjaran, $lembaga, $waktuIndonesia, $admin, $idAdmin, $hijriyah]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data pendaftaran berhasil ditambahkan.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Insert pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/update - Update data pendaftaran
     */
    public function updatePendaftaran(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id'], $input['keterangan_1'], $input['total'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data input tidak valid.'
                ], 400);
            }
            
            $id = $input['id'];
            $keterangan1 = TextSanitizer::cleanText($input['keterangan_1'] ?? '');
            $keterangan2 = TextSanitizer::cleanTextOrNull($input['keterangan_2'] ?? null);
            $total = (float)$input['total'];
            $tahunAjaran = $input['tahun_ajaran'] ?? null;
            $lembaga = TextSanitizer::cleanTextOrNull($input['lembaga'] ?? null);
            $admin = TextSanitizer::cleanTextOrNull($input['admin'] ?? null);
            $idAdmin = $input['id_admin'] ?? null;
            $hijriyah = TextSanitizer::cleanTextOrNull($input['hijriyah'] ?? null);
            
            $sqlUpdate = "UPDATE pendaftaran SET keterangan_1=?, keterangan_2=?, total=?, tahun_ajaran=?, lembaga=?, admin=?, id_admin=?, hijriyah=? WHERE id=?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$keterangan1, $keterangan2, $total, $tahunAjaran, $lembaga, $admin, $idAdmin, $hijriyah, $id]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data pendaftaran berhasil diupdate.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Update pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/delete-item - Hapus data pendaftaran
     */
    public function deletePendaftaran(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID wajib diisi.'
                ], 400);
            }
            
            $id = $input['id'];
            
            $sqlDelete = "DELETE FROM pendaftaran WHERE id=?";
            $stmtDelete = $this->db->prepare($sqlDelete);
            $stmtDelete->execute([$id]);
            
            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Data pendaftaran berhasil dihapus.'
            ], 200);
            
        } catch (\Exception $e) {
            error_log("Delete pendaftaran error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/create-santri - Buat santri baru dengan grup (ID auto-generate)
     */
    public function createSantri(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['nama']) || empty($input['nama'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama wajib diisi'
                ], 400);
            }

            if (!isset($input['gender']) || trim((string)$input['gender']) === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gender wajib diisi (Laki-laki atau Perempuan / L atau P)'
                ], 400);
            }

            $genderNormalized = SantriHelper::normalizeGender((string)$input['gender']);
            if ($genderNormalized === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Gender tidak valid. Gunakan Laki-laki (L) atau Perempuan (P).'
                ], 400);
            }

            if (!isset($input['tahun_hijriyah']) || trim((string)$input['tahun_hijriyah']) === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran hijriyah wajib diisi (contoh: 1447-1448)'
                ], 400);
            }

            $tahunHijriyah = trim((string)$input['tahun_hijriyah']);
            $grup = SantriHelper::parsePrefixFromGenderAndTahun($genderNormalized, $tahunHijriyah);
            if ($grup < 100 || $grup > 299) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tahun ajaran hijriyah tidak valid (format: 1447-1448 atau 1447)'
                ], 400);
            }

            $nama = TextSanitizer::cleanText($input['nama'] ?? '');
            $nik = $input['nik'] ?? null;
            $admin = TextSanitizer::cleanTextOrNull($input['admin'] ?? null);
            $idAdmin = isset($input['id_admin']) && $input['id_admin'] !== null && $input['id_admin'] !== '' ? (int)$input['id_admin'] : null;

            // Cek apakah NIK sudah terdaftar
            if ($nik) {
                $stmtCheckNik = $this->db->prepare("SELECT id, nama FROM santri WHERE nik = ?");
                $stmtCheckNik->execute([$nik]);
                $existingSantri = $stmtCheckNik->fetch(\PDO::FETCH_ASSOC);
                
                if ($existingSantri) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'NIK sudah terdaftar',
                        'data' => [
                            'id' => $existingSantri['id'],
                            'nama' => $existingSantri['nama']
                        ]
                    ], 400);
                }
            }

            $this->db->beginTransaction();

            try {
                // NIS 7 digit: prefix = grup (gender + tahun), urutan unik via helper (transaksi + FOR UPDATE)
                $nis = SantriHelper::generateNextNis($this->db, $grup);

                $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $sql = "INSERT INTO santri (grup, nis, nama, nik, gender, admin, tanggal_dibuat) VALUES (?, ?, ?, ?, ?, ?, ?)";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$grup, $nis, $nama, $nik, $genderNormalized, $admin, $waktuIndonesia]);
                $newId = (int) $this->db->lastInsertId();
                if ($newId <= 0) {
                    throw new \Exception('Gagal mendapatkan ID santri dari database.');
                }

                $this->db->commit();

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Santri baru berhasil dibuat',
                    'data' => [
                        'id' => $newId,
                        'nis' => $nis,
                        'grup' => $grup,
                        'nama' => $nama,
                        'nik' => $nik,
                        'gender' => $genderNormalized
                    ]
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Create santri error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat santri baru: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/search-by-nik - Cari santri berdasarkan NIK
     * Role santri: hanya boleh mencari NIK sendiri (dari token). Admin/psb: boleh cari NIK siapa saja.
     */
    public function searchByNik(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $roleKey = is_array($user) ? strtolower(trim($user['role_key'] ?? $user['user_role'] ?? '')) : '';
            $queryParams = $request->getQueryParams();
            $nik = $queryParams['nik'] ?? null;

            if (!$nik || empty($nik)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIK wajib diisi'
                ], 400);
            }

            if ($roleKey === 'santri') {
                $tokenNik = $user['nik'] ?? null;
                if ($tokenNik === null || trim((string) $nik) !== trim((string) $tokenNik)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Anda hanya dapat mencari data NIK sendiri'
                    ], 403);
                }
            }

            $sql = "SELECT id, nis, nama, nik, gender, tempat_lahir, tanggal_lahir FROM santri WHERE nik = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$nik]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($santri) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => $santri
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri dengan NIK tersebut tidak ditemukan'
                ], 404);
            }

        } catch (\Exception $e) {
            error_log("Search by NIK error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mencari santri: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/check-nik - Cek NIK (endpoint publik, tanpa auth)
     * Digunakan untuk halaman login aplikasi pendaftaran
     */
    public function checkNik(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $nik = $queryParams['nik'] ?? null;

            if (!$nik || empty($nik)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIK wajib diisi'
                ], 400);
            }

            // Validasi NIK harus 16 karakter
            if (strlen($nik) !== 16 || !ctype_digit($nik)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'NIK harus terdiri dari 16 angka'
                ], 400);
            }

            $sql = "SELECT id, nis, nama, nik FROM santri WHERE nik = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$nik]);
            $santri = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($santri) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'id' => $santri['id'],
                        'nis' => $santri['nis'] ?? null,
                        'nama' => $santri['nama'],
                        'nik' => $santri['nik'],
                        'exists' => true
                    ]
                ], 200);
            } else {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'exists' => false
                    ]
                ], 200);
            }

        } catch (\Exception $e) {
            error_log("Check NIK error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengecek NIK: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/save-biodata - Simpan biodata pendaftaran ke tabel santri
     * Role santri: hanya boleh menyimpan biodata sendiri (id dari token untuk UPDATE; untuk INSERT santri baru tidak ada id).
     */
    public function saveBiodata(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            // Log WA satu backend dengan daftar; bedakan sumber (uwaba/daftar) dan cegah ganda (throttle di WhatsAppService)
            $appSource = $request->getHeaderLine('X-App-Source') ?: ($input['app_source'] ?? 'daftar');
            $appSource = strtolower(trim($appSource)) === 'uwaba' ? 'uwaba' : 'daftar';
            $user = $request->getAttribute('user');
            $roleKey = is_array($user) ? strtolower(trim($user['role_key'] ?? $user['user_role'] ?? '')) : '';
            $idPengurusPengirim = null;
            if ($user !== null && $appSource === 'uwaba') {
                $idPengurusPengirim = (int) ($user['id_pengurus'] ?? $user['pengurus_id'] ?? $user['id'] ?? 0) ?: null;
            }
            $waLogOptions = ['sumber' => $appSource, 'id_pengurus_pengirim' => $idPengurusPengirim];

            // Pastikan semua teks dari pendaftar bersih (UTF-8 valid, tanpa karakter font/encoding aneh)
            $input = TextSanitizer::sanitizeStringValues($input, []);

            $id = null;
            $isNewSantri = false;

            $idFromInputRaw = $input['id'] ?? null;
            $allowedIdForSantri = null;
            if ($roleKey === 'santri') {
                $allowedIdForSantri = $user['user_id'] ?? $user['id'] ?? $user['santri_id'] ?? null;
            }

            // Cek dulu: jika client mengirim id (termasuk NIS 7 digit), resolve ke PK. Kalau ketemu = update.
            $resolvedId = null;
            if (isset($input['id']) && $input['id'] !== null && trim((string) $input['id']) !== '') {
                $resolvedId = SantriHelper::resolveId($this->db, $idFromInputRaw);
            }

            if ($resolvedId !== null) {
                // ID/NIS sudah ada di DB → update biodata (bukan santri baru)
                $id = $resolvedId;
                $isNewSantri = false;

                // Keamanan: role santri hanya boleh mengubah biodata sendiri
                if ($roleKey === 'santri' && $allowedIdForSantri !== null) {
                    $allowedResolved = SantriHelper::resolveId($this->db, $allowedIdForSantri);
                    if ($allowedResolved === null || (int) $id !== (int) $allowedResolved) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Anda hanya dapat menyimpan biodata sendiri'
                        ], 403);
                    }
                }

                // Validasi: NIK tidak boleh dipakai santri lain (boleh sama dengan milik diri sendiri)
                if (isset($input['nik']) && trim((string) $input['nik']) !== '') {
                    $stmtCheckNik = $this->db->prepare("SELECT id, nis, nama, nik FROM santri WHERE nik = ? AND id != ?");
                    $stmtCheckNik->execute([trim($input['nik']), $id]);
                    $existingNik = $stmtCheckNik->fetch(\PDO::FETCH_ASSOC);
                    if ($existingNik) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'NIK sudah terdaftar untuk santri lain',
                            'error_type' => 'duplicate_nik',
                            'data' => [
                                'nik' => $existingNik['nik'],
                                'nama' => $existingNik['nama'],
                                'id' => $existingNik['id'],
                                'nis' => $existingNik['nis'] ?? null
                            ]
                        ], 409);
                    }
                }
            } else {
                // Tidak ada id atau id tidak resolve ke santri mana pun → santri baru
                $isNewSantri = true;

                if (!isset($input['nik']) || empty(trim((string) ($input['nik'] ?? ''))) || strlen(trim($input['nik'])) !== 16) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'NIK wajib diisi 16 digit untuk santri baru'
                    ], 400);
                }

                $stmtCheckNik = $this->db->prepare("SELECT id, nis, nama, nik FROM santri WHERE nik = ?");
                $stmtCheckNik->execute([trim($input['nik'])]);
                $existingNik = $stmtCheckNik->fetch(\PDO::FETCH_ASSOC);
                if ($existingNik) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'NIK sudah terdaftar',
                        'error_type' => 'duplicate_nik',
                        'data' => [
                            'nik' => $existingNik['nik'],
                            'nama' => $existingNik['nama'],
                            'id' => $existingNik['id'],
                            'nis' => $existingNik['nis'] ?? null
                        ]
                    ], 409);
                }

                if (!isset($input['tahun_hijriyah']) || trim((string) ($input['tahun_hijriyah'] ?? '')) === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tahun ajaran hijriyah wajib diisi untuk generate ID santri baru (contoh: 1447-1448)'
                    ], 400);
                }

                if (!isset($input['gender']) || trim((string) ($input['gender'] ?? '')) === '') {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Gender wajib diisi untuk santri baru (Laki-laki atau Perempuan / L atau P)'
                    ], 400);
                }
                $genderNormalized = SantriHelper::normalizeGender((string) $input['gender']);
                if ($genderNormalized === null) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Gender tidak valid. Gunakan Laki-laki (L) atau Perempuan (P).'
                    ], 400);
                }
                $tahunHijriyah = trim((string) $input['tahun_hijriyah']);
                // Hitung prefix grup untuk santri baru (dipakai saat INSERT di bawah)
                // Sekaligus validasi format tahun_hijriyah & gender melalui helper.
                $grup = SantriHelper::parsePrefixFromGenderAndTahun($genderNormalized, $tahunHijriyah);
                $id = 0;
            }

            // Daftar semua field yang bisa diupdate (sesuai kolom di tabel santri)
            $allowedFields = [
                // Data Diri
                'nama', 'nik', 'gender', 'tempat_lahir', 'tanggal_lahir', 'nisn', 'no_kk', 'kepala_keluarga',
                'anak_ke', 'jumlah_saudara', 'saudara_di_pesantren', 'hobi', 'cita_cita', 'kebutuhan_khusus',
                
                // Biodata Ayah
                'ayah', 'status_ayah', 'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah',
                'pekerjaan_ayah', 'pendidikan_ayah', 'penghasilan_ayah',
                
                // Biodata Ibu
                'ibu', 'status_ibu', 'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu',
                'pekerjaan_ibu', 'pendidikan_ibu', 'penghasilan_ibu',
                
                // Biodata Wali
                'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali',
                'pekerjaan_wali', 'pendidikan_wali', 'penghasilan_wali',
                
                // Alamat
                'dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi', 'kode_pos',
                
                // Riwayat Madrasah
                'madrasah', 'nama_madrasah', 'alamat_madrasah', 'lulus_madrasah',
                
                // Riwayat Sekolah
                'sekolah', 'nama_sekolah', 'alamat_sekolah', 'lulus_sekolah', 'npsn', 'nsm',
                
                // Informasi Tambahan
                'no_telpon', 'email', 'riwayat_sakit', 'ukuran_baju', 'kip', 'pkh', 'kks',
                'status_nikah', 'pekerjaan', 'no_wa_santri',
                
                // Status Pendaftaran
                'status_pendaftar', 'status_murid', 'status_santri',
                
                // Kategori & Pendidikan
                'kategori', 'id_kamar', 'id_diniyah', 'nim_diniyah', 'id_formal', 'nim_formal',
                'lttq', 'kelas_lttq', 'kel_lttq'
            ];

            $stmtCheck = $this->db->prepare("SELECT id FROM santri WHERE id = ?");
            $stmtCheck->execute([$id]);
            $exists = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            $this->db->beginTransaction();

            try {
                // Email wajib diisi - validasi di sini
                if (!isset($input['email']) || $input['email'] === '' || $input['email'] === null) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Email wajib diisi'
                    ], 400);
                }
                
                // Trim email
                $input['email'] = trim($input['email']);
                
                // Validasi format email
                if ($input['email'] === '' || !filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Format email tidak valid'
                    ], 400);
                }
                
                if ($exists) {
                    $stmtOld = $this->db->prepare("SELECT * FROM santri WHERE id = ?");
                    $stmtOld->execute([$id]);
                    $oldSantri = $stmtOld->fetch(\PDO::FETCH_ASSOC);

                    $set = [];
                    $params = [];
                    
                    foreach ($allowedFields as $field) {
                        if ($field === 'id') {
                            continue; // Kolom id tidak boleh di-update
                        }
                        if (isset($input[$field])) {
                            $set[] = "$field = ?";
                            if ($field === 'email') {
                                $params[] = $input['email'];
                            } else {
                                $params[] = $input[$field] === '' ? null : $input[$field];
                            }
                        }
                    }
                    
                    // Email wajib diisi, pastikan email selalu di-update
                    // Cek apakah email sudah ada di $set
                    $emailInSet = false;
                    foreach ($set as $setItem) {
                        if (strpos($setItem, 'email =') === 0 || strpos($setItem, 'email=') === 0) {
                            $emailInSet = true;
                            break;
                        }
                    }
                    // Jika email tidak ada di $set, tambahkan (email wajib diisi, sudah divalidasi di atas)
                    if (!$emailInSet) {
                        $set[] = "email = ?";
                        $params[] = $input['email']; // Email sudah divalidasi di atas
                    }
                    
                    if (empty($set)) {
                        $this->db->rollBack();
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Tidak ada data yang diupdate'
                        ], 400);
                    }
                    
                    $params[] = $id;
                    $sql = "UPDATE santri SET " . implode(', ', $set) . " WHERE id = ?";
                    
                    // Log untuk debugging email
                    error_log("PendaftaranController::saveBiodata - UPDATE SQL: " . $sql);
                    error_log("PendaftaranController::saveBiodata - Email in params: " . ($input['email'] ?? 'NOT SET'));
                    error_log("PendaftaranController::saveBiodata - Email in set: " . (in_array('email = ?', $set) ? 'YES' : 'NO'));
                    
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($params);
                    
                    $this->saveOrUpdateRegistrasi($id, $input, $input['id_admin'] ?? null);
                    
                    $this->appendSantriRombelRiwayatIfNeeded($id, $input, $request);
                    $this->appendSantriKamarRiwayatIfNeeded($id, $input, $request, $oldSantri);
                    
                    $this->db->commit();

                    $stmtNew = $this->db->prepare("SELECT * FROM santri WHERE id = ?");
                    $stmtNew->execute([$id]);
                    $newSantri = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                    $pengurusId = null;
                    $santriIdActor = null;
                    $actorEntityType = null;
                    $actorEntityId = null;
                    if ($user !== null) {
                        if (isset($user['role_key']) && strtolower((string) $user['role_key']) === 'santri') {
                            $santriIdActor = (int) $id;
                            $actorEntityType = UserAktivitasLogger::ACTOR_SANTRI;
                            $actorEntityId = (int) $id;
                        } else {
                            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                            if ($pengurusId !== null) {
                                $actorEntityType = UserAktivitasLogger::ACTOR_PENGURUS;
                                $actorEntityId = $pengurusId;
                            }
                        }
                    } else {
                        // Pendaftaran tanpa user_id (santri belum punya akun): tetap catat aktor = santri yang diubah
                        $actorEntityType = UserAktivitasLogger::ACTOR_SANTRI;
                        $actorEntityId = (int) $id;
                        $santriIdActor = (int) $id;
                    }
                    if ($oldSantri && $newSantri) {
                        UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'santri', $id, $oldSantri, $newSantri, $request, null, $santriIdActor, $actorEntityType, $actorEntityId);
                    }

                    // Kirim WA ke nomor terdaftar (opsional: send_wa_santri / send_wa_wali dari UWABA)
                    $sendWaSantri = isset($input['send_wa_santri']) ? (bool) $input['send_wa_santri'] : null;
                    $sendWaWali = isset($input['send_wa_wali']) ? (bool) $input['send_wa_wali'] : null;
                    if ($sendWaSantri !== null || $sendWaWali !== null) {
                        $phones = [];
                        if ($sendWaWali) {
                            $t = trim($input['no_telpon'] ?? '');
                            if ($t !== '') $phones[] = $t;
                        }
                        if ($sendWaSantri) {
                            $t = trim($input['no_wa_santri'] ?? '');
                            if ($t !== '') $phones[] = $t;
                        }
                    } else {
                        $phones = array_filter([
                            trim($input['no_telpon'] ?? ''),
                            trim($input['no_wa_santri'] ?? '')
                        ]);
                    }
                    if (!empty($phones)) {
                        try {
                            $nisForWa = SantriHelper::getNisById($this->db, (int) $id);
                            if ($nisForWa === null || trim($nisForWa) === '') {
                                $nisForWa = (string) $id;
                            }
                            $waContext = $this->getRegistrasiContextForWa($id, $input);
                            WhatsAppService::sendPsbBiodataTerdaftar([
                                'id' => $id,
                                'nis' => $nisForWa,
                                'nama' => $input['nama'] ?? '',
                                'nik' => $input['nik'] ?? '',
                                'email' => $input['email'] ?? '',
                                'status_pendaftar' => $waContext['status_pendaftar'],
                                'daftar_formal' => $waContext['daftar_formal'],
                                'daftar_diniyah' => $waContext['daftar_diniyah'],
                                'status_murid' => $waContext['status_murid'],
                            ], $phones, $waLogOptions);
                        } catch (\Throwable $e) {
                            error_log('WA biodata terdaftar (update): ' . $e->getMessage());
                        }
                    }
                    $nisDisplay = SantriHelper::getNisById($this->db, (int) $id);
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Biodata pendaftaran berhasil diupdate',
                        'data' => [
                            'id' => $id,
                            'nis' => $nisDisplay !== null ? $nisDisplay : (string) $id
                        ]
                    ], 200);
                } else {
                    // Insert new santri — id dari AUTO_INCREMENT, NIS dari SantriHelper::generateNextNis (transaksi + unik)
                    if (!isset($grup) || ($grup < 100 || $grup > 999)) {
                        throw new \Exception('Grup tidak valid untuk santri baru');
                    }

                    $nis = SantriHelper::generateNextNis($this->db, $grup);
                    
                    // Santri baru: id HANYA dari AUTO_INCREMENT, nis dari helper
                    $fields = ['grup', 'nis'];
                    $values = ['?', '?'];
                    $params = [$grup, $nis];
                    
                    foreach ($allowedFields as $field) {
                        if ($field === 'id') {
                            continue; // Jangan pernah sertakan id di INSERT
                        }
                        if (isset($input[$field])) {
                            $fields[] = $field;
                            $values[] = '?';
                            if ($field === 'email') {
                                $params[] = $input['email'];
                            } elseif ($field === 'gender') {
                                $params[] = $genderNormalized;
                            } else {
                                $params[] = $input[$field] === '' ? null : $input[$field];
                            }
                        }
                    }
                    
                    if (!in_array('email', $fields)) {
                        $fields[] = 'email';
                        $values[] = '?';
                        $params[] = $input['email'];
                    }
                    if (!in_array('gender', $fields)) {
                        $fields[] = 'gender';
                        $values[] = '?';
                        $params[] = $genderNormalized;
                    }
                    
                    $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                    $fields[] = 'tanggal_dibuat';
                    $values[] = '?';
                    $params[] = $waktuIndonesia;
                    
                    // Pastikan kolom id tidak ikut (hanya AUTO_INCREMENT yang mengisi)
                    $idx = array_search('id', $fields, true);
                    if ($idx !== false) {
                        array_splice($fields, $idx, 1);
                        array_splice($values, $idx, 1);
                        array_splice($params, $idx, 1);
                    }
                    
                    $sql = "INSERT INTO santri (" . implode(', ', $fields) . ") VALUES (" . implode(', ', $values) . ")";
                    error_log("Save biodata - SQL: " . $sql);
                    error_log("Save biodata - Params: " . json_encode($params));
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($params);
                    $id = (int) $this->db->lastInsertId();
                    if ($id <= 0) {
                        throw new \Exception('Gagal mendapatkan ID santri dari database.');
                    }
                    
                    $this->saveOrUpdateRegistrasi($id, $input, $input['id_admin'] ?? null);
                    
                    $this->appendSantriRombelRiwayatIfNeeded($id, $input, $request);
                    $this->appendSantriKamarRiwayatIfNeeded($id, $input, $request, null);
                    
                    $this->db->commit();

                    $stmtNew = $this->db->prepare("SELECT * FROM santri WHERE id = ?");
                    $stmtNew->execute([$id]);
                    $newSantri = $stmtNew->fetch(\PDO::FETCH_ASSOC);
                    $pengurusId = null;
                    $santriIdActor = null;
                    $actorEntityType = null;
                    $actorEntityId = null;
                    if ($user !== null) {
                        if (isset($user['role_key']) && strtolower((string) $user['role_key']) === 'santri') {
                            $santriIdActor = $id;
                            $actorEntityType = UserAktivitasLogger::ACTOR_SANTRI;
                            $actorEntityId = (int) $id;
                        } else {
                            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                            if ($pengurusId !== null) {
                                $actorEntityType = UserAktivitasLogger::ACTOR_PENGURUS;
                                $actorEntityId = $pengurusId;
                            }
                        }
                    } else {
                        // Pendaftaran tanpa user_id (santri belum punya akun): catat aktor = santri yang baru dibuat
                        $actorEntityType = UserAktivitasLogger::ACTOR_SANTRI;
                        $actorEntityId = (int) $id;
                        $santriIdActor = (int) $id;
                    }
                    if ($newSantri) {
                        UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'santri', $id, null, $newSantri, $request, null, $santriIdActor, $actorEntityType, $actorEntityId);
                    }

                    // Kirim WA ke nomor terdaftar (opsional: send_wa_santri / send_wa_wali dari UWABA)
                    $sendWaSantri = isset($input['send_wa_santri']) ? (bool) $input['send_wa_santri'] : null;
                    $sendWaWali = isset($input['send_wa_wali']) ? (bool) $input['send_wa_wali'] : null;
                    if ($sendWaSantri !== null || $sendWaWali !== null) {
                        $phones = [];
                        if ($sendWaWali) {
                            $t = trim($input['no_telpon'] ?? '');
                            if ($t !== '') $phones[] = $t;
                        }
                        if ($sendWaSantri) {
                            $t = trim($input['no_wa_santri'] ?? '');
                            if ($t !== '') $phones[] = $t;
                        }
                    } else {
                        $phones = array_filter([
                            trim($input['no_telpon'] ?? ''),
                            trim($input['no_wa_santri'] ?? '')
                        ]);
                    }
                    if (!empty($phones)) {
                        try {
                            $nisForWa = SantriHelper::getNisById($this->db, (int) $id);
                            if ($nisForWa !== null && trim($nisForWa) !== '') {
                                $waContext = $this->getRegistrasiContextForWa($id, $input);
                                WhatsAppService::sendPsbBiodataTerdaftar([
                                    'id' => $id,
                                    'nis' => $nisForWa,
                                    'nama' => $input['nama'] ?? '',
                                    'nik' => $input['nik'] ?? '',
                                    'email' => $input['email'] ?? '',
                                    'status_pendaftar' => $waContext['status_pendaftar'],
                                    'daftar_formal' => $waContext['daftar_formal'],
                                    'daftar_diniyah' => $waContext['daftar_diniyah'],
                                    'status_murid' => $waContext['status_murid'],
                                ], $phones, $waLogOptions);
                            } else {
                                $waContext = $this->getRegistrasiContextForWa($id, $input);
                                WhatsAppService::addPendingBiodataTerdaftar(
                                    (int) $id,
                                    $phones,
                                    [
                                        'id' => $id,
                                        'nama' => $input['nama'] ?? '',
                                        'nik' => $input['nik'] ?? '',
                                        'email' => $input['email'] ?? '',
                                        'status_pendaftar' => $waContext['status_pendaftar'],
                                        'daftar_formal' => $waContext['daftar_formal'],
                                        'daftar_diniyah' => $waContext['daftar_diniyah'],
                                        'status_murid' => $waContext['status_murid'],
                                    ],
                                    $waLogOptions
                                );
                            }
                        } catch (\Throwable $e) {
                            error_log('WA biodata terdaftar (insert): ' . $e->getMessage());
                        }
                    }
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Biodata pendaftaran berhasil disimpan',
                        'data' => [
                            'id' => $id,
                            'nis' => $nis,
                            'is_new' => $isNewSantri
                        ]
                    ], 200);
                }

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\InvalidArgumentException $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => $e->getMessage()
            ], 400);
        } catch (\Exception $e) {
            error_log("Save biodata pendaftaran error: " . $e->getMessage());
            error_log("Save biodata pendaftaran error trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan biodata: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Jika input berisi id_diniyah atau id_formal, sisipkan riwayat ke santri___rombel.
     * id_pengurus diambil dari input, atau user (id_pengurus / user_id -> pengurus.id), default 1 (super admin).
     */
    private function appendSantriRombelRiwayatIfNeeded(int $idSantri, array $input, Request $request): void
    {
        $idDiniyah = isset($input['id_diniyah']) && $input['id_diniyah'] !== '' && $input['id_diniyah'] !== null ? (int) $input['id_diniyah'] : null;
        $idFormal = isset($input['id_formal']) && $input['id_formal'] !== '' && $input['id_formal'] !== null ? (int) $input['id_formal'] : null;
        if (($idDiniyah === null || $idDiniyah <= 0) && ($idFormal === null || $idFormal <= 0)) {
            return;
        }
        $idPengurus = isset($input['id_pengurus']) && $input['id_pengurus'] !== '' && $input['id_pengurus'] !== null ? (int) $input['id_pengurus'] : null;
        if (!$idPengurus) {
            $user = $request->getAttribute('user');
            $idPengurus = isset($user['id_pengurus']) ? (int) $user['id_pengurus'] : null;
            $uid = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if (!$idPengurus && $uid) {
                // Token pengurus bisa kirim user_id = pengurus.id; cek dulu sebagai pengurus.id, lalu id_user
                $st = $this->db->prepare("SELECT id FROM pengurus WHERE id = ? LIMIT 1");
                $st->execute([$uid]);
                $row = $st->fetch(\PDO::FETCH_ASSOC);
                $idPengurus = $row ? (int) $row['id'] : null;
                if (!$idPengurus) {
                    $st = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ? LIMIT 1");
                    $st->execute([$uid]);
                    $row = $st->fetch(\PDO::FETCH_ASSOC);
                    $idPengurus = $row ? (int) $row['id'] : null;
                }
            }
        }
        // id_pengurus wajib saat menulis riwayat rombel (tolak jika tidak disertakan / tidak bisa di-resolve)
        if (!$idPengurus || $idPengurus <= 0) {
            throw new \InvalidArgumentException('id_pengurus wajib diisi saat mengisi rombel diniyah/formal (siapa yang melakukan perubahan). Sertakan di body atau login sebagai pengurus.');
        }
        $tahunDiniyah = isset($input['tahun_ajaran_diniyah']) && trim((string) $input['tahun_ajaran_diniyah']) !== '' ? trim((string) $input['tahun_ajaran_diniyah']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
        $tahunFormal = isset($input['tahun_ajaran_formal']) && trim((string) $input['tahun_ajaran_formal']) !== '' ? trim((string) $input['tahun_ajaran_formal']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'masehi');
        $nim = isset($input['nim_diniyah']) ? trim((string) $input['nim_diniyah']) : (isset($input['nim_formal']) ? trim((string) $input['nim_formal']) : null);
        try {
            if ($idDiniyah > 0 && $tahunDiniyah) {
                SantriRombelHelper::appendRombelRiwayat($this->db, $idSantri, $idDiniyah, $tahunDiniyah, $idPengurus, $nim ?: null);
            }
            if ($idFormal > 0 && $tahunFormal) {
                SantriRombelHelper::appendRombelRiwayat($this->db, $idSantri, $idFormal, $tahunFormal, $idPengurus, $nim ?: null);
            }
        } catch (\InvalidArgumentException $e) {
            throw $e; // id_pengurus wajib — biar caller bisa return 400
        } catch (\Throwable $e) {
            error_log('PendaftaranController::appendSantriRombelRiwayatIfNeeded: ' . $e->getMessage());
        }
    }

    /**
     * Jika input berisi id_kamar (dan berubah dari nilai lama), sisipkan riwayat ke santri___kamar.
     * id_pengurus diambil dari input atau user; tahun_ajaran dari input atau default hijriyah.
     */
    private function appendSantriKamarRiwayatIfNeeded(int $idSantri, array $input, Request $request, ?array $oldSantri = null): void
    {
        $newKamar = isset($input['id_kamar']) && $input['id_kamar'] !== '' && $input['id_kamar'] !== null ? (int) $input['id_kamar'] : null;
        if ($newKamar === null || $newKamar <= 0) {
            return;
        }
        if ($oldSantri !== null) {
            $oldKamar = isset($oldSantri['id_kamar']) ? (int) $oldSantri['id_kamar'] : null;
            if ($newKamar === $oldKamar) {
                return;
            }
        }
        $idPengurus = isset($input['id_pengurus']) && $input['id_pengurus'] !== '' && $input['id_pengurus'] !== null ? (int) $input['id_pengurus'] : null;
        if (!$idPengurus) {
            $user = $request->getAttribute('user');
            $idPengurus = isset($user['id_pengurus']) ? (int) $user['id_pengurus'] : null;
            $uid = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if (!$idPengurus && $uid) {
                $st = $this->db->prepare("SELECT id FROM pengurus WHERE id = ? LIMIT 1");
                $st->execute([$uid]);
                $row = $st->fetch(\PDO::FETCH_ASSOC);
                $idPengurus = $row ? (int) $row['id'] : null;
                if (!$idPengurus) {
                    $st = $this->db->prepare("SELECT id FROM pengurus WHERE id_user = ? LIMIT 1");
                    $st->execute([$uid]);
                    $row = $st->fetch(\PDO::FETCH_ASSOC);
                    $idPengurus = $row ? (int) $row['id'] : null;
                }
            }
        }
        if (!$idPengurus || $idPengurus <= 0) {
            throw new \InvalidArgumentException('id_pengurus wajib diisi saat mengisi kamar (siapa yang melakukan perubahan). Sertakan di body atau login sebagai pengurus.');
        }
        $tahunKamar = isset($input['tahun_ajaran_kamar']) && trim((string) $input['tahun_ajaran_kamar']) !== '' ? trim((string) $input['tahun_ajaran_kamar']) : SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
        if (!$tahunKamar) {
            return;
        }
        $statusSantri = isset($input['status_santri']) ? trim((string) $input['status_santri']) : ($oldSantri !== null ? ($oldSantri['status_santri'] ?? null) : null);
        $kategori = isset($input['kategori']) ? trim((string) $input['kategori']) : ($oldSantri !== null ? ($oldSantri['kategori'] ?? null) : null);
        try {
            SantriKamarHelper::appendKamarRiwayat($this->db, $idSantri, $newKamar, $tahunKamar, $idPengurus, $statusSantri ?: null, $kategori ?: null);
        } catch (\InvalidArgumentException $e) {
            throw $e;
        } catch (\Throwable $e) {
            error_log('PendaftaranController::appendSantriKamarRiwayatIfNeeded: ' . $e->getMessage());
        }
    }

    /**
     * Ambil konteks registrasi untuk notifikasi WA (status_pendaftar, daftar_formal, daftar_diniyah, status_murid).
     * Selalu utamakan data dari psb___registrasi yang baru disimpan agar judul notif benar (Santri Baru vs Murid/Mahasiswa Baru).
     */
    private function getRegistrasiContextForWa(int $idSantri, array $input): array
    {
        $fallback = [
            'status_pendaftar' => isset($input['status_pendaftar']) && trim((string) $input['status_pendaftar']) !== '' ? trim((string) $input['status_pendaftar']) : null,
            'daftar_formal' => isset($input['daftar_formal']) && trim((string) $input['daftar_formal']) !== '' ? trim((string) $input['daftar_formal']) : null,
            'daftar_diniyah' => isset($input['daftar_diniyah']) && trim((string) $input['daftar_diniyah']) !== '' ? trim((string) $input['daftar_diniyah']) : null,
            'status_murid' => isset($input['status_murid']) && trim((string) $input['status_murid']) !== '' ? trim((string) $input['status_murid']) : null,
        ];

        try {
            $tahunHijriyah = $input['tahun_hijriyah'] ?? null;
            $tahunMasehi = $input['tahun_masehi'] ?? null;
            if ($tahunHijriyah !== null && $tahunHijriyah !== '' && $tahunMasehi !== null && $tahunMasehi !== '') {
                $stmt = $this->db->prepare("SELECT status_pendaftar, daftar_formal, daftar_diniyah, status_murid FROM psb___registrasi WHERE id_santri = ? AND tahun_hijriyah = ? AND tahun_masehi = ? LIMIT 1");
                $stmt->execute([$idSantri, $tahunHijriyah, $tahunMasehi]);
            } else {
                $stmt = $this->db->prepare("SELECT status_pendaftar, daftar_formal, daftar_diniyah, status_murid FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1");
                $stmt->execute([$idSantri]);
            }
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                $fromDb = [
                    'status_pendaftar' => trim((string) ($row['status_pendaftar'] ?? '')) !== '' ? trim((string) $row['status_pendaftar']) : null,
                    'daftar_formal' => trim((string) ($row['daftar_formal'] ?? '')) !== '' ? trim((string) $row['daftar_formal']) : null,
                    'daftar_diniyah' => trim((string) ($row['daftar_diniyah'] ?? '')) !== '' ? trim((string) $row['daftar_diniyah']) : null,
                    'status_murid' => trim((string) ($row['status_murid'] ?? '')) !== '' ? trim((string) $row['status_murid']) : null,
                ];
                return [
                    'status_pendaftar' => $fromDb['status_pendaftar'] ?? $fallback['status_pendaftar'],
                    'daftar_formal' => $fromDb['daftar_formal'] ?? $fallback['daftar_formal'],
                    'daftar_diniyah' => $fromDb['daftar_diniyah'] ?? $fallback['daftar_diniyah'],
                    'status_murid' => $fromDb['status_murid'] ?? $fallback['status_murid'],
                ];
            }
        } catch (\Throwable $e) {
            error_log('PendaftaranController::getRegistrasiContextForWa: ' . $e->getMessage());
        }

        return $fallback;
    }

    /**
     * Helper function untuk menyimpan atau update data ke tabel psb___registrasi
     * Dipanggil dari saveBiodata untuk menyimpan data registrasi sekaligus
     */
    private function saveOrUpdateRegistrasi($idSantri, $input, $idAdmin = null)
    {
        // Cek apakah tabel psb___registrasi ada
        try {
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                error_log("Tabel psb___registrasi tidak ditemukan, skip save registrasi");
                return; // Skip jika tabel tidak ada
            }
        } catch (\Exception $e) {
            error_log("Error checking table psb___registrasi: " . $e->getMessage());
            return; // Skip jika error
        }

        // Field yang bisa disimpan ke psb___registrasi
        $statusPendaftar = $input['status_pendaftar'] ?? null;
        // Simpan biodata → default keterangan_status = Belum Upload (jika tidak dikirim atau kosong)
        $keteranganStatus = $input['keterangan_status'] ?? null;
        if ($keteranganStatus === null || trim((string) $keteranganStatus) === '') {
            $keteranganStatus = 'Belum Upload';
        }
        $daftarDiniyah = $input['daftar_diniyah'] ?? null;
        $daftarFormal = $input['daftar_formal'] ?? null;
        $statusMurid = $input['status_murid'] ?? null;
        $prodi = $input['prodi'] ?? null;
        $gelombang = $input['gelombang'] ?? null;
        $statusSantri = $input['status_santri'] ?? null;
        $gender = $input['gender'] ?? null;
        
        // Riwayat Madrasah
        $madrasah = $input['madrasah'] ?? null;
        $namaMadrasah = $input['nama_madrasah'] ?? null;
        $alamatMadrasah = $input['alamat_madrasah'] ?? null;
        $lulusMadrasah = $input['lulus_madrasah'] ?? null;
        
        // Riwayat Sekolah
        $sekolah = $input['sekolah'] ?? null;
        $namaSekolah = $input['nama_sekolah'] ?? null;
        $alamatSekolah = $input['alamat_sekolah'] ?? null;
        $lulusSekolah = $input['lulus_sekolah'] ?? null;
        $npsn = $input['npsn'] ?? null;
        $nsm = $input['nsm'] ?? null;
        $jurusan = $input['jurusan'] ?? null;
        $programSekolah = $input['program_sekolah'] ?? null;
        
        // Tahun Ajaran
        $tahunHijriyah = $input['tahun_hijriyah'] ?? null;
        $tahunMasehi = $input['tahun_masehi'] ?? null;

        try {
            // Cek apakah data registrasi sudah ada berdasarkan kombinasi id_santri + tahun_hijriyah + tahun_masehi
            // Sesuai dengan unique constraint yang ada di tabel
            if ($tahunHijriyah !== null && $tahunHijriyah !== '' && $tahunMasehi !== null && $tahunMasehi !== '') {
                // Jika tahun hijriyah dan masehi ada, cek berdasarkan kombinasi 3 kolom
                $stmtCheck = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? AND tahun_hijriyah = ? AND tahun_masehi = ?");
                $stmtCheck->execute([$idSantri, $tahunHijriyah, $tahunMasehi]);
            } else {
                // Jika tahun tidak ada, cek hanya berdasarkan id_santri (untuk backward compatibility)
                // Tapi sebaiknya update jika ada untuk menambahkan tahun ajaran
                $stmtCheck = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1");
                $stmtCheck->execute([$idSantri]);
            }
            $exists = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');

            if ($exists) {
                // Ambil nilai saat ini agar jika input kosong kita tidak timpa dengan null (penting untuk notif WA)
                $currentRow = null;
                try {
                    $stmtCurrent = $this->db->prepare("SELECT status_pendaftar, daftar_formal, daftar_diniyah, status_murid FROM psb___registrasi WHERE id = ? LIMIT 1");
                    $stmtCurrent->execute([$exists['id']]);
                    $currentRow = $stmtCurrent->fetch(\PDO::FETCH_ASSOC);
                } catch (\Throwable $e) {
                    // ignore
                }
                $cur = $currentRow ?: [];
                $statusPendaftarUse = (isset($statusPendaftar) && $statusPendaftar !== '' && trim((string) $statusPendaftar) !== '') ? $statusPendaftar : ($cur['status_pendaftar'] ?? null);
                $daftarFormalUse = (isset($daftarFormal) && $daftarFormal !== '' && trim((string) $daftarFormal) !== '') ? $daftarFormal : ($cur['daftar_formal'] ?? null);
                $daftarDiniyahUse = (isset($daftarDiniyah) && $daftarDiniyah !== '' && trim((string) $daftarDiniyah) !== '') ? $daftarDiniyah : ($cur['daftar_diniyah'] ?? null);
                $statusMuridUse = (isset($statusMurid) && $statusMurid !== '' && trim((string) $statusMurid) !== '') ? $statusMurid : ($cur['status_murid'] ?? null);

                // Update existing registrasi berdasarkan id yang ditemukan (tanggal_biodata_simpan dicatat setiap simpan biodata)
                $sql = "UPDATE psb___registrasi SET 
                        status_pendaftar = ?, keterangan_status = ?, daftar_diniyah = ?, daftar_formal = ?, status_murid = ?, prodi = ?, gelombang = ?, status_santri = ?,
                        gender = ?,
                        madrasah = ?, nama_madrasah = ?, alamat_madrasah = ?, lulus_madrasah = ?,
                        sekolah = ?, nama_sekolah = ?, alamat_sekolah = ?, lulus_sekolah = ?,
                        npsn = ?, nsm = ?, jurusan = ?, program_sekolah = ?,
                        tahun_hijriyah = ?, tahun_masehi = ?,
                        id_admin = ?, tanggal_update = ?, tanggal_biodata_simpan = COALESCE(tanggal_biodata_simpan, ?) 
                        WHERE id = ?";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([
                    $statusPendaftarUse === '' ? null : $statusPendaftarUse,
                    $keteranganStatus === '' ? null : $keteranganStatus,
                    $daftarDiniyahUse === '' ? null : $daftarDiniyahUse,
                    $daftarFormalUse === '' ? null : $daftarFormalUse,
                    $statusMuridUse === '' ? null : $statusMuridUse,
                    $prodi === '' ? null : $prodi,
                    $gelombang === '' ? null : $gelombang,
                    $statusSantri === '' ? null : $statusSantri,
                    $gender === '' ? null : $gender,
                    $madrasah === '' ? null : $madrasah,
                    $namaMadrasah === '' ? null : $namaMadrasah,
                    $alamatMadrasah === '' ? null : $alamatMadrasah,
                    $lulusMadrasah === '' ? null : $lulusMadrasah,
                    $sekolah === '' ? null : $sekolah,
                    $namaSekolah === '' ? null : $namaSekolah,
                    $alamatSekolah === '' ? null : $alamatSekolah,
                    $lulusSekolah === '' ? null : $lulusSekolah,
                    $npsn === '' ? null : $npsn,
                    $nsm === '' ? null : $nsm,
                    $jurusan === '' ? null : $jurusan,
                    $programSekolah === '' ? null : $programSekolah,
                    $tahunHijriyah === '' ? null : $tahunHijriyah,
                    $tahunMasehi === '' ? null : $tahunMasehi,
                    $idAdmin,
                    $waktuIndonesia,
                    $waktuIndonesia,
                    $exists['id']
                ]);
            } else {
                // Insert new registrasi (tanggal_biodata_simpan dicatat saat insert)
                    $sql = "INSERT INTO psb___registrasi 
                            (id_santri, status_pendaftar, keterangan_status, daftar_diniyah, daftar_formal, status_murid, prodi, gelombang, status_santri,
                             gender,
                             madrasah, nama_madrasah, alamat_madrasah, lulus_madrasah,
                             sekolah, nama_sekolah, alamat_sekolah, lulus_sekolah,
                             npsn, nsm, jurusan, program_sekolah,
                             tahun_hijriyah, tahun_masehi,
                             id_admin, tanggal_dibuat, tanggal_biodata_simpan) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute([
                        $idSantri,
                        $statusPendaftar === '' ? null : $statusPendaftar,
                        $keteranganStatus === '' ? null : $keteranganStatus,
                        $daftarDiniyah === '' ? null : $daftarDiniyah,
                        $daftarFormal === '' ? null : $daftarFormal,
                        $statusMurid === '' ? null : $statusMurid,
                        $prodi === '' ? null : $prodi,
                        $gelombang === '' ? null : $gelombang,
                        $statusSantri === '' ? null : $statusSantri,
                    $gender === '' ? null : $gender,
                    $madrasah === '' ? null : $madrasah,
                    $namaMadrasah === '' ? null : $namaMadrasah,
                    $alamatMadrasah === '' ? null : $alamatMadrasah,
                    $lulusMadrasah === '' ? null : $lulusMadrasah,
                    $sekolah === '' ? null : $sekolah,
                    $namaSekolah === '' ? null : $namaSekolah,
                    $alamatSekolah === '' ? null : $alamatSekolah,
                    $lulusSekolah === '' ? null : $lulusSekolah,
                    $npsn === '' ? null : $npsn,
                    $nsm === '' ? null : $nsm,
                    $jurusan === '' ? null : $jurusan,
                    $programSekolah === '' ? null : $programSekolah,
                    $tahunHijriyah === '' ? null : $tahunHijriyah,
                    $tahunMasehi === '' ? null : $tahunMasehi,
                    $idAdmin,
                    $waktuIndonesia,
                    $waktuIndonesia
                ]);
            }
        } catch (\Exception $e) {
            error_log("Error saving registrasi in saveBiodata: " . $e->getMessage());
            // Jangan throw error, biarkan proses save biodata tetap berhasil
            // Registrasi bisa disimpan nanti melalui endpoint save-registrasi terpisah
        }
    }

    /**
     * POST /api/pendaftaran/save-registrasi - Simpan data registrasi PSB ke tabel psb___registrasi
     */
    public function saveRegistrasi(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id_santri']) || $input['id_santri'] === '' || $input['id_santri'] === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri wajib diisi'
                ], 400);
            }

            $idSantri = SantriHelper::resolveId($this->db, $input['id_santri']);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Field yang bisa disimpan ke psb___registrasi (teks disanitasi agar selalu bersih)
            $statusPendaftar = TextSanitizer::cleanTextOrNull($input['status_pendaftar'] ?? null);
            $daftarDiniyah = TextSanitizer::cleanTextOrNull($input['daftar_diniyah'] ?? null);
            $daftarFormal = TextSanitizer::cleanTextOrNull($input['daftar_formal'] ?? null);
            $statusMurid = TextSanitizer::cleanTextOrNull($input['status_murid'] ?? null);
            $prodi = TextSanitizer::cleanTextOrNull($input['prodi'] ?? null);
            $statusSantri = TextSanitizer::cleanTextOrNull($input['status_santri'] ?? null);
            $gender = $input['gender'] ?? null;
            
            // Riwayat Madrasah
            $madrasah = TextSanitizer::cleanTextOrNull($input['madrasah'] ?? null);
            $namaMadrasah = TextSanitizer::cleanTextOrNull($input['nama_madrasah'] ?? null);
            $alamatMadrasah = TextSanitizer::cleanTextOrNull($input['alamat_madrasah'] ?? null);
            $lulusMadrasah = TextSanitizer::cleanTextOrNull($input['lulus_madrasah'] ?? null);
            
            // Riwayat Sekolah
            $sekolah = TextSanitizer::cleanTextOrNull($input['sekolah'] ?? null);
            $namaSekolah = TextSanitizer::cleanTextOrNull($input['nama_sekolah'] ?? null);
            $alamatSekolah = TextSanitizer::cleanTextOrNull($input['alamat_sekolah'] ?? null);
            $lulusSekolah = TextSanitizer::cleanTextOrNull($input['lulus_sekolah'] ?? null);
            $npsn = TextSanitizer::cleanTextOrNull($input['npsn'] ?? null);
            $nsm = TextSanitizer::cleanTextOrNull($input['nsm'] ?? null);
            $jurusan = TextSanitizer::cleanTextOrNull($input['jurusan'] ?? null);
            $programSekolah = TextSanitizer::cleanTextOrNull($input['program_sekolah'] ?? null);
            
            $idAdmin = isset($input['id_admin']) && $input['id_admin'] !== null && $input['id_admin'] !== '' ? (int)$input['id_admin'] : null;
            
            // Flag untuk auto-assign items (default: true untuk insert baru, false untuk update)
            $autoAssignItems = isset($input['auto_assign_items']) ? (bool)$input['auto_assign_items'] : null;

            // Cek apakah tabel psb___registrasi ada
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel psb___registrasi belum ada. Silakan jalankan migration terlebih dahulu.'
                ], 500);
            }

            // Cek apakah santri sudah ada (untuk foreign key constraint)
            $stmtCheckSantri = $this->db->prepare("SELECT id FROM santri WHERE id = ?");
            $stmtCheckSantri->execute([$idSantri]);
            $santriExists = $stmtCheckSantri->fetch(\PDO::FETCH_ASSOC);
            
            if (!$santriExists) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri dengan ID ' . $idSantri . ' tidak ditemukan. Silakan simpan biodata terlebih dahulu.'
                ], 400);
            }

            $this->db->beginTransaction();

            try {
                // Ambil tahun ajaran dari input jika ada
                $tahunHijriyah = $input['tahun_hijriyah'] ?? null;
                $tahunMasehi = $input['tahun_masehi'] ?? null;
                
                // Cek apakah data registrasi sudah ada berdasarkan kombinasi id_santri + tahun_hijriyah + tahun_masehi
                // Sesuai dengan unique constraint yang ada di tabel
                if ($tahunHijriyah !== null && $tahunHijriyah !== '' && $tahunMasehi !== null && $tahunMasehi !== '') {
                    // Jika tahun hijriyah dan masehi ada, cek berdasarkan kombinasi 3 kolom
                    $stmtCheck = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? AND tahun_hijriyah = ? AND tahun_masehi = ?");
                    $stmtCheck->execute([$idSantri, $tahunHijriyah, $tahunMasehi]);
                } else {
                    // Jika tahun tidak ada, cek hanya berdasarkan id_santri (untuk backward compatibility)
                    // Tapi sebaiknya update jika ada untuk menambahkan tahun ajaran
                    $stmtCheck = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1");
                    $stmtCheck->execute([$idSantri]);
                }
                $exists = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

                $isNewRegistrasi = false;
                $idRegistrasi = null;
                $oldRegistrasi = null;
                $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');

                if ($exists) {
                    // Update existing registrasi berdasarkan id yang ditemukan
                    $idRegistrasi = $exists['id'];
                    $stmtOld = $this->db->prepare("SELECT * FROM psb___registrasi WHERE id = ?");
                    $stmtOld->execute([$idRegistrasi]);
                    $oldRegistrasi = $stmtOld->fetch(\PDO::FETCH_ASSOC);

                    $sql = "UPDATE psb___registrasi SET 
                            status_pendaftar = ?, daftar_diniyah = ?, daftar_formal = ?, status_murid = ?, prodi = ?, status_santri = ?,
                            madrasah = ?, nama_madrasah = ?, alamat_madrasah = ?, lulus_madrasah = ?,
                            sekolah = ?, nama_sekolah = ?, alamat_sekolah = ?, lulus_sekolah = ?,
                            npsn = ?, nsm = ?, jurusan = ?, program_sekolah = ?,
                            tahun_hijriyah = ?, tahun_masehi = ?,
                            id_admin = ?, tanggal_update = ? 
                            WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    $result = $stmt->execute([
                        $statusPendaftar === '' ? null : $statusPendaftar,
                        $daftarDiniyah === '' ? null : $daftarDiniyah,
                        $daftarFormal === '' ? null : $daftarFormal,
                        $statusMurid === '' ? null : $statusMurid,
                        $prodi === '' ? null : $prodi,
                        $statusSantri === '' ? null : $statusSantri,
                        $madrasah === '' ? null : $madrasah,
                        $namaMadrasah === '' ? null : $namaMadrasah,
                        $alamatMadrasah === '' ? null : $alamatMadrasah,
                        $lulusMadrasah === '' ? null : $lulusMadrasah,
                        $sekolah === '' ? null : $sekolah,
                        $namaSekolah === '' ? null : $namaSekolah,
                        $alamatSekolah === '' ? null : $alamatSekolah,
                        $lulusSekolah === '' ? null : $lulusSekolah,
                        $npsn === '' ? null : $npsn,
                        $nsm === '' ? null : $nsm,
                        $jurusan === '' ? null : $jurusan,
                        $programSekolah === '' ? null : $programSekolah,
                        $tahunHijriyah === '' ? null : $tahunHijriyah,
                        $tahunMasehi === '' ? null : $tahunMasehi,
                        $idAdmin,
                        $waktuIndonesia,
                        $exists['id']
                    ]);
                } else {
                    // Insert new registrasi
                    $isNewRegistrasi = true;
                    
                    $sql = "INSERT INTO psb___registrasi 
                            (id_santri, status_pendaftar, daftar_diniyah, daftar_formal, status_murid, prodi, status_santri,
                             madrasah, nama_madrasah, alamat_madrasah, lulus_madrasah,
                             sekolah, nama_sekolah, alamat_sekolah, lulus_sekolah,
                             npsn, nsm, jurusan, program_sekolah,
                             tahun_hijriyah, tahun_masehi,
                             id_admin, tanggal_dibuat) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
                    $stmt = $this->db->prepare($sql);
                    $result = $stmt->execute([
                        $idSantri,
                        $statusPendaftar === '' ? null : $statusPendaftar,
                        $daftarDiniyah === '' ? null : $daftarDiniyah,
                        $daftarFormal === '' ? null : $daftarFormal,
                        $statusMurid === '' ? null : $statusMurid,
                        $prodi === '' ? null : $prodi,
                        $statusSantri === '' ? null : $statusSantri,
                        $madrasah === '' ? null : $madrasah,
                        $namaMadrasah === '' ? null : $namaMadrasah,
                        $alamatMadrasah === '' ? null : $alamatMadrasah,
                        $lulusMadrasah === '' ? null : $lulusMadrasah,
                        $sekolah === '' ? null : $sekolah,
                        $namaSekolah === '' ? null : $namaSekolah,
                        $alamatSekolah === '' ? null : $alamatSekolah,
                        $lulusSekolah === '' ? null : $lulusSekolah,
                        $npsn === '' ? null : $npsn,
                        $nsm === '' ? null : $nsm,
                        $jurusan === '' ? null : $jurusan,
                        $programSekolah === '' ? null : $programSekolah,
                        $tahunHijriyah === '' ? null : $tahunHijriyah,
                        $tahunMasehi === '' ? null : $tahunMasehi,
                        $idAdmin,
                        $waktuIndonesia
                    ]);
                    
                    // Get inserted ID
                    $idRegistrasi = $this->db->lastInsertId();
                }

                if (!$result) {
                    $errorInfo = $stmt->errorInfo();
                    throw new \Exception("Database error: " . ($errorInfo[2] ?? 'Unknown error'));
                }

                // Ambil data baru untuk audit (setelah berhasil insert/update)
                $stmtNew = $this->db->prepare("SELECT * FROM psb___registrasi WHERE id = ?");
                $stmtNew->execute([$idRegistrasi]);
                $newRegistrasi = $stmtNew->fetch(\PDO::FETCH_ASSOC);

                // Auto-assign items jika diperlukan
                $assignResult = null;
                if ($idRegistrasi && ($autoAssignItems === true || ($autoAssignItems === null && $isNewRegistrasi))) {
                    // Siapkan data registrasi untuk matching
                    $registrasiData = array_filter([
                        'status_pendaftar' => $statusPendaftar === '' ? null : $statusPendaftar,
                        'daftar_formal' => $daftarFormal === '' ? null : $daftarFormal,
                        'status_santri' => $statusSantri === '' ? null : $statusSantri,
                        'status_murid' => $statusMurid === '' ? null : $statusMurid,
                        'daftar_diniyah' => $daftarDiniyah === '' ? null : $daftarDiniyah,
                        'gender' => $gender === '' ? null : $gender,
                    ], function($value) {
                        return $value !== null && $value !== '';
                    });

                    // Auto-assign items
                    $assignResult = $this->autoAssignItemsFromSets($idRegistrasi, $registrasiData, $idAdmin);
                }

                $this->db->commit();

                if ($newRegistrasi && $idAdmin !== null) {
                    if ($isNewRegistrasi) {
                        UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_CREATE, 'psb___registrasi', $idRegistrasi, null, $newRegistrasi, $request);
                    } else {
                        UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'psb___registrasi', $idRegistrasi, $oldRegistrasi, $newRegistrasi, $request);
                    }
                }
                
                $responseData = [
                    'success' => true,
                    'message' => 'Data registrasi berhasil disimpan'
                ];
                
                if ($assignResult !== null) {
                    $responseData['auto_assign'] = $assignResult;
                    if ($assignResult['assigned'] > 0) {
                        $responseData['message'] .= '. ' . $assignResult['assigned'] . ' item berhasil di-assign otomatis.';
                    }
                }
                
                return $this->jsonResponse($response, $responseData, 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                error_log("Save registrasi error (inner): " . $e->getMessage());
                error_log("Stack trace: " . $e->getTraceAsString());
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Save registrasi error (outer): " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan data registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/update-keterangan-status - Update hanya keterangan_status di psb___registrasi
     * Endpoint khusus untuk update keterangan_status saja tanpa mengubah field lain
     */
    public function updateKeteranganStatus(Request $request, Response $response): Response
    {
        try {
            // Gunakan getParsedBody() karena Slim BodyParsingMiddleware sudah aktif
            $input = $request->getParsedBody();

            // Fallback jika getParsedBody() kosong (misal request tidak memiliki Content-Type application/json)
            if (empty($input)) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                }
            }

            if (!$input) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan atau format JSON tidak valid'
                ], 400);
            }

            // Validasi input (id_santri bisa PK atau NIS, di-resolve ke PK)
            $idSantriParam = $input['id_santri'] ?? null;
            $keteranganStatus = $input['keterangan_status'] ?? null;
            $tahunHijriyah = $input['tahun_hijriyah'] ?? null;
            $tahunMasehi = $input['tahun_masehi'] ?? null;

            if (!$idSantriParam) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_santri wajib diisi'
                ], 400);
            }

            $idSantri = SantriHelper::resolveId($this->db, $idSantriParam);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'
                ], 400);
            }

            if ($keteranganStatus === null || $keteranganStatus === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'keterangan_status wajib diisi'
                ], 400);
            }

            // Hanya admin dari aplikasi uwaba yang boleh mengubah ke "Sudah Diverifikasi" / "Sudah Diverivikasi"
            $statusVerifikasiTrim = trim($keteranganStatus);
            if ($statusVerifikasiTrim === 'Sudah Diverifikasi' || $statusVerifikasiTrim === 'Sudah Diverivikasi') {
                $user = $request->getAttribute('user');
                $allowedApps = $user['allowed_apps'] ?? [];
                $allowedApps = is_array($allowedApps) ? $allowedApps : [];
                if (!in_array('uwaba', $allowedApps, true)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Hanya admin dari aplikasi UWABA yang dapat mengubah status menjadi Sudah Diverifikasi.'
                    ], 403);
                }
            }

            // Cek apakah tabel psb___registrasi ada
            try {
                $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
                if ($tableCheck->rowCount() === 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tabel psb___registrasi tidak ditemukan'
                    ], 404);
                }
            } catch (\Exception $e) {
                error_log("Error checking table psb___registrasi: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Error checking table: ' . $e->getMessage()
                ], 500);
            }

            // Cari registrasi berdasarkan id_santri dan tahun (jika ada)
            if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                $stmtCheck = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? AND tahun_hijriyah = ? AND tahun_masehi = ?");
                $stmtCheck->execute([$idSantri, $tahunHijriyah, $tahunMasehi]);
            } else {
                // Jika tahun tidak ada, cari yang terbaru berdasarkan id_santri
                $stmtCheck = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1");
                $stmtCheck->execute([$idSantri]);
            }
            
            $exists = $stmtCheck->fetch(\PDO::FETCH_ASSOC);

            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');

            if ($exists) {
                $statusVerifikasiTrimForUpdate = trim($keteranganStatus);
                $isSetSudahDiverifikasi = ($statusVerifikasiTrimForUpdate === 'Sudah Diverifikasi' || $statusVerifikasiTrimForUpdate === 'Sudah Diverivikasi');

                // Id pengurus dari aplikasi UWABA (user yang login = pengurus)
                $idPengurusVerifikasi = null;
                if ($isSetSudahDiverifikasi) {
                    $user = $request->getAttribute('user');
                    $idPengurusVerifikasi = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                }

                // Update keterangan_status dan tanggal_update; bila status = Sudah Diverifikasi, isi tanggal_diverifikasi + id_pengurus_verifikasi (dari UWABA)
                if ($isSetSudahDiverifikasi && $idPengurusVerifikasi !== null) {
                    $sql = "UPDATE psb___registrasi SET 
                            keterangan_status = ?,
                            tanggal_update = ?,
                            tanggal_diverifikasi = COALESCE(tanggal_diverifikasi, ?),
                            id_pengurus_verifikasi = COALESCE(id_pengurus_verifikasi, ?)
                            WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute([
                        $keteranganStatus,
                        $waktuIndonesia,
                        $waktuIndonesia,
                        $idPengurusVerifikasi,
                        $exists['id']
                    ]);
                } else {
                    // Saat status di-set ke Belum Bayar (berkas lengkap), catat tanggal_berkas_lengkap jika belum ada
                    $sql = "UPDATE psb___registrasi SET 
                            keterangan_status = ?,
                            tanggal_update = ?";
                    if (trim($keteranganStatus ?? '') === 'Belum Bayar') {
                        $sql .= ", tanggal_berkas_lengkap = COALESCE(tanggal_berkas_lengkap, ?)";
                    }
                    $sql .= " WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    if (trim($keteranganStatus ?? '') === 'Belum Bayar') {
                        $stmt->execute([$keteranganStatus, $waktuIndonesia, $waktuIndonesia, $exists['id']]);
                    } else {
                        $stmt->execute([$keteranganStatus, $waktuIndonesia, $exists['id']]);
                    }
                }

                // Kirim notifikasi WA bila status diubah menjadi Sudah Diverifikasi / Sudah Diverivikasi (format biodata seperti offcanvas)
                $statusVerifikasi = trim($keteranganStatus);
                if ($statusVerifikasi === 'Sudah Diverifikasi' || $statusVerifikasi === 'Sudah Diverivikasi') {
                    try {
                        $sqlBiodata = "SELECT s.id, s.nis, s.nama, s.nik, s.ayah, s.ibu, s.no_wa_santri, s.no_telpon,
                            s.dusun, s.rt, s.rw, s.desa, s.kecamatan, s.kabupaten, s.provinsi,
                            r.daftar_formal AS formal, r.daftar_diniyah AS diniyah, r.status_pendaftar,
                            r.tahun_hijriyah, r.tahun_masehi
                            FROM santri s
                            INNER JOIN psb___registrasi r ON r.id_santri = s.id
                            WHERE r.id = ?";
                        $stmtBiodata = $this->db->prepare($sqlBiodata);
                        $stmtBiodata->execute([$exists['id']]);
                        $rowBiodata = $stmtBiodata->fetch(\PDO::FETCH_ASSOC);
                        if ($rowBiodata) {
                            $alamatParts = array_filter([
                                isset($rowBiodata['dusun']) ? trim($rowBiodata['dusun']) : '',
                                isset($rowBiodata['rt']) ? trim($rowBiodata['rt']) : '',
                                isset($rowBiodata['rw']) ? trim($rowBiodata['rw']) : '',
                                isset($rowBiodata['desa']) ? trim($rowBiodata['desa']) : '',
                                isset($rowBiodata['kecamatan']) ? trim($rowBiodata['kecamatan']) : '',
                                isset($rowBiodata['kabupaten']) ? trim($rowBiodata['kabupaten']) : '',
                                isset($rowBiodata['provinsi']) ? trim($rowBiodata['provinsi']) : '',
                            ]);
                            $alamat = implode(', ', $alamatParts);
                            $tahunHijriyah = $rowBiodata['tahun_hijriyah'] ?? '';
                            $tahunMasehi = $rowBiodata['tahun_masehi'] ?? '';
                            $tahunAjaran = ($tahunHijriyah && $tahunMasehi) ? ($tahunHijriyah . ' / ' . $tahunMasehi) : ($tahunHijriyah ?: $tahunMasehi ?: '-');
                            $biodata = [
                                'id' => $rowBiodata['id'] ?? '-',
                                'nis' => $rowBiodata['nis'] ?? '-',
                                'nama' => $rowBiodata['nama'] ?? '-',
                                'nik' => $rowBiodata['nik'] ?? '-',
                                'ayah' => $rowBiodata['ayah'] ?? '-',
                                'ibu' => $rowBiodata['ibu'] ?? '-',
                                'alamat' => $alamat ?: '-',
                                'formal' => $rowBiodata['formal'] ?? '-',
                                'diniyah' => $rowBiodata['diniyah'] ?? '-',
                                'status_pendaftar' => $rowBiodata['status_pendaftar'] ?? '-',
                                'keterangan_status' => $statusVerifikasi,
                                'tahun_ajaran' => $tahunAjaran,
                            ];
                            $phoneNumbers = array_filter([
                                trim($rowBiodata['no_telpon'] ?? ''),
                                trim($rowBiodata['no_wa_santri'] ?? ''),
                            ]);
                            if (!empty($phoneNumbers)) {
                                WhatsAppService::sendPsbSudahDiverifikasi($phoneNumbers, $biodata, $idPengurusVerifikasi);
                            }
                        }
                    } catch (\Throwable $e) {
                        error_log('updateKeteranganStatus: send WA sudah diverifikasi error: ' . $e->getMessage());
                    }
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Keterangan status berhasil diupdate',
                    'data' => [
                        'id_registrasi' => $exists['id'],
                        'keterangan_status' => $keteranganStatus
                    ]
                ], 200);
            } else {
                // Registrasi tahun ini belum ada: jangan buat row di sini.
                // Row registrasi hanya dibuat saat simpan biodata atau saat daftar di halaman pembayaran.
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Belum ada data registrasi tahun ini; keterangan status hanya ditampilkan di aplikasi.',
                    'data' => [
                        'id_registrasi' => null,
                        'keterangan_status' => $keteranganStatus
                    ]
                ], 200);
            }

        } catch (\Exception $e) {
            error_log("Update keterangan status error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate keterangan status: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/bulk-update-registrasi - Update massal kolom psb___registrasi yang diizinkan.
     * Body: { updates: [ { id_registrasi: int, status_pendaftar?: string, status_murid?: string, daftar_formal?: string, daftar_diniyah?: string, gelombang?: string }, ... ] }
     * keterangan_status sengaja tidak diizinkan (hanya di-set lewat sync/berkas/pembayaran).
     */
    public function bulkUpdateRegistrasi(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if (empty($input)) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                }
            }
            if (!is_array($input) || empty($input['updates']) || !is_array($input['updates'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Body harus berisi updates (array of { id_registrasi, ...fields })'
                ], 400);
            }

            $allowedFields = ['status_pendaftar', 'status_murid', 'daftar_formal', 'daftar_diniyah', 'gelombang'];
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel psb___registrasi tidak ditemukan'
                ], 404);
            }

            $updated = 0;
            $waktuIndonesia = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');

            foreach ($input['updates'] as $item) {
                if (empty($item['id_registrasi'])) {
                    continue;
                }
                $idRegistrasi = (int) $item['id_registrasi'];
                $sets = [];
                $params = [];
                foreach ($allowedFields as $field) {
                    if (!array_key_exists($field, $item)) {
                        continue;
                    }
                    $val = $item[$field];
                    $sets[] = "{$field} = ?";
                    $params[] = ($val === '' || $val === null) ? null : $val;
                }
                if (count($sets) === 0) {
                    continue;
                }
                $sets[] = 'tanggal_update = ?';
                $params[] = $waktuIndonesia;
                $params[] = $idRegistrasi;
                $sql = 'UPDATE psb___registrasi SET ' . implode(', ', $sets) . ' WHERE id = ?';
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                if ($stmt->rowCount() > 0) {
                    $updated++;
                }
            }
            if ($updated > 0) {
                $user = $request->getAttribute('user');
                $idAdmin = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($idAdmin !== null) {
                    UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'psb___registrasi', 'bulk-' . $updated, null, ['updated_count' => $updated, 'ids' => array_column(array_filter($input['updates'], fn($i) => !empty($i['id_registrasi'])), 'id_registrasi')], $request);
                }
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => "Berhasil mengupdate {$updated} registrasi",
                'data' => ['updated' => $updated]
            ], 200);
        } catch (\Exception $e) {
            error_log("Bulk update registrasi error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal bulk update registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/sync-keterangan-status - Hitung dan update keterangan_status dari data di backend.
     * Body: { id_santri, tahun_hijriyah?, tahun_masehi? }
     * Aturan: Sudah Diverifikasi tidak diubah (hanya uwaba). Ada pembayaran (bayar > 0) → Belum Diverifikasi.
     * Berkas lengkap → Belum Bayar. Lainnya → Belum Upload.
     */
    public function syncKeteranganStatus(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if (empty($input)) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                }
            }
            if (!is_array($input)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak ditemukan atau format JSON tidak valid'
                ], 400);
            }

            $idSantriRaw = $input['id_santri'] ?? null;
            $tahunHijriyah = $input['tahun_hijriyah'] ?? null;
            $tahunMasehi = $input['tahun_masehi'] ?? null;

            if (!$idSantriRaw) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'id_santri wajib diisi'
                ], 400);
            }

            $idSantri = SantriHelper::resolveId($this->db, $idSantriRaw);
            if ($idSantri === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan (id_santri/NIS tidak valid)'
                ], 400);
            }

            $stmt = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$idSantri]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                $stmt = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id_santri = ? AND tahun_hijriyah = ? AND tahun_masehi = ?");
                $stmt->execute([$idSantri, $tahunHijriyah, $tahunMasehi]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            }

            if (!$row) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Tidak ada data registrasi',
                    'data' => ['id_registrasi' => null, 'keterangan_status' => null]
                ], 200);
            }

            $idRegistrasi = (int) $row['id'];
            $computed = $this->computeKeteranganStatusForRegistrasi($idRegistrasi);

            if ($computed !== null) {
                $waktu = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                // Saat status jadi Belum Bayar = berkas sudah lengkap, catat tanggal_berkas_lengkap (hanya jika belum ada)
                if ($computed === 'Belum Bayar') {
                    $upd = $this->db->prepare("UPDATE psb___registrasi SET keterangan_status = ?, tanggal_update = ?, tanggal_berkas_lengkap = COALESCE(tanggal_berkas_lengkap, ?) WHERE id = ?");
                    $upd->execute([$computed, $waktu, $waktu, $idRegistrasi]);
                } else {
                    $upd = $this->db->prepare("UPDATE psb___registrasi SET keterangan_status = ?, tanggal_update = ? WHERE id = ?");
                    $upd->execute([$computed, $waktu, $idRegistrasi]);
                }
            } else {
                $sel = $this->db->prepare("SELECT keterangan_status FROM psb___registrasi WHERE id = ?");
                $sel->execute([$idRegistrasi]);
                $cur = $sel->fetch(\PDO::FETCH_ASSOC);
                $computed = $cur['keterangan_status'] ?? null;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Keterangan status disinkronkan',
                'data' => [
                    'id_registrasi' => $idRegistrasi,
                    'keterangan_status' => $computed
                ]
            ], 200);
        } catch (\Exception $e) {
            error_log("Sync keterangan status error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyinkronkan keterangan status: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Hitung keterangan_status untuk satu registrasi dari data di DB.
     * Aturan: Sudah Diverifikasi tidak diubah. Ada pembayaran (bayar > 0) → Belum Diverifikasi.
     * Berkas lengkap (tanpa bukti pembayaran) → Belum Bayar. Lainnya → Belum Upload.
     *
     * @param int $idRegistrasi
     * @return string|null Nilai yang harus diset, atau null jika tidak usah diubah (Sudah Diverifikasi)
     */
    private function computeKeteranganStatusForRegistrasi(int $idRegistrasi): ?string
    {
        $stmt = $this->db->prepare("SELECT id, id_santri, COALESCE(bayar, 0) AS bayar, keterangan_status FROM psb___registrasi WHERE id = ?");
        $stmt->execute([$idRegistrasi]);
        $reg = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$reg) {
            return null;
        }

        $keteranganStatus = trim($reg['keterangan_status'] ?? '');
        // Sudah Diverifikasi dan Aktif tidak boleh diubah lagi oleh logika otomatis
        if ($keteranganStatus === 'Sudah Diverifikasi' || $keteranganStatus === 'Aktif') {
            return null;
        }

        $bayar = (float) ($reg['bayar'] ?? 0);
        if ($bayar > 0) {
            return 'Belum Diverifikasi';
        }

        $idSantri = (int) ($reg['id_santri'] ?? 0);
        if ($idSantri <= 0) {
            return 'Belum Upload';
        }

        $stmtB = $this->db->prepare("SELECT jenis_berkas, path_file, COALESCE(status_tidak_ada, 0) AS status_tidak_ada FROM santri___berkas WHERE id_santri = ?");
        $stmtB->execute([$idSantri]);
        $rows = $stmtB->fetchAll(\PDO::FETCH_ASSOC);

        $byJenis = [];
        foreach ($rows as $r) {
            $jenis = trim($r['jenis_berkas'] ?? '');
            if ($jenis === '') {
                continue;
            }
            $byJenis[$jenis] = [
                'path_file' => $r['path_file'] ?? '',
                'status_tidak_ada' => (int) ($r['status_tidak_ada'] ?? 0)
            ];
        }

        $allCovered = true;
        foreach (self::PSB_REQUIRED_BERKAS as $required) {
            if (!isset($byJenis[$required])) {
                $allCovered = false;
                break;
            }
            $v = $byJenis[$required];
            if ($v['status_tidak_ada'] !== 1 && (trim($v['path_file'] ?? '') === '' || $v['path_file'] === '-')) {
                $allCovered = false;
                break;
            }
        }

        return $allCovered ? 'Belum Bayar' : 'Belum Upload';
    }

    /**
     * GET /api/pendaftaran/whatsapp-kontak-status?nomor=62xxx - Status kontak WA untuk toggle notifikasi di form daftar.
     * Returns: { success, exists, siap_terima_notif }.
     */
    public function getWhatsAppKontakStatus(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $nomor = isset($params['nomor']) ? trim((string) $params['nomor']) : '';
        if ($nomor === '') {
            return $this->jsonResponse($response, [
                'success' => true,
                'exists' => false,
                'siap_terima_notif' => false,
            ], 200);
        }
        $status = WhatsAppService::getKontakStatusForNomor($nomor);
        return $this->jsonResponse($response, [
            'success' => true,
            'exists' => $status['exists'],
            'siap_terima_notif' => $status['siap_terima_notif'],
        ], 200);
    }

    /**
     * GET /api/pendaftaran/wa-wake - Nyalakan koneksi WA server jika sedang off.
     * Dipanggil saat pendaftar menekan tombol aktifkan notifikasi agar WA siap menerima pesan.
     */
    public function getWaWake(Request $request, Response $response): Response
    {
        $result = WhatsAppService::wakeWaServer();
        return $this->jsonResponse($response, [
            'success' => $result['success'],
            'message' => $result['message'],
        ], 200);
    }

    /**
     * GET /api/pendaftaran/get-biodata - Biodata santri untuk aplikasi daftar.
     * Role santri: hanya data sendiri (id dari token). Admin/psb: boleh id_santri di query.
     */
    public function getBiodata(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user)) {
                return $this->jsonResponse($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }
            $roleKey = strtolower(trim($user['role_key'] ?? $user['user_role'] ?? ''));
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            if ($roleKey === 'santri') {
                $idSantri = $user['user_id'] ?? $user['id'] ?? $user['santri_id'] ?? null;
            }
            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri tidak tersedia'
                ], 400);
            }
            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }
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
                s.status_nikah, s.pekerjaan, s.no_wa_santri,
                s.status_pendaftar, s.status_murid, s.status_santri,
                s.kategori, d.daerah, dk.kamar, dk.id_daerah, s.id_kamar,
                s.id_diniyah, rd.lembaga_id AS diniyah, rd.kelas AS kelas_diniyah, rd.kel AS kel_diniyah, s.nim_diniyah,
                s.id_formal, rf.lembaga_id AS formal, rf.kelas AS kelas_formal, rf.kel AS kel_formal, s.nim_formal,
                s.lttq, s.kelas_lttq, s.kel_lttq
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                WHERE s.id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row) {
                return $this->jsonResponse($response, ['success' => true, 'data' => $row], 200);
            }
            return $this->jsonResponse($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
        } catch (\Exception $e) {
            error_log("PendaftaranController::getBiodata " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil biodata',
                'data' => null
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-registrasi - Ambil data registrasi berdasarkan id_santri
     * Role santri: hanya data sendiri (id dari token). Admin/psb: boleh id_santri di query.
     * Support filter: tahun_hijriyah, tahun_masehi
     */
    public function getRegistrasi(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $roleKey = is_array($user) ? strtolower(trim($user['role_key'] ?? $user['user_role'] ?? '')) : '';
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            if ($roleKey === 'santri') {
                $idSantri = $user['user_id'] ?? $user['id'] ?? $user['santri_id'] ?? null;
            }
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Build query dengan filter tahun dan JOIN dengan pengurus + santri (untuk nis tampilan)
            $sql = "SELECT r.id, r.id_santri, s.nis, r.wajib, r.bayar, r.kurang, r.id_admin, r.tahun_hijriyah, r.tahun_masehi, 
                           r.status_pendaftar, r.keterangan_status, r.daftar_diniyah, r.daftar_formal, r.status_murid, r.prodi, r.gelombang,
                           r.status_santri, r.gender,
                           r.madrasah, r.nama_madrasah, r.alamat_madrasah, r.lulus_madrasah,
                           r.sekolah, r.nama_sekolah, r.alamat_sekolah, r.lulus_sekolah,
                           r.npsn, r.nsm, r.jurusan, r.program_sekolah,
                           p.nama AS admin
                    FROM psb___registrasi r
                    LEFT JOIN pengurus p ON r.id_admin = p.id
                    LEFT JOIN santri s ON r.id_santri = s.id
                    WHERE r.id_santri = ?";
            $params = [$resolvedId];
            
            if ($tahunHijriyah && $tahunHijriyah !== '') {
                $sql .= " AND r.tahun_hijriyah = ?";
                $params[] = $tahunHijriyah;
            }
            
            if ($tahunMasehi && $tahunMasehi !== '') {
                $sql .= " AND r.tahun_masehi = ?";
                $params[] = $tahunMasehi;
            }
            
            $sql .= " LIMIT 1";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data ?: null
            ], 200);

        } catch (\Exception $e) {
            error_log("Get registrasi error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-transaksi - Ambil transaksi berdasarkan id_registrasi
     * Role santri: hanya boleh melihat transaksi registrasi sendiri (id_registrasi harus milik id_santri dari token).
     */
    public function getTransaksi(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            $roleKey = is_array($user) ? strtolower(trim($user['role_key'] ?? $user['user_role'] ?? '')) : '';
            $queryParams = $request->getQueryParams();
            $idRegistrasi = $queryParams['id_registrasi'] ?? null;

            if (!$idRegistrasi) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_registrasi wajib diisi'
                ], 400);
            }

            if ($roleKey === 'santri') {
                $idSantriToken = $user['user_id'] ?? $user['id'] ?? $user['santri_id'] ?? null;
                if ($idSantriToken !== null) {
                    $stmtOwn = $this->db->prepare("SELECT id FROM psb___registrasi WHERE id = ? AND id_santri = ? LIMIT 1");
                    $stmtOwn->execute([$idRegistrasi, $idSantriToken]);
                    if (!$stmtOwn->fetch(\PDO::FETCH_ASSOC)) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Data transaksi tidak ditemukan atau tidak dapat diakses'
                        ], 403);
                    }
                }
            }

            $sql = "SELECT t.id, t.id_registrasi, t.id_santri, s.nis, t.nominal, t.via, t.hijriyah, t.masehi, t.id_admin, t.pc, 
                           t.tanggal_dibuat, t.tanggal_update, p.nama AS admin,
                           pay.id_payment_transaction, pay_trx.session_id, pay_trx.status as transaction_status,
                           pay_trx.payment_method, pay_trx.payment_channel, pay_trx.va_number, pay_trx.qr_code,
                           pay_trx.payment_url, pay_trx.trx_id as ipaymu_transaction_id
                    FROM psb___transaksi t
                    LEFT JOIN pengurus p ON t.id_admin = p.id
                    LEFT JOIN santri s ON t.id_santri = s.id
                    LEFT JOIN payment pay ON pay.id_referensi = t.id_registrasi AND pay.tabel_referensi = 'psb___registrasi'
                    LEFT JOIN payment___transaction pay_trx ON pay.id_payment_transaction = pay_trx.id
                    WHERE t.id_registrasi = ? 
                    ORDER BY t.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRegistrasi]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Bersihkan tanggal yang tidak valid (0000-00-00) menjadi null
            $this->cleanInvalidDates($data, ['tanggal_dibuat', 'tanggal_update', 'masehi']);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get transaksi error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data transaksi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-transaksi-public - DEPRECATED / DIHAPUS DARI ROUTE.
     * Sebelumnya: public tanpa auth → siapa saja bisa akses transaksi orang lain (IDOR).
     * Sekarang gunakan GET /api/pendaftaran/get-transaksi?id_registrasi=... dengan auth; backend cek kepemilikan untuk role santri.
     */
    public function getTransaksiPublic(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;
            $idRegistrasi = $queryParams['id_registrasi'] ?? null;

            if (!$idSantri && !$idRegistrasi) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri atau id_registrasi wajib diisi'
                ], 400);
            }

            // Jika ada id_santri, resolusi (bisa id atau nis) lalu ambil id_registrasi
            if ($idSantri && !$idRegistrasi) {
                $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
                if ($resolvedId === null) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => []
                    ], 200);
                }
                $sqlRegistrasi = "SELECT id FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1";
                $stmtRegistrasi = $this->db->prepare($sqlRegistrasi);
                $stmtRegistrasi->execute([$resolvedId]);
                $registrasi = $stmtRegistrasi->fetch(\PDO::FETCH_ASSOC);
                
                if (!$registrasi || !isset($registrasi['id'])) {
                    // Jika tidak ada registrasi, return empty array
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => []
                    ], 200);
                }
                
                $idRegistrasi = $registrasi['id'];
            }

            // Riwayat pembayaran pendaftaran: dari tabel psb___transaksi (bukan payment).
            // JOIN payment per transaksi (id_referensi = t.id, tabel_referensi = psb___transaksi) agar satu transaksi = satu baris.
            $sql = "SELECT t.id, t.id_registrasi, t.nominal, t.via, t.hijriyah, t.masehi, t.id_admin, t.pc, 
                           t.tanggal_dibuat, t.tanggal_update, p.nama AS admin,
                           pay.id_payment_transaction, pay_trx.session_id, pay_trx.status as transaction_status,
                           pay_trx.payment_method, pay_trx.payment_channel, pay_trx.va_number, pay_trx.qr_code,
                           pay_trx.payment_url, pay_trx.trx_id as ipaymu_transaction_id
                    FROM psb___transaksi t
                    LEFT JOIN pengurus p ON t.id_admin = p.id
                    LEFT JOIN payment pay ON pay.id_referensi = t.id AND pay.tabel_referensi = 'psb___transaksi'
                    LEFT JOIN payment___transaction pay_trx ON pay.id_payment_transaction = pay_trx.id
                    WHERE t.id_registrasi = ? 
                    ORDER BY t.tanggal_dibuat DESC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRegistrasi]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Satu baris per transaksi (id = psb___transaksi.id); hindari duplikat jika ada banyak payment untuk satu referensi
            $byTransaksiId = [];
            foreach ($rows as $row) {
                $tid = $row['id'] ?? null;
                if ($tid !== null && !isset($byTransaksiId[$tid])) {
                    $byTransaksiId[$tid] = $row;
                }
            }
            $data = array_values($byTransaksiId);

            // Bersihkan tanggal yang tidak valid (0000-00-00) menjadi null
            $this->cleanInvalidDates($data, ['tanggal_dibuat', 'tanggal_update', 'masehi']);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get transaksi public error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data transaksi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/create-payment-psb - Buat pembayaran baru di psb___transaksi
     */
    public function createPaymentPsb(Request $request, Response $response): Response
    {
        try {
            // Gunakan getParsedBody() seperti controller lain - sudah otomatis parse JSON oleh BodyParsingMiddleware
            $input = $request->getParsedBody();
            
            // Jika getParsedBody() null atau tidak array, coba parse manual dari raw body
            if (!is_array($input)) {
                $bodyContents = $request->getBody()->getContents();
                if (!empty($bodyContents)) {
                    $decoded = json_decode($bodyContents, true);
                    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                        $input = $decoded;
                    } else {
                        error_log("Create payment PSB: JSON decode error - " . json_last_error_msg());
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON format: ' . json_last_error_msg()
                        ], 400);
                    }
                } else {
                    error_log("Create payment PSB: Empty request body");
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Request body tidak boleh kosong'
                    ], 400);
                }
            }

            // Log input untuk debugging
            error_log("Create payment PSB input: " . json_encode($input));

            if (empty($input)) {
                error_log("Create payment PSB: Empty input array");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Data tidak boleh kosong'
                ], 400);
            }

            // Validasi required fields dengan pesan yang lebih jelas
            if (!isset($input['id_registrasi']) || $input['id_registrasi'] === '' || $input['id_registrasi'] === null) {
                error_log("Create payment PSB validation failed: id_registrasi missing or empty");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Registrasi wajib diisi'
                ], 400);
            }

            if (!isset($input['nominal']) || $input['nominal'] === '' || $input['nominal'] === null) {
                error_log("Create payment PSB validation failed: nominal missing or empty");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nominal wajib diisi'
                ], 400);
            }

            if (!isset($input['via']) || $input['via'] === '' || $input['via'] === null) {
                error_log("Create payment PSB validation failed: via missing or empty");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Metode pembayaran (via) wajib diisi'
                ], 400);
            }

            $idRegistrasi = (int)$input['id_registrasi'];
            $nominal = (int)$input['nominal'];
            $via = $input['via'] ?? 'Cash';
            $idAdmin = isset($input['id_admin']) ? (int)$input['id_admin'] : null;
            $hijriyah = $input['hijriyah'] ?? null;
            $masehi = $input['masehi'] ?? null;
            $pc = $input['pc'] ?? null;
            
            // Jika id_admin tidak dikirim, coba ambil dari request attribute (dari AuthMiddleware)
            if (!$idAdmin || $idAdmin <= 0) {
                $user = $request->getAttribute('user');
                if ($user && isset($user['user_id'])) {
                    $idAdmin = (int)$user['user_id'];
                } elseif ($user && isset($user['id'])) {
                    $idAdmin = (int)$user['id'];
                }
            }

            // Validasi tambahan
            if ($idRegistrasi <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID Registrasi tidak valid'
                ], 400);
            }

            if ($nominal <= 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nominal harus lebih dari 0'
                ], 400);
            }

            // Validasi id_admin (opsional, tapi jika ada harus valid)
            if ($idAdmin !== null && $idAdmin <= 0) {
                $idAdmin = null; // Set ke null jika tidak valid
            }

            // Get tanggal hijriyah dan masehi jika tidak diberikan
            if (!$masehi) {
                $masehi = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d');
            }

            $this->db->beginTransaction();

            try {
                // Ambil id_santri dari psb___registrasi berdasarkan id_registrasi
                $sqlGetSantri = "SELECT id_santri FROM psb___registrasi WHERE id = ?";
                $stmtGetSantri = $this->db->prepare($sqlGetSantri);
                $stmtGetSantri->execute([$idRegistrasi]);
                $registrasi = $stmtGetSantri->fetch(\PDO::FETCH_ASSOC);
                
                if (!$registrasi) {
                    throw new \Exception("Registrasi dengan ID {$idRegistrasi} tidak ditemukan");
                }
                
                $idSantri = $registrasi['id_santri'] ?? null;
                
                // Insert transaksi dengan id_admin dan id_santri
                $sql = "INSERT INTO psb___transaksi (id_registrasi, id_santri, nominal, via, hijriyah, masehi, id_admin, pc) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$idRegistrasi, $idSantri, $nominal, $via, $hijriyah, $masehi, $idAdmin, $pc]);

                // Ambil id transaksi yang baru dibuat
                $idTransaksi = $this->db->lastInsertId();

                // Insert ke tabel payment (induk)
                $adminName = null;
                if ($idAdmin) {
                    $sqlAdmin = "SELECT nama FROM pengurus WHERE id = ?";
                    $stmtAdmin = $this->db->prepare($sqlAdmin);
                    $stmtAdmin->execute([$idAdmin]);
                    $adminData = $stmtAdmin->fetch(\PDO::FETCH_ASSOC);
                    $adminName = $adminData['nama'] ?? null;
                }

                $this->insertToPayment('Pendaftaran', $idTransaksi, 'psb___transaksi', [
                    'id_santri' => $idSantri,
                    'nominal' => $nominal,
                    'via' => $via,
                    'metode_pembayaran' => $via,
                    'hijriyah' => $hijriyah,
                    'masehi' => $masehi,
                    'id_admin' => $idAdmin,
                    'admin' => $adminName,
                    'status' => 'Success'
                ]);

                // Update bayar, kurang, tanggal pembayaran pertama, dan status di psb___registrasi
                $tanggalUpdate = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $sqlUpdate = "UPDATE psb___registrasi 
                             SET bayar = COALESCE(bayar, 0) + ?, 
                                 kurang = GREATEST(COALESCE(wajib, 0) - (COALESCE(bayar, 0) + ?), 0),
                                 tanggal_update = ?,
                                 tanggal_pembayaran_pertama = COALESCE(tanggal_pembayaran_pertama, ?),
                                 keterangan_status = 'Belum Diverifikasi'
                             WHERE id = ?";
                $stmtUpdate = $this->db->prepare($sqlUpdate);
                $stmtUpdate->execute([$nominal, $nominal, $tanggalUpdate, $tanggalUpdate, $idRegistrasi]);

                // Kirim notifikasi WA: pembayaran berhasil (nominal sudah terbayar)
                try {
                    $stmtSantri = $this->db->prepare("SELECT s.nama, s.no_telpon, s.no_wa_santri FROM santri s WHERE s.id = ?");
                    $stmtSantri->execute([$idSantri]);
                    $santri = $stmtSantri->fetch(\PDO::FETCH_ASSOC);
                    if ($santri) {
                        $nama = $santri['nama'] ?? '';
                        $noWa = $santri['no_wa_santri'] ?? $santri['no_telpon'] ?? '';
                        if ($noWa !== '') {
                            WhatsAppService::sendPsbPembayaranBerhasil($noWa, $nama, $nominal, $idSantri);
                        }
                    }
                } catch (\Throwable $e) {
                    error_log("Create payment PSB: send WA error " . $e->getMessage());
                }

                $this->db->commit();

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Pembayaran berhasil disimpan'
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Create payment PSB error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menyimpan pembayaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-pendaftar-ids - Ambil id_santri dari tabel psb___registrasi berdasarkan tahun_hijriyah
     */
    public function getPendaftarIds(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunAjaran = $queryParams['tahun_ajaran'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            // Cek apakah tabel psb___registrasi ada
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel psb___registrasi belum ada'
                ], 404);
            }

            // Cek apakah kolom tahun_hijriyah ada
            $columnCheck = $this->db->query("SHOW COLUMNS FROM psb___registrasi LIKE 'tahun_hijriyah'");
            $columnExists = $columnCheck->rowCount() > 0;

            if (!$columnExists) {
                // Jika kolom tidak ada, return semua id_santri (fallback)
                $sql = "SELECT DISTINCT id_santri FROM psb___registrasi WHERE id_santri IS NOT NULL";
                $stmt = $this->db->prepare($sql);
                $stmt->execute();
            } else {
                // Build query dengan filter tahun_hijriyah dan tahun_masehi
                $sql = "SELECT DISTINCT id_santri FROM psb___registrasi WHERE id_santri IS NOT NULL";
                $params = [];
                
                if ($tahunAjaran && $tahunAjaran !== '') {
                    $sql .= " AND tahun_hijriyah = ?";
                    $params[] = $tahunAjaran;
                }
                
                if ($tahunMasehi && $tahunMasehi !== '') {
                    $sql .= " AND tahun_masehi = ?";
                    $params[] = $tahunMasehi;
                }
                
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
            }

            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Extract hanya id_santri values
            $idSantriList = array_map(function($row) {
                return (int)$row['id_santri'];
            }, $results);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $idSantriList
            ], 200);

        } catch (\Exception $e) {
            error_log("Get pendaftar IDs error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pendaftar: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-tahun-ajaran-list - Ambil daftar tahun_hijriyah yang unik dari tabel psb___registrasi
     */
    public function getTahunAjaranList(Request $request, Response $response): Response
    {
        try {
            // Cek apakah tabel psb___registrasi ada
            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tabel psb___registrasi belum ada'
                ], 404);
            }

            // Cek apakah kolom tahun_hijriyah ada
            $columnCheck = $this->db->query("SHOW COLUMNS FROM psb___registrasi LIKE 'tahun_hijriyah'");
            $columnExists = $columnCheck->rowCount() > 0;

            if (!$columnExists) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }

            // Ambil tahun_hijriyah yang unik dan tidak null
            $sqlHijriyah = "SELECT DISTINCT tahun_hijriyah FROM psb___registrasi WHERE tahun_hijriyah IS NOT NULL AND tahun_hijriyah != '' ORDER BY tahun_hijriyah DESC";
            $stmtHijriyah = $this->db->prepare($sqlHijriyah);
            $stmtHijriyah->execute();
            $resultsHijriyah = $stmtHijriyah->fetchAll(\PDO::FETCH_ASSOC);

            // Extract hanya tahun_hijriyah values
            $tahunHijriyahList = array_map(function($row) {
                return $row['tahun_hijriyah'];
            }, $resultsHijriyah);

            // Ambil tahun_masehi yang unik dan tidak null
            $sqlMasehi = "SELECT DISTINCT tahun_masehi FROM psb___registrasi WHERE tahun_masehi IS NOT NULL AND tahun_masehi != '' ORDER BY tahun_masehi DESC";
            $stmtMasehi = $this->db->prepare($sqlMasehi);
            $stmtMasehi->execute();
            $resultsMasehi = $stmtMasehi->fetchAll(\PDO::FETCH_ASSOC);

            // Extract hanya tahun_masehi values
            $tahunMasehiList = array_map(function($row) {
                return $row['tahun_masehi'];
            }, $resultsMasehi);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'tahun_hijriyah' => $tahunHijriyahList,
                    'tahun_masehi' => $tahunMasehiList
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Get tahun ajaran list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar tahun ajaran: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-registrasi-by-id - Ambil data registrasi berdasarkan id_registrasi (untuk mendapatkan id_santri)
     */
    public function getRegistrasiById(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idRegistrasi = $queryParams['id_registrasi'] ?? null;

            if (!$idRegistrasi) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_registrasi wajib diisi'
                ], 400);
            }

            $sql = "SELECT id, id_santri FROM psb___registrasi WHERE id = ? LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRegistrasi]);
            $data = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data ?: null
            ], 200);

        } catch (\Exception $e) {
            error_log("Get registrasi by id error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/delete-transaksi - Hapus transaksi pembayaran berdasarkan id transaksi
     */
    public function deleteTransaksi(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id']) || empty($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID transaksi wajib diisi'
                ], 400);
            }

            $idTransaksi = $input['id'];

            $this->db->beginTransaction();

            try {
                // Cek apakah transaksi ada
                $sqlSelect = "SELECT id, id_registrasi, nominal FROM psb___transaksi WHERE id = ?";
                $stmtSelect = $this->db->prepare($sqlSelect);
                $stmtSelect->execute([$idTransaksi]);
                $transaksi = $stmtSelect->fetch(\PDO::FETCH_ASSOC);

                if (!$transaksi) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => "Transaksi dengan ID {$idTransaksi} tidak ditemukan."
                    ], 404);
                }

                // Hapus transaksi
                $sqlDelete = "DELETE FROM psb___transaksi WHERE id = ?";
                $stmtDelete = $this->db->prepare($sqlDelete);
                $stmtDelete->execute([$idTransaksi]);
                $deleted = $stmtDelete->rowCount();

                if ($deleted > 0) {
                    // Update total bayar dan kurang di registrasi
                    $idRegistrasi = $transaksi['id_registrasi'];
                    $nominal = $transaksi['nominal'];
                    
                    // Hitung ulang total bayar
                    $sqlSum = "SELECT COALESCE(SUM(nominal), 0) as total_bayar FROM psb___transaksi WHERE id_registrasi = ?";
                    $stmtSum = $this->db->prepare($sqlSum);
                    $stmtSum->execute([$idRegistrasi]);
                    $result = $stmtSum->fetch(\PDO::FETCH_ASSOC);
                    $totalBayar = $result['total_bayar'] ?? 0;

                    // Update registrasi
                    $sqlUpdate = "UPDATE psb___registrasi SET bayar = ?, kurang = wajib - ? WHERE id = ?";
                    $stmtUpdate = $this->db->prepare($sqlUpdate);
                    $stmtUpdate->execute([$totalBayar, $totalBayar, $idRegistrasi]);

                    $this->db->commit();
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'message' => 'Transaksi berhasil dihapus.'
                    ], 200);
                } else {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Tidak ada data yang dihapus. Data mungkin sudah tidak ada.'
                    ], 404);
                }

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Delete transaksi error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus transaksi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-registrasi-detail - Ambil detail registrasi (item-item) berdasarkan id_registrasi
     */
    public function getRegistrasiDetail(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idRegistrasi = $queryParams['id_registrasi'] ?? null;

            if (!$idRegistrasi) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_registrasi wajib diisi'
                ], 400);
            }

            // Ambil detail dengan join ke psb___item untuk mendapatkan nama item dan harga standar
            $sql = "SELECT 
                        rd.id,
                        rd.id_registrasi,
                        rd.id_item,
                        rd.nominal as nominal_dibayar,
                        rd.status_ambil,
                        rd.tanggal_ambil,
                        rd.keterangan,
                        i.item as nama_item,
                        i.harga as harga_standar,
                        i.kategori as kategori_item,
                        COALESCE(i.urutan, 0) as urutan,
                        CASE 
                            WHEN rd.nominal = 0 THEN 'belum_bayar'
                            WHEN rd.nominal >= COALESCE(i.harga, 0) THEN 'sudah_bayar'
                            ELSE 'sebagian'
                        END as status_bayar
                    FROM psb___registrasi_detail rd
                    LEFT JOIN psb___item i ON rd.id_item = i.id
                    WHERE rd.id_registrasi = ?
                    ORDER BY COALESCE(i.urutan, 0) ASC, rd.id_item ASC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRegistrasi]);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Bersihkan tanggal yang tidak valid (0000-00-00) menjadi null
            $this->cleanInvalidDates($data, ['tanggal_ambil']);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data
            ], 200);

        } catch (\Exception $e) {
            error_log("Get registrasi detail error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data detail registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/update-registrasi-detail - Update detail registrasi (nominal dan status_ambil)
     */
    public function updateRegistrasiDetail(Request $request, Response $response): Response
    {
        try {
            // Gunakan getParsedBody() seperti controller lain
            $input = $request->getParsedBody();
            
            // Jika getParsedBody() null, coba baca raw body dan parse manual
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON: ' . json_last_error_msg()
                        ], 400);
                    }
                }
            }

            // Log untuk debugging
            error_log("Update registrasi detail input: " . json_encode($input));

            if (json_last_error() !== JSON_ERROR_NONE) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Invalid JSON: ' . json_last_error_msg()
                ], 400);
            }

            // Validasi field wajib
            if (!isset($input['id']) || $input['id'] === null || $input['id'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field id wajib diisi'
                ], 400);
            }

            // Validasi nominal_dibayar - harus ada di array (bisa 0)
            if (!array_key_exists('nominal_dibayar', $input)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field nominal_dibayar wajib diisi'
                ], 400);
            }

            if (!isset($input['status_ambil']) || $input['status_ambil'] === null || $input['status_ambil'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field status_ambil wajib diisi'
                ], 400);
            }

            $id = (int)$input['id'];
            $nominalDibayar = floatval($input['nominal_dibayar']);
            $statusAmbil = $input['status_ambil'];

            // Validasi status_ambil
            if (!in_array($statusAmbil, ['belum_ambil', 'sudah_ambil'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Status ambil harus salah satu dari: belum_ambil, sudah_ambil'
                ], 400);
            }
            $tanggalAmbil = null;

            // Jika status_ambil = 'sudah_ambil', set tanggal_ambil ke sekarang
            if ($statusAmbil === 'sudah_ambil') {
                $tanggalAmbil = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            }

            // Update detail
            $sql = "UPDATE psb___registrasi_detail 
                    SET nominal = ?, 
                        status_ambil = ?, 
                        tanggal_ambil = ?,
                        tanggal_update = ?
                    WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $tanggalUpdate = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $stmt->execute([$nominalDibayar, $statusAmbil, $tanggalAmbil, $tanggalUpdate, $id]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Detail registrasi berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update registrasi detail error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate detail registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/bulk-update-registrasi-detail - Update multiple detail registrasi sekaligus
     */
    public function bulkUpdateRegistrasiDetail(Request $request, Response $response): Response
    {
        try {
            // Gunakan getParsedBody() seperti controller lain - sudah otomatis parse JSON
            $input = $request->getParsedBody();
            
            // Jika getParsedBody() null, coba baca raw body dan parse manual
            if ($input === null) {
                $body = $request->getBody()->getContents();
                error_log("Bulk update registrasi detail - getParsedBody() returned null, trying raw body. Body: " . $body);
                
                if (empty($body)) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Request body is empty'
                    ], 400);
                }
                
                $input = json_decode($body, true);
                
                if (json_last_error() !== JSON_ERROR_NONE) {
                    error_log("Bulk update registrasi detail - JSON decode error: " . json_last_error_msg());
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Invalid JSON: ' . json_last_error_msg()
                    ], 400);
                }
            }

            // Cek apakah input null atau false
            if ($input === null || $input === false) {
                error_log("Bulk update registrasi detail - Input is null or false");
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Invalid request body. Expected JSON object with "details" array.'
                ], 400);
            }

            // Log untuk debugging
            error_log("Bulk update registrasi detail - Content-Type: " . ($request->getHeaderLine('Content-Type') ?: 'not set'));
            error_log("Bulk update registrasi detail - Decoded input: " . json_encode($input));
            error_log("Bulk update registrasi detail - Input type: " . gettype($input));
            error_log("Bulk update registrasi detail - Has 'details' key: " . (isset($input['details']) ? 'yes' : 'no'));
            if (isset($input['details'])) {
                error_log("Bulk update registrasi detail - 'details' type: " . gettype($input['details']));
                error_log("Bulk update registrasi detail - 'details' is_array: " . (is_array($input['details']) ? 'yes' : 'no'));
                error_log("Bulk update registrasi detail - 'details' count: " . (is_array($input['details']) ? count($input['details']) : 'N/A'));
            }

            // Cek apakah input adalah array langsung (jika frontend mengirim array langsung)
            if (is_array($input) && isset($input[0]) && is_array($input[0])) {
                // Input adalah array langsung, wrap dengan 'details'
                $input = ['details' => $input];
                error_log("Bulk update registrasi detail - Wrapped array input into 'details' key");
            }

            // Validasi final
            if (!isset($input['details']) || !is_array($input['details'])) {
                error_log("Bulk update registrasi detail - Validation failed. Input structure: " . json_encode($input));
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field details wajib diisi dan harus berupa array. Received: ' . json_encode($input)
                ], 400);
            }

            $details = $input['details'];
            if (empty($details)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Array details tidak boleh kosong'
                ], 400);
            }

            $this->db->beginTransaction();

            try {
                $updated = 0;
                $errors = [];

                foreach ($details as $index => $detail) {
                    // Validasi setiap detail
                    if (!isset($detail['id']) || $detail['id'] === null || $detail['id'] === '') {
                        $errors[] = "Detail index $index: Field id wajib diisi";
                        continue;
                    }

                    if (!array_key_exists('nominal_dibayar', $detail)) {
                        $errors[] = "Detail index $index: Field nominal_dibayar wajib diisi";
                        continue;
                    }

                    if (!isset($detail['status_ambil']) || $detail['status_ambil'] === null || $detail['status_ambil'] === '') {
                        $errors[] = "Detail index $index: Field status_ambil wajib diisi";
                        continue;
                    }

                    $id = (int)$detail['id'];
                    $nominalDibayar = floatval($detail['nominal_dibayar']);
                    $statusAmbil = $detail['status_ambil'];

                    // Validasi status_ambil
                    if (!in_array($statusAmbil, ['belum_ambil', 'sudah_ambil'])) {
                        $errors[] = "Detail index $index: Status ambil harus salah satu dari: belum_ambil, sudah_ambil";
                        continue;
                    }

                    $tanggalAmbil = null;
                    if ($statusAmbil === 'sudah_ambil') {
                        $tanggalAmbil = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                    }

                    // Update detail
                    $sql = "UPDATE psb___registrasi_detail 
                            SET nominal = ?, 
                                status_ambil = ?, 
                                tanggal_ambil = ?,
                                tanggal_update = ?
                            WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    $tanggalUpdate = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                    $stmt->execute([$nominalDibayar, $statusAmbil, $tanggalAmbil, $tanggalUpdate, $id]);
                    
                    $updated++;
                }

                if (!empty($errors)) {
                    $this->db->rollBack();
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Beberapa data tidak valid',
                        'errors' => $errors
                    ], 400);
                }

                $this->db->commit();
                if ($updated > 0) {
                    $user = $request->getAttribute('user');
                    $idAdmin = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                    if ($idAdmin !== null) {
                        UserAktivitasLogger::log(null, $idAdmin, UserAktivitasLogger::ACTION_UPDATE, 'psb___registrasi_detail', 'bulk-' . $updated, null, ['updated_count' => $updated], $request);
                    }
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => "Berhasil mengupdate $updated detail registrasi"
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Bulk update registrasi detail error: " . $e->getMessage());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate detail registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-item-list - Ambil daftar item dari psb___item
     */
    public function getItemList(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $kategori = $queryParams['kategori'] ?? null;
            $search = $queryParams['search'] ?? null;

            // Build query sesuai dengan struktur database
            // Note: gender, status_santri, status_pendaftar, lembaga sudah dihapus (migration 28)
            $sql = "SELECT 
                        id,
                        item as nama_item,
                        item,
                        harga as harga_standar,
                        harga,
                        kategori,
                        urutan,
                        dari,
                        sampai
                    FROM psb___item
                    WHERE 1=1";
            
            $params = [];
            
            if ($kategori && $kategori !== '') {
                $sql .= " AND kategori = ?";
                $params[] = $kategori;
            }
            
            if ($search && $search !== '') {
                $sql .= " AND (item LIKE ? OR CAST(id AS CHAR) LIKE ?)";
                $searchParam = "%{$search}%";
                $params[] = $searchParam;
                $params[] = $searchParam;
            }
            
            $sql .= " ORDER BY COALESCE(urutan, 0) ASC, item ASC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $data = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Get unique categories
            $categorySql = "SELECT DISTINCT kategori FROM psb___item WHERE kategori IS NOT NULL AND kategori != '' ORDER BY kategori ASC";
            $categoryStmt = $this->db->prepare($categorySql);
            $categoryStmt->execute();
            $categories = $categoryStmt->fetchAll(\PDO::FETCH_COLUMN);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $data,
                'categories' => $categories
            ], 200);

        } catch (\Exception $e) {
            error_log("Get item list error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar item: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/add-item-to-detail - Tambahkan item ke registrasi_detail
     */
    public function addItemToDetail(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON: ' . json_last_error_msg()
                        ], 400);
                    }
                }
            }

            // Validasi field wajib
            if (!isset($input['id_registrasi']) || $input['id_registrasi'] === null || $input['id_registrasi'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field id_registrasi wajib diisi'
                ], 400);
            }

            if (!isset($input['id_item']) || $input['id_item'] === null || $input['id_item'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field id_item wajib diisi'
                ], 400);
            }

            $idRegistrasi = (int)$input['id_registrasi'];
            $idItem = (int)$input['id_item']; // Convert to integer karena id_item di registrasi_detail adalah int(11)

            // Cek apakah item sudah ada di registrasi_detail
            $checkSql = "SELECT id FROM psb___registrasi_detail WHERE id_registrasi = ? AND id_item = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$idRegistrasi, $idItem]);
            if ($checkStmt->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item sudah ada di detail registrasi'
                ], 400);
            }

            // Cek apakah item ada di psb___item
            $itemSql = "SELECT id, harga as nominal FROM psb___item WHERE id = ?";
            $itemStmt = $this->db->prepare($itemSql);
            $itemStmt->execute([$idItem]);
            $item = $itemStmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$item) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item tidak ditemukan atau tidak aktif'
                ], 404);
            }

            // Insert ke registrasi_detail
            $this->db->beginTransaction();
            
            $insertSql = "INSERT INTO psb___registrasi_detail 
                            (id_registrasi, id_item, nominal, status_ambil, tanggal_dibuat, tanggal_update)
                          VALUES (?, ?, 0, 'belum_ambil', ?, ?)";
            $insertStmt = $this->db->prepare($insertSql);
            $tanggalNow = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
            $insertStmt->execute([$idRegistrasi, $idItem, $tanggalNow, $tanggalNow]);
            
            $this->db->commit();

            $this->recalculateWajibForRegistrasi($idRegistrasi);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Item berhasil ditambahkan ke detail registrasi',
                'data' => [
                    'id' => $this->db->lastInsertId(),
                    'id_registrasi' => $idRegistrasi,
                    'id_item' => $idItem
                ]
            ], 200);

        } catch (\Exception $e) {
            error_log("Add item to detail error: " . $e->getMessage());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan item: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/delete-registrasi-detail - Hapus item dari registrasi detail
     */
    public function deleteRegistrasiDetail(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON: ' . json_last_error_msg()
                        ], 400);
                    }
                }
            }

            if (!isset($input['id']) || $input['id'] === null || $input['id'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field id wajib diisi'
                ], 400);
            }

            $id = (int)$input['id'];

            // Cek apakah detail ada
            $checkSql = "SELECT id, id_registrasi FROM psb___registrasi_detail WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            $detail = $checkStmt->fetch(\PDO::FETCH_ASSOC);
            
            if (!$detail) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Detail registrasi tidak ditemukan'
                ], 404);
            }

            $this->db->beginTransaction();
            
            $idRegistrasi = (int) $detail['id_registrasi'];

            // Hapus detail
            $deleteSql = "DELETE FROM psb___registrasi_detail WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$id]);
            
            $this->db->commit();

            $this->recalculateWajibForRegistrasi($idRegistrasi);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Item berhasil dihapus dari detail registrasi'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete registrasi detail error: " . $e->getMessage());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus item: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/create-item - Buat item baru di psb___item
     */
    public function createItem(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON: ' . json_last_error_msg()
                        ], 400);
                    }
                }
            }

            if (!isset($input['item']) || empty($input['item'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field item wajib diisi'
                ], 400);
            }

            $this->db->beginTransaction();
            
            // Tabel psb___item hanya punya: item, kategori, urutan, harga, dari, sampai (tanpa gender, status_santri, status_pendaftar, lembaga)
            $sql = "INSERT INTO psb___item 
                    (item, kategori, urutan, harga, dari, sampai)
                    VALUES (?, ?, ?, ?, ?, ?)";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $input['item'] ?? null,
                !empty($input['kategori']) ? $input['kategori'] : null,
                !empty($input['urutan']) ? (int)$input['urutan'] : null,
                !empty($input['harga']) ? (int)$input['harga'] : null,
                !empty($input['dari']) ? $input['dari'] : null,
                !empty($input['sampai']) ? $input['sampai'] : null
            ]);
            
            $this->db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Item berhasil ditambahkan',
                'data' => ['id' => $this->db->lastInsertId()]
            ], 200);

        } catch (\Exception $e) {
            error_log("Create item error: " . $e->getMessage());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menambahkan item: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/update-item - Update item di psb___item
     */
    public function updateItem(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON: ' . json_last_error_msg()
                        ], 400);
                    }
                }
            }

            if (!isset($input['id']) || empty($input['id'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field id wajib diisi'
                ], 400);
            }

            if (!isset($input['item']) || empty($input['item'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field item wajib diisi'
                ], 400);
            }

            $id = (int)$input['id'];

            // Cek apakah item ada
            $checkSql = "SELECT id FROM psb___item WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            if ($checkStmt->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item tidak ditemukan'
                ], 404);
            }

            $this->db->beginTransaction();
            
            // Tabel psb___item hanya punya: item, kategori, urutan, harga, dari, sampai (tanpa gender, status_santri, status_pendaftar, lembaga)
            $sql = "UPDATE psb___item SET
                    item = ?,
                    kategori = ?,
                    urutan = ?,
                    harga = ?,
                    dari = ?,
                    sampai = ?
                    WHERE id = ?";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([
                $input['item'] ?? null,
                !empty($input['kategori']) ? $input['kategori'] : null,
                !empty($input['urutan']) ? (int)$input['urutan'] : null,
                !empty($input['harga']) ? (int)$input['harga'] : null,
                !empty($input['dari']) ? $input['dari'] : null,
                !empty($input['sampai']) ? $input['sampai'] : null,
                $id
            ]);
            
            $this->db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Item berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update item error: " . $e->getMessage());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate item: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/delete-item-psb - Hapus item dari psb___item
     */
    public function deleteItemPsb(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true);
                    if (json_last_error() !== JSON_ERROR_NONE) {
                        return $this->jsonResponse($response, [
                            'success' => false,
                            'message' => 'Invalid JSON: ' . json_last_error_msg()
                        ], 400);
                    }
                }
            }

            if (!isset($input['id']) || $input['id'] === null || $input['id'] === '') {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field id wajib diisi'
                ], 400);
            }

            $id = (int)$input['id'];

            // Cek apakah item ada
            $checkSql = "SELECT id FROM psb___item WHERE id = ?";
            $checkStmt = $this->db->prepare($checkSql);
            $checkStmt->execute([$id]);
            if ($checkStmt->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item tidak ditemukan'
                ], 404);
            }

            // Cek apakah item digunakan di registrasi_detail
            $checkUsageSql = "SELECT COUNT(*) as count FROM psb___registrasi_detail WHERE id_item = ?";
            $checkUsageStmt = $this->db->prepare($checkUsageSql);
            $checkUsageStmt->execute([$id]);
            $usage = $checkUsageStmt->fetch(\PDO::FETCH_ASSOC);
            
            if ($usage && $usage['count'] > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item tidak dapat dihapus karena masih digunakan di registrasi detail'
                ], 400);
            }

            $this->db->beginTransaction();
            
            $deleteSql = "DELETE FROM psb___item WHERE id = ?";
            $deleteStmt = $this->db->prepare($deleteSql);
            $deleteStmt->execute([$id]);
            
            $this->db->commit();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Item berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete item error: " . $e->getMessage());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus item: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Mencari item set yang match dengan kondisi registrasi
     * 
     * @param array $registrasiData Data registrasi (status_pendaftar, daftar_formal, status_santri, dll)
     * @return array Array of item set IDs yang match
     */
    private function findMatchingItemSets(array $registrasiData): array
    {
        try {
            // Ambil semua item set yang aktif, urutkan berdasarkan urutan
            $sql = "SELECT id, nama_set FROM psb___item_set WHERE is_active = 1 ORDER BY urutan ASC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $itemSets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $matchingSets = [];

            foreach ($itemSets as $set) {
                // Ambil semua kondisi untuk set ini
                $sql = "SELECT 
                            kf.field_name,
                            kv.value
                        FROM psb___item_set_kondisi_rel iskr
                        INNER JOIN psb___kondisi_value kv ON iskr.id_kondisi_value = kv.id
                        INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                        WHERE iskr.id_item_set = ? AND kf.is_active = 1 AND kv.is_active = 1
                        ORDER BY kf.field_name, kv.value";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$set['id']]);
                $kondisi = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                // Jika set tidak punya kondisi, skip (tidak akan match)
                if (empty($kondisi)) {
                    continue;
                }

                // Group kondisi berdasarkan field_name
                // Setiap field bisa punya multiple values (OR condition)
                $kondisiByField = [];
                foreach ($kondisi as $k) {
                    $fieldName = $k['field_name'];
                    if (!isset($kondisiByField[$fieldName])) {
                        $kondisiByField[$fieldName] = [];
                    }
                    $kondisiByField[$fieldName][] = $k['value'];
                }

                // Cek apakah semua field match dengan data registrasi
                // Untuk setiap field, cukup match dengan SALAH SATU value (OR)
                // Semua field harus match (AND antar field)
                $allFieldsMatch = true;
                foreach ($kondisiByField as $fieldName => $expectedValues) {
                    // Cek apakah field ada di data registrasi
                    if (!isset($registrasiData[$fieldName])) {
                        // Field tidak ada di registrasi, tidak match
                        $allFieldsMatch = false;
                        break;
                    }

                    // Normalisasi: trim + string agar perbandingan konsisten (spasi/tipe tidak bikin gagal)
                    $registrasiValue = trim((string) $registrasiData[$fieldName]);
                    
                    // Cek apakah value di registrasi match dengan SALAH SATU value di item set (OR)
                    $fieldMatch = false;
                    foreach ($expectedValues as $expectedValue) {
                        if (trim((string) $expectedValue) === $registrasiValue) {
                            $fieldMatch = true;
                            break; // Match dengan salah satu value, cukup
                        }
                    }

                    if (!$fieldMatch) {
                        // Field ini tidak match dengan semua value yang diharapkan
                        $allFieldsMatch = false;
                        break;
                    }
                }

                if ($allFieldsMatch) {
                    $matchingSets[] = $set['id'];
                }
            }

            return $matchingSets;

        } catch (\Exception $e) {
            error_log("Error finding matching item sets: " . $e->getMessage());
            return [];
        }
    }

    /**
     * Mengambil daftar item + harga yang berlaku sesuai kondisi (tanpa side effect).
     * Dipakai oleh frontend daftar dan uwaba agar satu logika di backend.
     *
     * POST /api/pendaftaran/items-by-kondisi
     * Body: { status_pendaftar?, daftar_formal?, daftar_diniyah?, status_murid?, status_santri?, gender?, gelombang?, ... }
     * Response: { success, data: { items: [{ id, id_item, nama_item, harga, kategori, urutan }], total_wajib, matching_set_ids } }
     */
    public function getItemsByKondisi(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if ($input === null) {
                $body = $request->getBody()->getContents();
                if (!empty($body)) {
                    $input = json_decode($body, true) ?: [];
                } else {
                    $input = $request->getQueryParams();
                }
            }
            if (!is_array($input)) {
                $input = [];
            }

            // Build registrasi data for matching: semua key di input yang punya value (agar field kondisi custom ikut)
            $registrasiData = array_filter($input, function ($v) {
                return $v !== null && $v !== '';
            });

            $matchingSetIds = $this->findMatchingItemSets($registrasiData);

            if (empty($matchingSetIds)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'items' => [],
                        'total_wajib' => 0,
                        'matching_set_ids' => [],
                    ],
                ], 200);
            }

            $placeholders = implode(',', array_fill(0, count($matchingSetIds), '?'));
            $sql = "SELECT 
                        i.id AS id_item,
                        i.item AS nama_item,
                        COALESCE(i.harga, 0) AS harga,
                        i.kategori,
                        COALESCE(i.urutan, 0) AS urutan,
                        isd.id_item_set
                    FROM psb___item_set_detail isd
                    INNER JOIN psb___item i ON isd.id_item = i.id
                    WHERE isd.id_item_set IN ($placeholders)
                    ORDER BY isd.id_item_set ASC, isd.urutan ASC, i.id ASC";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($matchingSetIds);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Deduplicate by id_item (keep first occurrence to preserve order)
            $seen = [];
            $items = [];
            $totalWajib = 0;
            foreach ($rows as $row) {
                $idItem = (int) $row['id_item'];
                if (isset($seen[$idItem])) {
                    continue;
                }
                $seen[$idItem] = true;
                $harga = (int) ($row['harga'] ?? 0);
                $items[] = [
                    'id' => $idItem,
                    'id_item' => $idItem,
                    'nama_item' => $row['nama_item'] ?? '',
                    'harga' => $harga,
                    'kategori' => $row['kategori'] ?? null,
                    'urutan' => (int) ($row['urutan'] ?? 0),
                ];
                $totalWajib += $harga;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'items' => $items,
                    'total_wajib' => $totalWajib,
                    'matching_set_ids' => $matchingSetIds,
                ],
            ], 200);

        } catch (\Exception $e) {
            error_log("Get items by kondisi error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil item berdasarkan kondisi: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Auto-assign items dari item set ke registrasi_detail
     * 
     * @param int $idRegistrasi ID registrasi
     * @param array $registrasiData Data registrasi untuk matching
     * @param int|null $idAdmin ID admin yang melakukan assign (optional)
     * @return array Array dengan info: ['assigned' => count, 'skipped' => count, 'sets' => array]
     */
    private function autoAssignItemsFromSets(int $idRegistrasi, array $registrasiData, ?int $idAdmin = null): array
    {
        try {
            // Cari set yang match
            $matchingSetIds = $this->findMatchingItemSets($registrasiData);

            if (empty($matchingSetIds)) {
                return [
                    'assigned' => 0,
                    'skipped' => 0,
                    'sets' => []
                ];
            }

            $totalAssigned = 0;
            $totalSkipped = 0;
            $processedSets = [];

            foreach ($matchingSetIds as $setId) {
                // Ambil item-item dari set ini
                $sql = "SELECT id_item, urutan 
                        FROM psb___item_set_detail 
                        WHERE id_item_set = ? 
                        ORDER BY urutan ASC";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$setId]);
                $items = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                $setAssigned = 0;
                $setSkipped = 0;

                foreach ($items as $item) {
                    $idItem = $item['id_item'];

                    // Cek apakah item sudah ada di registrasi_detail
                    $checkSql = "SELECT id FROM psb___registrasi_detail 
                                WHERE id_registrasi = ? AND id_item = ?";
                    $checkStmt = $this->db->prepare($checkSql);
                    $checkStmt->execute([$idRegistrasi, $idItem]);

                    if ($checkStmt->rowCount() > 0) {
                        // Item sudah ada, skip
                        $setSkipped++;
                        continue;
                    }

                    // Insert item ke registrasi_detail
                    $insertSql = "INSERT INTO psb___registrasi_detail 
                                  (id_registrasi, id_item, nominal, status_ambil, id_admin, tanggal_dibuat, tanggal_update)
                                  VALUES (?, ?, 0, 'belum_ambil', ?, NOW(), NOW())";
                    $insertStmt = $this->db->prepare($insertSql);
                    $insertStmt->execute([$idRegistrasi, $idItem, $idAdmin]);

                    $setAssigned++;
                }

                $totalAssigned += $setAssigned;
                $totalSkipped += $setSkipped;

                if ($setAssigned > 0 || $setSkipped > 0) {
                    $processedSets[] = [
                        'set_id' => $setId,
                        'assigned' => $setAssigned,
                        'skipped' => $setSkipped
                    ];
                }
            }

            // Hitung ulang wajib dari total harga item di detail (satu logika dengan items-by-kondisi)
            if (!empty($matchingSetIds)) {
                $this->recalculateWajibForRegistrasi($idRegistrasi);
            }

            return [
                'assigned' => $totalAssigned,
                'skipped' => $totalSkipped,
                'sets' => $processedSets
            ];

        } catch (\Exception $e) {
            error_log("Error auto-assigning items: " . $e->getMessage());
            return [
                'assigned' => 0,
                'skipped' => 0,
                'sets' => [],
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * Hitung ulang wajib dan kurang di psb___registrasi dari total harga item di registrasi_detail.
     * wajib = SUM(psb___item.harga) untuk semua baris di registrasi_detail; kurang = wajib - bayar.
     */
    private function recalculateWajibForRegistrasi(int $idRegistrasi): void
    {
        try {
            $sql = "SELECT COALESCE(SUM(i.harga), 0) AS total_wajib
                    FROM psb___registrasi_detail rd
                    INNER JOIN psb___item i ON rd.id_item = i.id
                    WHERE rd.id_registrasi = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRegistrasi]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $wajib = (int) ($row['total_wajib'] ?? 0);

            $sqlUpdate = "UPDATE psb___registrasi 
                          SET wajib = ?, 
                              kurang = GREATEST(? - COALESCE(bayar, 0), 0), 
                              tanggal_update = NOW() 
                          WHERE id = ?";
            $stmtUpdate = $this->db->prepare($sqlUpdate);
            $stmtUpdate->execute([$wajib, $wajib, $idRegistrasi]);
        } catch (\Exception $e) {
            error_log("Recalculate wajib error for registrasi $idRegistrasi: " . $e->getMessage());
        }
    }

    /**
     * POST /api/pendaftaran/auto-assign-items - Auto-assign items dari item set ke registrasi
     */
    public function autoAssignItems(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id_registrasi']) || empty($input['id_registrasi'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID registrasi wajib diisi'
                ], 400);
            }

            $idRegistrasi = (int)$input['id_registrasi'];
            $idAdmin = isset($input['id_admin']) && $input['id_admin'] !== null && $input['id_admin'] !== '' ? (int)$input['id_admin'] : null;

            // Ambil data registrasi untuk matching (termasuk gelombang jika ada, agar kondisi item set ikut match)
            $sql = "SELECT status_pendaftar, daftar_formal, status_santri, status_murid, daftar_diniyah, gender, gelombang 
                    FROM psb___registrasi 
                    WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idRegistrasi]);
            $registrasiRow = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$registrasiRow) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Registrasi tidak ditemukan'
                ], 404);
            }

            // Siapkan data registrasi untuk matching (filter null dan empty); semua kolom kondisi ikut
            $registrasiData = array_filter([
                'status_pendaftar' => $registrasiRow['status_pendaftar'] ?? null,
                'daftar_formal' => $registrasiRow['daftar_formal'] ?? null,
                'status_santri' => $registrasiRow['status_santri'] ?? null,
                'status_murid' => $registrasiRow['status_murid'] ?? null,
                'daftar_diniyah' => $registrasiRow['daftar_diniyah'] ?? null,
                'gender' => $registrasiRow['gender'] ?? null,
                'gelombang' => $registrasiRow['gelombang'] ?? null,
            ], function ($value) {
                return $value !== null && $value !== '';
            });

            // Auto-assign items
            $assignResult = $this->autoAssignItemsFromSets($idRegistrasi, $registrasiData, $idAdmin);

            $responseData = [
                'success' => true,
                'message' => 'Auto-assign items selesai',
                'data' => $assignResult
            ];

            if ($assignResult['assigned'] > 0) {
                $responseData['message'] = $assignResult['assigned'] . ' item berhasil di-assign otomatis.';
            } else if (!empty($assignResult['sets'])) {
                $responseData['message'] = 'Tidak ada item baru yang di-assign (semua item sudah ada).';
            } else {
                $responseData['message'] = 'Tidak ada item set yang cocok dengan kondisi registrasi ini.';
            }

            return $this->jsonResponse($response, $responseData, 200);

        } catch (\Exception $e) {
            error_log("Auto-assign items error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal melakukan auto-assign items: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/item-sets - Ambil daftar semua item set
     */
    public function getItemSets(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $includeInactive = isset($queryParams['include_inactive']) && $queryParams['include_inactive'] === 'true';

            $sql = "SELECT 
                        id,
                        nama_set,
                        is_active,
                        urutan,
                        keterangan,
                        tanggal_dibuat,
                        tanggal_update
                    FROM psb___item_set";
            
            if (!$includeInactive) {
                $sql .= " WHERE is_active = 1";
            }
            
            $sql .= " ORDER BY urutan ASC, nama_set ASC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $sets = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Ambil kondisi dan item untuk setiap set
            foreach ($sets as &$set) {
                // Ambil kondisi
                $kondisiSql = "SELECT 
                                    kf.id as field_id,
                                    kf.field_name,
                                    kf.field_label,
                                    kv.id as value_id,
                                    kv.value,
                                    kv.value_label
                                FROM psb___item_set_kondisi_rel iskr
                                INNER JOIN psb___kondisi_value kv ON iskr.id_kondisi_value = kv.id
                                INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                                WHERE iskr.id_item_set = ?
                                ORDER BY kf.urutan ASC, kv.urutan ASC";
                $kondisiStmt = $this->db->prepare($kondisiSql);
                $kondisiStmt->execute([$set['id']]);
                $set['kondisi'] = $kondisiStmt->fetchAll(\PDO::FETCH_ASSOC);

                // Ambil items
                $itemSql = "SELECT 
                                isd.id_item,
                                isd.urutan,
                                i.item as nama_item,
                                i.harga as harga_standar,
                                i.kategori
                            FROM psb___item_set_detail isd
                            INNER JOIN psb___item i ON isd.id_item = i.id
                            WHERE isd.id_item_set = ?
                            ORDER BY isd.urutan ASC";
                $itemStmt = $this->db->prepare($itemSql);
                $itemStmt->execute([$set['id']]);
                $set['items'] = $itemStmt->fetchAll(\PDO::FETCH_ASSOC);
            }
            unset($set);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $sets
            ], 200);

        } catch (\Exception $e) {
            error_log("Get item sets error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar item set: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/unique-kondisi-from-registrasi
     * Ambil kombinasi kondisi unik dari psb___registrasi (dengan pagination), cek apakah sudah ada item set yang match.
     * Query: page (default 1), limit (default 20).
     * Response: { success, data: [...], total, page, limit }
     */
    public function getUniqueKondisiFromRegistrasi(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $page = isset($queryParams['page']) ? max(1, (int) $queryParams['page']) : 1;
            $limit = isset($queryParams['limit']) ? max(1, min(100, (int) $queryParams['limit'])) : 20;

            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [],
                    'total' => 0,
                    'page' => $page,
                    'limit' => $limit,
                    'message' => 'Tabel psb___registrasi belum ada.'
                ], 200);
            }

            $columnsInRegistrasi = [];
            $colsStmt = $this->db->query("SHOW COLUMNS FROM psb___registrasi");
            while ($row = $colsStmt->fetch(\PDO::FETCH_ASSOC)) {
                $columnsInRegistrasi[] = $row['Field'];
            }

            $fieldStmt = $this->db->query("SELECT id, field_name, field_label FROM psb___kondisi_field WHERE is_active = 1 ORDER BY urutan ASC");
            $fields = $fieldStmt->fetchAll(\PDO::FETCH_ASSOC);

            $conditionColumns = [];
            foreach ($fields as $f) {
                if (in_array($f['field_name'], $columnsInRegistrasi, true)) {
                    $conditionColumns[] = $f;
                }
            }

            if (empty($conditionColumns)) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [],
                    'total' => 0,
                    'page' => $page,
                    'limit' => $limit,
                    'fields' => []
                ], 200);
            }

            $colNames = array_column($conditionColumns, 'field_name');
            $selectCols = [];
            foreach ($colNames as $c) {
                $safe = '`' . str_replace('`', '``', $c) . '`';
                $selectCols[] = $safe;
            }

            $sql = "SELECT " . implode(', ', $selectCols) . " FROM psb___registrasi";
            $stmt = $this->db->query($sql);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $uniqueKeys = [];
            $uniqueRows = [];
            foreach ($rows as $row) {
                $normalized = [];
                $hasAny = false;
                foreach ($colNames as $c) {
                    $v = isset($row[$c]) ? trim((string) $row[$c]) : '';
                    if ($v !== '') {
                        $hasAny = true;
                    }
                    $normalized[$c] = $v;
                }
                if (!$hasAny) {
                    continue;
                }
                $key = json_encode($normalized);
                if (!isset($uniqueKeys[$key])) {
                    $uniqueKeys[$key] = true;
                    $uniqueRows[] = $normalized;
                }
            }

            // Filter by query params (setiap key yang ada di condition columns)
            foreach ($colNames as $c) {
                $paramVal = isset($queryParams[$c]) ? trim((string) $queryParams[$c]) : null;
                if ($paramVal === null || $paramVal === '') {
                    continue;
                }
                $uniqueRows = array_values(array_filter($uniqueRows, function ($r) use ($c, $paramVal) {
                    return isset($r[$c]) && trim((string) $r[$c]) === $paramVal;
                }));
            }

            $itemSetsResult = $this->db->query("SELECT id, nama_set FROM psb___item_set WHERE is_active = 1");
            $allItemSets = $itemSetsResult->fetchAll(\PDO::FETCH_ASSOC);

            $result = [];
            foreach ($uniqueRows as $condition) {
                $registrasiData = array_filter($condition, function ($v) {
                    return $v !== null && $v !== '';
                });

                $matchingSetIds = $this->findMatchingItemSets($registrasiData);
                $firstMatch = null;
                foreach ($allItemSets as $set) {
                    if (in_array((int) $set['id'], $matchingSetIds, true)) {
                        $firstMatch = $set;
                        break;
                    }
                }

                $kondisiValueIds = [];
                foreach ($conditionColumns as $f) {
                    $val = $condition[$f['field_name']] ?? '';
                    if ($val === '') {
                        continue;
                    }
                    $vStmt = $this->db->prepare("SELECT id FROM psb___kondisi_value WHERE id_field = ? AND TRIM(value) = ? AND is_active = 1");
                    $vStmt->execute([$f['id'], $val]);
                    $vRow = $vStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($vRow) {
                        $kondisiValueIds[] = (int) $vRow['id'];
                    }
                }

                $labels = [];
                foreach ($conditionColumns as $f) {
                    $v = $condition[$f['field_name']] ?? '';
                    if ($v !== '') {
                        $labels[] = $f['field_label'] . ': ' . $v;
                    }
                }
                $condition_label = implode(', ', $labels);
                if ($condition_label === '') {
                    $condition_label = '(tanpa kondisi)';
                }

                $result[] = [
                    'condition' => $condition,
                    'condition_label' => $condition_label,
                    'has_item_set' => $firstMatch !== null,
                    'item_set_id' => $firstMatch ? (int) $firstMatch['id'] : null,
                    'item_set_nama' => $firstMatch ? $firstMatch['nama_set'] : null,
                    'kondisi_value_ids' => $kondisiValueIds
                ];
            }

            usort($result, function ($a, $b) {
                return strcmp($a['condition_label'], $b['condition_label']);
            });

            $total = count($result);
            $offset = ($page - 1) * $limit;
            $pagedData = array_slice($result, $offset, $limit);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $pagedData,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'fields' => array_map(function ($f) {
                    return ['id' => (int) $f['id'], 'field_name' => $f['field_name'], 'field_label' => $f['field_label']];
                }, $conditionColumns)
            ], 200);

        } catch (\Exception $e) {
            error_log("Get unique kondisi from registrasi error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil kondisi unik dari registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/registrasi-by-kondisi
     * Body: { condition: { status_pendaftar?: string, gender?: string, ... } }
     * Mengembalikan list registrasi yang persis match kondisi: nis, nama_santri, tahun_masehi, tahun_hijriyah.
     */
    public function getRegistrasiByKondisi(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            if ($input === null) {
                $body = $request->getBody()->getContents();
                $input = !empty($body) ? (json_decode($body, true) ?: []) : [];
            }
            $condition = isset($input['condition']) && is_array($input['condition']) ? $input['condition'] : [];

            $tableCheck = $this->db->query("SHOW TABLES LIKE 'psb___registrasi'");
            if ($tableCheck->rowCount() === 0) {
                return $this->jsonResponse($response, ['success' => true, 'data' => []], 200);
            }

            $columnsInRegistrasi = [];
            $colsStmt = $this->db->query("SHOW COLUMNS FROM psb___registrasi");
            while ($row = $colsStmt->fetch(\PDO::FETCH_ASSOC)) {
                $columnsInRegistrasi[] = $row['Field'];
            }

            $whereParts = [];
            $params = [];
            foreach ($condition as $fieldName => $value) {
                if ($value === null || $value === '') {
                    continue;
                }
                if (!in_array($fieldName, $columnsInRegistrasi, true)) {
                    continue;
                }
                $safeCol = '`' . str_replace('`', '``', $fieldName) . '`';
                $whereParts[] = "r.{$safeCol} = ?";
                $params[] = trim((string) $value);
            }

            $sql = "SELECT s.id AS id_santri, s.nis, s.nama AS nama_santri, r.tahun_masehi, r.tahun_hijriyah
                    FROM psb___registrasi r
                    INNER JOIN santri s ON s.id = r.id_santri";
            if (!empty($whereParts)) {
                $sql .= " WHERE " . implode(' AND ', $whereParts);
            }
            $sql .= " ORDER BY r.tahun_hijriyah DESC, r.tahun_masehi DESC, s.nama ASC";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $rows
            ], 200);

        } catch (\Exception $e) {
            error_log("Get registrasi by kondisi error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/item-set/{id} - Ambil detail item set
     */
    public function getItemSet(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID item set wajib diisi'
                ], 400);
            }

            $sql = "SELECT 
                        id,
                        nama_set,
                        is_active,
                        urutan,
                        keterangan,
                        tanggal_dibuat,
                        tanggal_update
                    FROM psb___item_set
                    WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $set = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$set) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item set tidak ditemukan'
                ], 404);
            }

            // Ambil kondisi
            $kondisiSql = "SELECT 
                                kf.id as field_id,
                                kf.field_name,
                                kf.field_label,
                                kv.id as value_id,
                                kv.value,
                                kv.value_label
                            FROM psb___item_set_kondisi_rel iskr
                            INNER JOIN psb___kondisi_value kv ON iskr.id_kondisi_value = kv.id
                            INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                            WHERE iskr.id_item_set = ?
                            ORDER BY kf.urutan ASC, kv.urutan ASC";
            $kondisiStmt = $this->db->prepare($kondisiSql);
            $kondisiStmt->execute([$id]);
            $set['kondisi'] = $kondisiStmt->fetchAll(\PDO::FETCH_ASSOC);

            // Ambil items
            $itemSql = "SELECT 
                            isd.id_item,
                            isd.urutan,
                            i.item as nama_item,
                            i.harga as harga_standar,
                            i.kategori
                        FROM psb___item_set_detail isd
                        INNER JOIN psb___item i ON isd.id_item = i.id
                        WHERE isd.id_item_set = ?
                        ORDER BY isd.urutan ASC";
            $itemStmt = $this->db->prepare($itemSql);
            $itemStmt->execute([$id]);
            $set['items'] = $itemStmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $set
            ], 200);

        } catch (\Exception $e) {
            error_log("Get item set error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil item set: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/item-set - Buat item set baru
     */
    public function createItemSet(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();

            if (!isset($input['nama_set']) || empty($input['nama_set'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Nama set wajib diisi'
                ], 400);
            }

            $namaSet = trim($input['nama_set']);
            $isActive = isset($input['is_active']) ? (int)$input['is_active'] : 1;
            $urutan = isset($input['urutan']) && $input['urutan'] !== '' ? (int)$input['urutan'] : null;
            $keterangan = isset($input['keterangan']) ? trim($input['keterangan']) : null;
            $kondisiValueIds = $input['kondisi_value_ids'] ?? []; // Array of kondisi value IDs
            $itemIds = $input['item_ids'] ?? []; // Array of item IDs

            $this->db->beginTransaction();

            try {
                // Insert item set
                $sql = "INSERT INTO psb___item_set (nama_set, is_active, urutan, keterangan, tanggal_dibuat, tanggal_update)
                        VALUES (?, ?, ?, ?, NOW(), NOW())";
                $stmt = $this->db->prepare($sql);
                $stmt->execute([$namaSet, $isActive, $urutan, $keterangan]);
                $idItemSet = $this->db->lastInsertId();

                // Insert kondisi
                if (!empty($kondisiValueIds)) {
                    $kondisiSql = "INSERT INTO psb___item_set_kondisi_rel (id_item_set, id_kondisi_value, tanggal_dibuat)
                                   VALUES (?, ?, NOW())";
                    $kondisiStmt = $this->db->prepare($kondisiSql);
                    foreach ($kondisiValueIds as $kondisiValueId) {
                        $kondisiStmt->execute([$idItemSet, (int)$kondisiValueId]);
                    }
                }

                // Insert items
                if (!empty($itemIds)) {
                    $itemSql = "INSERT INTO psb___item_set_detail (id_item_set, id_item, urutan, tanggal_dibuat)
                               VALUES (?, ?, ?, NOW())";
                    $itemStmt = $this->db->prepare($itemSql);
                    $itemUrutan = 1;
                    foreach ($itemIds as $itemId) {
                        $itemStmt->execute([$idItemSet, (int)$itemId, $itemUrutan]);
                        $itemUrutan++;
                    }
                }

                $this->db->commit();

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Item set berhasil dibuat',
                    'data' => ['id' => $idItemSet]
                ], 201);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Create item set error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat item set: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/pendaftaran/item-set/{id} - Update item set
     */
    public function updateItemSet(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $input = $request->getParsedBody();

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID item set wajib diisi'
                ], 400);
            }

            // Cek apakah item set ada
            $checkStmt = $this->db->prepare("SELECT id FROM psb___item_set WHERE id = ?");
            $checkStmt->execute([$id]);
            if ($checkStmt->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item set tidak ditemukan'
                ], 404);
            }

            $namaSet = isset($input['nama_set']) ? trim($input['nama_set']) : null;
            $isActive = isset($input['is_active']) ? (int)$input['is_active'] : null;
            $urutan = isset($input['urutan']) && $input['urutan'] !== '' ? (int)$input['urutan'] : null;
            $keterangan = isset($input['keterangan']) ? trim($input['keterangan']) : null;
            $kondisiValueIds = isset($input['kondisi_value_ids']) ? $input['kondisi_value_ids'] : null;
            $itemIds = isset($input['item_ids']) ? $input['item_ids'] : null;

            $this->db->beginTransaction();

            try {
                // Update item set
                $updateFields = [];
                $updateParams = [];

                if ($namaSet !== null) {
                    $updateFields[] = "nama_set = ?";
                    $updateParams[] = $namaSet;
                }
                if ($isActive !== null) {
                    $updateFields[] = "is_active = ?";
                    $updateParams[] = $isActive;
                }
                if ($urutan !== null) {
                    $updateFields[] = "urutan = ?";
                    $updateParams[] = $urutan;
                }
                if ($keterangan !== null) {
                    $updateFields[] = "keterangan = ?";
                    $updateParams[] = $keterangan;
                }

                if (!empty($updateFields)) {
                    $updateFields[] = "tanggal_update = NOW()";
                    $updateParams[] = $id;
                    $sql = "UPDATE psb___item_set SET " . implode(', ', $updateFields) . " WHERE id = ?";
                    $stmt = $this->db->prepare($sql);
                    $stmt->execute($updateParams);
                }

                // Update kondisi jika diberikan
                if ($kondisiValueIds !== null) {
                    // Hapus kondisi lama
                    $deleteKondisiSql = "DELETE FROM psb___item_set_kondisi_rel WHERE id_item_set = ?";
                    $deleteKondisiStmt = $this->db->prepare($deleteKondisiSql);
                    $deleteKondisiStmt->execute([$id]);

                    // Insert kondisi baru
                    if (!empty($kondisiValueIds)) {
                        $kondisiSql = "INSERT INTO psb___item_set_kondisi_rel (id_item_set, id_kondisi_value, tanggal_dibuat)
                                       VALUES (?, ?, NOW())";
                        $kondisiStmt = $this->db->prepare($kondisiSql);
                        foreach ($kondisiValueIds as $kondisiValueId) {
                            $kondisiStmt->execute([$id, (int)$kondisiValueId]);
                        }
                    }
                }

                // Update items jika diberikan
                if ($itemIds !== null) {
                    // Hapus items lama
                    $deleteItemSql = "DELETE FROM psb___item_set_detail WHERE id_item_set = ?";
                    $deleteItemStmt = $this->db->prepare($deleteItemSql);
                    $deleteItemStmt->execute([$id]);

                    // Insert items baru
                    if (!empty($itemIds)) {
                        $itemSql = "INSERT INTO psb___item_set_detail (id_item_set, id_item, urutan, tanggal_dibuat)
                                   VALUES (?, ?, ?, NOW())";
                        $itemStmt = $this->db->prepare($itemSql);
                        $itemUrutan = 1;
                        foreach ($itemIds as $itemId) {
                            $itemStmt->execute([$id, (int)$itemId, $itemUrutan]);
                            $itemUrutan++;
                        }
                    }
                }

                $this->db->commit();

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Item set berhasil diupdate'
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Update item set error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate item set: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pendaftaran/item-set/{id} - Hapus item set
     */
    public function deleteItemSet(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID item set wajib diisi'
                ], 400);
            }

            // Cek apakah item set ada
            $checkStmt = $this->db->prepare("SELECT id, nama_set FROM psb___item_set WHERE id = ?");
            $checkStmt->execute([$id]);
            $set = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$set) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Item set tidak ditemukan'
                ], 404);
            }

            // Hapus item set (cascade akan menghapus relasi dan detail)
            $deleteStmt = $this->db->prepare("DELETE FROM psb___item_set WHERE id = ?");
            $deleteStmt->execute([$id]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Item set "' . $set['nama_set'] . '" berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete item set error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus item set: ' . $e->getMessage()
            ], 500);
        }
    }

    // ============================================
    // API Endpoints untuk Manage Kondisi Field
    // ============================================

    /**
     * GET /api/pendaftaran/kondisi-fields - Ambil daftar semua kondisi field
     */
    public function getKondisiFields(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $includeInactive = isset($queryParams['include_inactive']) && $queryParams['include_inactive'] === 'true';

            $sql = "SELECT 
                        id,
                        field_name,
                        field_label,
                        field_type,
                        is_active,
                        urutan,
                        tanggal_dibuat,
                        tanggal_update
                    FROM psb___kondisi_field";
            
            if (!$includeInactive) {
                $sql .= " WHERE is_active = 1";
            }
            
            $sql .= " ORDER BY urutan ASC, field_label ASC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute();
            $fields = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $fields
            ], 200);

        } catch (\Exception $e) {
            error_log("Get kondisi fields error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar kondisi field: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/kondisi-field/{id} - Ambil detail kondisi field
     */
    public function getKondisiField(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kondisi field wajib diisi'
                ], 400);
            }

            $sql = "SELECT 
                        id,
                        field_name,
                        field_label,
                        field_type,
                        is_active,
                        urutan,
                        tanggal_dibuat,
                        tanggal_update
                    FROM psb___kondisi_field
                    WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $field = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$field) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi field tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $field
            ], 200);

        } catch (\Exception $e) {
            error_log("Get kondisi field error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil kondisi field: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/kondisi-field - Buat kondisi field baru
     */
    public function createKondisiField(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();

            if (!isset($input['field_name']) || empty($input['field_name'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field name wajib diisi'
                ], 400);
            }

            if (!isset($input['field_label']) || empty($input['field_label'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field label wajib diisi'
                ], 400);
            }

            $fieldName = trim($input['field_name']);
            $fieldLabel = trim($input['field_label']);
            $fieldType = isset($input['field_type']) ? $input['field_type'] : 'string';
            $isActive = isset($input['is_active']) ? (int)$input['is_active'] : 1;
            $urutan = isset($input['urutan']) && $input['urutan'] !== '' ? (int)$input['urutan'] : null;

            // Cek apakah field_name sudah ada
            $checkStmt = $this->db->prepare("SELECT id FROM psb___kondisi_field WHERE field_name = ?");
            $checkStmt->execute([$fieldName]);
            if ($checkStmt->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Field name sudah ada'
                ], 400);
            }

            $sql = "INSERT INTO psb___kondisi_field (field_name, field_label, field_type, is_active, urutan, tanggal_dibuat, tanggal_update)
                    VALUES (?, ?, ?, ?, ?, NOW(), NOW())";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$fieldName, $fieldLabel, $fieldType, $isActive, $urutan]);
            $id = $this->db->lastInsertId();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kondisi field berhasil dibuat',
                'data' => ['id' => $id]
            ], 201);

        } catch (\Exception $e) {
            error_log("Create kondisi field error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat kondisi field: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/pendaftaran/kondisi-field/{id} - Update kondisi field
     */
    public function updateKondisiField(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $input = $request->getParsedBody();

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kondisi field wajib diisi'
                ], 400);
            }

            // Cek apakah field ada
            $checkStmt = $this->db->prepare("SELECT id, field_name FROM psb___kondisi_field WHERE id = ?");
            $checkStmt->execute([$id]);
            $field = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$field) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi field tidak ditemukan'
                ], 404);
            }

            $updateFields = [];
            $updateParams = [];

            if (isset($input['field_label'])) {
                $updateFields[] = "field_label = ?";
                $updateParams[] = trim($input['field_label']);
            }
            if (isset($input['field_type'])) {
                $updateFields[] = "field_type = ?";
                $updateParams[] = $input['field_type'];
            }
            if (isset($input['is_active'])) {
                $updateFields[] = "is_active = ?";
                $updateParams[] = (int)$input['is_active'];
            }
            if (isset($input['urutan']) && $input['urutan'] !== '') {
                $updateFields[] = "urutan = ?";
                $updateParams[] = (int)$input['urutan'];
            }

            if (empty($updateFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $updateFields[] = "tanggal_update = NOW()";
            $updateParams[] = $id;

            $sql = "UPDATE psb___kondisi_field SET " . implode(', ', $updateFields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($updateParams);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kondisi field berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update kondisi field error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate kondisi field: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pendaftaran/kondisi-field/{id} - Hapus kondisi field
     */
    public function deleteKondisiField(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kondisi field wajib diisi'
                ], 400);
            }

            // Cek apakah field ada
            $checkStmt = $this->db->prepare("SELECT id, field_name, field_label FROM psb___kondisi_field WHERE id = ?");
            $checkStmt->execute([$id]);
            $field = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$field) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi field tidak ditemukan'
                ], 404);
            }

            // Cek apakah ada value yang menggunakan field ini
            $valueCheckStmt = $this->db->prepare("SELECT COUNT(*) as count FROM psb___kondisi_value WHERE id_field = ?");
            $valueCheckStmt->execute([$id]);
            $valueCount = $valueCheckStmt->fetch(\PDO::FETCH_ASSOC)['count'];

            if ($valueCount > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak dapat menghapus field karena masih digunakan oleh ' . $valueCount . ' value'
                ], 400);
            }

            // Hapus field
            $deleteStmt = $this->db->prepare("DELETE FROM psb___kondisi_field WHERE id = ?");
            $deleteStmt->execute([$id]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kondisi field "' . $field['field_label'] . '" berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete kondisi field error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus kondisi field: ' . $e->getMessage()
            ], 500);
        }
    }

    // ============================================
    // API Endpoints untuk Manage Kondisi Value
    // ============================================

    /**
     * GET /api/pendaftaran/kondisi-values - Ambil daftar kondisi value
     */
    public function getKondisiValues(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idField = $queryParams['id_field'] ?? null;
            $fieldName = $queryParams['field_name'] ?? null;
            $includeInactive = isset($queryParams['include_inactive']) && $queryParams['include_inactive'] === 'true';

            $sql = "SELECT 
                        kv.id,
                        kv.id_field,
                        kv.value,
                        kv.value_label,
                        kv.is_active,
                        kv.urutan,
                        kv.tanggal_dibuat,
                        kv.tanggal_update,
                        kf.field_name,
                        kf.field_label
                    FROM psb___kondisi_value kv
                    INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                    WHERE 1=1";
            
            $params = [];
            
            if ($idField) {
                $sql .= " AND kv.id_field = ?";
                $params[] = $idField;
            }
            
            if ($fieldName) {
                $sql .= " AND kf.field_name = ?";
                $params[] = $fieldName;
            }
            
            if (!$includeInactive) {
                $sql .= " AND kv.is_active = 1 AND kf.is_active = 1";
            }
            
            $sql .= " ORDER BY kf.urutan ASC, kv.urutan ASC, kv.value ASC";
            
            try {
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $values = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } catch (\PDOException $e) {
                error_log("Get kondisi values - SQL Error: " . $e->getMessage());
                error_log("Get kondisi values - SQL: " . $sql);
                error_log("Get kondisi values - Params: " . json_encode($params));
                // Jika tabel tidak ada, return array kosong
                if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                    return $this->jsonResponse($response, [
                        'success' => true,
                        'data' => []
                    ], 200);
                }
                throw $e;
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $values
            ], 200);

        } catch (\PDOException $e) {
            // Jika tabel tidak ada, return array kosong (sudah di-handle di try block)
            error_log("Get kondisi values PDO error (outer catch): " . $e->getMessage());
            error_log("Error code: " . $e->getCode());
            // Jika tabel tidak ada, return array kosong
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar kondisi value: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Get kondisi values error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil daftar kondisi value: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/kondisi-value/{id} - Ambil detail kondisi value
     */
    public function getKondisiValue(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kondisi value wajib diisi'
                ], 400);
            }

            $sql = "SELECT 
                        kv.id,
                        kv.id_field,
                        kv.value,
                        kv.value_label,
                        kv.is_active,
                        kv.urutan,
                        kv.tanggal_dibuat,
                        kv.tanggal_update,
                        kf.field_name,
                        kf.field_label
                    FROM psb___kondisi_value kv
                    INNER JOIN psb___kondisi_field kf ON kv.id_field = kf.id
                    WHERE kv.id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            $value = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$value) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi value tidak ditemukan'
                ], 404);
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $value
            ], 200);

        } catch (\Exception $e) {
            error_log("Get kondisi value error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil kondisi value: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/kondisi-value - Buat kondisi value baru
     */
    public function createKondisiValue(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();

            if (!isset($input['id_field']) || empty($input['id_field'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID field wajib diisi'
                ], 400);
            }

            if (!isset($input['value']) || empty($input['value'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Value wajib diisi'
                ], 400);
            }

            $idField = (int)$input['id_field'];
            $value = trim($input['value']);
            $valueLabel = isset($input['value_label']) ? trim($input['value_label']) : $value;
            $isActive = isset($input['is_active']) ? (int)$input['is_active'] : 1;
            $urutan = isset($input['urutan']) && $input['urutan'] !== '' ? (int)$input['urutan'] : null;

            // Cek apakah field ada
            $fieldCheckStmt = $this->db->prepare("SELECT id FROM psb___kondisi_field WHERE id = ?");
            $fieldCheckStmt->execute([$idField]);
            if ($fieldCheckStmt->rowCount() === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi field tidak ditemukan'
                ], 400);
            }

            // Cek apakah value sudah ada untuk field ini
            $checkStmt = $this->db->prepare("SELECT id FROM psb___kondisi_value WHERE id_field = ? AND value = ?");
            $checkStmt->execute([$idField, $value]);
            if ($checkStmt->rowCount() > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Value sudah ada untuk field ini'
                ], 400);
            }

            $sql = "INSERT INTO psb___kondisi_value (id_field, value, value_label, is_active, urutan, tanggal_dibuat, tanggal_update)
                    VALUES (?, ?, ?, ?, ?, NOW(), NOW())";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$idField, $value, $valueLabel, $isActive, $urutan]);
            $id = $this->db->lastInsertId();

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kondisi value berhasil dibuat',
                'data' => ['id' => $id]
            ], 201);

        } catch (\Exception $e) {
            error_log("Create kondisi value error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal membuat kondisi value: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * PUT /api/pendaftaran/kondisi-value/{id} - Update kondisi value
     */
    public function updateKondisiValue(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;
            $input = $request->getParsedBody();

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kondisi value wajib diisi'
                ], 400);
            }

            // Cek apakah value ada
            $checkStmt = $this->db->prepare("SELECT id, id_field, value FROM psb___kondisi_value WHERE id = ?");
            $checkStmt->execute([$id]);
            $value = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$value) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi value tidak ditemukan'
                ], 404);
            }

            $updateFields = [];
            $updateParams = [];

            if (isset($input['value'])) {
                $newValue = trim($input['value']);
                // Cek apakah value baru sudah ada untuk field yang sama
                $duplicateCheckStmt = $this->db->prepare("SELECT id FROM psb___kondisi_value WHERE id_field = ? AND value = ? AND id != ?");
                $duplicateCheckStmt->execute([$value['id_field'], $newValue, $id]);
                if ($duplicateCheckStmt->rowCount() > 0) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Value sudah ada untuk field ini'
                    ], 400);
                }
                $updateFields[] = "value = ?";
                $updateParams[] = $newValue;
            }
            if (isset($input['value_label'])) {
                $updateFields[] = "value_label = ?";
                $updateParams[] = trim($input['value_label']);
            }
            if (isset($input['is_active'])) {
                $updateFields[] = "is_active = ?";
                $updateParams[] = (int)$input['is_active'];
            }
            if (isset($input['urutan']) && $input['urutan'] !== '') {
                $updateFields[] = "urutan = ?";
                $updateParams[] = (int)$input['urutan'];
            }

            if (empty($updateFields)) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak ada data yang diupdate'
                ], 400);
            }

            $updateFields[] = "tanggal_update = NOW()";
            $updateParams[] = $id;

            $sql = "UPDATE psb___kondisi_value SET " . implode(', ', $updateFields) . " WHERE id = ?";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($updateParams);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kondisi value berhasil diupdate'
            ], 200);

        } catch (\Exception $e) {
            error_log("Update kondisi value error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengupdate kondisi value: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * DELETE /api/pendaftaran/kondisi-value/{id} - Hapus kondisi value
     */
    public function deleteKondisiValue(Request $request, Response $response, array $args): Response
    {
        try {
            $id = $args['id'] ?? null;

            if (!$id) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID kondisi value wajib diisi'
                ], 400);
            }

            // Cek apakah value ada
            $checkStmt = $this->db->prepare("SELECT id, value FROM psb___kondisi_value WHERE id = ?");
            $checkStmt->execute([$id]);
            $value = $checkStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$value) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Kondisi value tidak ditemukan'
                ], 404);
            }

            // Cek apakah value digunakan di item set
            $usageCheckStmt = $this->db->prepare("SELECT COUNT(*) as count FROM psb___item_set_kondisi_rel WHERE id_kondisi_value = ?");
            $usageCheckStmt->execute([$id]);
            $usageCount = $usageCheckStmt->fetch(\PDO::FETCH_ASSOC)['count'];

            if ($usageCount > 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Tidak dapat menghapus value karena masih digunakan oleh ' . $usageCount . ' item set'
                ], 400);
            }

            // Hapus value
            $deleteStmt = $this->db->prepare("DELETE FROM psb___kondisi_value WHERE id = ?");
            $deleteStmt->execute([$id]);

            return $this->jsonResponse($response, [
                'success' => true,
                'message' => 'Kondisi value "' . $value['value'] . '" berhasil dihapus'
            ], 200);

        } catch (\Exception $e) {
            error_log("Delete kondisi value error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus kondisi value: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-last-pendaftar - Ambil 10 pendaftar terakhir
     * Support filter: tahun_hijriyah, tahun_masehi
     * Return: no, id, nama, formal (daftar_formal)
     */
    public function getLastPendaftar(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            // Build WHERE clause untuk filter tahun (hijriyah OR masehi)
            $whereConditions = [];
            $params = [];

            if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                // Jika kedua tahun ada, gunakan OR logic
                $whereConditions[] = "(r.tahun_hijriyah = ? OR r.tahun_masehi = ?)";
                $params[] = $tahunHijriyah;
                $params[] = $tahunMasehi;
            } elseif ($tahunHijriyah && $tahunHijriyah !== '') {
                $whereConditions[] = "r.tahun_hijriyah = ?";
                $params[] = $tahunHijriyah;
            } elseif ($tahunMasehi && $tahunMasehi !== '') {
                $whereConditions[] = "r.tahun_masehi = ?";
                $params[] = $tahunMasehi;
            }

            $whereClause = count($whereConditions) > 0 ? "WHERE " . implode(" AND ", $whereConditions) : "";

            // Query untuk mendapatkan 10 pendaftar terakhir dengan JOIN ke tabel santri untuk mendapatkan nama
            // Urut berdasarkan tanggal_dibuat dari tabel psb___registrasi (tanggal registrasi pendaftaran)
            $sql = "SELECT 
                        r.id as id_registrasi,
                        r.id_santri,
                        s.nis,
                        s.nama,
                        r.daftar_formal as formal,
                        r.tanggal_dibuat
                    FROM psb___registrasi r
                    INNER JOIN santri s ON r.id_santri = s.id
                    $whereClause
                    ORDER BY r.tanggal_dibuat DESC, r.id DESC
                    LIMIT 10";
            
            try {
                $stmt = $this->db->prepare($sql);
                $stmt->execute($params);
                $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            } catch (\PDOException $e) {
                error_log("Get last pendaftar - SQL Error: " . $e->getMessage());
                error_log("Get last pendaftar - SQL: " . $sql);
                error_log("Get last pendaftar - Params: " . json_encode($params));
                throw $e;
            }

            // Format data dengan nomor urut (id untuk relasi, nis untuk tampilan)
            $formattedData = array_map(function($row, $index) {
                return [
                    'no' => $index + 1,
                    'id' => (int)$row['id_santri'],
                    'nis' => $row['nis'] ?? null,
                    'nama' => $row['nama'] ?? '-',
                    'formal' => $row['formal'] ?? '-'
                ];
            }, $results, array_keys($results));

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);

        } catch (\PDOException $e) {
            // Jika tabel tidak ada, return array kosong
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                error_log("Get last pendaftar - Tabel tidak ada: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }
            error_log("Get last pendaftar PDO error: " . $e->getMessage());
            error_log("Error code: " . $e->getCode());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pendaftar terakhir: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Get last pendaftar error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pendaftar terakhir: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/dashboard - Ambil statistik dashboard pendaftaran
     */
    public function getDashboard(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            // Build WHERE clause untuk filter tahun (hijriyah OR masehi)
            $whereConditions = [];
            $params = [];

            if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                // Jika kedua tahun ada, gunakan OR logic
                $whereConditions[] = "(r.tahun_hijriyah = ? OR r.tahun_masehi = ?)";
                $params[] = $tahunHijriyah;
                $params[] = $tahunMasehi;
            } elseif ($tahunHijriyah && $tahunHijriyah !== '') {
                $whereConditions[] = "r.tahun_hijriyah = ?";
                $params[] = $tahunHijriyah;
            } elseif ($tahunMasehi && $tahunMasehi !== '') {
                $whereConditions[] = "r.tahun_masehi = ?";
                $params[] = $tahunMasehi;
            }

            $whereClause = count($whereConditions) > 0 ? "WHERE " . implode(" AND ", $whereConditions) : "";

            // Total pendaftar
            $sqlTotal = "SELECT COUNT(DISTINCT r.id_santri) as total_pendaftar 
                        FROM psb___registrasi r
                        $whereClause";
            try {
                $stmtTotal = $this->db->prepare($sqlTotal);
                $stmtTotal->execute($params);
            } catch (\PDOException $e) {
                error_log("Get dashboard - SQL Total Error: " . $e->getMessage());
                error_log("Get dashboard - SQL: " . $sqlTotal);
                error_log("Get dashboard - Params: " . json_encode($params));
                throw $e;
            }
            $totalData = $stmtTotal->fetch(\PDO::FETCH_ASSOC);
            $totalPendaftar = (int)($totalData['total_pendaftar'] ?? 0);

            // Total santri baru (dari kolom status_pendaftar = 'santri baru')
            $whereSantriBaruConditions = $whereConditions;
            $whereSantriBaruConditions[] = "TRIM(LOWER(IFNULL(r.status_pendaftar,''))) = 'santri baru'";
            $whereSantriBaruClause = count($whereSantriBaruConditions) > 0 ? "WHERE " . implode(" AND ", $whereSantriBaruConditions) : "";
            $sqlSantriBaru = "SELECT COUNT(DISTINCT r.id_santri) as total_santri_baru 
                              FROM psb___registrasi r
                              $whereSantriBaruClause";
            try {
                $stmtSantriBaru = $this->db->prepare($sqlSantriBaru);
                $stmtSantriBaru->execute($params);
            } catch (\PDOException $e) {
                error_log("Get dashboard - SQL Santri Baru Error: " . $e->getMessage());
                throw $e;
            }
            $santriBaruData = $stmtSantriBaru->fetch(\PDO::FETCH_ASSOC);
            $totalSantriBaru = (int)($santriBaruData['total_santri_baru'] ?? 0);

            // Total pendaftar formal: dari daftar_formal, kecuali null / '' / 'Sudah sekolah' / 'Tidak Sekolah'
            $whereFormalConditions = $whereConditions;
            $whereFormalConditions[] = "r.daftar_formal IS NOT NULL AND TRIM(r.daftar_formal) != ''";
            $whereFormalConditions[] = "LOWER(TRIM(r.daftar_formal)) NOT IN ('sudah sekolah', 'tidak sekolah')";
            $whereFormalClause = count($whereFormalConditions) > 0 ? "WHERE " . implode(" AND ", $whereFormalConditions) : "";
            $sqlFormal = "SELECT COUNT(DISTINCT r.id_santri) as total_formal 
                         FROM psb___registrasi r
                         $whereFormalClause";
            try {
                $stmtFormal = $this->db->prepare($sqlFormal);
                $stmtFormal->execute($params);
            } catch (\PDOException $e) {
                error_log("Get dashboard - SQL Formal Error: " . $e->getMessage());
                error_log("Get dashboard - SQL: " . $sqlFormal);
                error_log("Get dashboard - Params: " . json_encode($params));
                throw $e;
            }
            $formalData = $stmtFormal->fetch(\PDO::FETCH_ASSOC);
            $totalFormal = (int)($formalData['total_formal'] ?? 0);

            // Total pendaftar diniyah: dari daftar_diniyah, kecuali null / '' / 'Sudah sekolah' / 'Tidak Sekolah'
            $whereDiniyahConditions = $whereConditions;
            $whereDiniyahConditions[] = "r.daftar_diniyah IS NOT NULL AND TRIM(r.daftar_diniyah) != ''";
            $whereDiniyahConditions[] = "LOWER(TRIM(r.daftar_diniyah)) NOT IN ('sudah sekolah', 'tidak sekolah')";
            $whereDiniyahClause = count($whereDiniyahConditions) > 0 ? "WHERE " . implode(" AND ", $whereDiniyahConditions) : "";
            $sqlDiniyah = "SELECT COUNT(DISTINCT r.id_santri) as total_diniyah 
                          FROM psb___registrasi r
                          $whereDiniyahClause";
            try {
                $stmtDiniyah = $this->db->prepare($sqlDiniyah);
                $stmtDiniyah->execute($params);
            } catch (\PDOException $e) {
                error_log("Get dashboard - SQL Diniyah Error: " . $e->getMessage());
                error_log("Get dashboard - SQL: " . $sqlDiniyah);
                error_log("Get dashboard - Params: " . json_encode($params));
                throw $e;
            }
            $diniyahData = $stmtDiniyah->fetch(\PDO::FETCH_ASSOC);
            $totalDiniyah = (int)($diniyahData['total_diniyah'] ?? 0);

            // Total pendaftar bulan ini
            $whereBulanIniConditions = $whereConditions;
            $whereBulanIniConditions[] = "YEAR(r.tanggal_dibuat) = YEAR(CURDATE()) AND MONTH(r.tanggal_dibuat) = MONTH(CURDATE())";
            $whereBulanIniClause = count($whereBulanIniConditions) > 0 ? "WHERE " . implode(" AND ", $whereBulanIniConditions) : "";
            $sqlBulanIni = "SELECT COUNT(DISTINCT r.id_santri) as total_bulan_ini 
                           FROM psb___registrasi r
                           $whereBulanIniClause";
            try {
                $stmtBulanIni = $this->db->prepare($sqlBulanIni);
                $stmtBulanIni->execute($params);
            } catch (\PDOException $e) {
                error_log("Get dashboard - SQL Bulan Ini Error: " . $e->getMessage());
                error_log("Get dashboard - SQL: " . $sqlBulanIni);
                error_log("Get dashboard - Params: " . json_encode($params));
                throw $e;
            }
            $bulanIniData = $stmtBulanIni->fetch(\PDO::FETCH_ASSOC);
            $totalBulanIni = (int)($bulanIniData['total_bulan_ini'] ?? 0);

            // Total pendaftar hari ini
            $whereHariIniConditions = $whereConditions;
            $whereHariIniConditions[] = "DATE(r.tanggal_dibuat) = CURDATE()";
            $whereHariIniClause = count($whereHariIniConditions) > 0 ? "WHERE " . implode(" AND ", $whereHariIniConditions) : "";
            $sqlHariIni = "SELECT COUNT(DISTINCT r.id_santri) as total_hari_ini 
                           FROM psb___registrasi r
                           $whereHariIniClause";
            try {
                $stmtHariIni = $this->db->prepare($sqlHariIni);
                $stmtHariIni->execute($params);
            } catch (\PDOException $e) {
                error_log("Get dashboard - SQL Hari Ini Error: " . $e->getMessage());
                throw $e;
            }
            $hariIniData = $stmtHariIni->fetch(\PDO::FETCH_ASSOC);
            $totalHariIni = (int)($hariIniData['total_hari_ini'] ?? 0);

            // Breakdown per isi daftar_formal (untuk diagram lingkaran Formal); kecuali Sudah sekolah / Tidak Sekolah
            $formalBreakdown = [];
            try {
                $baseFormal = "r.daftar_formal IS NOT NULL AND TRIM(r.daftar_formal) != '' AND LOWER(TRIM(r.daftar_formal)) NOT IN ('sudah sekolah', 'tidak sekolah')";
                $whereFormalBreakdown = $whereClause ? $whereClause . " AND " . $baseFormal : "WHERE " . $baseFormal;
                $sqlFormalBreakdown = "SELECT r.daftar_formal AS label, COUNT(DISTINCT r.id_santri) AS count 
                    FROM psb___registrasi r 
                    $whereFormalBreakdown 
                    GROUP BY r.daftar_formal 
                    ORDER BY count DESC";
                $stmtFormalBreakdown = $this->db->prepare($sqlFormalBreakdown);
                $stmtFormalBreakdown->execute($params);
                while ($row = $stmtFormalBreakdown->fetch(\PDO::FETCH_ASSOC)) {
                    $formalBreakdown[] = ['label' => $row['label'], 'count' => (int)$row['count']];
                }
            } catch (\PDOException $e) {
                error_log("Get dashboard formal breakdown: " . $e->getMessage());
            }

            // Breakdown per isi daftar_diniyah (untuk diagram lingkaran Diniyah); kecuali Sudah sekolah / Tidak Sekolah
            $diniyahBreakdown = [];
            try {
                $baseDiniyah = "r.daftar_diniyah IS NOT NULL AND TRIM(r.daftar_diniyah) != '' AND LOWER(TRIM(r.daftar_diniyah)) NOT IN ('sudah sekolah', 'tidak sekolah')";
                $whereDiniyahBreakdown = $whereClause ? $whereClause . " AND " . $baseDiniyah : "WHERE " . $baseDiniyah;
                $sqlDiniyahBreakdown = "SELECT r.daftar_diniyah AS label, COUNT(DISTINCT r.id_santri) AS count 
                    FROM psb___registrasi r 
                    $whereDiniyahBreakdown 
                    GROUP BY r.daftar_diniyah 
                    ORDER BY count DESC";
                $stmtDiniyahBreakdown = $this->db->prepare($sqlDiniyahBreakdown);
                $stmtDiniyahBreakdown->execute($params);
                while ($row = $stmtDiniyahBreakdown->fetch(\PDO::FETCH_ASSOC)) {
                    $diniyahBreakdown[] = ['label' => $row['label'], 'count' => (int)$row['count']];
                }
            } catch (\PDOException $e) {
                error_log("Get dashboard diniyah breakdown: " . $e->getMessage());
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'total_pendaftar' => $totalPendaftar,
                    'total_santri_baru' => $totalSantriBaru,
                    'total_formal' => $totalFormal,
                    'total_diniyah' => $totalDiniyah,
                    'total_bulan_ini' => $totalBulanIni,
                    'total_hari_ini' => $totalHariIni,
                    'formal_breakdown' => $formalBreakdown,
                    'diniyah_breakdown' => $diniyahBreakdown
                ]
            ], 200);

        } catch (\PDOException $e) {
            // Jika tabel tidak ada, return data kosong
            if ($e->getCode() == '42S02' || strpos($e->getMessage(), "doesn't exist") !== false) {
                error_log("Get dashboard pendaftaran - Tabel tidak ada: " . $e->getMessage());
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => [
                        'total_pendaftar' => 0,
                        'total_santri_baru' => 0,
                        'total_formal' => 0,
                        'total_diniyah' => 0,
                        'total_bulan_ini' => 0,
                        'total_hari_ini' => 0,
                        'formal_breakdown' => [],
                        'diniyah_breakdown' => []
                    ]
                ], 200);
            }
            error_log("Get dashboard pendaftaran PDO error: " . $e->getMessage());
            error_log("Error code: " . $e->getCode());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data dashboard: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            error_log("Get dashboard pendaftaran error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data dashboard: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/pendapatan-hari-ini - Total nominal transaksi pendaftaran hari ini (filter tahun ajaran)
     * Query: tahun_hijriyah, tahun_masehi (opsional)
     */
    public function getPendapatanHariIni(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            $whereConditions = [];
            $params = [];

            if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                $whereConditions[] = "(r.tahun_hijriyah = ? OR r.tahun_masehi = ?)";
                $params[] = $tahunHijriyah;
                $params[] = $tahunMasehi;
            } elseif ($tahunHijriyah && $tahunHijriyah !== '') {
                $whereConditions[] = "r.tahun_hijriyah = ?";
                $params[] = $tahunHijriyah;
            } elseif ($tahunMasehi && $tahunMasehi !== '') {
                $whereConditions[] = "r.tahun_masehi = ?";
                $params[] = $tahunMasehi;
            }

            $whereConditions[] = "DATE(t.tanggal_dibuat) = CURDATE()";
            $whereClause = "WHERE " . implode(" AND ", $whereConditions);

            $sql = "SELECT COALESCE(SUM(t.nominal), 0) AS total_pendapatan_hari_ini,
                           COUNT(t.id) AS jumlah_transaksi
                    FROM psb___transaksi t
                    INNER JOIN psb___registrasi r ON t.id_registrasi = r.id
                    $whereClause";
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $total = (float)($row['total_pendapatan_hari_ini'] ?? 0);
            $jumlahTransaksi = (int)($row['jumlah_transaksi'] ?? 0);

            // Pendapatan hari ini untuk admin yang login (sama seperti UWABA: admin + total)
            $totalAdmin = 0;
            $jumlahTransaksiAdmin = 0;
            $rincianViaAdmin = [];
            $user = $request->getAttribute('user');
            $idAdmin = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($idAdmin !== null) {
                $whereAdmin = $whereClause . " AND t.id_admin = ?";
                $paramsAdmin = array_merge($params, [$idAdmin]);
                $sqlAdmin = "SELECT COALESCE(SUM(t.nominal), 0) AS total, COUNT(t.id) AS jumlah
                             FROM psb___transaksi t
                             INNER JOIN psb___registrasi r ON t.id_registrasi = r.id
                             $whereAdmin";
                $stmtAdmin = $this->db->prepare($sqlAdmin);
                $stmtAdmin->execute($paramsAdmin);
                $rowAdmin = $stmtAdmin->fetch(\PDO::FETCH_ASSOC);
                $totalAdmin = (float)($rowAdmin['total'] ?? 0);
                $jumlahTransaksiAdmin = (int)($rowAdmin['jumlah'] ?? 0);
                try {
                    $sqlViaAdmin = "SELECT t.via AS via, COALESCE(SUM(t.nominal), 0) AS nominal
                                   FROM psb___transaksi t
                                   INNER JOIN psb___registrasi r ON t.id_registrasi = r.id
                                   $whereAdmin
                                   GROUP BY t.via ORDER BY nominal DESC";
                    $stmtViaAdmin = $this->db->prepare($sqlViaAdmin);
                    $stmtViaAdmin->execute($paramsAdmin);
                    while ($r = $stmtViaAdmin->fetch(\PDO::FETCH_ASSOC)) {
                        $rincianViaAdmin[$r['via'] ?? 'Lainnya'] = (float)($r['nominal'] ?? 0);
                    }
                } catch (\PDOException $e) {
                    // ignore
                }
            }

            $rincianVia = [];
            try {
                $sqlVia = "SELECT t.via AS via, COALESCE(SUM(t.nominal), 0) AS nominal
                           FROM psb___transaksi t
                           INNER JOIN psb___registrasi r ON t.id_registrasi = r.id
                           $whereClause
                           GROUP BY t.via
                           ORDER BY nominal DESC";
                $stmtVia = $this->db->prepare($sqlVia);
                $stmtVia->execute($params);
                while ($rowVia = $stmtVia->fetch(\PDO::FETCH_ASSOC)) {
                    $via = $rowVia['via'] ?? 'Lainnya';
                    $rincianVia[$via] = (float)($rowVia['nominal'] ?? 0);
                }
            } catch (\PDOException $e) {
                error_log("Get pendapatan hari ini rincian via: " . $e->getMessage());
            }

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => [
                    'total_pendapatan_hari_ini' => $total,
                    'jumlah_transaksi' => $jumlahTransaksi,
                    'total_pendapatan_hari_ini_admin' => $totalAdmin,
                    'jumlah_transaksi_admin' => $jumlahTransaksiAdmin,
                    'rincian_via' => $rincianVia,
                    'rincian_via_admin' => $rincianViaAdmin
                ]
            ], 200);
        } catch (\PDOException $e) {
            error_log("Get pendapatan hari ini PDO error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => true,
                'data' => ['total_pendapatan_hari_ini' => 0, 'jumlah_transaksi' => 0, 'total_pendapatan_hari_ini_admin' => 0, 'jumlah_transaksi_admin' => 0, 'rincian_via' => [], 'rincian_via_admin' => []]
            ], 200);
        } catch (\Exception $e) {
            error_log("Get pendapatan hari ini error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil pendapatan hari ini: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-all-pendaftar - Ambil semua pendaftar dengan detail lengkap
     * Support filter: tahun_hijriyah, tahun_masehi
     * Return: id, nama, formal, tahun_hijriyah, tahun_masehi, dll
     */
    public function getAllPendaftar(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi = $queryParams['tahun_masehi'] ?? null;

            // Build WHERE clause untuk filter tahun
            $whereConditions = [];
            $params = [];

            if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                $whereConditions[] = "r.tahun_hijriyah = ? AND r.tahun_masehi = ?";
                $params[] = $tahunHijriyah;
                $params[] = $tahunMasehi;
            } elseif ($tahunHijriyah && $tahunHijriyah !== '') {
                $whereConditions[] = "r.tahun_hijriyah = ?";
                $params[] = $tahunHijriyah;
            } elseif ($tahunMasehi && $tahunMasehi !== '') {
                $whereConditions[] = "r.tahun_masehi = ?";
                $params[] = $tahunMasehi;
            }

            $whereClause = count($whereConditions) > 0 ? "WHERE " . implode(" AND ", $whereConditions) : "";

            // Query: semua kolom santri (kecuali admin, grup = private/internal) + kolom registrasi
            // wajib_from_detail = total harga item dari detail registrasi (psb___registrasi_detail + psb___item)
            $sql = "SELECT 
                        r.id as id_registrasi,
                        r.id_santri,
                        (SELECT COALESCE(SUM(i.harga), 0) FROM psb___registrasi_detail rd INNER JOIN psb___item i ON rd.id_item = i.id WHERE rd.id_registrasi = r.id) AS wajib_from_detail,
                        r.wajib,
                        r.bayar,
                        r.kurang,
                        r.daftar_formal as formal,
                        r.daftar_diniyah as diniyah,
                        r.tahun_hijriyah,
                        r.tahun_masehi,
                        r.tanggal_dibuat,
                        r.tanggal_update,
                        r.tanggal_biodata_simpan,
                        r.tanggal_berkas_lengkap,
                        r.tanggal_pembayaran_pertama,
                        r.tanggal_diverifikasi,
                        r.id_pengurus_verifikasi,
                        r.tanggal_aktif_pondok,
                        r.id_pengurus_aktif,
                        r.status_pendaftar,
                        r.status_murid,
                        r.status_santri,
                        r.keterangan_status,
                        r.gelombang,
                        r.prodi,
                        s.nama,
                        s.nik,
                        s.nis,
                        s.gender,
                        s.tempat_lahir,
                        s.tanggal_lahir,
                        s.nisn,
                        s.no_kk,
                        s.kepala_keluarga,
                        s.anak_ke,
                        s.jumlah_saudara,
                        s.saudara_di_pesantren,
                        s.hobi,
                        s.cita_cita,
                        s.kebutuhan_khusus,
                        s.ayah,
                        s.status_ayah,
                        s.nik_ayah,
                        s.tempat_lahir_ayah,
                        s.tanggal_lahir_ayah,
                        s.pekerjaan_ayah,
                        s.pendidikan_ayah,
                        s.penghasilan_ayah,
                        s.ibu,
                        s.status_ibu,
                        s.nik_ibu,
                        s.tempat_lahir_ibu,
                        s.tanggal_lahir_ibu,
                        s.pekerjaan_ibu,
                        s.pendidikan_ibu,
                        s.penghasilan_ibu,
                        s.hubungan_wali,
                        s.wali,
                        s.nik_wali,
                        s.tempat_lahir_wali,
                        s.tanggal_lahir_wali,
                        s.pekerjaan_wali,
                        s.pendidikan_wali,
                        s.penghasilan_wali,
                        s.dusun,
                        s.rt,
                        s.rw,
                        s.desa,
                        s.kecamatan,
                        s.kabupaten,
                        s.provinsi,
                        s.kode_pos,
                        CONCAT_WS(', ', NULLIF(TRIM(s.dusun), ''), NULLIF(TRIM(s.rt), ''), NULLIF(TRIM(s.rw), ''), NULLIF(TRIM(s.desa), ''), NULLIF(TRIM(s.kecamatan), ''), NULLIF(TRIM(s.kabupaten), ''), NULLIF(TRIM(s.provinsi), '')) as alamat,
                        s.madrasah,
                        s.nama_madrasah,
                        s.alamat_madrasah,
                        s.lulus_madrasah,
                        s.sekolah,
                        s.nama_sekolah,
                        s.alamat_sekolah,
                        s.lulus_sekolah,
                        s.npsn,
                        s.nsm,
                        s.no_telpon,
                        s.email,
                        s.riwayat_sakit,
                        s.ukuran_baju,
                        s.kip,
                        s.pkh,
                        s.kks,
                        s.status_nikah,
                        s.pekerjaan,
                        s.no_wa_santri,
                        s.kategori,
                        s.id_kamar,
                        dk.id_daerah,
                        d.daerah,
                        dk.kamar,
                        rd.lembaga_id as diniyah_santri,
                        rd.kelas as kelas_diniyah,
                        rd.kel as kel_diniyah,
                        s.nim_diniyah,
                        rf.lembaga_id as formal_santri,
                        rf.kelas as kelas_formal,
                        rf.kel as kel_formal,
                        s.nim_formal,
                        s.lttq,
                        s.kelas_lttq,
                        s.kel_lttq,
                        pv.nama as nama_pengurus_verifikasi,
                        pa.nama as nama_pengurus_aktif
                    FROM psb___registrasi r
                    INNER JOIN santri s ON r.id_santri = s.id
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    LEFT JOIN pengurus pv ON r.id_pengurus_verifikasi = pv.id
                    LEFT JOIN pengurus pa ON r.id_pengurus_aktif = pa.id
                    $whereClause
                    ORDER BY r.id DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Format data: nomor urut + semua kolom santri (kecuali private) + kolom registrasi
            $formattedData = array_map(function($row, $index) {
                $alamat = $row['alamat'] ?? null;
                if (is_string($alamat) && trim($alamat) === '') {
                    $alamat = null;
                }
                $pick = function($key, $default = null) use ($row) {
                    return array_key_exists($key, $row) ? $row[$key] : $default;
                };
                return [
                    'no' => $index + 1,
                    'id' => (int)$row['id_santri'],
                    'nis' => $pick('nis'),
                    'id_registrasi' => (int)$row['id_registrasi'],
                    'nama' => $pick('nama', '-'),
                    'nik' => $pick('nik', '-'),
                    'gender' => $pick('gender'),
                    'tempat_lahir' => $pick('tempat_lahir'),
                    'tanggal_lahir' => $pick('tanggal_lahir'),
                    'nisn' => $pick('nisn'),
                    'no_kk' => $pick('no_kk'),
                    'kepala_keluarga' => $pick('kepala_keluarga'),
                    'anak_ke' => $pick('anak_ke'),
                    'jumlah_saudara' => $pick('jumlah_saudara'),
                    'saudara_di_pesantren' => $pick('saudara_di_pesantren'),
                    'hobi' => $pick('hobi'),
                    'cita_cita' => $pick('cita_cita'),
                    'kebutuhan_khusus' => $pick('kebutuhan_khusus'),
                    'ayah' => $pick('ayah'),
                    'status_ayah' => $pick('status_ayah'),
                    'nik_ayah' => $pick('nik_ayah'),
                    'tempat_lahir_ayah' => $pick('tempat_lahir_ayah'),
                    'tanggal_lahir_ayah' => $pick('tanggal_lahir_ayah'),
                    'pekerjaan_ayah' => $pick('pekerjaan_ayah'),
                    'pendidikan_ayah' => $pick('pendidikan_ayah'),
                    'penghasilan_ayah' => $pick('penghasilan_ayah'),
                    'ibu' => $pick('ibu'),
                    'status_ibu' => $pick('status_ibu'),
                    'nik_ibu' => $pick('nik_ibu'),
                    'tempat_lahir_ibu' => $pick('tempat_lahir_ibu'),
                    'tanggal_lahir_ibu' => $pick('tanggal_lahir_ibu'),
                    'pekerjaan_ibu' => $pick('pekerjaan_ibu'),
                    'pendidikan_ibu' => $pick('pendidikan_ibu'),
                    'penghasilan_ibu' => $pick('penghasilan_ibu'),
                    'hubungan_wali' => $pick('hubungan_wali'),
                    'wali' => $pick('wali'),
                    'nik_wali' => $pick('nik_wali'),
                    'tempat_lahir_wali' => $pick('tempat_lahir_wali'),
                    'tanggal_lahir_wali' => $pick('tanggal_lahir_wali'),
                    'pekerjaan_wali' => $pick('pekerjaan_wali'),
                    'pendidikan_wali' => $pick('pendidikan_wali'),
                    'penghasilan_wali' => $pick('penghasilan_wali'),
                    'dusun' => $pick('dusun'),
                    'rt' => $pick('rt'),
                    'rw' => $pick('rw'),
                    'desa' => $pick('desa'),
                    'kecamatan' => $pick('kecamatan'),
                    'kabupaten' => $pick('kabupaten'),
                    'provinsi' => $pick('provinsi'),
                    'kode_pos' => $pick('kode_pos'),
                    'alamat' => $alamat,
                    'madrasah' => $pick('madrasah'),
                    'nama_madrasah' => $pick('nama_madrasah'),
                    'alamat_madrasah' => $pick('alamat_madrasah'),
                    'lulus_madrasah' => $pick('lulus_madrasah'),
                    'sekolah' => $pick('sekolah'),
                    'nama_sekolah' => $pick('nama_sekolah'),
                    'alamat_sekolah' => $pick('alamat_sekolah'),
                    'lulus_sekolah' => $pick('lulus_sekolah'),
                    'npsn' => $pick('npsn'),
                    'nsm' => $pick('nsm'),
                    'no_telpon' => $pick('no_telpon'),
                    'email' => $pick('email'),
                    'riwayat_sakit' => $pick('riwayat_sakit'),
                    'ukuran_baju' => $pick('ukuran_baju'),
                    'kip' => $pick('kip'),
                    'pkh' => $pick('pkh'),
                    'kks' => $pick('kks'),
                    'status_nikah' => $pick('status_nikah'),
                    'pekerjaan' => $pick('pekerjaan'),
                    'no_wa_santri' => $pick('no_wa_santri'),
                    'kategori' => $pick('kategori'),
                    'id_kamar' => $pick('id_kamar') !== null ? (int) $pick('id_kamar') : null,
                    'id_daerah' => $pick('id_daerah') !== null ? (int) $pick('id_daerah') : null,
                    'daerah' => $pick('daerah'),
                    'kamar' => $pick('kamar'),
                    'diniyah_santri' => $pick('diniyah_santri'),
                    'kelas_diniyah' => $pick('kelas_diniyah'),
                    'kel_diniyah' => $pick('kel_diniyah'),
                    'nim_diniyah' => $pick('nim_diniyah'),
                    'formal_santri' => $pick('formal_santri'),
                    'kelas_formal' => $pick('kelas_formal'),
                    'kel_formal' => $pick('kel_formal'),
                    'nim_formal' => $pick('nim_formal'),
                    'lttq' => $pick('lttq'),
                    'kelas_lttq' => $pick('kelas_lttq'),
                    'kel_lttq' => $pick('kel_lttq'),
                    'formal' => $pick('formal_santri', $pick('formal', '-')),
                    'diniyah' => $pick('diniyah_santri', $pick('diniyah', '-')),
                    'daftar_formal' => $pick('formal', '-'),
                    'daftar_diniyah' => $pick('diniyah', '-'),
                    'tahun_hijriyah' => $pick('tahun_hijriyah'),
                    'tahun_masehi' => $pick('tahun_masehi'),
                    'tanggal_dibuat' => $pick('tanggal_dibuat'),
                    'tanggal_update' => $pick('tanggal_update'),
                    'tanggal_biodata_simpan' => $pick('tanggal_biodata_simpan'),
                    'tanggal_berkas_lengkap' => $pick('tanggal_berkas_lengkap'),
                    'tanggal_pembayaran_pertama' => $pick('tanggal_pembayaran_pertama'),
                    'tanggal_diverifikasi' => $pick('tanggal_diverifikasi'),
                    'id_pengurus_verifikasi' => $pick('id_pengurus_verifikasi'),
                    'nama_pengurus_verifikasi' => $pick('nama_pengurus_verifikasi'),
                    'tanggal_aktif_pondok' => $pick('tanggal_aktif_pondok'),
                    'id_pengurus_aktif' => $pick('id_pengurus_aktif'),
                    'nama_pengurus_aktif' => $pick('nama_pengurus_aktif'),
                    'status_pendaftar' => $pick('status_pendaftar'),
                    'status_murid' => $pick('status_murid'),
                    'status_santri' => $pick('status_santri'),
                    'keterangan_status' => $pick('keterangan_status'),
                    'gelombang' => $pick('gelombang'),
                    'prodi' => $pick('prodi'),
                    'wajib' => isset($row['wajib_from_detail']) ? (float)$row['wajib_from_detail'] : (isset($row['wajib']) ? (float)$row['wajib'] : null),
                    'bayar' => isset($row['bayar']) ? (float)$row['bayar'] : null,
                    'kurang' => isset($row['wajib_from_detail']) && isset($row['bayar']) ? (float) max(0, (float)$row['wajib_from_detail'] - (float)$row['bayar']) : (isset($row['kurang']) ? (float)$row['kurang'] : null)
                ];
            }, $results, array_keys($results));

            // Jangan catat aktivitas "export" di sini: endpoint ini dipakai untuk menampilkan daftar (load/refresh),
            // bukan hanya saat user menekan Export. Export di frontend dilakukan client-side dari data yang sudah dimuat.

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);

        } catch (\Exception $e) {
            error_log("Get all pendaftar error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data pendaftar: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/get-all-registrasi-by-santri - Ambil semua registrasi berdasarkan id_santri
     */
    public function getAllRegistrasiBySantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $idSantri = $queryParams['id_santri'] ?? null;

            if (!$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri wajib diisi'
                ], 400);
            }

            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Query untuk mendapatkan semua registrasi berdasarkan id_santri (dengan wajib, bayar, kurang, status, diniyah, formal)
            $sql = "SELECT 
                        r.id as id_registrasi,
                        r.id_santri,
                        s.nis,
                        r.tahun_hijriyah,
                        r.tahun_masehi,
                        r.tanggal_dibuat,
                        r.status_pendaftar,
                        r.status_murid,
                        r.status_santri,
                        r.keterangan_status,
                        r.daftar_diniyah,
                        r.daftar_formal,
                        r.wajib,
                        r.bayar,
                        r.kurang
                    FROM psb___registrasi r
                    LEFT JOIN santri s ON r.id_santri = s.id
                    WHERE r.id_santri = ?
                    ORDER BY r.tahun_hijriyah DESC, r.tahun_masehi DESC, r.tanggal_dibuat DESC";
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$resolvedId]);
            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            $idRegistrasiList = array_filter(array_map(function ($row) {
                return (int)($row['id_registrasi'] ?? 0);
            }, $results));

            // Ambil transaksi per registrasi (satu baris per transaksi, JOIN payment per t.id)
            $transaksiByRegistrasi = [];
            if (!empty($idRegistrasiList)) {
                $placeholders = implode(',', array_fill(0, count($idRegistrasiList), '?'));
                $sqlTx = "SELECT t.id, t.id_registrasi, t.nominal, t.via, t.hijriyah, t.masehi, t.tanggal_dibuat,
                                 pay.id_payment_transaction, pay_trx.session_id, pay_trx.status as transaction_status,
                                 pay_trx.payment_method, pay_trx.payment_channel, pay_trx.va_number, pay_trx.qr_code,
                                 pay_trx.payment_url, pay_trx.trx_id as ipaymu_transaction_id
                          FROM psb___transaksi t
                          LEFT JOIN payment pay ON pay.id_referensi = t.id AND pay.tabel_referensi = 'psb___transaksi'
                          LEFT JOIN payment___transaction pay_trx ON pay.id_payment_transaction = pay_trx.id
                          WHERE t.id_registrasi IN ({$placeholders})
                          ORDER BY t.id_registrasi, t.tanggal_dibuat DESC";
                $stmtTx = $this->db->prepare($sqlTx);
                $stmtTx->execute($idRegistrasiList);
                $allTx = $stmtTx->fetchAll(\PDO::FETCH_ASSOC);
                foreach ($allTx as $tx) {
                    $rid = (int)($tx['id_registrasi'] ?? 0);
                    if (!isset($transaksiByRegistrasi[$rid])) {
                        $transaksiByRegistrasi[$rid] = [];
                    }
                    $tid = $tx['id'] ?? null;
                    if ($tid !== null && !isset($transaksiByRegistrasi[$rid][$tid])) {
                        $transaksiByRegistrasi[$rid][$tid] = $tx;
                    }
                }
                foreach (array_keys($transaksiByRegistrasi) as $rid) {
                    $transaksiByRegistrasi[$rid] = array_values($transaksiByRegistrasi[$rid]);
                }
            }

            // Format data (sertakan wajib, bayar, kurang, transaksi per tahun)
            $formattedData = array_map(function ($row) use ($transaksiByRegistrasi) {
                $idReg = (int)$row['id_registrasi'];
                $wajib = isset($row['wajib']) ? (int)$row['wajib'] : null;
                $bayar = isset($row['bayar']) ? (int)$row['bayar'] : null;
                $kurang = isset($row['kurang']) ? (int)$row['kurang'] : null;
                return [
                    'id_registrasi' => $idReg,
                    'id_santri' => (int)$row['id_santri'],
                    'nis' => $row['nis'] ?? null,
                    'tahun_hijriyah' => $row['tahun_hijriyah'] ?? null,
                    'tahun_masehi' => $row['tahun_masehi'] ?? null,
                    'tanggal_dibuat' => $row['tanggal_dibuat'] ?? null,
                    'status_pendaftar' => $row['status_pendaftar'] ?? null,
                    'status_murid' => $row['status_murid'] ?? null,
                    'status_santri' => $row['status_santri'] ?? null,
                    'keterangan_status' => $row['keterangan_status'] ?? null,
                    'daftar_diniyah' => $row['daftar_diniyah'] ?? null,
                    'daftar_formal' => $row['daftar_formal'] ?? null,
                    'wajib' => $wajib,
                    'bayar' => $bayar,
                    'kurang' => $kurang,
                    'transaksi' => $transaksiByRegistrasi[$idReg] ?? []
                ];
            }, $results);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);

        } catch (\Exception $e) {
            error_log("Get all registrasi by santri error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/delete-registrasi - Hapus registrasi (dan santri jika diperlukan)
     */
    public function deleteRegistrasi(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id_registrasi']) || !is_array($input['id_registrasi']) || count($input['id_registrasi']) === 0) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_registrasi wajib diisi dan harus berupa array'
                ], 400);
            }

            $idRegistrasiList = $input['id_registrasi'];
            $hapusDiTabelSantri = isset($input['hapus_di_tabel_santri']) && $input['hapus_di_tabel_santri'] === true;

            $this->db->beginTransaction();

            try {
                // Ambil id_santri dari registrasi yang akan dihapus
                $placeholders = implode(',', array_fill(0, count($idRegistrasiList), '?'));
                $sqlGetSantri = "SELECT DISTINCT id_santri FROM psb___registrasi WHERE id IN ($placeholders)";
                $stmtGetSantri = $this->db->prepare($sqlGetSantri);
                $stmtGetSantri->execute($idRegistrasiList);
                $santriIds = $stmtGetSantri->fetchAll(\PDO::FETCH_COLUMN);

                // Hapus registrasi detail terlebih dahulu (foreign key constraint)
                $sqlDeleteDetail = "DELETE FROM psb___registrasi_detail WHERE id_registrasi IN ($placeholders)";
                $stmtDeleteDetail = $this->db->prepare($sqlDeleteDetail);
                $stmtDeleteDetail->execute($idRegistrasiList);

                // Hapus transaksi terkait (jika ada)
                $sqlDeleteTransaksi = "DELETE FROM psb___transaksi WHERE id_registrasi IN ($placeholders)";
                $stmtDeleteTransaksi = $this->db->prepare($sqlDeleteTransaksi);
                $stmtDeleteTransaksi->execute($idRegistrasiList);

                // Hapus registrasi
                $sqlDeleteRegistrasi = "DELETE FROM psb___registrasi WHERE id IN ($placeholders)";
                $stmtDeleteRegistrasi = $this->db->prepare($sqlDeleteRegistrasi);
                $stmtDeleteRegistrasi->execute($idRegistrasiList);

                // Jika checkbox "Hapus Di tabel santri" dicentang, hapus data santri
                if ($hapusDiTabelSantri && count($santriIds) > 0) {
                    // Hapus berkas santri terlebih dahulu
                    $santriPlaceholders = implode(',', array_fill(0, count($santriIds), '?'));
                    $sqlDeleteBerkas = "DELETE FROM santri___berkas WHERE id_santri IN ($santriPlaceholders)";
                    $stmtDeleteBerkas = $this->db->prepare($sqlDeleteBerkas);
                    $stmtDeleteBerkas->execute($santriIds);

                    // Hapus data santri
                    $sqlDeleteSantri = "DELETE FROM santri WHERE id IN ($santriPlaceholders)";
                    $stmtDeleteSantri = $this->db->prepare($sqlDeleteSantri);
                    $stmtDeleteSantri->execute($santriIds);
                }

                $this->db->commit();

                $message = count($idRegistrasiList) . ' registrasi berhasil dihapus';
                if ($hapusDiTabelSantri) {
                    $message .= ' beserta data santri terkait';
                }

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => $message
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Delete registrasi error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal menghapus registrasi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * GET /api/pendaftaran/find-similar-santri - Cari santri yang mirip berdasarkan NIK atau nama
     */
    public function findSimilarSantri(Request $request, Response $response): Response
    {
        try {
            $queryParams = $request->getQueryParams();
            $nik = $queryParams['nik'] ?? null;
            $nama = $queryParams['nama'] ?? null;
            $idSantri = $queryParams['id_santri'] ?? null;

            if (!$nik && !$nama && !$idSantri) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter nik, nama, atau id_santri wajib diisi'
                ], 400);
            }

            $whereConditions = [];
            $params = [];

            // Jika ada id_santri, cari berdasarkan data santri tersebut
            if ($idSantri) {
                $sqlGetSantri = "SELECT nik, nama FROM santri WHERE id = ? LIMIT 1";
                $stmtGetSantri = $this->db->prepare($sqlGetSantri);
                $stmtGetSantri->execute([$idSantri]);
                $santriData = $stmtGetSantri->fetch(\PDO::FETCH_ASSOC);
                
                if ($santriData) {
                    $nik = $nik ?: $santriData['nik'];
                    $nama = $nama ?: $santriData['nama'];
                }
            }

            // Cari berdasarkan NIK (exact match) - minimal 10 karakter untuk NIK
            if ($nik && strlen(trim($nik)) >= 10) {
                $whereConditions[] = "s.nik = ?";
                $params[] = trim($nik);
            }

            // Cari berdasarkan nama (fuzzy match - LIKE) - minimal 3 karakter
            if ($nama && strlen(trim($nama)) >= 3) {
                $whereConditions[] = "s.nama LIKE ?";
                $params[] = "%" . trim($nama) . "%";
            }

            if (count($whereConditions) === 0) {
                return $this->jsonResponse($response, [
                    'success' => true,
                    'data' => []
                ], 200);
            }

            $whereClause = "WHERE " . implode(" OR ", $whereConditions);
            
            // Query untuk mendapatkan semua santri yang mirip
            // Jika ada NIK, urutkan berdasarkan exact match NIK terlebih dahulu
            $orderByClause = "ORDER BY s.nama ASC";
            $orderParams = [];
            if ($nik && strlen(trim($nik)) >= 10) {
                $orderByClause = "ORDER BY 
                        CASE WHEN s.nik = ? THEN 1 ELSE 2 END,
                        s.nama ASC";
                $orderParams[] = trim($nik);
            }
            
            $sql = "SELECT 
                        s.id,
                        s.nama,
                        s.nik,
                        s.gender,
                        s.tempat_lahir,
                        s.tanggal_lahir,
                        COUNT(DISTINCT r.id) as jumlah_registrasi,
                        GROUP_CONCAT(DISTINCT CONCAT(r.tahun_hijriyah, '/', r.tahun_masehi) ORDER BY r.tahun_hijriyah DESC SEPARATOR ', ') as tahun_ajaran
                    FROM santri s
                    LEFT JOIN psb___registrasi r ON s.id = r.id_santri
                    $whereClause
                    GROUP BY s.id
                    $orderByClause
                    LIMIT 50";
            
            // Gabungkan params untuk WHERE clause dan ORDER BY clause
            $allParams = array_merge($params, $orderParams);
            
            $stmt = $this->db->prepare($sql);
            $stmt->execute($allParams);
            $results = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            // Format data
            $formattedData = array_map(function($row) {
                return [
                    'id' => (int)$row['id'],
                    'nama' => $row['nama'] ?? '-',
                    'nik' => $row['nik'] ?? '-',
                    'gender' => $row['gender'] ?? '-',
                    'tempat_lahir' => $row['tempat_lahir'] ?? '-',
                    'tanggal_lahir' => $row['tanggal_lahir'] ?? '-',
                    'jumlah_registrasi' => (int)$row['jumlah_registrasi'],
                    'tahun_ajaran' => $row['tahun_ajaran'] ?? '-'
                ];
            }, $results);

            return $this->jsonResponse($response, [
                'success' => true,
                'data' => $formattedData
            ], 200);

        } catch (\Exception $e) {
            error_log("Find similar santri error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mencari data santri: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * POST /api/pendaftaran/merge-santri - Padukan/gabungkan data santri
     */
    public function mergeSantri(Request $request, Response $response): Response
    {
        try {
            $input = $request->getParsedBody();
            
            if (!isset($input['id_santri_utama']) || !isset($input['id_santri_sekunder'])) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Parameter id_santri_utama dan id_santri_sekunder wajib diisi'
                ], 400);
            }

            $idSantriUtama = (int)$input['id_santri_utama'];
            $idSantriSekunder = (int)$input['id_santri_sekunder'];

            if ($idSantriUtama === $idSantriSekunder) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'ID santri utama dan sekunder tidak boleh sama'
                ], 400);
            }

            // Cek apakah kedua ID ada
            $sqlCheck = "SELECT id FROM santri WHERE id IN (?, ?)";
            $stmtCheck = $this->db->prepare($sqlCheck);
            $stmtCheck->execute([$idSantriUtama, $idSantriSekunder]);
            $exists = $stmtCheck->fetchAll(\PDO::FETCH_COLUMN);

            if (count($exists) !== 2) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Salah satu atau kedua ID santri tidak ditemukan'
                ], 404);
            }

            $this->db->beginTransaction();

            try {
                // 1. Update semua registrasi dari id_santri_sekunder ke id_santri_utama
                // Cek dulu apakah ada konflik (registrasi dengan tahun yang sama)
                $sqlCheckConflict = "SELECT r1.id as id_utama, r2.id as id_sekunder, r1.tahun_hijriyah, r1.tahun_masehi
                                     FROM psb___registrasi r1
                                     INNER JOIN psb___registrasi r2 ON (
                                         r1.id_santri = ? AND r2.id_santri = ? AND
                                         (r1.tahun_hijriyah = r2.tahun_hijriyah OR r1.tahun_masehi = r2.tahun_masehi)
                                     )";
                $stmtCheckConflict = $this->db->prepare($sqlCheckConflict);
                $stmtCheckConflict->execute([$idSantriUtama, $idSantriSekunder]);
                $conflicts = $stmtCheckConflict->fetchAll(\PDO::FETCH_ASSOC);

                if (count($conflicts) > 0) {
                    // Ada konflik, hapus registrasi sekunder yang konflik
                    $conflictIds = array_column($conflicts, 'id_sekunder');
                    $placeholders = implode(',', array_fill(0, count($conflictIds), '?'));
                    
                    // Hapus detail dan transaksi dari registrasi yang konflik
                    $sqlDeleteDetail = "DELETE FROM psb___registrasi_detail WHERE id_registrasi IN ($placeholders)";
                    $stmtDeleteDetail = $this->db->prepare($sqlDeleteDetail);
                    $stmtDeleteDetail->execute($conflictIds);
                    
                    $sqlDeleteTransaksi = "DELETE FROM psb___transaksi WHERE id_registrasi IN ($placeholders)";
                    $stmtDeleteTransaksi = $this->db->prepare($sqlDeleteTransaksi);
                    $stmtDeleteTransaksi->execute($conflictIds);
                    
                    // Hapus registrasi yang konflik
                    $sqlDeleteRegistrasi = "DELETE FROM psb___registrasi WHERE id IN ($placeholders)";
                    $stmtDeleteRegistrasi = $this->db->prepare($sqlDeleteRegistrasi);
                    $stmtDeleteRegistrasi->execute($conflictIds);
                }

                // Update registrasi yang tidak konflik
                $sqlUpdateRegistrasi = "UPDATE psb___registrasi SET id_santri = ? WHERE id_santri = ?";
                $stmtUpdateRegistrasi = $this->db->prepare($sqlUpdateRegistrasi);
                $stmtUpdateRegistrasi->execute([$idSantriUtama, $idSantriSekunder]);

                // 2. Update berkas dari id_santri_sekunder ke id_santri_utama
                $sqlUpdateBerkas = "UPDATE santri___berkas SET id_santri = ? WHERE id_santri = ?";
                $stmtUpdateBerkas = $this->db->prepare($sqlUpdateBerkas);
                $stmtUpdateBerkas->execute([$idSantriUtama, $idSantriSekunder]);

                // 3. Update data santri utama dengan data yang lebih lengkap dari sekunder (jika ada field kosong di utama)
                // Ambil data sekunder
                $sqlGetSekunder = "SELECT * FROM santri WHERE id = ?";
                $stmtGetSekunder = $this->db->prepare($sqlGetSekunder);
                $stmtGetSekunder->execute([$idSantriSekunder]);
                $dataSekunder = $stmtGetSekunder->fetch(\PDO::FETCH_ASSOC);

                if ($dataSekunder) {
                    // Ambil data utama
                    $sqlGetUtama = "SELECT * FROM santri WHERE id = ?";
                    $stmtGetUtama = $this->db->prepare($sqlGetUtama);
                    $stmtGetUtama->execute([$idSantriUtama]);
                    $dataUtama = $stmtGetUtama->fetch(\PDO::FETCH_ASSOC);

                    // Buat array update untuk field yang kosong di utama tapi ada di sekunder
                    $updateFields = [];
                    $updateValues = [];
                    
                    // Daftar field yang akan di-update jika kosong di utama
                    $fieldsToUpdate = [
                        'nik', 'nama', 'gender', 'tempat_lahir', 'tanggal_lahir',
                        'ayah', 'ibu', 'dusun', 'rt', 'rw', 'desa', 'kecamatan',
                        'kabupaten', 'provinsi', 'kode_pos', 'no_telpon', 'no_wa_santri'
                    ];

                    foreach ($fieldsToUpdate as $field) {
                        if (empty($dataUtama[$field]) && !empty($dataSekunder[$field])) {
                            $updateFields[] = "$field = ?";
                            $updateValues[] = $dataSekunder[$field];
                        }
                    }

                    if (count($updateFields) > 0) {
                        $updateValues[] = $idSantriUtama;
                        $sqlUpdateSantri = "UPDATE santri SET " . implode(", ", $updateFields) . " WHERE id = ?";
                        $stmtUpdateSantri = $this->db->prepare($sqlUpdateSantri);
                        $stmtUpdateSantri->execute($updateValues);
                    }
                }

                // 4. Hapus santri sekunder
                $sqlDeleteSantri = "DELETE FROM santri WHERE id = ?";
                $stmtDeleteSantri = $this->db->prepare($sqlDeleteSantri);
                $stmtDeleteSantri->execute([$idSantriSekunder]);

                $this->db->commit();

                return $this->jsonResponse($response, [
                    'success' => true,
                    'message' => 'Data santri berhasil dipadukan. ID ' . $idSantriSekunder . ' telah digabungkan ke ID ' . $idSantriUtama
                ], 200);

            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }

        } catch (\Exception $e) {
            error_log("Merge santri error: " . $e->getMessage());
            error_log("Stack trace: " . $e->getTraceAsString());
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal memadukan data santri: ' . $e->getMessage()
            ], 500);
        }
    }
}

