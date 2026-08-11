<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Memetakan payload webhook Evolution API v2 (MESSAGES_UPSERT, dan sebagian MESSAGES_UPDATE) ke bentuk inbound eBeddien.
 *
 * Evolution mengirim POST dengan envelope: event, instance, data (lihat webhook.controller emit).
 * Log `console.log(messageRaw)` di container Evolution bukan sama dengan request webhook ke URL Anda.
 */
final class EvolutionInboundParser
{
    /**
     * @return list<array{from: string, from_jid: string, text: string, message_id: ?string, is_group: ?bool}>
     */
    public static function extractInboundMessages(array $payload): array
    {
        $event = strtoupper(str_replace('.', '_', (string) ($payload['event'] ?? '')));
        $isUpsert = $event === '' || str_contains($event, 'MESSAGES_UPSERT');
        $isUpdate = str_contains($event, 'MESSAGES_UPDATE');
        if ($event !== '' && !$isUpsert && !$isUpdate) {
            return [];
        }

        $data = $payload['data'] ?? null;
        if (!\is_array($data)) {
            $data = $payload;
        }

        // messages.update: data datar { keyId, remoteJid, fromMe, message? } tanpa key/messages[]
        if ($isUpdate && !isset($data['messages']) && !isset($data['key']) && isset($data['remoteJid'], $data['keyId'])) {
            $inner = $data['message'] ?? [];
            if (!\is_array($inner)) {
                $inner = [];
            }
            $data = [
                'messages' => [[
                    'key' => [
                        'remoteJid' => (string) $data['remoteJid'],
                        'fromMe' => !empty($data['fromMe']),
                        'id' => (string) $data['keyId'],
                        'participant' => isset($data['participant']) ? (string) $data['participant'] : '',
                    ],
                    'message' => $inner,
                ]],
            ];
        }

        $messages = $data['messages'] ?? null;
        if (!\is_array($messages)) {
            if (isset($data['key']) && \is_array($data['key'])) {
                $messages = [$data];
            } else {
                $messages = [];
            }
        }

        $out = [];
        foreach ($messages as $msg) {
            if (!\is_array($msg)) {
                continue;
            }
            $key = $msg['key'] ?? [];
            if (!\is_array($key)) {
                continue;
            }
            if (!empty($key['fromMe'])) {
                continue;
            }
            $remoteJid = trim((string) ($key['remoteJid'] ?? ''));
            if ($remoteJid === '' || str_contains(strtolower($remoteJid), 'status@broadcast')) {
                continue;
            }

            $participant = trim((string) ($key['participant'] ?? ''));
            $isGroup = str_ends_with(strtolower($remoteJid), '@g.us');
            $senderJid = ($isGroup && $participant !== '') ? $participant : $remoteJid;

            [$fromDigits, $normJid] = self::jidToFromAndJid($senderJid);
            if ($fromDigits === '' && $normJid === '') {
                continue;
            }

            $inner = $msg['message'] ?? [];
            if (!\is_array($inner)) {
                $inner = [];
            }
            $text = self::extractTextFromMessageContent($inner);
            if ($text === '') {
                continue;
            }

            $messageId = isset($key['id']) ? trim((string) $key['id']) : null;
            if ($messageId === '') {
                $messageId = null;
            }

            $out[] = [
                'from' => $fromDigits !== '' ? $fromDigits : $senderJid,
                'from_jid' => $normJid !== '' ? $normJid : $senderJid,
                'text' => $text,
                'message_id' => $messageId,
                'is_group' => $isGroup,
            ];
        }

        return $out;
    }

    /**
     * @return array{0: string, 1: string} [digit atau string mentah untuk @lid, jid penuh]
     */
    private static function jidToFromAndJid(string $jid): array
    {
        $jid = trim($jid);
        if ($jid === '') {
            return ['', ''];
        }
        $lower = strtolower($jid);
        $base = strstr($jid, '@', true);
        if ($base === false) {
            $base = $jid;
        }
        if (str_contains($base, ':')) {
            $parts = explode(':', $base, 2);
            $base = $parts[1] ?? $parts[0];
        }
        $digits = preg_replace('/\D/', '', $base) ?? '';

        return [$digits, $jid];
    }

    /**
     * @param array<string, mixed> $m
     */
    private static function extractTextFromMessageContent(array $m): string
    {
        if (isset($m['conversation']) && \is_string($m['conversation'])) {
            return trim($m['conversation']);
        }
        if (isset($m['extendedTextMessage']) && \is_array($m['extendedTextMessage'])) {
            $t = trim((string) ($m['extendedTextMessage']['text'] ?? ''));
            if ($t !== '') {
                return $t;
            }
        }
        foreach (['imageMessage', 'videoMessage', 'documentMessage'] as $k) {
            if (isset($m[$k]) && \is_array($m[$k])) {
                $c = trim((string) ($m[$k]['caption'] ?? ''));
                if ($c !== '') {
                    return $c;
                }
            }
        }
        if (isset($m['buttonsResponseMessage']) && \is_array($m['buttonsResponseMessage'])) {
            $t = trim((string) ($m['buttonsResponseMessage']['selectedDisplayText'] ?? ''));
            if ($t !== '') {
                return $t;
            }
            $t = trim((string) ($m['buttonsResponseMessage']['selectedButtonId'] ?? ''));
            if ($t !== '') {
                return $t;
            }
        }
        if (isset($m['listResponseMessage']) && \is_array($m['listResponseMessage'])) {
            $t = trim((string) ($m['listResponseMessage']['title'] ?? ''));
            if ($t !== '') {
                return $t;
            }
            $ss = $m['listResponseMessage']['singleSelectReply'] ?? null;
            if (\is_array($ss)) {
                $t = trim((string) ($ss['selectedRowId'] ?? ''));
                if ($t !== '') {
                    return $t;
                }
            }
        }
        if (isset($m['templateButtonReplyMessage']) && \is_array($m['templateButtonReplyMessage'])) {
            $t = trim((string) ($m['templateButtonReplyMessage']['selectedDisplayText'] ?? ''));
            if ($t !== '') {
                return $t;
            }
        }

        return '';
    }
}
