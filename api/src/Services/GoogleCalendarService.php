<?php

namespace App\Services;

use App\Database;

/**
 * Layanan Google Calendar: baca kalender public (iCal) untuk jadwal pesantren.
 * Ke depan bisa diperluas dengan OAuth (google___user_oauth) untuk jadwal per user.
 */
class GoogleCalendarService
{
    /** URL dasar iCal public Google (calendar_id di-encode). */
    private const ICAL_BASE = 'https://calendar.google.com/calendar/ical/%s/public/basic.ics';

    /**
     * Ambil konfigurasi kalender dari DB by slug.
     *
     * @return array{id: int, slug: string, name: string, calendar_id: string, calendar_url: ?string, is_public: int}|null
     */
    public static function getCalendarConfigBySlug(string $slug): ?array
    {
        $db = Database::getInstance()->getConnection();
        $stmt = $db->prepare("SELECT id, slug, name, calendar_id, calendar_url, is_public FROM google___calendar_config WHERE slug = ? LIMIT 1");
        $stmt->execute([$slug]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Bangun URL iCal: pakai calendar_url jika ada, else default Google public.
     */
    public static function buildIcalUrl(string $calendarId, ?string $calendarUrl = null): string
    {
        if ($calendarUrl !== null && $calendarUrl !== '') {
            return $calendarUrl;
        }
        return sprintf(self::ICAL_BASE, rawurlencode($calendarId));
    }

    /**
     * Fetch konten iCal dari URL (dengan timeout).
     */
    public static function fetchIcalContent(string $url): string
    {
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 15,
                'user_agent' => 'UWABA-GoogleCalendar/1.0',
            ],
        ]);
        $content = @file_get_contents($url, false, $ctx);
        return is_string($content) ? $content : '';
    }

    /**
     * Parse iCal string, return array of events dalam rentang timeMin-timeMax (optional).
     * Setiap event: summary, description, start, end, start_iso, end_iso.
     *
     * @param string $timeMin ISO 8601 (Y-m-d\TH:i:s atau Y-m-d)
     * @param string $timeMax ISO 8601
     * @return array<int, array{summary: string, description: string, start: string, end: string, start_iso: string, end_iso: string}>
     */
    public static function parseIcalEvents(string $icalContent, ?string $timeMin = null, ?string $timeMax = null): array
    {
        $events = [];
        $current = [];
        $inEvent = false;
        $lines = preg_split('/\r\n|\r|\n/', $icalContent);

        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }
            // Unfold line (RFC 2445: line starting with space/tab is continuation)
            if (isset($line[0]) && ($line[0] === ' ' || $line[0] === "\t")) {
                if ($inEvent && isset($key)) {
                    $current[$key] .= substr($line, 1);
                }
                continue;
            }

            if (strtoupper(substr($line, 0, 6)) === 'BEGIN:') {
                if (strtoupper(substr($line, 0, 12)) === 'BEGIN:VEVENT') {
                    $inEvent = true;
                    $current = [];
                }
                continue;
            }

            if (strtoupper(substr($line, 0, 10)) === 'END:VEVENT') {
                $inEvent = false;
                $ev = self::normalizeParsedEvent($current);
                if ($ev !== null) {
                    if ($timeMin !== null || $timeMax !== null) {
                        $start = $ev['start_iso'] ?? $ev['start'];
                        $end = $ev['end_iso'] ?? $ev['end'];
                        if ($timeMin !== null && $end < $timeMin) {
                            continue;
                        }
                        if ($timeMax !== null && $start > $timeMax) {
                            continue;
                        }
                    }
                    $events[] = $ev;
                }
                $current = [];
                continue;
            }

            if ($inEvent && preg_match('/^([^:;]+)(?:;([^:]*))?:(.*)$/s', $line, $m)) {
                $key = strtoupper(trim(explode(';', $m[1])[0]));
                $value = trim($m[3]);
                $current[$key] = $value;
            }
        }

        // Sort by start
        usort($events, function ($a, $b) {
            return strcmp($a['start_iso'], $b['start_iso']);
        });

        return $events;
    }

    /**
     * Normalize parsed VEVENT keys ke format standar (DTSTART, DTEND, SUMMARY, DESCRIPTION).
     */
    private static function normalizeParsedEvent(array $raw): ?array
    {
        $start = $raw['DTSTART'] ?? '';
        $end = $raw['DTEND'] ?? $raw['DTSTART'] ?? '';
        $summary = $raw['SUMMARY'] ?? '';
        $description = $raw['DESCRIPTION'] ?? '';

        $startIso = self::icalDateToIso($start);
        $endIso = self::icalDateToIso($end);
        if ($startIso === '' || $endIso === '') {
            return null;
        }

        return [
            'summary' => self::unescapeIcalString($summary),
            'description' => self::unescapeIcalString($description),
            'start' => $start,
            'end' => $end,
            'start_iso' => $startIso,
            'end_iso' => $endIso,
        ];
    }

    /**
     * Convert iCal date (DATE or DATETIME, with or without TZID) to ISO 8601.
     */
    private static function icalDateToIso(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        // DATE only: 20250224
        if (preg_match('/^\d{8}$/', $value)) {
            return substr($value, 0, 4) . '-' . substr($value, 4, 2) . '-' . substr($value, 6, 2) . 'T00:00:00';
        }
        // 20250224T100000Z or 20250224T100000
        if (preg_match('/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/', $value, $m)) {
            return $m[1] . '-' . $m[2] . '-' . $m[3] . 'T' . $m[4] . ':' . $m[5] . ':' . $m[6];
        }
        return '';
    }

    private static function unescapeIcalString(string $s): string
    {
        $s = str_replace('\\n', "\n", $s);
        $s = str_replace('\\,', ',', $s);
        $s = str_replace('\\;', ';', $s);
        return trim($s);
    }

    /**
     * Fetch events via Google Calendar API v3 (jika API key di-set).
     * Return array of events dalam format yang sama dengan parseIcalEvents, atau null jika gagal.
     */
    private static function fetchEventsViaCalendarApi(string $calendarId, string $apiKey, ?string $timeMin, ?string $timeMax): ?array
    {
        $params = [
            'key' => $apiKey,
            'singleEvents' => 'true',
            'orderBy' => 'startTime',
        ];
        if ($timeMin !== null && $timeMin !== '') {
            $params['timeMin'] = $timeMin;
        }
        if ($timeMax !== null && $timeMax !== '') {
            $params['timeMax'] = $timeMax;
        }
        $url = 'https://www.googleapis.com/calendar/v3/calendars/' . rawurlencode($calendarId) . '/events?' . http_build_query($params);
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 15,
                'user_agent' => 'UWABA-GoogleCalendar/1.0',
            ],
        ]);
        $json = @file_get_contents($url, false, $ctx);
        if ($json === false || $json === '') {
            return null;
        }
        $data = json_decode($json, true);
        if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
            return null;
        }
        $events = [];
        foreach ($data['items'] as $item) {
            $start = $item['start'] ?? [];
            $end = $item['end'] ?? [];
            $startIso = isset($start['dateTime']) ? $start['dateTime'] : (isset($start['date']) ? $start['date'] . 'T00:00:00' : '');
            $endIso = isset($end['dateTime']) ? $end['dateTime'] : (isset($end['date']) ? $end['date'] . 'T23:59:59' : $startIso);
            if ($startIso === '') {
                continue;
            }
            $events[] = [
                'id' => $item['id'] ?? null,
                'summary' => $item['summary'] ?? '',
                'description' => $item['description'] ?? '',
                'start' => $startIso,
                'end' => $endIso,
                'start_iso' => $startIso,
                'end_iso' => $endIso,
            ];
        }
        return $events;
    }

    /**
     * Baca file JSON Service Account. Return array atau null.
     */
    private static function loadServiceAccount(): ?array
    {
        $cfg = require __DIR__ . '/../../config.php';
        $path = $cfg['google']['service_account_json_path'] ?? null;
        if ($path === null || $path === '') {
            return null;
        }
        $path = trim((string) $path);
        $apiRoot = __DIR__ . '/../..';
        if ($path !== '' && !preg_match('#^([A-Za-z]:[\\\\/]|/)#', $path)) {
            $path = rtrim($apiRoot, '/\\') . '/' . ltrim(str_replace('\\', '/', $path), '/');
        }
        if (!is_file($path)) {
            error_log('GoogleCalendar Service Account: file not found: ' . $path);
            return null;
        }
        $json = @file_get_contents($path);
        if ($json === false) {
            return null;
        }
        $data = json_decode($json, true);
        return is_array($data) && isset($data['client_email'], $data['private_key']) ? $data : null;
    }

    /**
     * Dapatkan access token dari Service Account (JWT bearer grant).
     */
    private static function getServiceAccountAccessToken(): ?string
    {
        $sa = self::loadServiceAccount();
        if ($sa === null) {
            return null;
        }
        $now = time();
        $payload = [
            'iss' => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/calendar',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ];
        try {
            $jwt = \Firebase\JWT\JWT::encode($payload, $sa['private_key'], 'RS256');
        } catch (\Exception $e) {
            error_log('GoogleCalendar Service Account JWT: ' . $e->getMessage());
            return null;
        }
        $body = http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => $body,
                'timeout' => 15,
            ],
        ]);
        $response = @file_get_contents('https://oauth2.googleapis.com/token', false, $ctx);
        if ($response === false) {
            return null;
        }
        $data = json_decode($response, true);
        return isset($data['access_token']) ? $data['access_token'] : null;
    }

    /**
     * Panggil Calendar API dengan Bearer token (create/update/delete).
     */
    private static function calendarApiRequest(string $method, string $calendarId, string $urlSuffix, ?string $accessToken, ?string $body = null): array
    {
        if ($accessToken === null || $accessToken === '') {
            return ['success' => false, 'error' => 'Service Account belum dikonfigurasi.', 'data' => null];
        }
        $url = 'https://www.googleapis.com/calendar/v3/calendars/' . rawurlencode($calendarId) . $urlSuffix;
        $opts = [
            'http' => [
                'method' => $method,
                'header' => "Authorization: Bearer " . $accessToken . "\r\nContent-Type: application/json; charset=utf-8\r\n",
                'timeout' => 15,
            ],
        ];
        if ($body !== null) {
            $opts['http']['content'] = $body;
        }
        $ctx = stream_context_create($opts);
        $response = @file_get_contents($url, false, $ctx);
        $code = 0;
        if (isset($http_response_header[0]) && preg_match('/ (\d+) /', $http_response_header[0], $m)) {
            $code = (int) $m[1];
        }
        $data = $response !== false ? json_decode($response, true) : null;
        if ($code >= 200 && $code < 300) {
            return ['success' => true, 'error' => null, 'data' => $data];
        }
        $errMsg = is_array($data) && isset($data['error']['message']) ? $data['error']['message'] : ($response ?: 'Request gagal');
        return ['success' => false, 'error' => $errMsg, 'data' => $data];
    }

    /**
     * Buat event baru di kalender (butuh Service Account).
     * start dan end: ISO 8601 (dateTime atau date).
     */
    public static function createEvent(string $slug, string $summary, string $description, string $start, string $end): array
    {
        $config = self::getCalendarConfigBySlug($slug);
        if ($config === null) {
            return ['success' => false, 'error' => 'Kalender tidak ditemukan.', 'event' => null];
        }
        $token = self::getServiceAccountAccessToken();
        $payload = [
            'summary' => $summary,
            'description' => $description,
            'start' => self::formatCalendarDateTime($start),
            'end' => self::formatCalendarDateTime($end),
        ];
        $body = json_encode($payload);
        $result = self::calendarApiRequest('POST', $config['calendar_id'], '/events', $token, $body);
        if ($result['success'] && is_array($result['data'])) {
            return ['success' => true, 'error' => null, 'event' => $result['data']];
        }
        return ['success' => false, 'error' => $result['error'] ?? 'Gagal membuat event.', 'event' => null];
    }

    /**
     * Update event (butuh Service Account).
     */
    public static function updateEvent(string $slug, string $eventId, string $summary, string $description, string $start, string $end): array
    {
        $config = self::getCalendarConfigBySlug($slug);
        if ($config === null) {
            return ['success' => false, 'error' => 'Kalender tidak ditemukan.', 'event' => null];
        }
        $token = self::getServiceAccountAccessToken();
        $payload = [
            'summary' => $summary,
            'description' => $description,
            'start' => self::formatCalendarDateTime($start),
            'end' => self::formatCalendarDateTime($end),
        ];
        $body = json_encode($payload);
        $result = self::calendarApiRequest('PUT', $config['calendar_id'], '/events/' . rawurlencode($eventId), $token, $body);
        if ($result['success'] && is_array($result['data'])) {
            return ['success' => true, 'error' => null, 'event' => $result['data']];
        }
        return ['success' => false, 'error' => $result['error'] ?? 'Gagal mengubah event.', 'event' => null];
    }

    /**
     * Hapus event (butuh Service Account).
     */
    public static function deleteEvent(string $slug, string $eventId): array
    {
        $config = self::getCalendarConfigBySlug($slug);
        if ($config === null) {
            return ['success' => false, 'error' => 'Kalender tidak ditemukan.'];
        }
        $token = self::getServiceAccountAccessToken();
        $result = self::calendarApiRequest('DELETE', $config['calendar_id'], '/events/' . rawurlencode($eventId), $token);
        return ['success' => $result['success'], 'error' => $result['error'] ?? null];
    }

    private static function formatCalendarDateTime(string $iso): array
    {
        if (strlen($iso) <= 10) {
            return ['date' => $iso, 'timeZone' => 'Asia/Jakarta'];
        }
        return ['dateTime' => $iso, 'timeZone' => 'Asia/Jakarta'];
    }

    /**
     * Ambil event dari kalender public by slug, dalam rentang timeMin-timeMax.
     * Jika GOOGLE_CALENDAR_API_KEY di-set di .env, pakai Google Calendar API; jika tidak, pakai iCal public.
     *
     * @return array{events: array, config: array|null, error: string|null}
     */
    public static function getPublicEvents(string $slug, ?string $timeMin = null, ?string $timeMax = null): array
    {
        $config = self::getCalendarConfigBySlug($slug);
        if ($config === null) {
            return ['events' => [], 'config' => null, 'error' => 'Kalender tidak ditemukan atau belum dikonfigurasi.'];
        }

        $cfg = require __DIR__ . '/../../config.php';
        $apiKey = $cfg['google']['calendar_api_key'] ?? null;
        if ($apiKey !== null && $apiKey !== '') {
            $events = self::fetchEventsViaCalendarApi($config['calendar_id'], $apiKey, $timeMin, $timeMax);
            if ($events !== null) {
                return [
                    'events' => $events,
                    'config' => ['name' => $config['name'], 'slug' => $config['slug']],
                    'error' => null,
                ];
            }
            // Fallback ke iCal jika API gagal (mis. key salah atau kalender tidak di-share)
        }

        $url = self::buildIcalUrl($config['calendar_id'], $config['calendar_url'] ?? null);
        $content = self::fetchIcalContent($url);
        if ($content === '') {
            return [
                'events' => [],
                'config' => ['name' => $config['name'], 'slug' => $config['slug']],
                'error' => 'Tidak dapat mengambil data kalender. Pastikan kalender public dan ID benar.',
            ];
        }

        $events = self::parseIcalEvents($content, $timeMin, $timeMax);
        return [
            'events' => $events,
            'config' => ['name' => $config['name'], 'slug' => $config['slug']],
            'error' => null,
        ];
    }
}
