<?php

namespace App\Helpers;

/**
 * Pembuat XLSX minimal (ZIP store) tanpa ekstensi zip/PhpSpreadsheet.
 * Layout mengikuti template MAKER OPERASIONAL: No | Nama | Harga | Keterangan | Total.
 *
 * Mendukung multi-sheet: satu hari = satu sheet.
 *
 * Baris bisa bertipe:
 * - item (default): nomor + nama barang + harga + keterangan rekening + total
 * - group: header kelompok rekening
 * - subtotal: subtotal per rekening
 */
class SimpleXlsxWriter
{
    /**
     * Satu sheet (kompatibilitas lama).
     *
     * @param list<array{
     *   kind?: 'item'|'group'|'subtotal',
     *   nama?: string,
     *   harga?: float|int,
     *   keterangan?: string,
     *   catatan?: string
     * }> $rows
     */
    public static function makerOperasional(string $title, array $rows): string
    {
        return self::makerOperasionalSheets([
            [
                'name' => 'operasional',
                'title' => $title,
                'rows' => $rows,
            ],
        ]);
    }

    /**
     * Multi-sheet: tiap elemen = satu hari.
     *
     * @param list<array{
     *   name: string,
     *   title: string,
     *   rows: list<array{
     *     kind?: 'item'|'group'|'subtotal',
     *     nama?: string,
     *     harga?: float|int,
     *     keterangan?: string,
     *     catatan?: string
     *   }>
     * }> $sheets
     */
    public static function makerOperasionalSheets(array $sheets): string
    {
        if (!$sheets) {
            throw new \InvalidArgumentException('Tidak ada sheet untuk diekspor');
        }

        $shared = [];
        $si = static function (string $text) use (&$shared): int {
            $text = self::xmlSafe($text);
            $idx = array_search($text, $shared, true);
            if ($idx === false) {
                $shared[] = $text;
                return count($shared) - 1;
            }
            return (int) $idx;
        };

        $hNo = $si('No');
        $hNama = $si('Nama');
        $hHarga = $si('Harga ');
        $hKet = $si('Keterangan ');
        $hTotal = $si('Total ');
        $hGrand = $si('TOTAL ');

        $sheetFiles = [];
        $sheetMeta = [];
        $usedNames = [];

        foreach ($sheets as $i => $sheet) {
            $rawName = trim((string) ($sheet['name'] ?? ('Sheet' . ($i + 1))));
            $sheetName = self::uniqueSheetName($rawName !== '' ? $rawName : ('Sheet' . ($i + 1)), $usedNames);
            $usedNames[] = mb_strtolower($sheetName);

            $title = trim((string) ($sheet['title'] ?? ''));
            if ($title === '') {
                $title = 'PENGAJUAN MAKER OPERASIONAL';
            }
            $titleIdx = $si($title);
            $rows = $sheet['rows'] ?? [];
            if (!is_array($rows)) {
                $rows = [];
            }

            $built = self::buildSheetXml($rows, $titleIdx, $hNo, $hNama, $hHarga, $hKet, $hTotal, $hGrand, $si, $i === 0);
            $n = $i + 1;
            $sheetFiles['xl/worksheets/sheet' . $n . '.xml'] = $built;
            $sheetMeta[] = [
                'name' => $sheetName,
                'rid' => 'rId' . $n,
                'sheetId' => $n,
                'part' => '/xl/worksheets/sheet' . $n . '.xml',
            ];
        }

        $sharedXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'
            . count($shared) . '" uniqueCount="' . count($shared) . '">';
        foreach ($shared as $text) {
            $sharedXml .= '<si><t>' . $text . '</t></si>';
        }
        $sharedXml .= '</sst>';

        $files = [
            '[Content_Types].xml' => self::contentTypes($sheetMeta),
            '_rels/.rels' => self::relsRoot(),
            'xl/workbook.xml' => self::workbook($sheetMeta),
            'xl/_rels/workbook.xml.rels' => self::workbookRels($sheetMeta),
            'xl/styles.xml' => self::styles(),
            'xl/sharedStrings.xml' => $sharedXml,
        ];
        foreach ($sheetFiles as $path => $xml) {
            $files[$path] = $xml;
        }

        return self::zipStore($files);
    }

