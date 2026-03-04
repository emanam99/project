<?php
/**
 * Script untuk debug role user
 * 
 * Usage: php debug_role.php [user_id]
 * Contoh: php debug_role.php 123
 */

require __DIR__ . '/vendor/autoload.php';

use App\Database;
use App\Helpers\RoleHelper;
use App\Config\RoleConfig;

// Get user ID from command line argument
$userId = isset($argv[1]) ? (int)$argv[1] : null;

if (!$userId) {
    echo "Usage: php debug_role.php [user_id]\n";
    echo "Contoh: php debug_role.php 123\n";
    exit(1);
}

try {
    $db = Database::getInstance()->getConnection();
    
    echo "=== Debug Role untuk User ID: $userId ===\n\n";
    
    // 1. Cek apakah user ada
    echo "1. Cek user di tabel pengurus:\n";
    $stmt = $db->prepare("SELECT id, nama, level FROM pengurus WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(\PDO::FETCH_ASSOC);
    
    if (!$user) {
        echo "   ❌ User tidak ditemukan!\n";
        exit(1);
    }
    
    echo "   ✅ User ditemukan: {$user['nama']} (level: {$user['level']})\n\n";
    
    // 2. Cek role di tabel pengurus___role
    echo "2. Cek role di tabel pengurus___role:\n";
    $stmt = $db->prepare("
        SELECT 
            pr.id as pengurus_role_id,
            pr.pengurus_id,
            pr.role_id,
            pr.lembaga_id,
            r.id as role_table_id,
            r.`key` as role_key,
            r.label as role_label
        FROM pengurus___role pr
        LEFT JOIN role r ON pr.role_id = r.id
        WHERE pr.pengurus_id = ?
        ORDER BY pr.tanggal_dibuat DESC
        LIMIT 1
    ");
    $stmt->execute([$userId]);
    $roleData = $stmt->fetch(\PDO::FETCH_ASSOC);
    
    if (!$roleData) {
        echo "   ❌ User tidak memiliki role di tabel pengurus___role!\n";
        echo "   💡 Solusi: Tambahkan role untuk user ini menggunakan endpoint manage-users\n\n";
    } else {
        echo "   ✅ Role ditemukan:\n";
        echo "      - Role ID (pengurus___role): {$roleData['pengurus_role_id']}\n";
        echo "      - Role Key: {$roleData['role_key']}\n";
        echo "      - Role Label: {$roleData['role_label']}\n";
        echo "      - Lembaga ID: " . ($roleData['lembaga_id'] ?? 'NULL') . "\n\n";
    }
    
    // 3. Test RoleHelper
    echo "3. Test RoleHelper::getUserRole():\n";
    $userRole = RoleHelper::getUserRole($userId);
    if (!$userRole) {
        echo "   ❌ RoleHelper::getUserRole() mengembalikan null\n\n";
    } else {
        echo "   ✅ Data dari RoleHelper::getUserRole():\n";
        echo "      - role_key: {$userRole['role_key']}\n";
        echo "      - role_label: {$userRole['role_label']}\n";
        echo "      - lembaga_id: " . ($userRole['lembaga_id'] ?? 'NULL') . "\n\n";
    }
    
    // 4. Test RoleHelper::getRoleInfoForToken
    echo "4. Test RoleHelper::getRoleInfoForToken():\n";
    $roleInfo = RoleHelper::getRoleInfoForToken($userId);
    echo "   Data dari RoleHelper::getRoleInfoForToken():\n";
    echo "      - role_key: " . ($roleInfo['role_key'] ?? 'NULL') . "\n";
    echo "      - role_label: {$roleInfo['role_label']}\n";
    echo "      - allowed_apps: " . json_encode($roleInfo['allowed_apps']) . "\n";
    echo "      - permissions: " . json_encode($roleInfo['permissions']) . "\n";
    echo "      - lembaga_id: " . ($roleInfo['lembaga_id'] ?? 'NULL') . "\n\n";
    
    // 5. Test RoleConfig
    if (!empty($roleInfo['role_key'])) {
        echo "5. Test RoleConfig untuk role_key: {$roleInfo['role_key']}\n";
        $allowedApps = RoleConfig::getAllowedApps($roleInfo['role_key']);
        $permissions = RoleConfig::getPermissions($roleInfo['role_key']);
        echo "   - Allowed Apps: " . json_encode($allowedApps) . "\n";
        echo "   - Permissions: " . json_encode($permissions) . "\n";
        echo "   - Has 'uwaba' access: " . (in_array('uwaba', $allowedApps) ? '✅ YES' : '❌ NO') . "\n\n";
    } else {
        echo "5. ⚠️  Role key kosong, tidak bisa test RoleConfig\n\n";
    }
    
    // 6. List semua role yang tersedia
    echo "6. Daftar semua role yang tersedia di tabel role:\n";
    $stmt = $db->query("SELECT id, `key`, label FROM role ORDER BY id");
    $allRoles = $stmt->fetchAll(\PDO::FETCH_ASSOC);
    foreach ($allRoles as $role) {
        echo "   - ID: {$role['id']}, Key: {$role['key']}, Label: {$role['label']}\n";
    }
    echo "\n";
    
    // 7. Summary
    echo "=== SUMMARY ===\n";
    if (empty($roleInfo['role_key'])) {
        echo "❌ PROBLEM: User tidak memiliki role_key yang valid\n";
        echo "💡 SOLUSI: Tambahkan role untuk user ini di tabel pengurus___role\n";
    } elseif (empty($roleInfo['allowed_apps'])) {
        echo "❌ PROBLEM: allowed_apps kosong untuk role_key: {$roleInfo['role_key']}\n";
        echo "💡 SOLUSI: Pastikan role_key '{$roleInfo['role_key']}' ada di RoleConfig::ROLE_ALLOWED_APPS\n";
    } elseif (!in_array('uwaba', $roleInfo['allowed_apps'])) {
        echo "❌ PROBLEM: Role '{$roleInfo['role_key']}' tidak memiliki akses ke aplikasi 'uwaba'\n";
        echo "💡 SOLUSI: Pastikan role ini ditambahkan ke RoleConfig::ROLE_ALLOWED_APPS dengan 'uwaba'\n";
    } else {
        echo "✅ OK: User memiliki role_key: {$roleInfo['role_key']}\n";
        echo "✅ OK: allowed_apps berisi 'uwaba'\n";
        echo "⚠️  Jika masih error, cek error log backend untuk detail lebih lanjut\n";
    }
    
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    echo "Stack trace: " . $e->getTraceAsString() . "\n";
    exit(1);
}

