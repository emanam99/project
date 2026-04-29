<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require 'vendor/autoload.php'; // Sesuaikan jalur ke file PHPMailer Anda

$mail = new PHPMailer(true);

try {
    // --- Pengaturan Server ---
    $mail->isSMTP();
    $mail->Host       = 'smtp.hostinger.com';
    $mail->SMTPAuth   = true;
    $mail->Username   = 'beddien@alutsmani.id'; // Email yang dibuat di Hostinger
    $mail->Password   = 'Beddian30..';
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS; // SSL
    $mail->Port       = 465;

    // --- Penerima & Isi Email ---
    $mail->setFrom('email-anda@domain.com', 'Nama Anda/Bisnis');
    $mail->addAddress('user-tujuan@gmail.com'); // Email user

    $mail->isHTML(true);
    $mail->Subject = 'Konfirmasi Otomatis';
    $mail->Body    = 'Halo! Ini adalah email yang dikirim secara <b>otomatis</b> melalui PHP.';

    $mail->send();
    echo 'Email berhasil dikirim';
} catch (Exception $e) {
    echo "Email gagal dikirim. Error: {$mail->ErrorInfo}";
}