<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

class SecurityHeadersMiddleware implements MiddlewareInterface
{
    private $isProduction;

    public function __construct()
    {
        $this->isProduction = getenv('APP_ENV') === 'production' || 
                              (file_exists(__DIR__ . '/../../.env') && 
                               strpos(file_get_contents(__DIR__ . '/../../.env'), 'APP_ENV=production') !== false);
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        // X-Frame-Options: Mencegah clickjacking
        // DENY = tidak boleh di-embed di frame sama sekali
        $response = $response->withHeader('X-Frame-Options', 'DENY');

        // X-Content-Type-Options: Mencegah MIME sniffing
        // nosniff = browser tidak boleh menebak content type
        $response = $response->withHeader('X-Content-Type-Options', 'nosniff');

        // X-XSS-Protection: Enable XSS filter (legacy, tapi masih berguna untuk browser lama)
        // 1; mode=block = enable XSS filter dan block jika terdeteksi
        $response = $response->withHeader('X-XSS-Protection', '1; mode=block');

        // Referrer-Policy: Kontrol informasi referrer yang dikirim
        // strict-origin-when-cross-origin = kirim full URL untuk same-origin, hanya origin untuk cross-origin HTTPS
        $response = $response->withHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Content-Security-Policy: Mencegah XSS dan injection attacks
        // Sesuaikan dengan kebutuhan aplikasi Anda
        $csp = "default-src 'self'; " .
               "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " . // unsafe-inline dan unsafe-eval untuk kompatibilitas, pertimbangkan untuk dihapus jika memungkinkan
               "style-src 'self' 'unsafe-inline'; " .
               "img-src 'self' data: https:; " .
               "font-src 'self' data:; " .
               "connect-src 'self'; " .
               "frame-ancestors 'none';"; // Sama seperti X-Frame-Options: DENY
        $response = $response->withHeader('Content-Security-Policy', $csp);

        // Strict-Transport-Security (HSTS): Force HTTPS (hanya di production)
        // max-age=31536000 = 1 tahun
        // includeSubDomains = berlaku untuk semua subdomain
        // preload = bisa di-submit ke HSTS preload list
        if ($this->isProduction) {
            $response = $response->withHeader(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains; preload'
            );
        }

        // Permissions-Policy (sebelumnya Feature-Policy): Kontrol fitur browser
        // Disable geolocation, microphone, camera untuk keamanan
        $response = $response->withHeader(
            'Permissions-Policy',
            'geolocation=(), microphone=(), camera=()'
        );

        return $response;
    }
}

