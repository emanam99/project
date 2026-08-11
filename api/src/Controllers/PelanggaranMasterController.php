<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Config\EbeddienFiturAccess;
use App\Database;
use App\Helpers\RoleHelper;
use App\Helpers\TextSanitizer;
use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * CRUD master `pelanggaran` — akses granular lewat action.domisili.pelanggaran.* + menu.domisili.pelanggaran.
 */
final class PelanggaranMasterController
{
    private PDO $db;

    /** @var list<string> */
    private const KATEGORI = ['ringan', 'sedang', 'berat', 'buku_hitam'];

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    private function json(Response $response, array $data, int $code = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response->withStatus($code)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }

    private function isRealSuper(array $user): bool
    {
        return !empty($user['is_real_super_admin']);
    }

    /** Tarbiyah super tanpa penugasan fitur (fallback legacy sama middleware). */
    private function passesLegacyTarbiyahSuper(array $user): bool
    {
        if (RoleHelper::tokenUnionHasAnyEbeddienFiturAssignment($this->db, $user)) {
            return false;
        }

        return RoleHelper::tokenMatchesAnyEbeddienFiturSelector($this->db, $user, EbeddienFiturAccess::tarbiyahSuperSelectors());
    }

    private function canReadList(array $user): bool
    {
        if ($this->isRealSuper($user)) {
            return true;
        }
        if ($this->passesLegacyTarbiyahSuper($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'menu.domisili.pelanggaran')
            || RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.domisili.pelanggaran.halaman');
    }

    private function canCreate(array $user): bool
    {
        if ($this->isRealSuper($user)) {
            return true;
        }
        if ($this->passesLegacyTarbiyahSuper($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.domisili.pelanggaran.buat');
    }

    private function canEdit(array $user): bool
    {
        if ($this->isRealSuper($user)) {
            return true;
        }
        if ($this->passesLegacyTarbiyahSuper($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.domisili.pelanggaran.ubah');
    }

    private function canSetStatus(array $user): bool
    {
        if ($this->isRealSuper($user)) {
            return true;
        }
        if ($this->passesLegacyTarbiyahSuper($user)) {
            return true;
        }

        return RoleHelper::tokenHasEbeddienFiturCode($this->db, $user, 'action.domisili.pelanggaran.status');
    }

    private static function normalizeKategori(mixed $v): ?string
    {
        $k = strtolower(trim((string) $v));

        return in_array($k, self::KATEGORI, true) ? $k : null;
    }

    public function getAll(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user) || !$this->canReadList($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berhak mengakses daftar pelanggaran'], 403);
            }
            $sql = 'SELECT id, kategori, nama, urutan, aktif, tanggal_dibuat, tanggal_update FROM pelanggaran';
            $onlyAktif = isset($request->getQueryParams()['aktif']) ? trim((string) $request->getQueryParams()['aktif']) : '';
            if ($onlyAktif === '1' || strtolower($onlyAktif) === 'true') {
                $sql .= ' WHERE aktif = 1';
            }
            $sql .= ' ORDER BY kategori ASC, urutan ASC, nama ASC';
            $st = $this->db->prepare($sql);
            $st->execute();

            return $this->json($response, ['success' => true, 'data' => $st->fetchAll(PDO::FETCH_ASSOC)], 200);
        } catch (\Throwable $e) {
            error_log('PelanggaranMasterController::getAll: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memuat data'], 500);
        }
    }

    public function create(Request $request, Response $response): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user) || !$this->canCreate($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berhak menambah pelanggaran'], 403);
            }
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, []) : [];
            $kat = self::normalizeKategori($body['kategori'] ?? '');
            $nama = isset($body['nama']) ? trim((string) $body['nama']) : '';
            $urutan = isset($body['urutan']) ? (int) $body['urutan'] : 0;
            if ($kat === null || $nama === '') {
                return $this->json($response, ['success' => false, 'message' => 'kategori dan nama wajib'], 400);
            }
            if (mb_strlen($nama) > 255) {
                $nama = mb_substr($nama, 0, 255);
            }
            $aktif = 1;
            if (array_key_exists('aktif', $body)) {
                $aktif = ((int) $body['aktif'] === 0 || $body['aktif'] === false || $body['aktif'] === '0') ? 0 : 1;
            }
            $st = $this->db->prepare(
                'INSERT INTO pelanggaran (kategori, nama, urutan, aktif) VALUES (?, ?, ?, ?)'
            );
            $st->execute([$kat, $nama, $urutan, $aktif]);
            $id = (int) $this->db->lastInsertId();

            return $this->json($response, ['success' => true, 'message' => 'Jenis pelanggaran ditambahkan', 'data' => ['id' => $id]], 201);
        } catch (\Throwable $e) {
            error_log('PelanggaranMasterController::create: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal menyimpan'], 500);
        }
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user) || !$this->canEdit($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berhak mengubah pelanggaran'], 403);
            }
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id tidak valid'], 400);
            }
            $chk = $this->db->prepare('SELECT id FROM pelanggaran WHERE id = ? LIMIT 1');
            $chk->execute([$id]);
            if (!$chk->fetch(PDO::FETCH_ASSOC)) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, []) : [];
            $kat = self::normalizeKategori($body['kategori'] ?? '');
            $nama = isset($body['nama']) ? trim((string) $body['nama']) : '';
            $urutan = isset($body['urutan']) ? (int) $body['urutan'] : 0;
            if ($kat === null || $nama === '') {
                return $this->json($response, ['success' => false, 'message' => 'kategori dan nama wajib'], 400);
            }
            if (mb_strlen($nama) > 255) {
                $nama = mb_substr($nama, 0, 255);
            }
            $aktif = 1;
            if (array_key_exists('aktif', $body)) {
                $aktif = ((int) $body['aktif'] === 0 || $body['aktif'] === false || $body['aktif'] === '0') ? 0 : 1;
            }
            $st = $this->db->prepare('UPDATE pelanggaran SET kategori = ?, nama = ?, urutan = ?, aktif = ? WHERE id = ?');
            $st->execute([$kat, $nama, $urutan, $aktif, $id]);

            return $this->json($response, ['success' => true, 'message' => 'Data diperbarui'], 200);
        } catch (\Throwable $e) {
            error_log('PelanggaranMasterController::update: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal memperbarui'], 500);
        }
    }

    public function setStatus(Request $request, Response $response, array $args): Response
    {
        try {
            $user = $request->getAttribute('user');
            if (!is_array($user) || !$this->canSetStatus($user)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak berhak mengubah status'], 403);
            }
            $id = isset($args['id']) ? (int) $args['id'] : 0;
            if ($id <= 0) {
                return $this->json($response, ['success' => false, 'message' => 'id tidak valid'], 400);
            }
            $body = $request->getParsedBody();
            $body = is_array($body) ? $body : [];
            $aktifRaw = $body['aktif'] ?? null;
            $aktif = ((int) $aktifRaw === 0 || $aktifRaw === false || $aktifRaw === '0') ? 0 : 1;
            $st = $this->db->prepare('UPDATE pelanggaran SET aktif = ? WHERE id = ?');
            $st->execute([$aktif, $id]);
            if ($st->rowCount() === 0) {
                return $this->json($response, ['success' => false, 'message' => 'Data tidak ditemukan'], 404);
            }

            return $this->json($response, ['success' => true, 'message' => $aktif === 1 ? 'Diaktifkan' : 'Dinonaktifkan'], 200);
        } catch (\Throwable $e) {
            error_log('PelanggaranMasterController::setStatus: ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Gagal mengubah status'], 500);
        }
    }
}
