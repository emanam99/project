<?php

namespace App\Helpers;

/**
 * ZIP store (tanpa kompresi) — cukup untuk bundel CSV BNI Online + Inhouse.
 */
class ZipStore
{
    /** @param array<string,string> $files path => content */
    public static function make(array $files): string
    {
        $out = '';
        $central = '';
        $offset = 0;
        $count = 0;

        foreach ($files as $name => $content) {
            $name = str_replace('\\', '/', $name);
            $size = strlen($content);
            $crc = crc32($content);

            $local = pack(
                'VvvvvvVVVvv',
                0x04034b50,
                20,
                0,
                0,
                0,
                0,
                $crc,
                $size,
                $size,
                strlen($name),
                0
            ) . $name . $content;

            $central .= pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50,
                20,
                20,
                0,
                0,
                0,
                0,
                $crc,
                $size,
                $size,
                strlen($name),
                0,
                0,
                0,
                0,
                0,
                $offset
            ) . $name;

            $out .= $local;
            $offset += strlen($local);
            $count++;
        }

        $centralOffset = strlen($out);
        $centralSize = strlen($central);
        $out .= $central;
        $out .= pack(
            'VvvvvVVv',
            0x06054b50,
            0,
            0,
            $count,
            $count,
            $centralSize,
            $centralOffset,
            0
        );

        return $out;
    }
}
