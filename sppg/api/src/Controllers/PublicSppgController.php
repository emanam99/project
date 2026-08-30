<?php



namespace App\Controllers;



use App\Helpers\AuthHelper;

use App\Helpers\TenantHostHelper;

use App\Services\SppgService;

use App\Services\SubdomainProvisioner;

use Psr\Http\Message\ResponseInterface as Response;

use Psr\Http\Message\ServerRequestInterface as Request;



class PublicSppgController

{

    private SppgService $sppg;



    public function __construct()

    {

        $this->sppg = new SppgService();

    }



    private function json(Response $response, array $payload, int $status = 200): Response

    {

        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);

    }



    /** GET /public/sppg/check-slug?slug= */

    public function checkSlug(Request $request, Response $response): Response

    {

        $slug = SppgService::slugify((string) ($request->getQueryParams()['slug'] ?? ''));

        if ($slug === '') {

            return $this->json($response, ['success' => false, 'message' => 'Slug tidak valid'], 422);

        }

        return $this->json($response, [

            'success' => true,

            'data' => ['slug' => $slug, 'available' => $this->sppg->isSlugAvailable($slug)],

        ]);

    }



    /** GET /public/sppg/check-subdomain?subdomain= */

    public function checkSubdomain(Request $request, Response $response): Response

    {

        $sub = SppgService::normalizeSubdomain((string) ($request->getQueryParams()['subdomain'] ?? ''));

        if ($sub === '' || !TenantHostHelper::isValidSubdomainFormat($sub)) {

            return $this->json($response, [

                'success' => true,

                'data' => ['subdomain' => $sub, 'available' => false, 'reason' => 'format'],

            ]);

        }

        if (TenantHostHelper::isReservedSubdomain($sub)) {

            return $this->json($response, [

                'success' => true,

                'data' => ['subdomain' => $sub, 'available' => false, 'reason' => 'reserved'],

            ]);

        }

        return $this->json($response, [

            'success' => true,

            'data' => [

                'subdomain' => $sub,

                'available' => $this->sppg->isSubdomainAvailable($sub),

                'tenant_url' => TenantHostHelper::tenantUrl($sub),

            ],

        ]);

    }



    /** POST /public/sppg/register */

    public function register(Request $request, Response $response): Response

    {

        $body = json_decode((string) $request->getBody(), true);

        $body = is_array($body) ? $body : [];



        $namaUnit = trim((string) ($body['nama_unit'] ?? ''));

        $namaYayasan = trim((string) ($body['nama_yayasan'] ?? ''));

        $slug = SppgService::slugify((string) ($body['slug'] ?? ''));

        $subdomain = SppgService::normalizeSubdomain((string) ($body['subdomain'] ?? ''));

        $alamat = trim((string) ($body['alamat'] ?? ''));

        $telepon = trim((string) ($body['telepon'] ?? ''));

        $emailKontak = trim((string) ($body['email_kontak'] ?? ''));

        $frontend = AuthHelper::resolveFrontendUrl($body['frontend'] ?? null);



        if ($namaUnit === '' || $namaYayasan === '') {

            return $this->json($response, ['success' => false, 'message' => 'Nama unit dan nama yayasan wajib diisi'], 422);

        }

        if ($slug === '') {

            return $this->json($response, ['success' => false, 'message' => 'Slug SPPG tidak valid'], 422);

        }

        if (!$this->sppg->isSlugAvailable($slug)) {
            return $this->json($response, ['success' => false, 'message' => 'Slug sudah dipakai'], 409);
        }

        $cloudyEnabled = TenantHostHelper::tenantBaseDomain() !== null;
        if ($cloudyEnabled) {
            if ($subdomain === '' || !TenantHostHelper::isValidSubdomainFormat($subdomain)) {
                return $this->json($response, ['success' => false, 'message' => 'Subdomain tidak valid'], 422);
            }
            if (TenantHostHelper::isReservedSubdomain($subdomain)) {
                return $this->json($response, ['success' => false, 'message' => 'Subdomain tidak boleh dipakai'], 422);
            }
            if (!$this->sppg->isSubdomainAvailable($subdomain)) {
                return $this->json($response, ['success' => false, 'message' => 'Subdomain sudah dipakai'], 409);
            }
        }

        $tenantFrontend = ($cloudyEnabled && $subdomain !== '')
            ? (TenantHostHelper::tenantUrl($subdomain) ?? $frontend)
            : $frontend;

        try {
            $registerPayload = [
                'nama_unit' => $namaUnit,
                'nama_yayasan' => $namaYayasan,
                'slug' => $slug,
                'alamat' => $alamat,
                'telepon' => $telepon,
                'email_kontak' => $emailKontak,
            ];
            if ($cloudyEnabled) {
                $registerPayload['subdomain'] = $subdomain;
            }
            $authUrl = AuthHelper::buildGoogleAuthUrl('/langganan', $tenantFrontend, [
                'mode' => 'register',
                'register' => $registerPayload,
            ]);
            return $this->json($response, ['success' => true, 'data' => ['auth_url' => $authUrl]]);
        } catch (\Throwable $e) {
            return $this->json($response, ['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
