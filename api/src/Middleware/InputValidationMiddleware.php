<?php

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Nyholm\Psr7\Response;

class InputValidationMiddleware implements MiddlewareInterface
{
    private $validationRules;

    public function __construct(array $validationRules = [])
    {
        $this->validationRules = $validationRules;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // Jika tidak ada rules, skip validation
        if (empty($this->validationRules)) {
            return $handler->handle($request);
        }

        // Ambil data dari request body atau query params
        $data = [];
        $method = $request->getMethod();
        
        if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
            $data = $request->getParsedBody() ?? [];
        } else {
            $data = $request->getQueryParams();
        }

        // Validasi data
        $validationResult = $this->validateData($data);

        if (!empty($validationResult['errors'])) {
            $response = new Response();
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => 'Validasi gagal',
                'errors' => $validationResult['errors']
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withStatus(400)
                ->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        // Attach sanitized data ke request
        if (!empty($validationResult['data'])) {
            $request = $request->withAttribute('validated_data', $validationResult['data']);
        }

        return $handler->handle($request);
    }

    private function validateData(array $data): array
    {
        $errors = [];
        $sanitized = [];

        foreach ($this->validationRules as $field => $rules) {
            $value = $data[$field] ?? null;
            $ruleArray = is_string($rules) ? explode('|', $rules) : $rules;

            foreach ($ruleArray as $rule) {
                if (strpos($rule, ':') !== false) {
                    [$ruleName, $ruleValue] = explode(':', $rule, 2);
                } else {
                    $ruleName = $rule;
                    $ruleValue = null;
                }

                switch ($ruleName) {
                    case 'required':
                        if ($value === null || (is_string($value) && trim($value) === '')) {
                            $errors[] = "Field '{$field}' wajib diisi";
                        }
                        break;

                    case 'string':
                        if ($value !== null && !is_string($value)) {
                            $errors[] = "Field '{$field}' harus berupa string";
                        } elseif ($value !== null) {
                            $sanitized[$field] = trim(htmlspecialchars($value, ENT_QUOTES, 'UTF-8'));
                        }
                        break;

                    case 'integer':
                    case 'int':
                        if ($value !== null) {
                            if (!is_numeric($value) || (int)$value != $value) {
                                $errors[] = "Field '{$field}' harus berupa integer";
                            } else {
                                $sanitized[$field] = (int)$value;
                            }
                        }
                        break;

                    case 'numeric':
                        if ($value !== null && !is_numeric($value)) {
                            $errors[] = "Field '{$field}' harus berupa angka";
                        }
                        break;

                    case 'email':
                        if ($value !== null && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                            $errors[] = "Field '{$field}' harus berupa email yang valid";
                        }
                        break;

                    case 'date':
                        if ($value !== null) {
                            $d = \DateTime::createFromFormat('Y-m-d', $value);
                            if (!$d || $d->format('Y-m-d') !== $value) {
                                $errors[] = "Field '{$field}' harus berupa tanggal dengan format Y-m-d";
                            }
                        }
                        break;

                    case 'array':
                        if ($value !== null && !is_array($value)) {
                            $errors[] = "Field '{$field}' harus berupa array";
                        }
                        break;

                    case 'min':
                        if ($value !== null && $ruleValue !== null) {
                            if (is_string($value)) {
                                $length = mb_strlen($value);
                                if ($length < (int)$ruleValue) {
                                    $errors[] = "Field '{$field}' minimal " . (int)$ruleValue . " karakter";
                                }
                            } elseif (is_numeric($value) && (float)$value < (float)$ruleValue) {
                                $errors[] = "Field '{$field}' minimal " . (float)$ruleValue;
                            }
                        }
                        break;

                    case 'max':
                        if ($value !== null && $ruleValue !== null) {
                            if (is_string($value)) {
                                $length = mb_strlen($value);
                                if ($length > (int)$ruleValue) {
                                    $errors[] = "Field '{$field}' maksimal " . (int)$ruleValue . " karakter";
                                }
                            } elseif (is_numeric($value) && (float)$value > (float)$ruleValue) {
                                $errors[] = "Field '{$field}' maksimal " . (float)$ruleValue;
                            }
                        }
                        break;

                    case 'in':
                        if ($value !== null && $ruleValue !== null) {
                            $allowed = array_map('trim', explode(',', $ruleValue));
                            if (!in_array($value, $allowed, true)) {
                                $errors[] = "Field '{$field}' harus salah satu dari: " . implode(', ', $allowed);
                            }
                        }
                        break;
                }
            }

            // Jika tidak ada error dan value ada, tambahkan ke sanitized
            if (!isset($sanitized[$field]) && $value !== null && !in_array("Field '{$field}' wajib diisi", $errors)) {
                $sanitized[$field] = $value;
            }
        }

        return [
            'errors' => $errors,
            'data' => $sanitized
        ];
    }
}

