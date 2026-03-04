<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpException;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;

class JsonErrorHandler
{
    public function __invoke(
        ServerRequestInterface $request,
        \Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails
    ): ResponseInterface {
        $response = new \Slim\Psr7\Response();
        
        $statusCode = 500;
        $message = 'Internal Server Error';
        
        if ($exception instanceof HttpNotFoundException) {
            $statusCode = 404;
            $message = 'Endpoint tidak ditemukan';
        } elseif ($exception instanceof HttpMethodNotAllowedException) {
            $statusCode = 405;
            $message = 'Method tidak diizinkan';
        } elseif ($exception instanceof HttpException) {
            $statusCode = $exception->getCode();
            $message = $exception->getMessage();
        }
        
        if ($logErrors) {
            error_log("Error: " . $exception->getMessage());
        }
        
        $data = [
            'success' => false,
            'message' => $message
        ];
        
        if ($displayErrorDetails) {
            $data['error'] = [
                'type' => get_class($exception),
                'message' => $exception->getMessage(),
                'file' => $exception->getFile(),
                'line' => $exception->getLine()
            ];
        }
        
        $response->getBody()->write(json_encode($data));
        return $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json');
    }
}

