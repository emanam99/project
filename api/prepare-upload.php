<?php
/**
 * Script untuk mempersiapkan file upload ke hosting
 * Jalankan: php prepare-upload.php
 */

$uploadDir = __DIR__ . '/upload-ready';
$excludeFiles = [
    'composer.json',
    'composer.lock',
    'README.md',
    'UPLOAD-GUIDE.md',
    'DEPLOY.md',
    '.gitignore',
    'prepare-upload.php',
    'error.log',
    // Migration scripts (sudah tidak digunakan, menggunakan SQL migration files)
    'add_alasan_penolakan_pengeluaran_rencana_detail.php',
    'add_id_admin_approve_pengeluaran.php',
    'add_id_rencana_pengeluaran.php',
    'add_kategori_lembaga_pengeluaran.php',
    'add_rejected_column_pengeluaran_rencana_detail.php',
    'add_sumber_uang_pengeluaran.php',
    'check_database_structure.php',
    'create_pemasukan_table.php',
    'fix_pengeluaran_table_name.php',
    'run_pengeluaran_migration.php',
];

$excludeDirs = [
    '.git',
    '.idea',
    '.vscode',
    'upload-ready',
];

echo "🚀 Mempersiapkan file untuk upload...\n\n";

// Hapus folder upload-ready jika ada
if (is_dir($uploadDir)) {
    echo "🗑️  Menghapus folder upload-ready lama...\n";
    deleteDirectory($uploadDir);
}

// Buat folder upload-ready
mkdir($uploadDir, 0755, true);
echo "✅ Folder upload-ready dibuat\n\n";

// Copy file dan folder
copyDirectory(__DIR__, $uploadDir, $excludeFiles, $excludeDirs);

echo "\n✅ File siap untuk di-upload!\n";
echo "📁 Lokasi: " . $uploadDir . "\n\n";
echo "⚠️  PENTING sebelum upload:\n";
echo "   1. Ubah kredensial database di: upload-ready/config.php\n";
echo "   2. Ganti JWT secret key di: upload-ready/config.php\n";
echo "   3. Pastikan display_errors = 0 di: upload-ready/public/index.php\n\n";
echo "📖 Lihat UPLOAD-GUIDE.md untuk panduan lengkap!\n";

function copyDirectory($source, $dest, $excludeFiles = [], $excludeDirs = []) {
    if (!is_dir($dest)) {
        mkdir($dest, 0755, true);
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $item) {
        $relativePath = str_replace($source . DIRECTORY_SEPARATOR, '', $item->getPathname());
        $destPath = $dest . DIRECTORY_SEPARATOR . $relativePath;

        // Skip excluded directories
        $shouldExclude = false;
        foreach ($excludeDirs as $excludeDir) {
            if (strpos($relativePath, $excludeDir) === 0) {
                $shouldExclude = true;
                break;
            }
        }
        if ($shouldExclude) {
            continue;
        }

        // Skip excluded files
        $fileName = basename($relativePath);
        if (in_array($fileName, $excludeFiles)) {
            continue;
        }

        if ($item->isDir()) {
            if (!is_dir($destPath)) {
                mkdir($destPath, 0755, true);
                echo "📁 Created: $relativePath\n";
            }
        } else {
            copy($item->getPathname(), $destPath);
            echo "📄 Copied: $relativePath\n";
        }
    }
}

function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = $dir . DIRECTORY_SEPARATOR . $file;
        is_dir($path) ? deleteDirectory($path) : unlink($path);
    }
    rmdir($dir);
}

