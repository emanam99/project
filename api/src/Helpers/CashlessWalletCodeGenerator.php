<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Kode wallet cashless (7 digit): YY hijriyah + 5 digit acak, unik global.
 * Contoh tahun 1445 → "45" + "18372" = 4518372
 */
final class CashlessWalletCodeGenerator
{
    private const CODE_LENGTH = 7;

    private const RANDOM_LENGTH = 5;

    private const MAX_ATTEMPTS = 30;

    public function __construct(private \PDO $db)
    {
    }

    public function generateUnique(): string
    {
        $yy = $this->resolveHijriYearSuffix();

        for ($i = 0; $i < self::MAX_ATTEMPTS; $i++) {
            $code = $yy . $this->randomSuffix();
            if ($this->isCodeAvailable($code)) {
                return $code;
            }
        }

        throw new \RuntimeException('Gagal menghasilkan kode wallet unik');
    }

    /**
     * 2 digit akhir tahun hijriyah (1445 → "45").
     */
    public function resolveHijriYearSuffix(): string
    {
        $today = date('Y-m-d');
        $hijriYmd = PsaKalenderMasehiToHijriHelper::masehiYmdToHijriyahYmd($this->db, $today, '12:00:00');
        if ($hijriYmd !== null && preg_match('/^(\d{4})-\d{2}-\d{2}$/', $hijriYmd, $m)) {
            return str_pad((string) ((int) $m[1] % 100), 2, '0', STR_PAD_LEFT);
        }

        $taRow = TahunAjaranActiveHelper::fetchActiveHijriyahRowForMasehiDate($this->db, $today);
        if ($taRow !== null) {
            $yy = self::yearSuffixFromTahunAjaran((string) ($taRow['tahun_ajaran'] ?? ''));
            if ($yy !== null) {
                return $yy;
            }
        }

        $fallbackTa = SantriRombelHelper::getDefaultTahunAjaran($this->db, 'hijriyah');
        if ($fallbackTa !== null) {
            $yy = self::yearSuffixFromTahunAjaran($fallbackTa);
            if ($yy !== null) {
                return $yy;
            }
        }

        return str_pad((string) (((int) date('Y')) % 100), 2, '0', STR_PAD_LEFT);
    }

    public static function yearSuffixFromTahunAjaran(string $tahunAjaran): ?string
    {
        $tahun = trim($tahunAjaran);
        if ($tahun === '') {
            return null;
        }
        if (str_contains($tahun, '-')) {
            $tahun = trim(explode('-', $tahun)[0]);
        }
        if (!preg_match('/^\d{4}$/', $tahun)) {
            return null;
        }
        return str_pad((string) ((int) $tahun % 100), 2, '0', STR_PAD_LEFT);
    }

    private function randomSuffix(): string
    {
        $max = (10 ** self::RANDOM_LENGTH) - 1;
        return str_pad((string) random_int(0, $max), self::RANDOM_LENGTH, '0', STR_PAD_LEFT);
    }

    private function isCodeAvailable(string $code): bool
    {
        if (strlen($code) !== self::CODE_LENGTH || !ctype_digit($code)) {
            return false;
        }
        $stmt = $this->db->prepare('SELECT 1 FROM cashless___accounts WHERE code = ? LIMIT 1');
        $stmt->execute([$code]);
        return $stmt->fetchColumn() === false;
    }
}