    /**
     * @param list<array{kind?:string,nama?:string,harga?:float|int,keterangan?:string,catatan?:string}> $rows
     * @param callable(string):int $si
     */
    private static function buildSheetXml(
        array $rows,
        int $titleIdx,
        int $hNo,
        int $hNama,
        int $hHarga,
        int $hKet,
        int $hTotal,
        int $hGrand,
        callable $si,
        bool $tabSelected
    ): string {
        $sheetRows = [];
        $merges = ['B1:F1'];

        $sheetRows[] = self::rowXml(1, [
            self::cellS('B1', $titleIdx, 9),
            self::cellEmpty('C1', 9),
            self::cellEmpty('D1', 9),
            self::cellEmpty('E1', 9),
            self::cellEmpty('F1', 9),
        ]);
        $sheetRows[] = self::rowXml(3, [
            self::cellS('A3', $hNo, 1),
            self::cellS('B3', $hNama, 2),
            self::cellS('C3', $hHarga, 2),
            self::cellS('D3', $hKet, 2),
            self::cellS('E3', $hTotal, 2),
        ]);

        $grand = 0.0;
        $r = 4;
        $no = 1;
        foreach ($rows as $row) {
            $kind = (string) ($row['kind'] ?? 'item');
            $nama = trim((string) ($row['nama'] ?? ''));
            $ket = trim((string) ($row['keterangan'] ?? ''));
            $catatan = trim((string) ($row['catatan'] ?? ''));
            $harga = (float) ($row['harga'] ?? 0);

            if ($kind === 'group') {
                $label = $nama !== '' ? $nama : 'Tanpa rekening';
                $sheetRows[] = self::rowXml($r, [
                    self::cellS("B{$r}", $si($label), 10),
                    self::cellEmpty("C{$r}", 10),
                    self::cellEmpty("D{$r}", 10),
                    self::cellEmpty("E{$r}", 10),
                    self::cellEmpty("F{$r}", 10),
                ]);
                $merges[] = "B{$r}:F{$r}";
                $r++;
                continue;
            }

            if ($kind === 'subtotal') {
                $label = $nama !== '' ? $nama : 'Subtotal';
                $sheetRows[] = self::rowXml($r, [
                    self::cellS("B{$r}", $si($label), 9),
                    self::cellEmpty("C{$r}", 9),
                    self::cellEmpty("D{$r}", 9),
                    self::cellNum("E{$r}", $harga, 7),
                ]);
                $merges[] = "B{$r}:D{$r}";
                $r++;
                continue;
            }

            $grand += $harga;
            $cells = [
                self::cellN("A{$r}", (string) $no),
            ];
            if ($nama !== '') {
                $cells[] = self::cellS("B{$r}", $si($nama));
            }
            $cells[] = self::cellNum("C{$r}", $harga, 3);
            if ($ket !== '') {
                $cells[] = self::cellS("D{$r}", $si($ket));
            }
            $cells[] = self::cellNum("E{$r}", $harga, 4);
            if ($catatan !== '') {
                $cells[] = self::cellS("F{$r}", $si($catatan));
            }
            $sheetRows[] = self::rowXml($r, $cells);
            $r++;
            $no++;
        }

        $totalRow = $r;
        $sheetRows[] = self::rowXml($totalRow, [
            self::cellS("B{$totalRow}", $hGrand, 9),
            self::cellEmpty("C{$totalRow}", 9),
            self::cellEmpty("D{$totalRow}", 9),
            self::cellNum("E{$totalRow}", $grand, 7),
        ]);
        $merges[] = "B{$totalRow}:D{$totalRow}";

        $mergeXml = '<mergeCells count="' . count($merges) . '">';
        foreach ($merges as $ref) {
            $mergeXml .= '<mergeCell ref="' . $ref . '"/>';
        }
        $mergeXml .= '</mergeCells>';

        $selected = $tabSelected ? ' tabSelected="1"' : '';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheetPr/><dimension ref="A1:F' . $totalRow . '"/>'
            . '<sheetViews><sheetView' . $selected . ' workbookViewId="0">'
            . '<selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>'
            . '<sheetFormatPr defaultRowHeight="15"/>'
            . '<cols>'
            . '<col min="1" max="1" width="5" customWidth="1"/>'
            . '<col min="2" max="2" width="28" customWidth="1"/>'
            . '<col min="3" max="3" width="13.28" customWidth="1"/>'
            . '<col min="4" max="4" width="20" customWidth="1"/>'
            . '<col min="5" max="5" width="14.42" customWidth="1"/>'
            . '<col min="6" max="6" width="18" customWidth="1"/>'
            . '</cols>'
            . '<sheetData>' . implode('', $sheetRows) . '</sheetData>'
            . $mergeXml
            . '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
            . '</worksheet>';
    }

