<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\LiveSantriIndexNotifier;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Aksi santri dari konteks Domisili (daerah/kamar) — middleware tarbiyah super.
 */
class SantriTarbiyahDomisiliController
{
    private const FITUR_ROMBEL_CATATAN_HAPUS = 'action.rombel.catatan_santri.hapus';

    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    public function listCatatan(Request $request, Response $response): Response
    {
        try {
            $idSantri = $request->getQueryParams()['id_santri'] ?? null;
            if (!$idSantri || (int) $idSantri <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            $params = $request->getQueryParams();
            $jenis = isset($params['jenis_catatan']) ? strtolower(trim((string) $params['jenis_catatan'])) : '';
            if ($jenis !== 'putih' && $jenis !== 'hitam') {
                $jenis = '';
            }
            $sql = 'SELECT c.*, p.nama AS pengurus_nama
                    FROM santri___catatan c
                    LEFT JOIN pengurus p ON c.id_pengurus = p.id
                    WHERE c.id_santri = ?';
            $bind = [(int) $idSantri];
            if ($jenis !== '') {
                $sql .= ' AND c.jenis_catatan = ?';
                $bind[] = $jenis;
            }
            $sql .= ' ORDER BY c.tanggal_dibuat DESC';
            $st = $this->db->prepare($sql);
            $st->execute($bind);
            return $this->json($response, ['success' => true, 'data' => $st->fetchAll(\PDO::FETCH_ASSOC)], 200);
        } catch (\Exception $e) {
            error_log('listCatatan: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar catatan'], 500);
        }
    }

