<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Evaluator rumus teks Bisyaroh: gabung string dengan &, literal "…", rujukan @pengurus/@jabatan/@pj/@[kolom].
 */
final class BisyarohTextFormulaEvaluator
{
    /**
     * @param array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>} $context
     * @param array<string, string> $colTextEnv nilai tampilan kolom di atas (@[col_key])
     */
    public static function evaluate(string $formula, array $context, array $colTextEnv): string
    {
        $p = new self();
        $p->context = $context;
        $p->colTextEnv = $colTextEnv;
        $p->s = trim($formula);
        $p->n = strlen($p->s);
        $p->i = 0;
        if ($p->n === 0) {
            throw new \InvalidArgumentException('Rumus kosong.');
        }
        $v = $p->parseConcat();
        $p->skipWs();
        if ($p->i < $p->n) {
            throw new \InvalidArgumentException('Ekspresi teks tidak lengkap di posisi ' . ($p->i + 1) . '.');
        }

        return $v;
    }

    /** @var array{pengurus: array<string, string>, jabatan: array<string, string>, pj: array<string, string>} */
    private array $context = [
        'pengurus' => [],
        'jabatan' => [],
        'pj' => [],
    ];

    /** @var array<string, string> */
    private array $colTextEnv = [];

    private string $s = '';

    private int $n = 0;

    private int $i = 0;

    private function skipWs(): void
    {
        while ($this->i < $this->n && ctype_space($this->s[$this->i])) {
            ++$this->i;
        }
    }

    private function parseConcat(): string
    {
        $parts = [$this->parsePrimary()];
        while (true) {
            $this->skipWs();
            if ($this->i >= $this->n || $this->s[$this->i] !== '&') {
                break;
            }
            ++$this->i;
            $parts[] = $this->parsePrimary();
        }

        return implode('', $parts);
    }

    private function parsePrimary(): string
    {
        $this->skipWs();
        if ($this->i >= $this->n) {
            throw new \InvalidArgumentException('Ekspresi teks terpotong setelah &.');
        }
        if ($this->s[$this->i] === '(') {
            ++$this->i;
            $v = $this->parseConcat();
            $this->skipWs();
            if ($this->i >= $this->n || $this->s[$this->i] !== ')') {
                throw new \InvalidArgumentException('Kurung tutup ) hilang.');
            }
            ++$this->i;

            return $v;
        }
        if ($this->s[$this->i] === '"') {
            return $this->parseQuotedString();
        }
        if ($this->s[$this->i] === '@') {
            return $this->parseReference();
        }
        throw new \InvalidArgumentException(
            'Kolom teks: gunakan "teks", rujukan @pengurus[…] / @jabatan[…] / @pj[…] / @[kolom], atau gabung dengan &. Fungsi angka (IF, SUM, …) hanya untuk kolom rumus tipe Angka/Rupiah/Persen.'
        );
    }

    private function parseQuotedString(): string
    {
        if ($this->s[$this->i] !== '"') {
            throw new \InvalidArgumentException('Literal teks wajib diawali tanda kutip ".');
        }
        ++$this->i;
        $out = '';
        while ($this->i < $this->n) {
            $ch = $this->s[$this->i];
            if ($ch === '\\') {
                if ($this->i + 1 >= $this->n) {
                    throw new \InvalidArgumentException('Escape tidak lengkap di literal teks.');
                }
                $next = $this->s[$this->i + 1];
                $out .= $next === 'n' ? "\n" : $next;
                $this->i += 2;
                continue;
            }
            if ($ch === '"') {
                ++$this->i;

                return $out;
            }
            $out .= $ch;
            ++$this->i;
        }
        throw new \InvalidArgumentException('Tanda kutip penutup " hilang.');
    }

    private function parseReference(): string
    {
        if ($this->s[$this->i] !== '@') {
            throw new \InvalidArgumentException('Rujukan teks harus diawali @.');
        }
        ++$this->i;
        if ($this->i < $this->n && $this->s[$this->i] === '[') {
            return $this->parseColRef();
        }
        $ns = $this->readIdentifier();
        if ($ns === '') {
            throw new \InvalidArgumentException('Rujukan @ tidak lengkap.');
        }
        $this->skipWs();
        if ($this->i >= $this->n || $this->s[$this->i] !== '[') {
            throw new \InvalidArgumentException('Rujukan @' . $ns . ' wajib diikuti [kolom].');
        }
        ++$this->i;
        $col = $this->readIdentifier();
        $this->skipWs();
        if ($this->i >= $this->n || $this->s[$this->i] !== ']') {
            throw new \InvalidArgumentException('Kurung ] hilang pada @' . $ns . '[' . $col);
        }
        ++$this->i;

        return $this->resolveNamespacedRef($ns, $col);
    }

    private function parseColRef(): string
    {
        ++$this->i;
        $col = $this->readIdentifier();
        if ($col === '') {
            throw new \InvalidArgumentException('Kunci kolom @[…] tidak boleh kosong.');
        }
        $this->skipWs();
        if ($this->i >= $this->n || $this->s[$this->i] !== ']') {
            throw new \InvalidArgumentException('Kurung ] hilang pada @[' . $col);
        }
        ++$this->i;
        if (!array_key_exists($col, $this->colTextEnv)) {
            throw new \InvalidArgumentException('Referensi @[' . $col . '] belum tersedia (isi kolom di atas / urutan kolom).');
        }

        return (string) $this->colTextEnv[$col];
    }

    private function readIdentifier(): string
    {
        $start = $this->i;
        while ($this->i < $this->n && (ctype_alnum($this->s[$this->i]) || $this->s[$this->i] === '_')) {
            ++$this->i;
        }

        return substr($this->s, $start, $this->i - $start);
    }

    private function resolveNamespacedRef(string $ns, string $col): string
    {
        $nsLower = strtolower($ns);
        if ($nsLower === 'pengurus') {
            if (!BisyarohPengurusFormulaHelper::isAllowedColumn($col)) {
                throw new \InvalidArgumentException('Kolom pengurus tidak diizinkan: ' . $col);
            }

            return $this->context['pengurus'][$col] ?? '';
        }
        if ($nsLower === 'jabatan') {
            if (!BisyarohPengurusFormulaHelper::isAllowedJabatanColumn($col)) {
                throw new \InvalidArgumentException('Kolom jabatan tidak diizinkan: ' . $col);
            }

            return $this->context['jabatan'][$col] ?? '';
        }
        if ($nsLower === 'pj' || $nsLower === 'pengurus_jabatan') {
            if (!BisyarohPengurusFormulaHelper::isAllowedPjColumn($col)) {
                throw new \InvalidArgumentException('Kolom penugasan tidak diizinkan: ' . $col);
            }

            return $this->context['pj'][$col] ?? '';
        }
        throw new \InvalidArgumentException('Namespace rujukan tidak dikenal: @' . $ns);
    }
}
