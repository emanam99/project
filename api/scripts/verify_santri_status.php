<?php
$c = require dirname(__DIR__) . '/config.php';
$db = new PDO(
    'mysql:host=' . $c['database']['host'] . ';dbname=' . $c['database']['dbname'] . ';charset=utf8mb4',
    $c['database']['username'],
    $c['database']['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
$allowed = "('Mukim','Boyong','Khoriji','Guru Tugas','Pengurus','Alumni')";
$empty = (int) $db->query("SELECT COUNT(*) FROM santri WHERE status_santri IS NULL OR TRIM(status_santri) = '' OR status_santri NOT IN $allowed")->fetchColumn();
$noOpen = (int) $db->query('SELECT COUNT(*) FROM santri s WHERE NOT EXISTS (SELECT 1 FROM santri___status ss WHERE ss.id_santri = s.id AND ss.sampai IS NULL)')->fetchColumn();
$joinEmpty = (int) $db->query(
    "SELECT COUNT(*) FROM santri s
     LEFT JOIN santri___status st ON st.id_santri = s.id AND st.sampai IS NULL
       AND st.id = (SELECT MAX(ss2.id) FROM santri___status ss2 WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL)
     WHERE TRIM(COALESCE(st.status_santri, s.status_santri, '')) = ''"
)->fetchColumn();
$col = $db->query("SHOW COLUMNS FROM santri LIKE 'status_santri'")->fetch(PDO::FETCH_ASSOC);
echo "empty_invalid=$empty no_open=$noOpen join_empty=$joinEmpty null={$col['Null']} default={$col['Default']}\n";
foreach ($db->query('SELECT status_santri, COUNT(*) c FROM santri GROUP BY status_santri ORDER BY c DESC') as $r) {
    echo $r['status_santri'] . '=' . $r['c'] . "\n";
}
