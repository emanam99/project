<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\SantriHelper;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class PrintController
{
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
     * Validasi format ID santri (7 digit)
     */
    private function validateSantriId(?string $id): bool
    {
        return $id !== null && preg_match('/^\d{7}$/', $id);
    }

    /**
     * GET /api/print - Ambil data untuk print kwitansi
     * Endpoint ini tidak memerlukan authentication karena data bisa dilihat siapa saja dengan ID
     * Tapi tetap ada validasi keamanan (format ID, rate limiting via middleware)
     */
    public function getPrintData(Request $request, Response $response): Response
    {
        try {
            $registrasiPayload = null;
            $queryParams   = $request->getQueryParams();
            $idSantri      = $queryParams['id_santri'] ?? null;
            $pageMode      = $queryParams['page'] ?? 'tunggakan';
            $tahunAjaran   = $queryParams['tahun_ajaran'] ?? null;
            // Tahun ajaran khusus untuk mode pendaftaran (PSB)
            $tahunHijriyah = $queryParams['tahun_hijriyah'] ?? null;
            $tahunMasehi   = $queryParams['tahun_masehi'] ?? null;

            // Resolve id_santri (dari query bisa id atau nis) ke santri.id untuk query DB
            $resolvedId = SantriHelper::resolveId($this->db, $idSantri);
            if ($resolvedId === null) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }
            $idSantri = $resolvedId;

            // Konfigurasi tabel berdasarkan mode
            if ($pageMode === 'khusus') {
                $tableTunggakan = 'uwaba___khusus';
                $tableBayar = 'uwaba___bayar_khusus';
                $idKolomReferensi = 'id_khusus';
            } elseif ($pageMode === 'uwaba') {
                $tableTunggakan = 'uwaba';
                $tableBayar = 'uwaba___bayar';
                $idKolomReferensi = 'id';
            } elseif ($pageMode === 'pendaftaran') {
                // Mode pendaftaran menggunakan tabel psb___registrasi dan psb___registrasi_detail
                // Tidak perlu set tableTunggakan karena akan dihandle khusus
            } else {
                $tableTunggakan = 'uwaba___tunggakan';
                $tableBayar = 'uwaba___bayar_tunggakan';
                $idKolomReferensi = 'id_tunggakan';
            }

            // Ambil biodata santri (diniyah/formal dari rombel; mode pendaftaran menimpa dari psb___registrasi.daftar_*)
            $stmt = $this->db->prepare("SELECT s.*, 
                COALESCE(s.status_santri, '') AS status_santri,
                COALESCE(d.kategori, s.kategori, '') AS kategori,
                COALESCE(rd.lembaga_id, '') AS diniyah,
                COALESCE(rf.lembaga_id, '') AS formal,
                COALESCE(s.lttq, '') AS lttq,
                COALESCE(s.saudara_di_pesantren, '') AS saudara,
                COALESCE(s.no_telpon, '') AS no_telpon,
                d.daerah AS daerah,
                dk.kamar AS kamar
                FROM santri s
                LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                LEFT JOIN daerah d ON d.id = dk.id_daerah
                WHERE s.id = ? LIMIT 1");
            $stmt->execute([$idSantri]);
            $biodata = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$biodata) {
                return $this->jsonResponse($response, [
                    'success' => false,
                    'message' => 'Santri tidak ditemukan'
                ], 404);
            }

            // Ambil rincian tunggakan
            if ($pageMode === 'pendaftaran') {
                // Untuk pendaftaran, ambil data registrasi dan detail item
                // Jika tahun hijriyah/masehi diberikan, filter berdasarkan kombinasi tahun
                if ($tahunHijriyah && $tahunHijriyah !== '' && $tahunMasehi && $tahunMasehi !== '') {
                    $stmt = $this->db->prepare(
                        "SELECT r.id, r.id_santri, r.wajib, r.bayar, r.kurang, r.id_admin, 
                                r.tahun_hijriyah, r.tahun_masehi, r.daftar_diniyah, r.daftar_formal, p.nama AS admin 
                         FROM psb___registrasi r 
                         LEFT JOIN pengurus p ON r.id_admin = p.id 
                         WHERE r.id_santri = ? 
                           AND r.tahun_hijriyah = ? 
                           AND r.tahun_masehi = ?
                         ORDER BY r.tanggal_dibuat DESC, r.id DESC
                         LIMIT 1"
                    );
                    $stmt->execute([$idSantri, $tahunHijriyah, $tahunMasehi]);
                } elseif ($tahunHijriyah && $tahunHijriyah !== '') {
                    $stmt = $this->db->prepare(
                        "SELECT r.id, r.id_santri, r.wajib, r.bayar, r.kurang, r.id_admin, 
                                r.tahun_hijriyah, r.tahun_masehi, r.daftar_diniyah, r.daftar_formal, p.nama AS admin 
                         FROM psb___registrasi r 
                         LEFT JOIN pengurus p ON r.id_admin = p.id 
                         WHERE r.id_santri = ? 
                           AND r.tahun_hijriyah = ?
                         ORDER BY r.tanggal_dibuat DESC, r.id DESC
                         LIMIT 1"
                    );
                    $stmt->execute([$idSantri, $tahunHijriyah]);
                } elseif ($tahunMasehi && $tahunMasehi !== '') {
                    $stmt = $this->db->prepare(
                        "SELECT r.id, r.id_santri, r.wajib, r.bayar, r.kurang, r.id_admin, 
                                r.tahun_hijriyah, r.tahun_masehi, r.daftar_diniyah, r.daftar_formal, p.nama AS admin 
                         FROM psb___registrasi r 
                         LEFT JOIN pengurus p ON r.id_admin = p.id 
                         WHERE r.id_santri = ? 
                           AND r.tahun_masehi = ?
                         ORDER BY r.tanggal_dibuat DESC, r.id DESC
                         LIMIT 1"
                    );
                    $stmt->execute([$idSantri, $tahunMasehi]);
                } else {
                    // Fallback: ambil registrasi terbaru jika tahun tidak diberikan
                    $stmt = $this->db->prepare(
                        "SELECT r.id, r.id_santri, r.wajib, r.bayar, r.kurang, r.id_admin, 
                                r.tahun_hijriyah, r.tahun_masehi, r.daftar_diniyah, r.daftar_formal, p.nama AS admin 
                         FROM psb___registrasi r 
                         LEFT JOIN pengurus p ON r.id_admin = p.id 
                         WHERE r.id_santri = ? 
                         ORDER BY r.tanggal_dibuat DESC, r.id DESC
                         LIMIT 1"
                    );
                    $stmt->execute([$idSantri]);
                }
                $registrasi = $stmt->fetch(\PDO::FETCH_ASSOC);
                
                if (!$registrasi) {
                    return $this->jsonResponse($response, [
                        'success' => false,
                        'message' => 'Data registrasi tidak ditemukan untuk santri ini'
                    ], 404);
                }

                // Kwitansi PSB: Diniyah/Formal dari pilihan registrasi (bukan rombel santri)
                $daftarDin = trim((string) ($registrasi['daftar_diniyah'] ?? ''));
                $daftarFor = trim((string) ($registrasi['daftar_formal'] ?? ''));
                $biodata['diniyah'] = $daftarDin !== '' ? $daftarDin : '-';
                $biodata['formal'] = $daftarFor !== '' ? $daftarFor : '-';

                $registrasiPayload = [
                    'id' => isset($registrasi['id']) ? (int) $registrasi['id'] : null,
                    'tahun_hijriyah' => $registrasi['tahun_hijriyah'] ?? null,
                    'tahun_masehi' => $registrasi['tahun_masehi'] ?? null,
                    'daftar_diniyah' => $daftarDin !== '' ? $daftarDin : null,
                    'daftar_formal' => $daftarFor !== '' ? $daftarFor : null,
                ];
                
                // Ambil detail item dari registrasi
                $stmt = $this->db->prepare("SELECT 
                    rd.id,
                    rd.id_registrasi,
                    rd.id_item,
                    rd.nominal as nominal_dibayar,
                    rd.status_ambil,
                    i.item as nama_item,
                    i.harga as harga_standar,
                    COALESCE(i.kategori, 'Lainnya') as kategori,
                    COALESCE(i.urutan, 0) as urutan,
                    CASE 
                        WHEN rd.nominal = 0 THEN 'Belum Bayar'
                        WHEN rd.nominal >= COALESCE(i.harga, 0) THEN 'Lunas'
                        ELSE 'Kurang'
                    END as status
                    FROM psb___registrasi_detail rd
                    LEFT JOIN psb___item i ON rd.id_item = i.id
                    WHERE rd.id_registrasi = ?
                    ORDER BY COALESCE(i.kategori, 'Lainnya') ASC, COALESCE(i.urutan, 0) ASC, rd.id_item ASC");
                $stmt->execute([$registrasi['id']]);
                $items = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                
                // Format data items sebagai tunggakan
                $tunggakan = [];
                foreach ($items as $item) {
                    $total = floatval($item['harga_standar'] ?? 0);
                    $bayar = floatval($item['nominal_dibayar'] ?? 0);
                    $kurang = max($total - $bayar, 0);
                    
                    $tunggakan[] = [
                        'id' => $item['id'],
                        'keterangan_1' => $item['nama_item'] ?? '-',
                        'kategori' => $item['kategori'] ?? 'Lainnya',
                        'total' => $total,
                        'bayar' => $bayar,
                        'kurang' => $kurang,
                        'status' => $item['status'] ?? 'Belum Bayar',
                        'status_ambil' => $item['status_ambil'] ?? 'belum_ambil'
                    ];
                }
                
                // Ambil transaksi pembayaran
                $stmt = $this->db->prepare("SELECT 
                    t.id,
                    t.id_registrasi,
                    t.nominal,
                    t.via,
                    t.id_admin,
                    t.hijriyah,
                    t.tanggal_dibuat,
                    p.nama AS admin
                    FROM psb___transaksi t
                    LEFT JOIN pengurus p ON t.id_admin = p.id
                    WHERE t.id_registrasi = ?
                    ORDER BY t.tanggal_dibuat ASC");
                $stmt->execute([$registrasi['id']]);
                $pembayaran = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                
                // Format tanggal untuk tampilan
                foreach ($pembayaran as &$p) {
                    if (!empty($p['tanggal_dibuat'])) {
                        try {
                            $dateTime = \DateTime::createFromFormat('Y-m-d H:i:s', $p['tanggal_dibuat'], new \DateTimeZone('Asia/Jakarta'));
                            if (!$dateTime) {
                                $dateTime = new \DateTime($p['tanggal_dibuat']);
                                $dateTime->setTimezone(new \DateTimeZone('Asia/Jakarta'));
                            }
                            $p['tanggal_dibuat'] = $dateTime->format('Y-m-d H:i:s');
                            $p['tanggal_print'] = $dateTime->format('d/m/Y H:i');
                        } catch (\Exception $e) {
                            error_log("Error formatting date in print: " . $e->getMessage() . " - Date: " . ($p['tanggal_dibuat'] ?? 'null'));
                            $p['tanggal_print'] = $p['tanggal_dibuat'] ?? '';
                        }
                    }
                }
                unset($p);
                
            } elseif ($pageMode === 'uwaba') {
                // Untuk uwaba, ambil data bulanan dengan urutan Hijri yang benar
                // Filter berdasarkan tahun_ajaran jika disediakan
                if ($tahunAjaran) {
                    $stmt = $this->db->prepare("SELECT t.id, t.id_bulan, t.wajib as total, t.nominal, t.keterangan, t.json, t.is_disabled FROM {$tableTunggakan} t WHERE t.id_santri = ? AND t.tahun_ajaran = ? ORDER BY FIELD(t.id_bulan, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8)");
                    $stmt->execute([$idSantri, $tahunAjaran]);
                } else {
                $stmt = $this->db->prepare("SELECT t.id, t.id_bulan, t.wajib as total, t.nominal, t.keterangan, t.json, t.is_disabled FROM {$tableTunggakan} t WHERE t.id_santri = ? ORDER BY FIELD(t.id_bulan, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8)");
                $stmt->execute([$idSantri]);
                }
                $tunggakan = $stmt->fetchAll(\PDO::FETCH_ASSOC);

                // Tambahkan nama bulan dan keterangan_1
                $bulanNames = ['Dzul Qo\'dah', 'Dzul Hijjah', 'Muharram', 'Shafar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Ula', 'Jumadil Akhir', 'Rajab', 'Sya\'ban'];
                foreach ($tunggakan as &$t) {
                    $bulanIndex = array_search($t['id_bulan'], [11, 12, 1, 2, 3, 4, 5, 6, 7, 8]);
                    $t['keterangan_1'] = $bulanNames[$bulanIndex] ?? 'Bulan ' . $t['id_bulan'];
                    $t['keterangan_2'] = $t['keterangan'] ?? '';
                }
            } else {
                // Untuk mode tunggakan/khusus, load semua data tanpa filter tahun_ajaran
                // Include tahun_ajaran untuk ditampilkan di tabel
                $stmt = $this->db->prepare("SELECT t.id, t.keterangan_1, t.keterangan_2, t.wajib, t.tahun_ajaran FROM {$tableTunggakan} t WHERE t.id_santri = ? ORDER BY t.tahun_ajaran DESC, t.id ASC");
                $stmt->execute([$idSantri]);
                $tunggakan = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            // Ambil semua pembayaran santri
            if ($pageMode === 'pendaftaran') {
                // Pembayaran sudah diambil di bagian sebelumnya
            } elseif ($pageMode === 'uwaba') {
                // Untuk uwaba, ambil dari uwaba___bayar
                // Data masehi akan dikonversi di PHP dari UTC ke Asia/Jakarta
                if ($tahunAjaran) {
                    $stmt = $this->db->prepare("SELECT p.id, p.id as id_uwaba, p.nominal, p.via, p.admin, p.hijriyah, p.masehi as tanggal_dibuat FROM {$tableBayar} p WHERE p.id_santri = ? AND p.tahun_ajaran = ? ORDER BY p.masehi ASC");
                    $stmt->execute([$idSantri, $tahunAjaran]);
                } else {
                $stmt = $this->db->prepare("SELECT p.id, p.id as id_uwaba, p.nominal, p.via, p.admin, p.hijriyah, p.masehi as tanggal_dibuat FROM {$tableBayar} p WHERE p.id_santri = ? ORDER BY p.masehi ASC");
                $stmt->execute([$idSantri]);
                }
                $pembayaran = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                
                // Format tanggal untuk tampilan
                // Data dari database mungkin dalam UTC (karena timestamp MySQL bisa disimpan dalam UTC)
                // Kita perlu mengkonversi ke Asia/Jakarta
                foreach ($pembayaran as &$p) {
                    if (!empty($p['tanggal_dibuat'])) {
                        try {
                            // Asumsikan data dari database dalam UTC, konversi ke Asia/Jakarta
                            $dateTime = new \DateTime($p['tanggal_dibuat'], new \DateTimeZone('UTC'));
                            $dateTime->setTimezone(new \DateTimeZone('Asia/Jakarta'));
                            $p['tanggal_dibuat'] = $dateTime->format('Y-m-d H:i:s');
                            $p['tanggal_print'] = $dateTime->format('d/m/Y H:i');
                        } catch (\Exception $e) {
                            // Jika error, coba tanpa konversi timezone
                            try {
                                $dateTime = new \DateTime($p['tanggal_dibuat'], new \DateTimeZone('Asia/Jakarta'));
                                $p['tanggal_dibuat'] = $dateTime->format('Y-m-d H:i:s');
                                $p['tanggal_print'] = $dateTime->format('d/m/Y H:i');
                            } catch (\Exception $e2) {
                                error_log("Error formatting date in print: " . $e2->getMessage() . " - Date: " . ($p['tanggal_dibuat'] ?? 'null'));
                                $p['tanggal_print'] = $p['tanggal_dibuat'] ?? '';
                            }
                        }
                    }
                }
                unset($p);
            } else {
                // Untuk mode tunggakan/khusus, load semua pembayaran tanpa filter tahun_ajaran
                // Join dengan tabel utama untuk mendapatkan keterangan_1
                $stmt = $this->db->prepare("SELECT p.id, p.{$idKolomReferensi}, p.nominal, p.via, p.admin, p.hijriyah, p.tanggal_dibuat, t.keterangan_1 FROM {$tableBayar} p INNER JOIN {$tableTunggakan} t ON p.{$idKolomReferensi} = t.id WHERE p.id_santri = ? ORDER BY p.tanggal_dibuat ASC");
                $stmt->execute([$idSantri]);
                $pembayaran = $stmt->fetchAll(\PDO::FETCH_ASSOC);
                
                // Format tanggal untuk tampilan
                // MySQL timestamp dikembalikan sebagai string tanpa timezone
                // Karena MySQL timezone sudah di-set ke +07:00, data seharusnya sudah dalam timezone Asia/Jakarta
                foreach ($pembayaran as &$p) {
                    if (!empty($p['tanggal_dibuat'])) {
                        try {
                            // Coba interpretasikan sebagai timezone Asia/Jakarta dulu
                            $dateTime = \DateTime::createFromFormat('Y-m-d H:i:s', $p['tanggal_dibuat'], new \DateTimeZone('Asia/Jakarta'));
                            
                            // Jika gagal, coba format lain atau asumsikan UTC dan konversi
                            if (!$dateTime) {
                                // Coba dengan format yang lebih fleksibel
                                $dateTime = new \DateTime($p['tanggal_dibuat']);
                                // Jika data lama mungkin dalam UTC, konversi ke Asia/Jakarta
                                // Tapi karena MySQL timezone sudah di-set, seharusnya tidak perlu
                                $dateTime->setTimezone(new \DateTimeZone('Asia/Jakarta'));
                            }
                            
                            $p['tanggal_dibuat'] = $dateTime->format('Y-m-d H:i:s');
                            $p['tanggal_print'] = $dateTime->format('d/m/Y H:i');
                        } catch (\Exception $e) {
                            // Jika error, gunakan format asli
                            error_log("Error formatting date in print: " . $e->getMessage() . " - Date: " . ($p['tanggal_dibuat'] ?? 'null'));
                            $p['tanggal_print'] = $p['tanggal_dibuat'] ?? '';
                        }
                    }
                }
                unset($p);
            }

            // Kelompokkan pembayaran per tunggakan dan hitung total bayar, kurang, status
            if ($pageMode === 'pendaftaran') {
                // Data sudah diformat di bagian sebelumnya, tidak perlu grouping lagi
            } elseif ($pageMode === 'uwaba') {
                // Baca uwaba-prices.json
                $uwabaPricesPath = __DIR__ . '/../../../js/uwaba/uwaba-prices.json';
                $uwabaPrices = null;

                if (file_exists($uwabaPricesPath)) {
                    try {
                        $uwabaPricesContent = file_get_contents($uwabaPricesPath);
                        $uwabaPrices = json_decode($uwabaPricesContent, true);
                    } catch (\Exception $e) {
                        error_log("Error reading uwaba-prices.json: " . $e->getMessage());
                    }
                }

                // Untuk uwaba, pembayaran tidak dikelompokkan per bulan, tapi ditampilkan semua
                foreach ($tunggakan as &$t) {
                    $t['pembayaran'] = []; // Kosongkan array pembayaran per bulan
                    $t['bayar'] = $t['nominal'] ?? 0; // Ambil dari field nominal di tabel uwaba
                    // Gunakan wajib (yang sudah di-aliaskan sebagai total), bukan total langsung
                    $wajib = isset($t['total']) ? (int)$t['total'] : 0; // total adalah alias dari wajib untuk uwaba
                    $t['kurang'] = $wajib - $t['bayar'];
                    if ($t['kurang'] <= 0) {
                        $t['status'] = 'Lunas';
                    } elseif ($t['bayar'] > 0) {
                        $t['status'] = 'Kurang';
                    } else {
                        $t['status'] = 'Belum Bayar';
                    }
                }

                // Hitung wajib berdasarkan biodata untuk setiap bulan
                foreach ($tunggakan as &$t) {
                    if ($t['is_disabled'] != 1) {
                        $wajib = 0;

                        // Harga dasar berdasarkan status_santri dan kategori
                        if ($biodata['status_santri'] && $biodata['kategori'] && $uwabaPrices) {
                            $wajib += $uwabaPrices['status_santri'][$biodata['status_santri']][$biodata['kategori']]['wajib'] ?? 0;
                        }

                        // Tambahan diniyah / formal / LTTQ — kunci = lembaga.id (string) di uwaba-prices.json
                        $dinKey = isset($biodata['diniyah']) ? trim((string) $biodata['diniyah']) : '';
                        if ($dinKey !== '' && $dinKey !== '-' && $uwabaPrices) {
                            $wajib += (int) ($uwabaPrices['diniyah'][$dinKey]['wajib'] ?? 0);
                        }

                        $forKey = isset($biodata['formal']) ? trim((string) $biodata['formal']) : '';
                        if ($forKey !== '' && $forKey !== '-' && $uwabaPrices) {
                            $wajib += (int) ($uwabaPrices['formal'][$forKey]['wajib'] ?? 0);
                        }

                        $lttqKey = isset($biodata['lttq']) ? trim((string) $biodata['lttq']) : '';
                        if ($lttqKey !== '' && $lttqKey !== '-' && $uwabaPrices) {
                            $wajib += (int) ($uwabaPrices['lttq'][$lttqKey]['wajib'] ?? 0);
                        }

                        // Diskon saudara
                        if ($biodata['saudara'] && $biodata['saudara'] !== 'Tidak Ada' && $uwabaPrices) {
                            $diskon = $uwabaPrices['saudara'][$biodata['saudara']]['diskon'] ?? 0;
                            $wajib = max($wajib - $diskon, 0);
                        }

                        $t['wajib_calculated'] = $wajib;
                    } else {
                        $t['wajib_calculated'] = 0;
                    }
                }
            } else {
                // Untuk tunggakan/khusus, kelompokkan pembayaran per item
                foreach ($tunggakan as &$t) {
                    $t['pembayaran'] = array_values(array_filter($pembayaran, function($p) use ($t, $idKolomReferensi) {
                        return $p[$idKolomReferensi] == $t['id'];
                    }));
                    $t['bayar'] = array_sum(array_column($t['pembayaran'], 'nominal'));
                    // Gunakan wajib (yang sudah diambil dari query), bukan total
                    $wajib = isset($t['wajib']) ? (int)$t['wajib'] : 0;
                    $t['kurang'] = max($wajib - $t['bayar'], 0); // Pastikan kurang tidak negatif
                    if ($t['kurang'] <= 0) {
                        $t['status'] = 'Lunas';
                    } elseif ($t['bayar'] > 0) {
                        $t['status'] = 'Kurang';
                    } else {
                        $t['status'] = 'Belum Bayar';
                    }
                }
            }

            // Tambahkan tanggal print saat ini dengan timezone Asia/Jakarta
            $tanggalPrint = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('d/m/Y H:i');

            return $this->jsonResponse($response, [
                'success' => true,
                'biodata' => $biodata,
                'tunggakan' => $tunggakan,
                'pembayaran' => $pembayaran,
                'uwaba_prices' => $pageMode === 'uwaba' ? $uwabaPrices : null,
                'tanggal_print' => $tanggalPrint,
                'registrasi' => $registrasiPayload
            ], 200);

        } catch (\Exception $e) {
            error_log("Print data error: " . $e->getMessage());
            return $this->jsonResponse($response, [
                'success' => false,
                'message' => 'Gagal mengambil data print'
            ], 500);
        }
    }
}

