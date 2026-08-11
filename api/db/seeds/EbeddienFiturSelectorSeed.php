<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccessDefinitions;
use Phinx\Seed\AbstractSeed;

/**
 * Mengisi ebeddien_fitur_selector dari EbeddienFiturAccessDefinitions (selaras route middleware).
 * Setelah deploy: php vendor/bin/phinx seed:run -s EbeddienFiturSelectorSeed
 * Ubah selector di DB untuk menyesuaikan endpoint tanpa deploy PHP (middleware membaca dari sini).
 */
class EbeddienFiturSelectorSeed extends AbstractSeed
{
    public function run(): void
    {
        require_once __DIR__ . '/../../vendor/autoload.php';

        $conn = $this->getAdapter()->getConnection();
        $ref = new \ReflectionClass(EbeddienFiturAccessDefinitions::class);
        $stmt = $conn->prepare(
            'INSERT INTO `ebeddien_fitur_selector` (`selector_key`, `codes_json`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `codes_json` = VALUES(`codes_json`)'
        );

        foreach ($ref->getMethods(\ReflectionMethod::IS_PUBLIC | \ReflectionMethod::IS_STATIC) as $method) {
            $name = $method->getName();
            if ($name === 'merge') {
                continue;
            }
            $codes = call_user_func([EbeddienFiturAccessDefinitions::class, $name]);
            if (!is_array($codes)) {
                continue;
            }
            $json = json_encode(array_values($codes), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $stmt->execute([$name, $json]);
        }
    }
}
