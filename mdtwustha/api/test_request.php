<?php
$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode(['nip' => '12345', 'password' => 'admin']),
        'ignore_errors' => true // to get body on 500
    ]
]);
$result = file_get_contents('http://localhost/mdtwustha/api/public/login', false, $context);
echo "STATUS:\n";
print_r($http_response_header);
echo "\nBODY:\n";
echo $result;
