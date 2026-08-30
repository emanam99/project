<?php

namespace App\Services;

use App\Config\Database;
use App\Helpers\AuthHelper;
use App\Helpers\TenantHostHelper;
use PDO;

class SppgService
{
    public const SUBSCRIPTION_AMOUNT = 50000.0;

    private PDO $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM sppg WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function findBySlug(string $slug): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM sppg WHERE slug = ? LIMIT 1');
        $stmt->execute([$slug]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function findBySubdomain(string $subdomain): ?array
    {
        $sub = TenantHostHelper::normalizeSubdomain($subdomain);
        if ($sub === '') {
            return null;
        }
        $stmt = $this->db->prepare('SELECT * FROM sppg WHERE subdomain = ? LIMIT 1');
        $stmt->execute([$sub]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function isSubdomainAvailable(string $subdomain): bool
    {
        $sub = TenantHostHelper::normalizeSubdomain($subdomain);
        if ($sub === '' || !TenantHostHelper::isValidSubdomainFormat($sub)) {
            return false;
        }
        if (TenantHostHelper::isReservedSubdomain($sub)) {
            return false;
        }
        $stmt = $this->db->prepare('SELECT id FROM sppg WHERE subdomain = ? LIMIT 1');
        $stmt->execute([$sub]);
        return !$stmt->fetch();
    }

    public static function normalizeSubdomain(string $text): string
    {
        return TenantHostHelper::normalizeSubdomain($text);
    }

    public function isSlugAvailable(string $slug): bool
    {
        if ($slug === '') {
            return false;
        }
        $stmt = $this->db->prepare('SELECT id FROM sppg WHERE slug = ? LIMIT 1');
        $stmt->execute([$slug]);
        return !$stmt->fetch();
    }

    public function getActiveSubscription(int $sppgId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM sppg_subscriptions WHERE sppg_id = ? ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$sppgId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function getPaymentHistory(int $sppgId, int $limit = 10): array
    {
        $stmt = $this->db->prepare(
            'SELECT id, amount, currency, status, xendit_invoice_id, paid_at, created_at
             FROM sppg_subscription_payments
             WHERE sppg_id = ?
             ORDER BY id DESC
             LIMIT ?'
        );
        $stmt->bindValue(1, $sppgId, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function publicProfile(array $sppg): array
    {
        return [
            'id' => (int) $sppg['id'],
            'public_id' => $sppg['public_id'],
            'slug' => $sppg['slug'],
            'subdomain' => $sppg['subdomain'] ?? null,
            'tenant_url' => TenantHostHelper::tenantUrl($sppg['subdomain'] ?? null),
            'nama_unit' => $sppg['nama_unit'],
            'nama_yayasan' => $sppg['nama_yayasan'],
            'alamat' => $sppg['alamat'],
            'telepon' => $sppg['telepon'],
            'email_kontak' => $sppg['email_kontak'],
            'status' => $sppg['status'],
            'pwa_short_name' => $sppg['pwa_short_name'] ?? null,
            'pwa_logo_url' => self::publicLogoUrl($sppg),
        ];
    }

    public static function publicLogoUrl(array $sppg, ?string $origin = null): ?string
    {
        if (empty($sppg['pwa_logo_path']) || empty($sppg['slug'])) {
            return null;
        }
        $base = $origin ?? AuthHelper::getFrontendUrl();
        return rtrim($base, '/') . '/api/public/sppg/pwa-logo?slug=' . rawurlencode((string) $sppg['slug']);
    }

    public function publicSubscription(?array $sub): ?array
    {
        if (!$sub) {
            return null;
        }
        return [
            'id' => (int) $sub['id'],
            'plan_code' => $sub['plan_code'],
            'amount' => (float) $sub['amount'],
            'currency' => $sub['currency'],
            'status' => $sub['status'],
            'period_start' => $sub['period_start'],
            'period_end' => $sub['period_end'],
            'invoice_url' => $sub['xendit_invoice_url'] ?? null,
        ];
    }

    public static function slugify(string $text): string
    {
        $text = strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9\s-]/', '', $text) ?? '';
        $text = preg_replace('/[\s-]+/', '-', $text) ?? '';
        return trim($text, '-');
    }

    public function nextPublicId(): string
    {
        $stmt = $this->db->query('SELECT COUNT(*) FROM sppg');
        $n = (int) $stmt->fetchColumn() + 1;
        return 'SPPG-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    /**
     * @param array{nama_unit:string,nama_yayasan:string,slug:string,subdomain?:string,alamat?:string,telepon?:string,email_kontak?:string} $data
     */
    public function createTenant(array $data): array
    {
        $slug = self::slugify($data['slug'] ?? '');
        if ($slug === '' || !$this->isSlugAvailable($slug)) {
            throw new \InvalidArgumentException('Slug SPPG tidak valid atau sudah dipakai');
        }

        $subdomain = self::normalizeSubdomain((string) ($data['subdomain'] ?? ''));
        $baseDomain = TenantHostHelper::tenantBaseDomain();
        if ($baseDomain !== null) {
            if ($subdomain === '' || !TenantHostHelper::isValidSubdomainFormat($subdomain)) {
                throw new \InvalidArgumentException('Subdomain tidak valid');
            }
            if (!$this->isSubdomainAvailable($subdomain)) {
                throw new \InvalidArgumentException('Subdomain sudah dipakai');
            }
        } else {
            $subdomain = $subdomain !== '' ? $subdomain : null;
        }

        $publicId = $this->nextPublicId();
        $ins = $this->db->prepare(
            'INSERT INTO sppg (public_id, slug, subdomain, nama_unit, nama_yayasan, alamat, telepon, email_kontak, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'pending_payment\')'
        );
        $ins->execute([
            $publicId,
            $slug,
            $subdomain,
            trim($data['nama_unit']),
            trim($data['nama_yayasan']),
            trim((string) ($data['alamat'] ?? '')) ?: null,
            trim((string) ($data['telepon'] ?? '')) ?: null,
            trim((string) ($data['email_kontak'] ?? '')) ?: null,
        ]);
        $sppgId = (int) $this->db->lastInsertId();

        $subIns = $this->db->prepare(
            'INSERT INTO sppg_subscriptions (sppg_id, plan_code, amount, currency, status)
             VALUES (?, \'basic\', ?, \'IDR\', \'pending_payment\')'
        );
        $subIns->execute([$sppgId, self::SUBSCRIPTION_AMOUNT]);

        return $this->findById($sppgId) ?? [];
    }

    public function updateProfile(int $sppgId, array $data): ?array
    {
        $existing = $this->findById($sppgId);
        if (!$existing) {
            return null;
        }

        $namaUnit = array_key_exists('nama_unit', $data) ? trim((string) $data['nama_unit']) : $existing['nama_unit'];
        $namaYayasan = array_key_exists('nama_yayasan', $data) ? trim((string) $data['nama_yayasan']) : $existing['nama_yayasan'];
        $alamat = array_key_exists('alamat', $data) ? trim((string) $data['alamat']) : ($existing['alamat'] ?? '');
        $telepon = array_key_exists('telepon', $data) ? trim((string) $data['telepon']) : ($existing['telepon'] ?? '');
        $emailKontak = array_key_exists('email_kontak', $data) ? trim((string) $data['email_kontak']) : ($existing['email_kontak'] ?? '');
        $pwaShort = array_key_exists('pwa_short_name', $data)
            ? trim((string) $data['pwa_short_name'])
            : ($existing['pwa_short_name'] ?? '');

        if ($namaUnit === '' || $namaYayasan === '') {
            throw new \InvalidArgumentException('Nama unit dan nama yayasan wajib diisi');
        }
        if ($pwaShort !== '' && strlen($pwaShort) > 64) {
            throw new \InvalidArgumentException('Nama aplikasi PWA maksimal 64 karakter');
        }

        $upd = $this->db->prepare(
            'UPDATE sppg SET nama_unit = ?, nama_yayasan = ?, alamat = ?, telepon = ?, email_kontak = ?, pwa_short_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([
            $namaUnit,
            $namaYayasan,
            $alamat !== '' ? $alamat : null,
            $telepon !== '' ? $telepon : null,
            $emailKontak !== '' ? $emailKontak : null,
            $pwaShort !== '' ? $pwaShort : null,
            $sppgId,
        ]);

        return $this->findById($sppgId);
    }

    public function updatePwaLogo(int $sppgId, string $relPath, string $mime): ?array
    {
        $upd = $this->db->prepare(
            'UPDATE sppg SET pwa_logo_path = ?, pwa_logo_tipe = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([$relPath, $mime, $sppgId]);
        return $this->findById($sppgId);
    }

    public function clearPwaLogo(int $sppgId): ?array
    {
        $upd = $this->db->prepare(
            'UPDATE sppg SET pwa_logo_path = NULL, pwa_logo_tipe = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([$sppgId]);
        return $this->findById($sppgId);
    }

    public function markPendingDns(int $sppgId): ?array
    {
        $upd = $this->db->prepare(
            'UPDATE sppg SET status = \'pending_dns\', updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        $upd->execute([$sppgId]);
        return $this->findById($sppgId);
    }
}
