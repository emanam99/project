<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Seed template warmer: 2 kategori (education, finance), masing-masing 50 skrip percakapan (wa1/wa2).
 * Setiap skrip punya conversation_id + beberapa baris dengan sender 1 atau 2.
 */
class WarmerMessageSeed extends AbstractSeed
{
    public function run(): void
    {
        $this->execute("DELETE FROM whatsapp___warmer WHERE source = 'system'");

        $conversations = $this->getConversations();
        $table = $this->table('whatsapp___warmer');
        $sortOrder = 0;
        foreach ($conversations as $conv) {
            foreach ($conv['messages'] as $i => $msg) {
                $table->insert([
                    'source' => 'system',
                    'category' => $conv['category'],
                    'language' => $conv['language'],
                    'conversation_id' => $conv['conversation_id'],
                    'sender' => $msg['from'],
                    'content' => $msg['text'],
                    'source_file' => null,
                    'format' => null,
                    'sort_order' => $i,
                ]);
                $sortOrder++;
            }
        }
        $table->saveData();
    }

    /**
     * @return list<array{category: string, language: string, conversation_id: string, messages: list<array{from: int, text: string}>}>
     */
    private function getConversations(): array
    {
        $out = [];
        $edu = $this->educationConversations();
        $fin = $this->financeConversations();
        foreach ($edu as $i => $messages) {
            $out[] = [
                'category' => 'education',
                'language' => 'id',
                'conversation_id' => 'seed_edu_' . ($i + 1),
                'messages' => $messages,
            ];
        }
        foreach ($fin as $i => $messages) {
            $out[] = [
                'category' => 'finance',
                'language' => 'id',
                'conversation_id' => 'seed_fin_' . ($i + 1),
                'messages' => $messages,
            ];
        }
        return $out;
    }

