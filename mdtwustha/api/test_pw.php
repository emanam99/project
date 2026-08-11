<?php
require 'vendor/autoload.php';
$db = App\Config\Database::getInstance();

$stmt = $db->query("SELECT nip, pw FROM pengurus WHERE nip='test1'");
var_dump($stmt->fetchAll(PDO::FETCH_ASSOC));
