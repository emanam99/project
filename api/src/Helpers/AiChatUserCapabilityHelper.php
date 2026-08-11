<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Snapshot hak akses eBeddien untuk konteks AI — selaras GET /api/v2/me/fitur-menu (menu + action).
 */
final class AiChatUserCapabilityHelper
{
    private const PROMPT_MAX_CHARS = 4500;

    /** Samakan AppFiturController::LEMBAGA_HALAMAN_ACTION_TO_MENU */
    private const LEMBAGA_HALAMAN_ACTION_TO_MENU = [
        'action.santri.halaman' => 'menu.santri',
        'action.rombel.halaman' => 'menu.rombel',
        'action.manage_jabatan.halaman' => 'menu.manage_jabatan',
        'action.mapel.halaman' => 'menu.mapel',
        'action.bisyaroh.halaman' => 'menu.bisyaroh',
    ];

    /**
     * @return array{
     *   role_keys: list<string>,
     *   codes: list<string>,
     *   items: list<array<string, mixed>>,
     *   app_key: string
     * }
     */
    public static function fetchEbeddienSnapshot(\PDO $db, array $user): array
    {
        $appKey = 'ebeddien';
        $roleKeys = RoleHelper::normalizeTokenRoleKeysUnion($user);
        if ($roleKeys === []) {
            return ['role_keys' => [], 'codes' => [], 'items' => [], 'app_key' => $appKey];
        }

        $stmt = $db->prepare('SELECT `id` FROM `app` WHERE `key` = ? LIMIT 1');
        $stmt->execute([$appKey]);
        $appRow = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($appRow === false) {
            return ['role_keys' => $roleKeys, 'codes' => [], 'items' => [], 'app_key' => $appKey];
        }
        $appId = (int) $appRow['id'];

        $placeholders = implode(',', array_fill(0, count($roleKeys), '?'));
        $stmt = $db->prepare("SELECT `id` FROM `role` WHERE `key` IN ($placeholders)");
        $stmt->execute($roleKeys);
        $roleIds = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $roleIds[] = (int) $row['id'];
        }
        if ($roleIds === []) {
            return ['role_keys' => $roleKeys, 'codes' => [], 'items' => [], 'app_key' => $appKey];
        }

        $typeList = ['menu', 'action'];
        $typePh = implode(',', array_fill(0, count($typeList), '?'));
        $rolePh = implode(',', array_fill(0, count($roleIds), '?'));
        $sql = "SELECT DISTINCT f.`id`, f.`id_app`, f.`parent_id`, f.`type`, f.`code`, f.`label`, f.`path`, f.`icon_key`, f.`group_label`, f.`sort_order`
            FROM `app___fitur` f
            INNER JOIN `role___fitur` rf ON rf.`fitur_id` = f.`id`
            WHERE f.`id_app` = ? AND f.`type` IN ($typePh) AND rf.`role_id` IN ($rolePh)
            ORDER BY f.`sort_order` ASC, f.`id` ASC";
        $stmt = $db->prepare($sql);
        $params = array_merge([$appId], $typeList, $roleIds);
        $stmt->execute($params);