    /**
     * 50 skrip percakapan kategori pendidikan (ID).
     * @return list<list<array{from: int, text: string}>>
     */
    private function educationConversations(): array
    {
        $templates = [
            [
                ['from' => 1, 'text' => 'Salam, apa kabar?'],
                ['from' => 2, 'text' => 'Salam balik, baik. Mau tanya materi kemarin?'],
                ['from' => 1, 'text' => 'Iya, bagian yang tadi dijelaskan pak guru.'],
                ['from' => 2, 'text' => 'Oke, nanti saya jelaskan lagi.'],
            ],
            [
                ['from' => 1, 'text' => 'Selamat pagi.'],
                ['from' => 2, 'text' => 'Pagi. Sudah siap belajar?'],
                ['from' => 1, 'text' => 'Siap. Topik hari ini apa?'],
                ['from' => 2, 'text' => 'Kita lanjut bab kemarin.'],
            ],
            [
                ['from' => 2, 'text' => 'Hai, ada yang bisa dibantu?'],
                ['from' => 1, 'text' => 'Saya mau tanya tentang tugas.'],
                ['from' => 2, 'text' => 'Tugas yang mana?'],
                ['from' => 1, 'text' => 'Tugas matematika halaman 10.'],
            ],
            [
                ['from' => 1, 'text' => 'Belajar itu investasi terbaik.'],
                ['from' => 2, 'text' => 'Betul. Pendidikan membuka peluang.'],
                ['from' => 1, 'text' => 'Semangat belajar ya.'],
                ['from' => 2, 'text' => 'Siap, terima kasih.'],
            ],
            [
                ['from' => 2, 'text' => 'Jangan lupa istirahat setelah belajar.'],
                ['from' => 1, 'text' => 'Oke, saya istirahat dulu.'],
                ['from' => 2, 'text' => 'Materi hari ini sudah dipahami?'],
                ['from' => 1, 'text' => 'Sudah, nanti saya ulangi lagi.'],
            ],
            [
                ['from' => 1, 'text' => 'Kapan kita belajar kelompok?'],
                ['from' => 2, 'text' => 'Besok sore bisa.'],
                ['from' => 1, 'text' => 'Oke, di mana?'],
                ['from' => 2, 'text' => 'Di perpustakaan saja.'],
            ],
            [
                ['from' => 2, 'text' => 'Tugas sudah dikumpulkan?'],
                ['from' => 1, 'text' => 'Sudah tadi pagi.'],
                ['from' => 2, 'text' => 'Bagus. Nilai nanti diumumkan.'],
                ['from' => 1, 'text' => 'Baik, terima kasih.'],
            ],
            [
                ['from' => 1, 'text' => 'Buku referensi yang mana ya?'],
                ['from' => 2, 'text' => 'Yang pak guru sebutkan tadi.'],
                ['from' => 1, 'text' => 'Oke saya cari.'],
                ['from' => 2, 'text' => 'Kalau ada yang kurang kabari saja.'],
            ],
            [
                ['from' => 2, 'text' => 'Semangat ujian besok.'],
                ['from' => 1, 'text' => 'Terima kasih. Doakan ya.'],
                ['from' => 2, 'text' => 'Pasti. Santai saja.'],
                ['from' => 1, 'text' => 'Iya, siap.'],
            ],
            [
                ['from' => 1, 'text' => 'Jadwal remedial kapan?'],
                ['from' => 2, 'text' => 'Minggu depan.'],
                ['from' => 1, 'text' => 'Baik saya catat.'],
                ['from' => 2, 'text' => 'Persiapkan dengan baik.'],
            ],
        ];

        $variants = [
            ['Salam.', 'Salam balik.', 'Ada yang bisa dibantu?', 'Saya mau tanya.'],
            ['Hai.', 'Hai juga.', 'Belajar apa hari ini?', 'Lanjut bab kemarin.'],
            ['Pagi.', 'Pagi. Siap belajar?', 'Siap.', 'Oke kita mulai.'],
            ['Selamat siang.', 'Siang. Mau tanya materi?', 'Iya.', 'Silakan.'],
            ['Permisi.', 'Iya, ada apa?', 'Tugas kemarin boleh minta penjelasan?', 'Boleh, nanti saya jelaskan.'],
            ['Terima kasih atas bantuannya.', 'Sama-sama.', 'Sangat membantu.', 'Senang bisa bantu.'],
            ['Kapan deadline tugas?', 'Besok.', 'Baik saya kerjakan.', 'Semangat.'],
            ['Materi ini susah ya.', 'Memang. Perlahan saja.', 'Oke saya coba lagi.', 'Kalau bingung tanya saja.'],
            ['Belajar bareng kapan?', 'Kapan kamu free?', 'Besok sore.', 'Oke setuju.'],
            ['Nilai sudah keluar?', 'Belum. Minggu depan.', 'Oke tunggu saja.', 'Iya.'],
        ];

        for ($i = count($templates); $i < 50; $i++) {
            $v = $variants[$i % count($variants)];
            $templates[] = [
                ['from' => 1, 'text' => $v[0]],
                ['from' => 2, 'text' => $v[1]],
                ['from' => 1, 'text' => $v[2]],
                ['from' => 2, 'text' => $v[3]],
            ];
        }
        return $templates;
    }

