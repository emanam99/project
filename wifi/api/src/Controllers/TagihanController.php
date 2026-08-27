<?php

namespace App\Controllers;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Support\TagihanBerulang;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class TagihanController
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function json(Response $response, array $payload, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }

    private function denyManage(Request $request, Response $response): ?Response
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::canManageData($user['role'] ?? null)) {
            return $this->json($response, ['success' => false, 'message' => 'Akses hanya lihat'], 403);
        }
        return null;
    }

    private function portalPelangganId(Request $request): ?int
    {
        $user = $request->getAttribute('user');
        if (!AuthHelper::isPortalUser($user['role'] ?? null)) {
            return null;
        }
        $pid = $user['pelanggan_id'] ?? null;
        return $pid !== null ? (int) $pid : 0;
    }

    private function parseBody(Request $request): array
    {
        $body = json_decode((string) $request->getBody(), true);
        return is_array($body) ? $body : [];
    }

    private function todayString(): string
    {
        return (new \DateTimeImmutable('now'))->format('Y-m-d');
    }

    private function enrichRow(array $row): array
    {
        $nominal = (float) $row['nominal'];
        $totalBayar = (float) ($row['total_bayar'] ?? 0);
        $sisa = max(0, $nominal - $totalBayar);
        return [
            'id' => (int) $row['id'],
            'pelanggan_id' => (int) $row['pelanggan_id'],
            'nama_pelanggan' => $row['nama_pelanggan'] ?? null,
            'nama' => $row['nama'],
            'nominal' => $nominal,
            'periode_bulan' => (int) $row['periode_bulan'],
            'periode_tahun' => (int) $row['periode_tahun'],
            'jatuh_tempo' => $row['jatuh_tempo'],
            'keterangan' => $row['keterangan'],
            'total_bayar' => $totalBayar,
            'sisa' => $sisa,
            'lunas' => $sisa <= 0.00001,
            'jumlah_bayar' => (int) ($row['jumlah_bayar'] ?? 0),
            'tanggal_bayar_terakhir' => $row['tanggal_bayar_terakhir'] ?? null,
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
            'pembayaran' => $row['pembayaran'] ?? null,
        ];
    }

    private function baseSelectSql(): string
    {
        return '
            SELECT t.*, p.nama AS nama_pelanggan,
                   COALESCE(SUM(b.nominal), 0) AS total_bayar,
                   COUNT(b.id) AS jumlah_bayar,
                   MAX(b.tanggal) AS tanggal_bayar_terakhir
            FROM tagihan t
            INNER JOIN pelanggan p ON p.id = t.pelanggan_id
            LEFT JOIN tagihan_bayar b ON b.tagihan_id = t.id
        ';
    }

    /** GET /tagihan */
    public function index(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $pelangganId = (int) ($params['pelanggan_id'] ?? 0);
        $bulan = (int) ($params['periode_bulan'] ?? 0);
        $tahun = (int) ($params['periode_tahun'] ?? 0);
        $status = trim((string) ($params['status'] ?? '')); // lunas|belum|all
        $q = trim((string) ($params['q'] ?? ''));

        $portalPid = $this->portalPelangganId($request);
        if ($portalPid !== null) {
            if ($portalPid <= 0) {
                return $this->json($response, ['success' => true, 'data' => []]);
            }
            $pelangganId = $portalPid;
        }

        $sql = $this->baseSelectSql() . ' WHERE 1=1';
        $bind = [];

        if ($pelangganId > 0) {
            $sql .= ' AND t.pelanggan_id = :pid';
            $bind['pid'] = $pelangganId;
        }
        if ($bulan >= 1 && $bulan <= 12) {
            $sql .= ' AND t.periode_bulan = :bulan';
            $bind['bulan'] = $bulan;
        }
        if ($tahun > 0) {
            $sql .= ' AND t.periode_tahun = :tahun';
            $bind['tahun'] = $tahun;
        }
        if ($q !== '' && $portalPid === null) {
            $sql .= ' AND (t.nama LIKE :q OR p.nama LIKE :q OR t.keterangan LIKE :q)';
            $bind['q'] = '%' . $q . '%';
        }

        $sql .= ' GROUP BY t.id';

        if ($status === 'lunas') {
            $sql .= ' HAVING (t.nominal - COALESCE(SUM(b.nominal), 0)) <= 0.00001';
        } elseif ($status === 'belum') {
            $sql .= ' HAVING (t.nominal - COALESCE(SUM(b.nominal), 0)) > 0.00001';
        }

        $sql .= ' ORDER BY t.periode_tahun DESC, t.periode_bulan DESC, t.jatuh_tempo ASC, t.id DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($bind);
        $rows = array_map(fn ($r) => $this->enrichRow($r), $stmt->fetchAll());

        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    /** GET /tagihan/{id} */
    public function show(Request $request, Response $response, array $args): Response
    {
        $id = (int) ($args['id'] ?? 0);
        $sql = $this->baseSelectSql() . ' WHERE t.id = :id GROUP BY t.id LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Tagihan tidak ditemukan'], 404);
        }

        $portalPid = $this->portalPelangganId($request);
        if ($portalPid !== null && (int) $row['pelanggan_id'] !== $portalPid) {
            return $this->json($response, ['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $bayarStmt = $this->db->prepare(
            'SELECT b.id, b.tagihan_id, b.nominal, b.tanggal, b.via, b.keterangan, b.created_by, b.created_at,
                    u.name AS created_by_name, u.email AS created_by_email
             FROM tagihan_bayar b
             LEFT JOIN users u ON u.id = b.created_by
             WHERE b.tagihan_id = ?
             ORDER BY b.tanggal DESC, b.id DESC'
        );
        $bayarStmt->execute([$id]);
        $pembayaran = array_map(static function ($b) {
            $byName = trim((string) ($b['created_by_name'] ?? ''));
            if ($byName === '') {
                $byName = trim((string) ($b['created_by_email'] ?? ''));
            }
            return [
                'id' => (int) $b['id'],
                'tagihan_id' => (int) $b['tagihan_id'],
                'nominal' => (float) $b['nominal'],
                'tanggal' => $b['tanggal'],
                'via' => $b['via'],
                'keterangan' => $b['keterangan'],
                'created_by' => $b['created_by'] !== null ? (int) $b['created_by'] : null,
                'created_by_name' => $byName !== '' ? $byName : null,
                'created_at' => $b['created_at'],
            ];
        }, $bayarStmt->fetchAll());

        $data = $this->enrichRow($row);
        $data['pembayaran'] = $pembayaran;

        return $this->json($response, ['success' => true, 'data' => $data]);
    }

    /** POST /tagihan — single atau batch (pelanggan_ids) */
    public function create(Request $request, Response $response): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $body = $this->parseBody($request);
        $nama = trim((string) ($body['nama'] ?? ''));
        $nominal = (float) ($body['nominal'] ?? 0);
        $bulan = (int) ($body['periode_bulan'] ?? 0);
        $tahun = (int) ($body['periode_tahun'] ?? 0);
        $jatuhTempo = trim((string) ($body['jatuh_tempo'] ?? ''));
        $keterangan = trim((string) ($body['keterangan'] ?? ''));
        $berulang = !empty($body['berulang']);
        $jatuhTempoHari = (int) ($body['jatuh_tempo_hari'] ?? 10);
        if ($jatuhTempoHari < 1 || $jatuhTempoHari > 31) {
            $jatuhTempoHari = 10;
        }

        $pelangganIds = $body['pelanggan_ids'] ?? null;
        if (!is_array($pelangganIds)) {
            $single = (int) ($body['pelanggan_id'] ?? 0);
            $pelangganIds = $single > 0 ? [$single] : [];
        }
        $pelangganIds = array_values(array_unique(array_filter(array_map(
            static fn ($id) => (int) $id,
            $pelangganIds
        ), static fn ($id) => $id > 0)));

        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama tagihan wajib'], 422);
        }
        if ($nominal <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Nominal harus > 0'], 422);
        }
        if ($bulan < 1 || $bulan > 12) {
            return $this->json($response, ['success' => false, 'message' => 'Periode bulan tidak valid'], 422);
        }
        if ($tahun < 2000 || $tahun > 2100) {
            return $this->json($response, ['success' => false, 'message' => 'Periode tahun tidak valid'], 422);
        }
        if ($jatuhTempo === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $jatuhTempo)) {
            return $this->json($response, ['success' => false, 'message' => 'Jatuh tempo tidak valid'], 422);
        }
        if (count($pelangganIds) === 0) {
            return $this->json($response, ['success' => false, 'message' => 'Pilih minimal satu pelanggan'], 422);
        }

        $check = $this->db->prepare('SELECT id FROM pelanggan WHERE id = ?');
        $ins = $this->db->prepare(
            'INSERT INTO tagihan (pelanggan_id, nama, nominal, periode_bulan, periode_tahun, jatuh_tempo, keterangan, berulang_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        $user = $request->getAttribute('user');
        $createdBy = isset($user['id']) ? (int) $user['id'] : null;

        $createdIds = [];
        $this->db->beginTransaction();
        try {
            $berulangMap = [];
            if ($berulang) {
                $templateIds = TagihanBerulang::upsertTemplates(
                    $pelangganIds,
                    $nominal,
                    $keterangan !== '' ? $keterangan : null,
                    $jatuhTempoHari,
                    $createdBy
                );
                $berulangMap = TagihanBerulang::mapPelangganToBerulangId($templateIds);
            }

            foreach ($pelangganIds as $pid) {
                $check->execute([$pid]);
                if (!$check->fetch()) {
                    throw new \RuntimeException('Pelanggan #' . $pid . ' tidak ditemukan');
                }
                $bid = $berulangMap[$pid] ?? null;
                $ins->execute([
                    $pid,
                    $nama,
                    $nominal,
                    $bulan,
                    $tahun,
                    $jatuhTempo,
                    $keterangan !== '' ? $keterangan : null,
                    $bid,
                ]);
                $createdIds[] = (int) $this->db->lastInsertId();
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 422);
        }

        $placeholders = implode(',', array_fill(0, count($createdIds), '?'));
        $sql = $this->baseSelectSql() . " WHERE t.id IN ($placeholders) GROUP BY t.id ORDER BY t.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($createdIds);
        $rows = array_map(fn ($r) => $this->enrichRow($r), $stmt->fetchAll());

        return $this->json($response, [
            'success' => true,
            'data' => count($rows) === 1 ? $rows[0] : $rows,
            'count' => count($rows),
            'berulang' => $berulang,
        ], 201);
    }

    /** GET /tagihan/berulang */
    public function listBerulang(Request $request, Response $response): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $params = $request->getQueryParams();
        $pelangganId = (int) ($params['pelanggan_id'] ?? 0);
        $rows = TagihanBerulang::listForPelanggan($pelangganId > 0 ? $pelangganId : null);
        return $this->json($response, ['success' => true, 'data' => $rows]);
    }

    /** DELETE /tagihan/berulang/{id} — matikan auto bulanan */
    public function deleteBerulang(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        if ($id <= 0 || !TagihanBerulang::deactivate($id)) {
            return $this->json($response, ['success' => false, 'message' => 'Template berulang tidak ditemukan'], 404);
        }
        return $this->json($response, ['success' => true, 'message' => 'Tagihan berulang dimatikan']);
    }

    /** PUT /tagihan/{id} */
    public function update(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT * FROM tagihan WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            return $this->json($response, ['success' => false, 'message' => 'Tagihan tidak ditemukan'], 404);
        }

        $body = $this->parseBody($request);
        $nama = array_key_exists('nama', $body) ? trim((string) $body['nama']) : $existing['nama'];
        $nominal = array_key_exists('nominal', $body) ? (float) $body['nominal'] : (float) $existing['nominal'];
        $bulan = array_key_exists('periode_bulan', $body) ? (int) $body['periode_bulan'] : (int) $existing['periode_bulan'];
        $tahun = array_key_exists('periode_tahun', $body) ? (int) $body['periode_tahun'] : (int) $existing['periode_tahun'];
        $jatuhTempo = array_key_exists('jatuh_tempo', $body) ? trim((string) $body['jatuh_tempo']) : $existing['jatuh_tempo'];
        $keterangan = array_key_exists('keterangan', $body)
            ? (trim((string) $body['keterangan']) ?: null)
            : $existing['keterangan'];

        if ($nama === '') {
            return $this->json($response, ['success' => false, 'message' => 'Nama tagihan wajib'], 422);
        }
        if ($nominal <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Nominal harus > 0'], 422);
        }
        if ($bulan < 1 || $bulan > 12 || $tahun < 2000) {
            return $this->json($response, ['success' => false, 'message' => 'Periode tidak valid'], 422);
        }
        if ($jatuhTempo === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $jatuhTempo)) {
            return $this->json($response, ['success' => false, 'message' => 'Jatuh tempo tidak valid'], 422);
        }

        $sumStmt = $this->db->prepare('SELECT COALESCE(SUM(nominal),0) FROM tagihan_bayar WHERE tagihan_id = ?');
        $sumStmt->execute([$id]);
        $paid = (float) $sumStmt->fetchColumn();
        if ($nominal + 0.00001 < $paid) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Nominal tidak boleh kurang dari total pembayaran (Rp ' . number_format($paid, 0, ',', '.') . ')',
            ], 422);
        }

        $upd = $this->db->prepare(
            'UPDATE tagihan SET nama = ?, nominal = ?, periode_bulan = ?, periode_tahun = ?, jatuh_tempo = ?, keterangan = ?,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([$nama, $nominal, $bulan, $tahun, $jatuhTempo, $keterangan, $id]);

        return $this->show($request, $response, $args);
    }

    /** DELETE /tagihan/{id} */
    public function delete(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT id FROM tagihan WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            return $this->json($response, ['success' => false, 'message' => 'Tagihan tidak ditemukan'], 404);
        }

        $sumStmt = $this->db->prepare('SELECT COALESCE(SUM(nominal),0) FROM tagihan_bayar WHERE tagihan_id = ?');
        $sumStmt->execute([$id]);
        $paid = (float) $sumStmt->fetchColumn();
        if ($paid > 0) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Tagihan sudah ada pembayaran; hapus pembayaran dulu atau biarkan',
            ], 422);
        }

        $del = $this->db->prepare('DELETE FROM tagihan WHERE id = ?');
        $del->execute([$id]);

        return $this->json($response, ['success' => true, 'message' => 'Tagihan dihapus']);
    }

    /** POST /tagihan/bayar */
    public function createBayar(Request $request, Response $response): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $user = $request->getAttribute('user');
        $body = $this->parseBody($request);
        $tagihanId = (int) ($body['tagihan_id'] ?? 0);
        $nominal = (float) ($body['nominal'] ?? 0);
        $tanggal = trim((string) ($body['tanggal'] ?? ''));
        $keterangan = trim((string) ($body['keterangan'] ?? ''));
        $via = strtolower(trim((string) ($body['via'] ?? 'cash')));
        if (!in_array($via, ['cash', 'tf'], true)) {
            $via = 'cash';
        }

        if ($tagihanId <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'tagihan_id wajib'], 422);
        }
        if ($nominal <= 0) {
            return $this->json($response, ['success' => false, 'message' => 'Nominal pembayaran harus > 0'], 422);
        }
        if ($tanggal === '') {
            $tanggal = $this->todayString();
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return $this->json($response, ['success' => false, 'message' => 'Format tanggal tidak valid'], 422);
        }

        $stmt = $this->db->prepare(
            'SELECT t.id, t.nominal, COALESCE(SUM(b.nominal), 0) AS total_bayar
             FROM tagihan t
             LEFT JOIN tagihan_bayar b ON b.tagihan_id = t.id
             WHERE t.id = ?
             GROUP BY t.id'
        );
        $stmt->execute([$tagihanId]);
        $tagihan = $stmt->fetch();
        if (!$tagihan) {
            return $this->json($response, ['success' => false, 'message' => 'Tagihan tidak ditemukan'], 404);
        }

        $sisa = (float) $tagihan['nominal'] - (float) $tagihan['total_bayar'];
        if ($nominal > $sisa + 0.00001) {
            return $this->json($response, [
                'success' => false,
                'message' => 'Nominal melebihi sisa tagihan (' . $sisa . ')',
            ], 422);
        }

        $ins = $this->db->prepare(
            'INSERT INTO tagihan_bayar (tagihan_id, nominal, tanggal, via, keterangan, created_by)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $ins->execute([
            $tagihanId,
            $nominal,
            $tanggal,
            $via,
            $keterangan !== '' ? $keterangan : null,
            (int) ($user['id'] ?? 0) ?: null,
        ]);

        return $this->show($request, $response, ['id' => $tagihanId]);
    }

    /** DELETE /tagihan/bayar/{id} */
    public function deleteBayar(Request $request, Response $response, array $args): Response
    {
        if ($denied = $this->denyManage($request, $response)) {
            return $denied;
        }
        $id = (int) ($args['id'] ?? 0);
        $stmt = $this->db->prepare('SELECT id, tagihan_id FROM tagihan_bayar WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            return $this->json($response, ['success' => false, 'message' => 'Pembayaran tidak ditemukan'], 404);
        }

        $del = $this->db->prepare('DELETE FROM tagihan_bayar WHERE id = ?');
        $del->execute([$id]);

        return $this->show($request, $response, ['id' => (int) $row['tagihan_id']]);
    }
}
