<?php

namespace App\Helpers;

use PDO;

/** Aturan cair_status setelah BNI approved, berdasarkan jenis rekening. */
class CairStatusHelper
{
    /**
     * VA → jatim, Rek → cair. Hanya baris yang sudah approved.
     *
     * @param list<int> $belanjaIds
     */
    public static function applyAfterApproved(PDO $db, array $belanjaIds): int
    {
        $belanjaIds = array_values(array_unique(array_filter(array_map('intval', $belanjaIds), static fn ($id) => $id > 0)));
        if (!$belanjaIds) {
            return 0;
        }

        $placeholders = implode(',', array_fill(0, count($belanjaIds), '?'));
        $sql = "UPDATE belanja b
                INNER JOIN rekening r ON r.id = b.rekening_id
                SET b.cair_status = CASE
                      WHEN r.jenis = 'va' THEN 'jatim'
                      ELSE 'cair'
                    END,
                    b.updated_at = CURRENT_TIMESTAMP
                WHERE b.id IN ($placeholders)
                  AND b.bni_status = 'approved'
                  AND b.rekening_id IS NOT NULL";
        $stmt = $db->prepare($sql);
        $stmt->execute($belanjaIds);
        return $stmt->rowCount();
    }
}