    /**
     * 50 skrip percakapan kategori keuangan (ID).
     * @return list<list<array{from: int, text: string}>>
     */
    private function financeConversations(): array
    {
        $templates = [
            [
                ['from' => 1, 'text' => 'Tabungan rutin bikin aman.'],
                ['from' => 2, 'text' => 'Betul. Saya sisihkan 10% tiap bulan.'],
                ['from' => 1, 'text' => 'Bagus itu. Konsisten saja.'],
                ['from' => 2, 'text' => 'Iya, terima kasih sarannya.'],
            ],
            [
                ['from' => 2, 'text' => 'Hindari utang konsumtif.'],
                ['from' => 1, 'text' => 'Setuju. Utang untuk produktif saja.'],
                ['from' => 2, 'text' => 'Cek saldo rutin biar terkontrol.'],
                ['from' => 1, 'text' => 'Oke saya catat.'],
            ],
            [
                ['from' => 1, 'text' => 'Investasi jangka panjang itu penting.'],
                ['from' => 2, 'text' => 'Iya. Saya baru mulai reksadana.'],
                ['from' => 1, 'text' => 'Bagus. Jangan lupa diversifikasi.'],
                ['from' => 2, 'text' => 'Oke, terima kasih.'],
            ],
            [
                ['from' => 1, 'text' => 'Salam. Mau tanya soal keuangan.'],
                ['from' => 2, 'text' => 'Salam. Silakan, tanya apa?'],
                ['from' => 1, 'text' => 'Cara atur budget bulanan yang baik?'],
                ['from' => 2, 'text' => '50-30-20: kebutuhan, keinginan, tabungan.'],
            ],
            [
                ['from' => 2, 'text' => 'Ada yang bisa dibantu?'],
                ['from' => 1, 'text' => 'Saya mau mulai nabung. Tips?'],
                ['from' => 2, 'text' => 'Mulai dari jumlah kecil, rutin.'],
                ['from' => 1, 'text' => 'Oke saya coba. Terima kasih.'],
            ],
            [
                ['from' => 1, 'text' => 'Kartu kredit perlu tidak ya?'],
                ['from' => 2, 'text' => 'Kalau disiplin bayar lunas, bisa manfaat.'],
                ['from' => 1, 'text' => 'Kalau tidak?'],
                ['from' => 2, 'text' => 'Bisa jebak utang. Hati-hati.'],
            ],
            [
                ['from' => 2, 'text' => 'Dana darurat idealnya berapa bulan?'],
                ['from' => 1, 'text' => 'Minimal 3–6 bulan pengeluaran.'],
                ['from' => 2, 'text' => 'Saya baru 2 bulan. Perlu nambah?'],
                ['from' => 1, 'text' => 'Iya, prioritaskan dulu.'],
            ],
            [
                ['from' => 1, 'text' => 'Asuransi kesehatan penting ya?'],
                ['from' => 2, 'text' => 'Sangat. Jangan sampai sakit bikin bangkrut.'],
                ['from' => 1, 'text' => 'Oke saya cari yang cocok.'],
                ['from' => 2, 'text' => 'Bandingkan beberapa produk dulu.'],
            ],
            [
                ['from' => 1, 'text' => 'Bagaimana cara cek kesehatan keuangan?'],
                ['from' => 2, 'text' => 'Lihat rasio utang, tabungan, dan investasi.'],
                ['from' => 1, 'text' => 'Ada template simple?'],
                ['from' => 2, 'text' => 'Bisa pakai spreadsheet. Saya kirim contoh.'],
            ],
            [
                ['from' => 2, 'text' => 'Jangan lupa catat pengeluaran harian.'],
                ['from' => 1, 'text' => 'Saya pakai aplikasi.'],
                ['from' => 2, 'text' => 'Bagus. Review mingguan.'],
                ['from' => 1, 'text' => 'Oke, terima kasih.'],
            ],
        ];

        $variants = [
            ['Tabungan rutin bikin aman.', 'Setuju. Saya sudah rutin.', 'Bagus.', 'Terima kasih.'],
            ['Sisihkan 10% dari gaji.', 'Sudah saya lakukan.', 'Konsisten ya.', 'Iya.'],
            ['Cek saldo rutin.', 'Oke saya jadwalkan.', 'Biarkan terkontrol.', 'Baik.'],
            ['Hindari utang konsumtif.', 'Betul. Saya hindari.', 'Bagus.', 'Terima kasih.'],
            ['Investasi jangka panjang penting.', 'Saya baru mulai.', 'Pelan-pelan saja.', 'Oke.'],
            ['Dana darurat sudah ada?', 'Baru 2 bulan.', 'Tambah lagi 3–6 bulan.', 'Siap.'],
            ['Asuransi sudah?', 'Belum. Mau cari.', 'Prioritaskan kesehatan.', 'Oke.'],
            ['Budget bulanan pakai apa?', '50-30-20.', 'Bagus itu.', 'Iya.'],
            ['Utang kartu kredit lunas?', 'Iya tiap bulan.', 'Bagus disiplin.', 'Terima kasih.'],
            ['Catat pengeluaran?', 'Pakai aplikasi.', 'Review mingguan ya.', 'Baik.'],
        ];

        for ($i = count($templates); $i < 50; $i++) {
            $v = $variants[$i % count($variants)];
            $templates[] = [
                ['from' => 1, 'text' => $v[0]],
                ['from' => 2, 'text' => $v[1]],
                ['from' => 1, 'text' => $v[2]],
                ['from' => 2, 'text' => $v[3]],
            ];
        }
        return $templates;
    }
}
