<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class HttpsMiddleware implements MiddlewareInterface
{
    private $forceHttps;

    public function __construct()
    {
        $isProduction = getenv('APP_ENV') === 'production';
        if (!$isProduction && file_exists(__DIR__ . '/../../.env')) {
            $content = @file_get_contents(__DIR__ . '/../../.env');
            if ($content !== false && strpos($content, 'APP_ENV=production') !== false) {
                $isProduction = true;
            }
        }
        $forceHttpsEnv = getenv('FORCE_HTTPS');
        if ($forceHttpsEnv === false || $forceHttpsEnv === '') {
            $this->forceHttps = $isProduction;
        } else {
            $this->forceHttps = filter_var($forceHttpsEnv, FILTER_VALIDATE_BOOLEAN);
        }
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!$this->forceHttps) {
            return $handler->handle($request);
        }

        $uri = $request->getUri();
        if ($uri->getScheme() !== 'https') {
            $httpsUri = $uri->withScheme('https')->withPort(443);
            $response = new Response();
            return $response
                ->withStatus(301)
                ->withHeader('Location', (string) $httpsUri);
        }

        return $handler->handle($request);
    }
}