    /** @param list<string> $usedLower */
    private static function uniqueSheetName(string $name, array $usedLower): string
    {
        $name = preg_replace('/[\\\\\/\?\*\[\]]+/', ' ', $name) ?? $name;
        $name = trim(preg_replace('/\s+/', ' ', $name) ?? $name);
        if ($name === '') {
            $name = 'Sheet';
        }
        if (function_exists('mb_substr')) {
            $name = mb_substr($name, 0, 31);
        } else {
            $name = substr($name, 0, 31);
        }

        $base = $name;
        $n = 2;
        while (in_array(mb_strtolower($name), $usedLower, true)) {
            $suffix = ' (' . $n . ')';
            $max = 31 - strlen($suffix);
            if (function_exists('mb_substr')) {
                $name = mb_substr($base, 0, max(1, $max)) . $suffix;
            } else {
                $name = substr($base, 0, max(1, $max)) . $suffix;
            }
            $n++;
        }
        return $name;
    }

    /** @param list<array{name:string,rid:string,sheetId:int,part:string}> $sheets */
    private static function contentTypes(array $sheets): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
        foreach ($sheets as $s) {
            $xml .= '<Override PartName="' . $s['part'] . '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }
        $xml .= '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            . '</Types>';
        return $xml;
    }

    private static function relsRoot(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    /** @param list<array{name:string,rid:string,sheetId:int,part:string}> $sheets */
    private static function workbook(array $sheets): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets>';
        foreach ($sheets as $s) {
            $xml .= '<sheet name="' . self::xmlSafe($s['name']) . '" sheetId="' . $s['sheetId'] . '" r:id="' . $s['rid'] . '"/>';
        }
        $xml .= '</sheets></workbook>';
        return $xml;
    }

    /** @param list<array{name:string,rid:string,sheetId:int,part:string}> $sheets */
    private static function workbookRels(array $sheets): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        foreach ($sheets as $s) {
            $n = $s['sheetId'];
            $xml .= '<Relationship Id="' . $s['rid'] . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $n . '.xml"/>';
        }
        $next = count($sheets) + 1;
        $xml .= '<Relationship Id="rId' . $next . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
        $xml .= '<Relationship Id="rId' . ($next + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>';
        $xml .= '</Relationships>';
        return $xml;
    }

    private static function xmlSafe(string $text): string
    {
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $text) ?? $text;
        return htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    /** @param list<string> $cells */
    private static function rowXml(int $r, array $cells): string
    {
        return '<row r="' . $r . '">' . implode('', $cells) . '</row>';
    }

    private static function cellS(string $ref, int $sharedIndex, ?int $style = null): string
    {
        $s = $style !== null ? ' s="' . $style . '"' : '';
        return '<c r="' . $ref . '"' . $s . ' t="s"><v>' . $sharedIndex . '</v></c>';
    }

    private static function cellN(string $ref, string $value, ?int $style = null): string
    {
        $s = $style !== null ? ' s="' . $style . '"' : '';
        return '<c r="' . $ref . '"' . $s . '><v>' . self::xmlSafe($value) . '</v></c>';
    }

    private static function cellNum(string $ref, float $value, int $style): string
    {
        $n = abs($value - round($value)) < 0.00001
            ? (string) (int) round($value)
            : rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
        return '<c r="' . $ref . '" s="' . $style . '"><v>' . $n . '</v></c>';
    }

    private static function cellEmpty(string $ref, int $style): string
    {
        return '<c r="' . $ref . '" s="' . $style . '"/>';
    }

    private static function styles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>'
            . '<fonts count="4">'
            . '<font><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="14"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><color rgb="FF1F4E79"/><name val="Calibri"/></font>'
            . '</fonts>'
            . '<fills count="4">'
            . '<fill><patternFill patternType="none"/></fill>'
            . '<fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>'
            . '</fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="11">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>'
            . '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
            . '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
            . '</cellXfs>'
            . '</styleSheet>';
    }

    /** @param array<string,string> $files path => content */
    private static function zipStore(array $files): string
    {
        $out = '';
        $central = '';
        $offset = 0;
        $count = 0;

        foreach ($files as $name => $content) {
            $name = str_replace('\\', '/', $name);
            $nameBytes = $name;
            $size = strlen($content);
            $crc = crc32($content);

            $local = pack(
                'VvvvvvVVVvv',
                0x04034b50,
                20,
                0,
                0,
                0,
                0,
                $crc,
                $size,
                $size,
                strlen($nameBytes),
                0
            ) . $nameBytes . $content;

            $central .= pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,
                20,
                20,
                0,
                0,
                0,
                0,
                $crc,
                $size,
                $size,
                strlen($nameBytes),
                0,
                0,
                0,
                0,
                0,
                $offset
            ) . $nameBytes;

            $out .= $local;
            $offset += strlen($local);
            $count++;
        }

        $centralOffset = strlen($out);
        $centralSize = strlen($central);
        $out .= $central;
        $out .= pack(
            'VvvvvVVv',
            0x06054b50,
            0,
            0,
            $count,
            $count,
            $centralSize,
            $centralOffset,
            0
        );

        return $out;
    }
}