        $items = [];
        $codes = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $row['id'] = (int) $row['id'];
            $row['id_app'] = (int) $row['id_app'];
            $row['parent_id'] = $row['parent_id'] !== null && $row['parent_id'] !== '' ? (int) $row['parent_id'] : null;
            $row['sort_order'] = (int) $row['sort_order'];
            $items[] = $row;
            $codes[] = (string) $row['code'];
        }

        self::injectLembagaMenuRowsForHalamanActions($db, $appId, $items, $codes);

        return [
            'role_keys' => $roleKeys,
            'codes' => array_values(array_unique($codes)),
            'items' => $items,
            'app_key' => $appKey,
        ];
    }

    /**
     * @param list<array<string, mixed>> $items
     * @param list<string> $codes
     */
    private static function injectLembagaMenuRowsForHalamanActions(\PDO $db, int $appId, array &$items, array &$codes): void
    {
        $have = [];
        foreach ($codes as $c) {
            $have[(string) $c] = true;
        }
        $toLoad = [];
        foreach (self::LEMBAGA_HALAMAN_ACTION_TO_MENU as $act => $menuCode) {
            if (isset($have[$act]) && !isset($have[$menuCode])) {
                $toLoad[$menuCode] = true;
            }
        }
        if ($toLoad === []) {
            return;
        }
        $menuCodes = array_keys($toLoad);
        $ph = implode(',', array_fill(0, count($menuCodes), '?'));
        $sql = "SELECT `id`, `id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`
            FROM `app___fitur` WHERE `id_app` = ? AND `type` = 'menu' AND `code` IN ($ph) ORDER BY `sort_order` ASC, `id` ASC";
        $stmt = $db->prepare($sql);
        $stmt->execute(array_merge([$appId], $menuCodes));
        $extra = [];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $row['id'] = (int) $row['id'];
            $row['id_app'] = (int) $row['id_app'];
            $row['parent_id'] = $row['parent_id'] !== null && $row['parent_id'] !== '' ? (int) $row['parent_id'] : null;
            $row['sort_order'] = (int) $row['sort_order'];
            $extra[] = $row;
            $codes[] = (string) $row['code'];
        }
        if ($extra !== []) {
            $items = array_merge($extra, $items);
        }
    }

    /**
     * @param array{role_keys: list<string>, codes: list<string>, items: list<array<string, mixed>>, app_key: string} $snapshot
     */
    public static function formatSnapshotForPrompt(array $snapshot, array $userPayload): string
    {
        $lines = [];
        $lines[] = 'Ini adalah ringkasan hak akses akun yang sedang login (sumber: penugasan role ↔ fitur di database). '
            . 'Jangan mengarang menu atau izin di luar daftar ini. '
            . 'Untuk nominal/transaksi keuangan, hanya gunakan blok DATA KEUANGAN bila disediakan pada pesan yang sama.';

        $rk = $snapshot['role_keys'] ?? [];
        $lines[] = '';
        $lines[] = 'Role (gabungan dari token): ' . ($rk !== [] ? implode(', ', $rk) : '(tidak ada role_key di token)');

        if (!empty($userPayload['is_real_super_admin'])) {
            $lines[] = 'Catatan: pengguna bertanda super admin instansi (is_real_super_admin).';
        }

        $perms = $userPayload['permissions'] ?? null;
        if (is_array($perms) && $perms !== []) {
            $flat = [];
            foreach ($perms as $p) {
                $flat[] = is_scalar($p) ? (string) $p : '';
            }
            $flat = array_values(array_filter($flat, static fn ($x) => $x !== ''));
            if ($flat !== []) {
                $lines[] = 'Permission kebijakan role (isi token): ' . implode(', ', array_slice($flat, 0, 40))
                    . (count($flat) > 40 ? ' …' : '');
            }
        }

        $apps = $userPayload['allowed_apps'] ?? null;
        if (is_array($apps) && $apps !== []) {
            $ak = [];
            foreach ($apps as $a) {
                $ak[] = is_scalar($a) ? (string) $a : '';
            }
            $ak = array_values(array_filter($ak, static fn ($x) => $x !== ''));
            if ($ak !== []) {
                $lines[] = 'Aplikasi diizinkan (token): ' . implode(', ', $ak);
            }
        }

        $lid = $userPayload['lembaga_id'] ?? null;
        $lids = $userPayload['lembaga_ids'] ?? null;
        $scopeAll = !empty($userPayload['lembaga_scope_all']);
        if ($scopeAll) {
            $lines[] = 'Scope lembaga (token): semua lembaga (lembaga_scope_all).';
        } elseif (($lid !== null && $lid !== '') || (is_array($lids) && $lids !== [])) {
            $parts = [];
            if ($lid !== null && $lid !== '') {
                $parts[] = 'utama=' . trim((string) $lid);
            }
            if (is_array($lids) && $lids !== []) {
                $parts[] = 'daftar=' . implode(',', array_map('strval', $lids));
            }
            $lines[] = 'Scope lembaga (token): ' . implode('; ', $parts);
        }

        $codes = $snapshot['codes'] ?? [];
        $items = $snapshot['items'] ?? [];

        if ($codes === []) {
            $lines[] = '';
            $lines[] = 'Tidak ada baris menu/aksi eBeddien dari role___fitur untuk role ini. '
                . 'Beberapa fitur bisa tetap aktif lewat kebijakan legacy role (mis. keuangan) — ikuti instruksi server lain pada pesan.';

            return self::trimBlock(implode("\n", $lines));
        }

        $lines[] = '';
        $lines[] = 'Jumlah kode fitur unik: ' . count($codes) . '.';

        $menus = [];
        foreach ($items as $row) {
            if (!is_array($row)) {
                continue;
            }
            if (($row['type'] ?? '') !== 'menu') {
                continue;
            }
            $code = (string) ($row['code'] ?? '');
            $label = (string) ($row['label'] ?? '');
            $path = (string) ($row['path'] ?? '');
            $group = (string) ($row['group_label'] ?? '');
            $menus[] = ['group' => $group, 'line' => '- ' . $code . ' — ' . $label . ($path !== '' ? ' (' . $path . ')' : '')];
        }
        usort($menus, static function ($a, $b) {
            return strcmp($a['group'] . $a['line'], $b['group'] . $b['line']);
        });
        $lines[] = '';
        $lines[] = 'Menu yang diizinkan:';
        $maxMenus = 90;
        foreach (array_slice($menus, 0, $maxMenus) as $m) {
            $lines[] = $m['line'];
        }
        if (count($menus) > $maxMenus) {
            $lines[] = '- … dan ' . (count($menus) - $maxMenus) . ' menu lain (dipotong untuk hemat token).';
        }

        $actionCodes = array_values(array_filter($codes, static fn ($c) => str_starts_with((string) $c, 'action.')));
        $lines[] = '';
        $lines[] = 'Aksi halaman (action.*) yang diizinkan:';
        $lines = array_merge($lines, explode("\n", self::summarizeActionCodes($actionCodes)));

        $out = implode("\n", $lines);

        return self::trimBlock($out);
    }

    /**
     * @param list<string> $actionCodes
     */
    private static function summarizeActionCodes(array $actionCodes): string
    {
        if ($actionCodes === []) {
            return '  (tidak ada kode action.*)';
        }
        sort($actionCodes);
        if (count($actionCodes) <= 42) {
            $lines = [];
            foreach ($actionCodes as $c) {
                $lines[] = '  - ' . $c;
            }

            return implode("\n", $lines);
        }

        $groups = [];
        foreach ($actionCodes as $c) {
            $parts = explode('.', $c);
            $prefix = count($parts) >= 3 ? $parts[0] . '.' . $parts[1] . '.' . $parts[2] : $c;
            $groups[$prefix] = ($groups[$prefix] ?? 0) + 1;
        }
        arsort($groups);
        $lines = ['  (di-ringkas per prefiks; total ' . count($actionCodes) . ' aksi)'];
        $n = 0;
        foreach ($groups as $p => $cnt) {
            if ($n >= 45) {
                $lines[] = '  - …';

                break;
            }
            $lines[] = '  - ' . $p . '.* × ' . $cnt;
            $n++;
        }

        return implode("\n", $lines);
    }

    private static function trimBlock(string $s): string
    {
        if (mb_strlen($s, 'UTF-8') <= self::PROMPT_MAX_CHARS) {
            return $s;
        }

        return mb_substr($s, 0, self::PROMPT_MAX_CHARS - 24, 'UTF-8') . "\n…(dipotong)";
    }
}
