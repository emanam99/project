<?php

namespace App\Helpers;

/**
 * Domisili santri hanya lewat id_kamar → daerah___kamar → daerah (kategori, nama daerah).
 */
final class SantriDomisiliHelper
{
    public static function kategoriForKamarId(\PDO $db, ?int $idKamar): ?string
    {
        if ($idKamar === null || $idKamar <= 0) {
            return null;
        }
        $stmt = $db->prepare(
            'SELECT d.kategori FROM daerah___kamar dk
             INNER JOIN daerah d ON d.id = dk.id_daerah
             WHERE dk.id = ? LIMIT 1'
        );
        $stmt->execute([$idKamar]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row || !isset($row['kategori'])) {
            return null;
        }
        $t = trim((string) $row['kategori']);

        return $t !== '' ? $t : null;
    }

    /**
     * Jika body berisi id_kamar valid, set input['kategori'] dari tabel daerah (sumber kebenaran).
     */
    public static function applyKategoriFromKamar(array &$input, \PDO $db): void
    {
        if (!array_key_exists('id_kamar', $input)) {
            return;
        }
        $raw = $input['id_kamar'];
        if ($raw === '' || $raw === null) {
            return;
        }
        $id = (int) $raw;
        if ($id <= 0) {
            return;
        }
        $kat = self::kategoriForKamarId($db, $id);
        if ($kat !== null) {
            $input['kategori'] = $kat;
        }
    }
}
