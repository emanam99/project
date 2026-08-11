<?php

namespace App\Helpers;

/**
 * Resolve nama tampilan pengurus pengirim untuk riwayat chat (whatsapp.id_pengurus_pengirim).
 */
class ChatPengirimNamaHelper
{
    /**
     * @param \PDO $db
     * @param int[] $ids Nilai id_pengurus_pengirim dari baris whatsapp (biasanya pengurus.id; legacy bisa users.id)
     * @return array<int, string> Map id as stored => nama tampilan
     */
    public static function resolveByStoredIds(\PDO $db, array $ids): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn (int $id): bool => $id > 0)));
        if ($ids === []) {
            return [];
        }

        $namaById = [];
        $hasPengurus = $db->query("SHOW TABLES LIKE 'pengurus'")->rowCount() > 0;
        $hasUsers = $db->query("SHOW TABLES LIKE 'users'")->rowCount() > 0;

        if ($hasPengurus) {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $joinUsers = $hasUsers ? ' LEFT JOIN users u ON u.id = p.id_user ' : '';
            $namaExpr = $hasUsers
                ? "COALESCE(NULLIF(TRIM(p.nama), ''), NULLIF(TRIM(u.username), ''))"
                : "NULLIF(TRIM(p.nama), '')";
            try {
                $stmt = $db->prepare(
                    "SELECT p.id AS lookup_id, {$namaExpr} AS nama
                     FROM pengurus p{$joinUsers}
                     WHERE p.id IN ({$ph})"
                );
                $stmt->execute($ids);
                while (($r = $stmt->fetch(\PDO::FETCH_ASSOC)) !== false) {
                    $lookupId = isset($r['lookup_id']) ? (int) $r['lookup_id'] : 0;
                    $nama = isset($r['nama']) ? trim((string) $r['nama']) : '';
                    if ($lookupId > 0 && $nama !== '') {
                        $namaById[$lookupId] = $nama;
                    }
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }

        $missing = array_values(array_diff($ids, array_keys($namaById)));
        if ($missing !== [] && $hasUsers) {
            $ph = implode(',', array_fill(0, count($missing), '?'));
            $joinPengurus = $hasPengurus ? ' LEFT JOIN pengurus p ON p.id_user = u.id ' : '';
            $namaExpr = $hasPengurus
                ? "COALESCE(NULLIF(TRIM(p.nama), ''), NULLIF(TRIM(u.username), ''))"
                : "NULLIF(TRIM(u.username), '')";
            try {
                $stmt = $db->prepare(
                    "SELECT u.id AS lookup_id, {$namaExpr} AS nama
                     FROM users u{$joinPengurus}
                     WHERE u.id IN ({$ph})"
                );
                $stmt->execute($missing);
                while (($r = $stmt->fetch(\PDO::FETCH_ASSOC)) !== false) {
                    $lookupId = isset($r['lookup_id']) ? (int) $r['lookup_id'] : 0;
                    $nama = isset($r['nama']) ? trim((string) $r['nama']) : '';
                    if ($lookupId > 0 && $nama !== '') {
                        $namaById[$lookupId] = $nama;
                    }
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }

        return $namaById;
    }
}
