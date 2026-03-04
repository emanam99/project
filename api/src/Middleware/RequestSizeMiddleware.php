<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class RequestSizeMiddleware implements MiddlewareInterface
{
    private $maxSize;   // bytes
    private $maxParams;

    public function __construct(int $maxSize = 10485760, int $maxParams = 100) // 10MB default
    {
        $this->maxSize = $maxSize;
        $this->maxParams = $maxParams;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $contentLength = $request->getHeaderLine('Content-Length');
        if ($contentLength && (int) $contentLength > $this->maxSize) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Request body terlalu besar. Maksimal: ' . ($this->maxSize / 1048576) . 'MB'
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(413)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $params = $request->getQueryParams();
        $body = $request->getParsedBody() ?? [];
        $totalParams = is_array($body) ? count($params) + count($body) : count($params);

        if ($totalParams > $this->maxParams) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Terlalu banyak parameter. Maksimal: ' . $this->maxParams
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(400)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        return $handler->handle($request);
    }
}
