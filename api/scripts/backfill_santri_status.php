<?php
/** Diagnosa + backfill status santri kosong (staging/local). */
$c = require dirname(__DIR__) . '/config.php';
$db = new PDO(
    'mysql:host=' . $c['database']['host'] . ';dbname=' . $c['database']['dbname'] . ';charset=utf8mb4',
    $c['database']['username'],
    $c['database']['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$allowed = "('Mukim','Boyong','Khoriji','Guru Tugas','Pengurus','Alumni')";

$emptyCol = (int) $db->query(
    "SELECT COUNT(*) FROM santri WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN $allowed"
)->fetchColumn();

$noOpen = (int) $db->query(
    'SELECT COUNT(*) FROM santri s
     WHERE NOT EXISTS (
       SELECT 1 FROM santri___status ss WHERE ss.id_santri = s.id AND ss.sampai IS NULL
     )'
)->fetchColumn();

$joinEmpty = (int) $db->query(
    "SELECT COUNT(*) FROM santri s
     LEFT JOIN santri___status st ON st.id_santri = s.id AND st.sampai IS NULL
       AND st.id = (SELECT MAX(ss2.id) FROM santri___status ss2 WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL)
     WHERE TRIM(COALESCE(st.status_santri, '')) = ''"
)->fetchColumn();

echo "empty_or_invalid_col=$emptyCol no_open_history=$noOpen join_shows_empty=$joinEmpty\n";

$fix = getenv('STATUS_BACKFILL') === '1';
if (!$fix) {
    echo "Set STATUS_BACKFILL=1 to apply fixes.\n";
    exit(0);
}

// 1) Sync kolom santri dari histori terbuka
$db->exec(
    "UPDATE santri s
     INNER JOIN (
       SELECT ss.id_santri, ss.status_santri
       FROM santri___status ss
       INNER JOIN (
         SELECT id_santri, MAX(id) AS max_id
         FROM santri___status WHERE sampai IS NULL GROUP BY id_santri
       ) x ON x.max_id = ss.id
     ) act ON act.id_santri = s.id
     SET s.status_santri = act.status_santri
     WHERE act.status_santri IS NOT NULL AND TRIM(act.status_santri) <> ''"
);

// 2) Normalisasi ejaan
$map = [
    'mukim' => 'Mukim',
    'boyong' => 'Boyong',
    'khoriji' => 'Khoriji',
    'guru tugas' => 'Guru Tugas',
    'pengurus' => 'Pengurus',
    'alumni' => 'Alumni',
];
$st = $db->prepare('UPDATE santri SET status_santri = ? WHERE LOWER(TRIM(status_santri)) = ?');
$st2 = $db->prepare('UPDATE santri___status SET status_santri = ? WHERE LOWER(TRIM(status_santri)) = ?');
foreach ($map as $from => $to) {
    $st->execute([$to, $from]);
    $st2->execute([$to, $from]);
}

// 3) Infer Boyong dari santri___boyong bila kolom kosong
$db->exec(
    "UPDATE santri s
     INNER JOIN (
       SELECT id_santri FROM santri___boyong GROUP BY id_santri
     ) b ON b.id_santri = s.id
     SET s.status_santri = 'Boyong'
     WHERE s.status_santri IS NULL OR TRIM(s.status_santri) = '' OR s.status_santri NOT IN $allowed"
);

// 4) Default Mukim untuk sisa kosong/invalid
$db->exec(
    "UPDATE santri SET status_santri = 'Mukim'
     WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN $allowed"
);

// 5) Tutup duplikat baris terbuka, pastikan satu histori aktif per santri
$db->exec(
    'UPDATE santri___status ss
     INNER JOIN (
       SELECT id_santri, MAX(id) AS keep_id
       FROM santri___status WHERE sampai IS NULL GROUP BY id_santri
     ) k ON k.id_santri = ss.id_santri
     SET ss.sampai = CURRENT_TIMESTAMP
     WHERE ss.sampai IS NULL AND ss.id <> k.keep_id'
);

// 6) Insert histori terbuka untuk yang belum punya, dari kolom santri
$db->exec(
    "INSERT INTO santri___status (id_santri, status_santri, id_pengurus, dari, sampai, tanggal_dibuat)
     SELECT s.id, s.status_santri, NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP
     FROM santri s
     WHERE NOT EXISTS (
       SELECT 1 FROM santri___status ss WHERE ss.id_santri = s.id AND ss.sampai IS NULL
     )
       AND s.status_santri IS NOT NULL AND TRIM(s.status_santri) <> ''"
);

// 7) Sync histori terbuka yang beda dari kolom (pakai kolom sebagai sumber kebenaran setelah backfill)
$db->exec(
    "UPDATE santri___status ss
     INNER JOIN santri s ON s.id = ss.id_santri
     SET ss.status_santri = s.status_santri
     WHERE ss.sampai IS NULL
       AND ss.id = (SELECT MAX(ss2.id) FROM santri___status ss2 WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL)
       AND ss.status_santri <> s.status_santri"
);

$emptyCol2 = (int) $db->query(
    "SELECT COUNT(*) FROM santri WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN $allowed"
)->fetchColumn();
$noOpen2 = (int) $db->query(
    'SELECT COUNT(*) FROM santri s
     WHERE NOT EXISTS (SELECT 1 FROM santri___status ss WHERE ss.id_santri = s.id AND ss.sampai IS NULL)'
)->fetchColumn();
$joinEmpty2 = (int) $db->query(
    "SELECT COUNT(*) FROM santri s
     LEFT JOIN santri___status st ON st.id_santri = s.id AND st.sampai IS NULL
       AND st.id = (SELECT MAX(ss2.id) FROM santri___status ss2 WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL)
     WHERE TRIM(COALESCE(st.status_santri, s.status_santri, '')) = ''"
)->fetchColumn();

echo "AFTER empty_or_invalid_col=$emptyCol2 no_open_history=$noOpen2 join_empty=$joinEmpty2\n";
foreach ($db->query(
    "SELECT status_santri, COUNT(*) c FROM santri GROUP BY status_santri ORDER BY c DESC"
) as $r) {
    echo $r['status_santri'] . '=' . $r['c'] . "\n";
}
