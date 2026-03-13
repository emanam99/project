<?php

namespace App\Controllers;

use App\Database;
use App\Helpers\TextSanitizer;
use App\Helpers\UserAktivitasLogger;
use App\Services\GoogleCalendarService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class GoogleCalendarController
{
    private $db;

    public function __construct()
    {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * GET /api/google-calendar/events?slug=pesantren&timeMin=...&timeMax=...
     * Public atau auth: tampilkan event kalender public (jadwal pesantren).
     */
    public function getEvents(Request $request, Response $response): Response
    {
        try {
            $params = $request->getQueryParams();
            $slug = $params['slug'] ?? 'pesantren';
            $timeMin = $params['timeMin'] ?? null;
            $timeMax = $params['timeMax'] ?? null;

            $result = GoogleCalendarService::getPublicEvents($slug, $timeMin, $timeMax);
            return $this->json($response, [
                'success' => true,
                'events' => $result['events'],
                'config' => $result['config'],
                'error' => $result['error'],
            ]);
        } catch (\Exception $e) {
            error_log('GoogleCalendar getEvents: ' . $e->getMessage());
            return $this->json($response, [
                'success' => false,
                'events' => [],
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/google-calendar/config
     * Daftar konfigurasi kalender (admin_kalender / super_admin).
     */
    public function getConfig(Request $request, Response $response): Response
    {
        try {
            $stmt = $this->db->query("SELECT id, slug, name, calendar_id, calendar_url, is_public, created_at, updated_at FROM google___calendar_config ORDER BY slug");
            $rows = $stmt ? $stmt->fetchAll(\PDO::FETCH_ASSOC) : [];
            return $this->json($response, ['success' => true, 'configs' => $rows]);
        } catch (\Exception $e) {
            error_log('GoogleCalendar getConfig: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/google-calendar/config/{slug}
     * Satu konfigurasi by slug (tanpa expose full calendar_id di frontend jika perlu, atau tampilkan untuk admin).
     */
    public function getConfigBySlug(Request $request, Response $response, array $args): Response
    {
        try {
            $slug = $args['slug'] ?? '';
            $config = GoogleCalendarService::getCalendarConfigBySlug($slug);
            if ($config === null) {
                return $this->json($response, ['success' => false, 'error' => 'Konfigurasi tidak ditemukan'], 404);
            }
            return $this->json($response, ['success' => true, 'config' => $config]);
        } catch (\Exception $e) {
            error_log('GoogleCalendar getConfigBySlug: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/google-calendar/events - Buat event baru (super_admin only).
     * Body: slug, summary, description, start, end (ISO 8601).
     */
    public function createEvent(Request $request, Response $response): Response
    {
        try {
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $raw = $request->getBody()->getContents();
                if ($raw !== '') {
                    $decoded = json_decode($raw, true);
                    $body = is_array($decoded) ? $decoded : [];
                }
            }
            if (!is_array($body)) {
                return $this->json($response, ['success' => false, 'error' => 'Body harus JSON.'], 400);
            }
            $body = TextSanitizer::sanitizeStringValues($body, []);
            $slug = $body['slug'] ?? 'pesantren';
            $summary = trim($body['summary'] ?? '');
            $description = trim($body['description'] ?? '');
            $start = trim($body['start'] ?? '');
            $end = trim($body['end'] ?? '');
            if ($summary === '' || $start === '' || $end === '') {
                return $this->json($response, ['success' => false, 'error' => 'summary, start, dan end wajib.'], 400);
            }
            $result = GoogleCalendarService::createEvent($slug, $summary, $description, $start, $end);
            if ($result['success']) {
                $user = $request->getAttribute('user');
                $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($pengurusId !== null && !empty($result['event']['id'])) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_CREATE, 'google_calendar_event', $result['event']['id'], null, $result['event'], $request);
                }
                return $this->json($response, ['success' => true, 'event' => $result['event']]);
            }
            return $this->json($response, ['success' => false, 'error' => $result['error']], 400);
        } catch (\Exception $e) {
            error_log('GoogleCalendar createEvent: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/google-calendar/events/{eventId} - Update event (super_admin only).
     */
    public function updateEvent(Request $request, Response $response, array $args): Response
    {
        try {
            $eventId = $args['eventId'] ?? '';
            if ($eventId === '') {
                return $this->json($response, ['success' => false, 'error' => 'eventId wajib.'], 400);
            }
            $body = $request->getParsedBody();
            if (!is_array($body)) {
                return $this->json($response, ['success' => false, 'error' => 'Body harus JSON.'], 400);
            }
            $body = TextSanitizer::sanitizeStringValues($body, []);
            $slug = $body['slug'] ?? 'pesantren';
            $summary = trim($body['summary'] ?? '');
            $description = trim($body['description'] ?? '');
            $start = trim($body['start'] ?? '');
            $end = trim($body['end'] ?? '');
            if ($summary === '' || $start === '' || $end === '') {
                return $this->json($response, ['success' => false, 'error' => 'summary, start, dan end wajib.'], 400);
            }
            $result = GoogleCalendarService::updateEvent($slug, $eventId, $summary, $description, $start, $end);
            if ($result['success']) {
                $user = $request->getAttribute('user');
                $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($pengurusId !== null) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_UPDATE, 'google_calendar_event', $eventId, null, $result['event'] ?? ['id' => $eventId, 'summary' => $summary], $request);
                }
                return $this->json($response, ['success' => true, 'event' => $result['event']]);
            }
            return $this->json($response, ['success' => false, 'error' => $result['error']], 400);
        } catch (\Exception $e) {
            error_log('GoogleCalendar updateEvent: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/google-calendar/events/{eventId} - Hapus event (super_admin only).
     * Query: slug=pesantren (optional).
     */
    public function deleteEvent(Request $request, Response $response, array $args): Response
    {
        try {
            $eventId = $args['eventId'] ?? '';
            if ($eventId === '') {
                return $this->json($response, ['success' => false, 'error' => 'eventId wajib.'], 400);
            }
            $params = $request->getQueryParams();
            $slug = $params['slug'] ?? 'pesantren';
            $result = GoogleCalendarService::deleteEvent($slug, $eventId);
            if ($result['success']) {
                $user = $request->getAttribute('user');
                $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
                if ($pengurusId !== null) {
                    UserAktivitasLogger::log(null, $pengurusId, UserAktivitasLogger::ACTION_DELETE, 'google_calendar_event', $eventId, ['id' => $eventId, 'slug' => $slug], null, $request);
                }
                return $this->json($response, ['success' => true]);
            }
            return $this->json($response, ['success' => false, 'error' => $result['error']], 400);
        } catch (\Exception $e) {
            error_log('GoogleCalendar deleteEvent: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/google-calendar/config/{slug} atau POST body dengan slug
     * Update konfigurasi kalender (admin_kalender / super_admin).
     */
    public function updateConfig(Request $request, Response $response, array $args): Response
    {
        try {
            $slug = $args['slug'] ?? '';
            $body = $request->getParsedBody();
            $body = is_array($body) ? TextSanitizer::sanitizeStringValues($body, []) : [];
            if (is_array($body) && isset($body['slug'])) {
                $slug = $body['slug'];
            }
            if ($slug === '') {
                return $this->json($response, ['success' => false, 'error' => 'Slug wajib'], 400);
            }

            $name = $body['name'] ?? '';
            $calendarId = $body['calendar_id'] ?? '';
            $calendarUrl = isset($body['calendar_url']) ? trim((string) $body['calendar_url']) : null;
            if ($calendarUrl === '') {
                $calendarUrl = null;
            }
            $isPublic = isset($body['is_public']) ? (int) (bool) $body['is_public'] : 1;

            $existing = GoogleCalendarService::getCalendarConfigBySlug($slug);
            if ($existing) {
                $stmt = $this->db->prepare("UPDATE google___calendar_config SET name = ?, calendar_id = ?, calendar_url = ?, is_public = ? WHERE slug = ?");
                $stmt->execute([$name ?: $existing['name'], $calendarId ?: $existing['calendar_id'], $calendarUrl, $isPublic, $slug]);
            } else {
                $stmt = $this->db->prepare("INSERT INTO google___calendar_config (slug, name, calendar_id, calendar_url, is_public) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$slug, $name ?: $slug, $calendarId, $calendarUrl, $isPublic]);
            }
            $config = GoogleCalendarService::getCalendarConfigBySlug($slug);
            $user = $request->getAttribute('user');
            $pengurusId = isset($user['user_id']) ? (int) $user['user_id'] : (isset($user['id']) ? (int) $user['id'] : null);
            if ($pengurusId !== null && $config) {
                UserAktivitasLogger::log(null, $pengurusId, $existing ? UserAktivitasLogger::ACTION_UPDATE : UserAktivitasLogger::ACTION_CREATE, 'google___calendar_config', $slug, $existing ?: null, $config, $request);
            }
            return $this->json($response, ['success' => true, 'config' => $config]);
        } catch (\Exception $e) {
            error_log('GoogleCalendar updateConfig: ' . $e->getMessage());
            return $this->json($response, ['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    private function json(Response $response, $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
    }
}
