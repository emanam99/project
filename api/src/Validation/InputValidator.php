<?php

namespace App\Validation;

class InputValidator
{
    /**
     * Validasi required fields
     */
    public static function validateRequired(array $data, array $requiredFields): array
    {
        $errors = [];
        foreach ($requiredFields as $field) {
            if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
                $errors[] = "Field '{$field}' wajib diisi";
            }
        }
        return $errors;
    }

    /**
     * Validasi tipe data
     */
    public static function validateType($value, string $type, string $fieldName = ''): ?string
    {
        switch ($type) {
            case 'string':
                if (!is_string($value)) {
                    return "Field '{$fieldName}' harus berupa string";
                }
                break;
            case 'integer':
            case 'int':
                if (!is_numeric($value) || (int)$value != $value) {
                    return "Field '{$fieldName}' harus berupa integer";
                }
                break;
            case 'numeric':
                if (!is_numeric($value)) {
                    return "Field '{$fieldName}' harus berupa angka";
                }
                break;
            case 'email':
                if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    return "Field '{$fieldName}' harus berupa email yang valid";
                }
                break;
            case 'date':
                $d = \DateTime::createFromFormat('Y-m-d', $value);
                if (!$d || $d->format('Y-m-d') !== $value) {
                    return "Field '{$fieldName}' harus berupa tanggal dengan format Y-m-d";
                }
                break;
            case 'array':
                if (!is_array($value)) {
                    return "Field '{$fieldName}' harus berupa array";
                }
                break;
        }
        return null;
    }

    /**
     * Validasi panjang string
     */
    public static function validateLength(string $value, ?int $min = null, ?int $max = null, string $fieldName = ''): ?string
    {
        $length = mb_strlen($value);
        if ($min !== null && $length < $min) {
            return "Field '{$fieldName}' minimal {$min} karakter";
        }
        if ($max !== null && $length > $max) {
            return "Field '{$fieldName}' maksimal {$max} karakter";
        }
        return null;
    }

    /**
     * Validasi nilai dalam range
     */
    public static function validateRange($value, $min, $max, string $fieldName = ''): ?string
    {
        if (!is_numeric($value)) {
            return "Field '{$fieldName}' harus berupa angka";
        }
        $num = (float)$value;
        if ($num < $min || $num > $max) {
            return "Field '{$fieldName}' harus antara {$min} dan {$max}";
        }
        return null;
    }

    /**
     * Validasi nilai dalam daftar yang diizinkan
     */
    public static function validateIn($value, array $allowedValues, string $fieldName = ''): ?string
    {
        if (!in_array($value, $allowedValues, true)) {
            $allowed = implode(', ', $allowedValues);
            return "Field '{$fieldName}' harus salah satu dari: {$allowed}";
        }
        return null;
    }

    /**
     * Sanitize string input
     */
    public static function sanitizeString(string $value): string
    {
        return trim(htmlspecialchars($value, ENT_QUOTES, 'UTF-8'));
    }

    /**
     * Sanitize integer
     */
    public static function sanitizeInt($value): ?int
    {
        if (!is_numeric($value)) {
            return null;
        }
        return (int)$value;
    }

    /**
     * Validasi dan sanitize array data berdasarkan rules
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];
        $sanitized = [];

        foreach ($rules as $field => $ruleSet) {
            $value = $data[$field] ?? null;
            $ruleArray = is_string($ruleSet) ? explode('|', $ruleSet) : $ruleSet;

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
                        if ($value !== null) {
                            if (!is_string($value)) {
                                $errors[] = "Field '{$field}' harus berupa string";
                            } else {
                                $sanitized[$field] = self::sanitizeString($value);
                            }
                        }
                        break;

                    case 'integer':
                    case 'int':
                        if ($value !== null) {
                            $error = self::validateType($value, 'integer', $field);
                            if ($error) {
                                $errors[] = $error;
                            } else {
                                $sanitized[$field] = self::sanitizeInt($value);
                            }
                        }
                        break;

                    case 'numeric':
                        if ($value !== null) {
                            $error = self::validateType($value, 'numeric', $field);
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;

                    case 'email':
                        if ($value !== null) {
                            $error = self::validateType($value, 'email', $field);
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;

                    case 'date':
                        if ($value !== null) {
                            $error = self::validateType($value, 'date', $field);
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;

                    case 'array':
                        if ($value !== null) {
                            $error = self::validateType($value, 'array', $field);
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;

                    case 'min':
                        if ($value !== null && $ruleValue !== null) {
                            if (is_string($value)) {
                                $error = self::validateLength($value, (int)$ruleValue, null, $field);
                            } else {
                                $error = self::validateRange($value, (int)$ruleValue, PHP_INT_MAX, $field);
                            }
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;

                    case 'max':
                        if ($value !== null && $ruleValue !== null) {
                            if (is_string($value)) {
                                $error = self::validateLength($value, null, (int)$ruleValue, $field);
                            } else {
                                $error = self::validateRange($value, PHP_INT_MIN, (int)$ruleValue, $field);
                            }
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;

                    case 'in':
                        if ($value !== null && $ruleValue !== null) {
                            $allowed = explode(',', $ruleValue);
                            $error = self::validateIn($value, $allowed, $field);
                            if ($error) {
                                $errors[] = $error;
                            }
                        }
                        break;
                }
            }

            // Jika tidak ada error dan value ada, tambahkan ke sanitized
            if (!isset($sanitized[$field]) && $value !== null && !isset($errors[array_search("Field '{$field}' wajib diisi", $errors)])) {
                $sanitized[$field] = $value;
            }
        }

        return [
            'errors' => $errors,
            'data' => $sanitized
        ];
    }
}