    public function createCatatan(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $catatan = isset($data['catatan']) ? trim((string) $data['catatan']) : '';
            if ($idSantri <= 0 || $catatan === '') {
                return $this->json($response, ['success' => false, 'message' => 'id_santri dan catatan wajib'], 400);
            }
            $keteranganSumber = isset($data['keterangan']) ? trim((string) $data['keterangan']) : '';
            $keterangan = $this->buildCatatanKeteranganAktif($idSantri, $keteranganSumber);
            $jenisCatatan = isset($data['jenis_catatan']) ? strtolower(trim((string) $data['jenis_catatan'])) : 'putih';
            if ($jenisCatatan !== 'putih' && $jenisCatatan !== 'hitam') {
                $jenisCatatan = 'putih';
            }
            $user = $request->getAttribute('user');
            $idPengurus = is_array($user) ? (RoleHelper::getPengurusIdFromPayload($user) ?? 0) : 0;
            if ($idPengurus <= 0) {
                $idPengurus = null;
            }
            $sql = 'INSERT INTO santri___catatan (id_santri, id_pengurus, catatan, keterangan, jenis_catatan) VALUES (?, ?, ?, ?, ?)';
            $st = $this->db->prepare($sql);
            $st->execute([$idSantri, $idPengurus, $catatan, $keterangan, $jenisCatatan]);
            $id = (int) $this->db->lastInsertId();
            return $this->json($response, ['success' => true, 'message' => 'Catatan disimpan', 'data' => ['id' => $id]], 201);
        } catch (\Exception $e) {
            error_log('createCatatan: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan catatan'], 500);
        }
    }

    public function deleteCatatan(Request $request, Response $response, array $args): Response
    {
        try {
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'ID catatan tidak valid'], 400);
            }

            $user = $request->getAttribute('user');
            $userArr = is_array($user) ? $user : [];
            if (!$this->canDeleteCatatan($userArr)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'Akses ditolak: role Anda belum diberi aksi hapus catatan santri Rombel.',
                ], 403);
            }

            $stmt = $this->db->prepare('SELECT * FROM santri___catatan WHERE id = ? LIMIT 1');
            $stmt->execute([$id]);
            $old = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$old) {
                return $this->json($response, ['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
            }

            $del = $this->db->prepare('DELETE FROM santri___catatan WHERE id = ?');
            $del->execute([$id]);

            $actorPengurusId = RoleHelper::getPengurusIdFromPayload($userArr);
            UserAktivitasLogger::log(
                null,
                $actorPengurusId,
                UserAktivitasLogger::ACTION_DELETE,
                'santri___catatan',
                (string) $id,
                $old,
                null,
                $request
            );

            return $this->json($response, ['success' => true, 'message' => 'Catatan dihapus'], 200);
        } catch (\Exception $e) {
            error_log('deleteCatatan: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menghapus catatan'], 500);
        }
    }

    public function pindahKamar(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? $data : [];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $idKamar = array_key_exists('id_kamar', $data)
                ? ($data['id_kamar'] === '' || $data['id_kamar'] === null ? null : (int) $data['id_kamar'])
                : null;
            if ($idSantri <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            if ($idKamar !== null && $idKamar > 0) {
                $chk = $this->db->prepare('SELECT id FROM daerah___kamar WHERE id = ? LIMIT 1');
                $chk->execute([$idKamar]);
                if (!$chk->fetch(\PDO::FETCH_ASSOC)) {
                    return $this->json($response, ['success' => false, 'message' => 'Kamar tidak ditemukan'], 404);
                }
            }
            $st = $this->db->prepare('UPDATE santri SET id_kamar = ? WHERE id = ?');
            $st->execute([$idKamar, $idSantri]);
            LiveSantriIndexNotifier::ping();
            return $this->json($response, ['success' => true, 'message' => 'Kamar santri diperbarui'], 200);
        } catch (\Exception $e) {
            error_log('pindahKamar: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal memindahkan kamar santri'], 500);
        }
    }

    /** @var list<string> */
    private const PELANGGARAN_KATEGORI = ['ringan', 'sedang', 'berat', 'buku_hitam'];

    public function listPelanggaranMaster(Request $request, Response $response): Response
    {
        try {
            $kat = isset($request->getQueryParams()['kategori'])
                ? strtolower(trim((string) $request->getQueryParams()['kategori']))
                : '';
            if ($kat !== '' && !in_array($kat, self::PELANGGARAN_KATEGORI, true)) {
                return $this->json($response, ['success' => false, 'message' => 'kategori tidak valid'], 400);
            }
            $sql = 'SELECT id, kategori, nama, keterangan, urutan, aktif, tanggal_dibuat, tanggal_update FROM pelanggaran WHERE aktif = 1';
            $bind = [];
            if ($kat !== '') {
                $sql .= ' AND kategori = ?';
                $bind[] = $kat;
            }
            $sql .= ' ORDER BY kategori, urutan ASC, nama ASC';
            $st = $this->db->prepare($sql);
            $st->execute($bind);
            return $this->json($response, ['success' => true, 'data' => $st->fetchAll(\PDO::FETCH_ASSOC)], 200);
        } catch (\Exception $e) {
            error_log('listPelanggaranMaster: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil master pelanggaran'], 500);
        }
    }

    public function listPelanggaranSantri(Request $request, Response $response): Response
    {
        try {
            $idSantri = $request->getQueryParams()['id_santri'] ?? null;
            if (!$idSantri || (int) $idSantri <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id_santri wajib'], 400);
            }
            $sql = 'SELECT sp.*, pg.nama AS pelanggaran_nama, pg.kategori AS pelanggaran_kategori, pg.keterangan AS pelanggaran_keterangan, p.nama AS pengurus_nama
                    FROM santri___pelanggaran sp
                    INNER JOIN pelanggaran pg ON pg.id = sp.id_pelanggaran
                    LEFT JOIN pengurus p ON sp.id_pengurus = p.id
                    WHERE sp.id_santri = ?
                    ORDER BY sp.tanggal_dibuat DESC';
            $st = $this->db->prepare($sql);
            $st->execute([(int) $idSantri]);
            return $this->json($response, ['success' => true, 'data' => $st->fetchAll(\PDO::FETCH_ASSOC)], 200);
        } catch (\Exception $e) {
            error_log('listPelanggaranSantri: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil pelanggaran santri'], 500);
        }
    }

    /**
     * GET /api/tarbiyah/santri/pelanggaran-by-tanggal?tanggal_dari=&tanggal_sampai=
     * Daftar catatan pelanggaran global filter DATE(tanggal_dibuat).
     */
    public function listPelanggaranByTanggal(Request $request, Response $response): Response
    {
        try {
            $q = $request->getQueryParams();
            $tanggalDari = isset($q['tanggal_dari']) ? trim((string) $q['tanggal_dari']) : '';
            $tanggalSampai = isset($q['tanggal_sampai']) ? trim((string) $q['tanggal_sampai']) : '';
            $ymdOk = static function (string $v): bool {
                return $v !== '' && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $v);
            };
            if (!$ymdOk($tanggalDari) || !$ymdOk($tanggalSampai)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => 'tanggal_dari dan tanggal_sampai wajib (YYYY-MM-DD)',
                ], 400);
            }
            $dari = $tanggalDari <= $tanggalSampai ? $tanggalDari : $tanggalSampai;
            $sampai = $tanggalDari <= $tanggalSampai ? $tanggalSampai : $tanggalDari;

            $sql = 'SELECT sp.*,
                    pg.nama AS pelanggaran_nama,
                    pg.kategori AS pelanggaran_kategori,
                    pg.keterangan AS pelanggaran_keterangan,
                    p.nama AS pengurus_nama,
                    s.nama AS nama_santri,
                    s.nis AS nis,
                    s.gender AS gender,
                    COALESCE(
                        (
                            SELECT ss.status_santri
                            FROM santri___status ss
                            WHERE ss.id_santri = s.id AND ss.sampai IS NULL
                            ORDER BY ss.id DESC
                            LIMIT 1
                        ),
                        s.status_santri,
                        \'\'
                    ) AS status_santri,
                    d.daerah AS daerah,
                    dk.kamar AS kamar,
                    ld.nama AS diniyah,
                    rd.kelas AS kelas_diniyah,
                    rd.kel AS kel_diniyah,
                    lf.nama AS formal,
                    rf.kelas AS kelas_formal,
                    rf.kel AS kel_formal
                    FROM santri___pelanggaran sp
                    INNER JOIN pelanggaran pg ON pg.id = sp.id_pelanggaran
                    INNER JOIN santri s ON s.id = sp.id_santri
                    LEFT JOIN pengurus p ON sp.id_pengurus = p.id
                    LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
                    LEFT JOIN daerah d ON d.id = dk.id_daerah
                    LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
                    LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
                    LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
                    LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
                    WHERE DATE(sp.tanggal_dibuat) BETWEEN ? AND ?
                    ORDER BY sp.tanggal_dibuat DESC, sp.id DESC';
            $st = $this->db->prepare($sql);
            $st->execute([$dari, $sampai]);

            return $this->json($response, [
                'success' => true,
                'data' => $st->fetchAll(\PDO::FETCH_ASSOC),
                'meta' => ['tanggal_dari' => $dari, 'tanggal_sampai' => $sampai],
            ], 200);
        } catch (\Exception $e) {
            error_log('listPelanggaranByTanggal: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal mengambil daftar pelanggaran'], 500);
        }
    }

    public function createPelanggaran(Request $request, Response $response): Response
    {
        try {
            $data = $request->getParsedBody();
            $data = is_array($data) ? TextSanitizer::sanitizeStringValues($data, []) : [];
            $idSantri = isset($data['id_santri']) ? (int) $data['id_santri'] : 0;
            $idPelanggaran = isset($data['id_pelanggaran']) ? (int) $data['id_pelanggaran'] : 0;
            if ($idSantri <= 0 || $idPelanggaran <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id_santri dan id_pelanggaran wajib'], 400);
            }
            $catatanRaw = isset($data['catatan']) ? trim((string) $data['catatan']) : '';
            if ($catatanRaw !== '' && mb_strlen($catatanRaw) > 4000) {
                $catatanRaw = mb_substr($catatanRaw, 0, 4000);
            }
            $catatan = $catatanRaw === '' ? null : $catatanRaw;

            $chkP = $this->db->prepare('SELECT id FROM pelanggaran WHERE id = ? AND aktif = 1 LIMIT 1');
            $chkP->execute([$idPelanggaran]);
            if (!$chkP->fetch(\PDO::FETCH_ASSOC)) {
                return $this->json($response, ['success' => false, 'message' => 'Jenis pelanggaran tidak ditemukan atau nonaktif'], 404);
            }

            $chkS = $this->db->prepare('SELECT id_diniyah, id_formal, id_kamar FROM santri WHERE id = ? LIMIT 1');
            $chkS->execute([$idSantri]);
            $srow = $chkS->fetch(\PDO::FETCH_ASSOC);
            if (!$srow) {
                return $this->json($response, ['success' => false, 'message' => 'Santri tidak ditemukan'], 404);
            }
            $idRombelDiniyah = isset($srow['id_diniyah']) && $srow['id_diniyah'] !== null && (int) $srow['id_diniyah'] > 0
                ? (int) $srow['id_diniyah'] : null;
            $idRombelFormal = isset($srow['id_formal']) && $srow['id_formal'] !== null && (int) $srow['id_formal'] > 0
                ? (int) $srow['id_formal'] : null;
            $idKamar = isset($srow['id_kamar']) && $srow['id_kamar'] !== null && (int) $srow['id_kamar'] > 0
                ? (int) $srow['id_kamar'] : null;

            $user = $request->getAttribute('user');
            $idPengurus = $user !== null ? (int) ($user['user_id'] ?? $user['id'] ?? 0) : 0;
            if ($idPengurus <= 0) {
                $idPengurus = null;
            }

            $sql = 'INSERT INTO santri___pelanggaran (
                id_santri, id_pelanggaran, catatan, id_rombel_diniyah, id_rombel_formal, id_kamar, id_pengurus
            ) VALUES (?, ?, ?, ?, ?, ?, ?)';
            $st = $this->db->prepare($sql);
            $st->execute([
                $idSantri,
                $idPelanggaran,
                $catatan,
                $idRombelDiniyah,
                $idRombelFormal,
                $idKamar,
                $idPengurus,
            ]);
            $id = (int) $this->db->lastInsertId();

            return $this->json($response, ['success' => true, 'message' => 'Pelanggaran dicatat', 'data' => ['id' => $id]], 201);
        } catch (\Exception $e) {
            error_log('createPelanggaran: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan pelanggaran'], 500);
        }
    }

    private function json(Response $response, array $data, int $code): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($code)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    /** @param array<string, mixed> $user */
    private function canDeleteCatatan(array $user): bool
    {
        if (!empty($user['is_real_super_admin'])) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, self::FITUR_ROMBEL_CATATAN_HAPUS);
    }

    private function buildCatatanKeteranganAktif(int $idSantri, string $sumber): ?string
    {
        $parts = [];
        $sumber = trim($sumber);
        if ($sumber !== '') {
            $parts[] = $sumber;
        }

        $aktif = $this->fetchSantriKonteksAktif($idSantri);
        if ($aktif !== null) {
            $diniyah = $this->formatRombelKonteks(
                'Diniyah aktif',
                $aktif['diniyah_lembaga_nama'] ?? $aktif['diniyah'] ?? null,
                $aktif['kelas_diniyah'] ?? null,
                $aktif['kel_diniyah'] ?? null
            );
            if ($diniyah !== null) {
                $parts[] = $diniyah;
            }

            $formal = $this->formatRombelKonteks(
                'Formal aktif',
                $aktif['formal_lembaga_nama'] ?? $aktif['formal'] ?? null,
                $aktif['kelas_formal'] ?? null,
                $aktif['kel_formal'] ?? null
            );
            if ($formal !== null) {
                $parts[] = $formal;
            }

            $kamar = $this->formatKamarKonteks($aktif['daerah'] ?? null, $aktif['kamar'] ?? null);
            if ($kamar !== null) {
                $parts[] = $kamar;
            }
        }

        $ket = implode(' | ', array_values(array_filter($parts, static fn($v) => trim((string) $v) !== '')));
        if ($ket === '') {
            return null;
        }

        return mb_strlen($ket) > 512 ? mb_substr($ket, 0, 512) : $ket;
    }

    /** @return array<string, mixed>|null */
    private function fetchSantriKonteksAktif(int $idSantri): ?array
    {
        $stmt = $this->db->prepare('
            SELECT
                rd.lembaga_id AS diniyah,
                ld.nama AS diniyah_lembaga_nama,
                rd.kelas AS kelas_diniyah,
                rd.kel AS kel_diniyah,
                rf.lembaga_id AS formal,
                lf.nama AS formal_lembaga_nama,
                rf.kelas AS kelas_formal,
                rf.kel AS kel_formal,
                d.daerah,
                dk.kamar
            FROM santri s
            LEFT JOIN lembaga___rombel rd ON rd.id = s.id_diniyah
            LEFT JOIN lembaga ld ON ld.id = rd.lembaga_id
            LEFT JOIN lembaga___rombel rf ON rf.id = s.id_formal
            LEFT JOIN lembaga lf ON lf.id = rf.lembaga_id
            LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
            LEFT JOIN daerah d ON d.id = dk.id_daerah
            WHERE s.id = ?
            LIMIT 1
        ');
        $stmt->execute([$idSantri]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    private function formatRombelKonteks(string $prefix, $lembaga, $kelas, $kel): ?string
    {
        $lembaga = trim((string) ($lembaga ?? ''));
        $kelas = trim((string) ($kelas ?? ''));
        $kel = trim((string) ($kel ?? ''));
        if ($lembaga === '' && $kelas === '' && $kel === '') {
            return null;
        }

        $label = $lembaga !== '' ? $lembaga : 'Rombel';
        if ($kelas !== '') {
            $label .= ' - ' . $kelas;
        }
        if ($kel !== '') {
            $label .= ' (' . $kel . ')';
        }

        return $prefix . ': ' . $label;
    }

    private function formatKamarKonteks($daerah, $kamar): ?string
    {
        $daerah = trim((string) ($daerah ?? ''));
        $kamar = trim((string) ($kamar ?? ''));
        if ($daerah === '' && $kamar === '') {
            return null;
        }

        if ($daerah !== '' && $kamar !== '') {
            return 'Kamar aktif: ' . $daerah . '.' . $kamar;
        }

        return 'Kamar aktif: ' . ($daerah !== '' ? $daerah : $kamar);
    }
}
