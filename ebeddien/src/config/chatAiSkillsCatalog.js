/**
 * Daftar kemampuan Chat AI untuk pengguna — dikelompokkan menurut area aplikasi.
 * Map `requiresAccess` ke field boolean dari buildChatAiKemampuanAccess()
 * (hook Chat AI + izin menu santri/keuangan); null = selalu relevan di konteks umum.
 */
export const CHAT_AI_SKILL_GROUPS = [
  {
    id: 'obrolan_web',
    title: 'Obrolan web (tab Obrolan)',
    subtitle: 'Mode utama memakai API server + konteks lembaga.',
    skills: [
      {
        title: 'Jawaban dari bank Q&A terkurasi',
        description:
          'Asisten memunculkan saran cepat dari Bank Q&A dan menjawab dengan mempertimbangkan dokumen yang sudah disetujui admin.',
        requiresAccess: null,
      },
      {
        title: 'Balasan ringkas & ramah',
        description:
          'Jawaban to the point dengan emoji wajar; detail hanya bila Anda minta. Pertanyaan lanjutan (mis. «Ada lagi yang bisa dibantu?») dikirim sebagai chat terpisah — di aplikasi dan WhatsApp.',
        requiresAccess: null,
      },
      {
        title: 'Konteks utas WhatsApp (notifikasi & balasan)',
        description:
          'Di WhatsApp, asisten membaca hingga 10 pesan terakhir dari riwayat WA (termasuk notifikasi otomatis aplikasi yang Anda terima). Balasan singkat seperti «Iya» ditafsirkan sebagai respons terhadap notifikasi terakhir, bukan pertanyaan tanpa konteks.',
        requiresAccess: null,
      },
      {
        title: 'Konteks halaman saat panel dari header',
        description:
          'Jika Anda membuka eBeddien AI dari menu pengguna (panel kanan), server dapat menyertakan path halaman dan judul menu yang sedang aktif — sehingga pertanyaan tentang «halaman ini» atau meminta arahan navigasi lebih tepat. Di desktop Anda bisa mem-pin panel agar konten utama tetap terlihat di samping kiri.',
        requiresAccess: null,
      },
      {
        title: 'Kenali pengguna (nama & username)',
        description:
          'Saat Anda login eBeddien atau chat WhatsApp dengan nomor WA terverifikasi, server menyisipkan nama lengkap, username login, jabatan/role, dan jenis kelamin dari basis data — asisten mengenali siapa yang diajak bicara (sapaan Ustadz/Ustadzah untuk pengurus laki/perempuan) tanpa menanyakan identitas ulang.',
        requiresAccess: null,
      },
      {
        title: 'Mode berpikir (reasoning)',
        description: 'Opsi model reasoning untuk pertanyaan yang perlu langkah analisis lebih panjang.',
        requiresAccess: null,
      },
      {
        title: 'Mode alternatif (proxy)',
        description:
          'Sambungan langsung ke penyedia AI eksternal — hanya jika administrator mengizinkan role Anda.',
        requiresAccess: 'modeAlternatif',
      },
      {
        title: 'Pilih penyedia AI manual',
        description:
          'Secara default sistem memilih jalur AI otomatis (prioritas DeepSeek). Opsi pilih manual DeepSeek/Gemini hanya muncul jika role Anda diizinkan.',
        requiresAccess: 'selectProviderManual',
      },
      {
        title: 'Wirid, Nailul Murod, dzikir & doa',
        description:
          'Bila Anda menanyakan wirid, Nailul Murod, dzikir, shalawat, qoshidah/qasidah, doa, bacaan sebelum/sesudah shalat, atau amaliyah serupa, server menyisipkan cuplikan dari basis (penyamaan longgar, mis. «doa dhuha» dengan judul «doa setelah dhuha»). Jawaban menyertakan tulisan Arab bacaan sebagaimana di Nailul Murod, lalu arti/penjelasan bila diminta — asisten tidak mengarang teks di luar cuplikan.',
        requiresAccess: null,
      },
      {
        title: 'Biaya & item pendaftaran PSB (publik)',
        description:
          'Pertanyaan tentang biaya pendaftaran, item/tagihan PSB, atau «berapa bayar» — server menyisipkan katalog item set aktif (sama logika items-by-kondisi di aplikasi daftar & Simulasi eBeddien). Sebutkan kondisi Anda (status pendaftar, formal/diniyah, gender, gelombang, dll.) agar nominal tepat; siapa saja boleh tanya tanpa login staf. Detail tagihan/riwayat per santri → Aplikasi wali https://mybeddien.alutsmani.id',
        requiresAccess: null,
      },
      {
        title: 'Tarif UWABA / syahriah bulanan (publik)',
        description:
          'Pertanyaan biaya UWABA per bulan (mis. diniyah Wustha, formal STAI, status Mukim) — server menyisipkan katalog uwaba-prices.json selaras Input UWABA & kalkulator di eBeddien: harga dasar per status (flat), tambahan diniyah/formal/LTTQ, diskon saudara. Jenjang Khoriji ikut formal. Bukan biaya pendaftaran PSB; sebutkan kombinasi biodata bila perlu. Riwayat bayar/tunggakan per santri → https://mybeddien.alutsmani.id',
        requiresAccess: null,
      },
      {
        title: 'Panduan MyBeddian / Aplikasi santri (publik)',
        description:
          'Pertanyaan tentang MyBeddian (install PWA, login, daftar, lupa NIS, cek tagihan lewat login, passkey, fitur santri/wali/PJGT) — server menyisipkan panduan Aplikasi resmi. Siapa saja boleh tanya tanpa login staf. Tagihan per NIS tetap hanya lewat akun santri yang bersangkutan di https://mybeddien.alutsmani.id',
        requiresAccess: null,
      },
      {
        title: 'Analisis & ringkasan data pendaftar PSB',
        description:
          'Untuk pertanyaan analisis/statistik pendaftaran (pembayaran, duplikasi, pola hari, insight tahun ajaran), server dapat menyisipkan agregat dari basis PSB — sesuai lingkup akses pendaftaran Anda. Di eBeddien, ringkasan penuh ada di menu Pendaftaran → Analisis. Sebutkan tahun ajaran bila perlu (mis. 1447/2026).',
        requiresAccess: 'pendaftarAnalisis',
      },
    ],
  },
  {
    id: 'pelatihan',
    title: 'Pelatihan & pemantauan',
    subtitle: 'Tab di menu Chat AI / Pelatihan.',
    skills: [
      {
        title: 'Bank Q&A',
        description: 'Mengelola pasangan tanya-jawab yang menjadi sumber utama obrolan.',
        requiresAccess: 'pageTrainingBank',
      },
      {
        title: 'Training Chat',
        description: 'Percobaan obrolan untuk menguji jawaban sebelum dipublikasikan ke bank.',
        requiresAccess: 'pageTrainingChat',
      },
      {
        title: 'Dashboard',
        description: 'Ringkasan pemakaian dan aktivitas AI untuk pengawas.',
        requiresAccess: 'pageDashboard',
      },
      {
        title: 'Riwayat',
        description: 'Meninjau percakapan atau log terkait pelatihan/pemakaian.',
        requiresAccess: 'pageRiwayat',
      },
    ],
  },
  {
    id: 'pengaturan',
    title: 'Pengaturan & saluran',
    subtitle: 'Kontrol akses lembaga dan preferensi pengguna.',
    skills: [
      {
        title: 'Pengaturan Chat AI (WA instansi)',
        description:
          'Master AI WhatsApp, limit harian per pengunjung, kontak obrolan, dan preferensi mode obrolan web.',
        requiresAccess: 'pagePengaturan',
      },
      {
        title: 'Pengaturan User AI',
        description: 'Preferensi model dan parameter AI per akun pengguna (tab / panel terpisah).',
        requiresAccess: 'uiUserAiSettings',
      },
      {
        title: 'WhatsApp privat',
        description:
          'Balasan AI: pengguna eBeddien dengan no_wa terverifikasi memakai akun, limit web, dan pilihan model DeepSeek/Gemini (disimpan dari UI). Kirim gambar/PDF di WA diteruskan ke server seperti di Obrolan. Pengunjung lain lewat kuota instansi. Usulan agen: balas YA di WA atau tombol Konfirmasi di aplikasi.',
        requiresAccess: null,
      },
      {
        title: 'Konteks utas WA (notifikasi aplikasi)',
        description:
          'Hingga 10 pesan WA terakhir (termasuk notifikasi otomatis yang Anda terima) dibaca sebelum AI menjawab — balasan «Iya»/«OK» ditautkan ke notifikasi terakhir.',
        requiresAccess: null,
      },
    ],
  },
  {
    id: 'santri',
    title: 'Data santri & relasi',
    subtitle:
      'Jika server menyisipkan blok konteks (NIS 7 digit atau nama dalam tanda kutip), asisten dapat menjelaskan biodata yang dizinkan, rombel, domisili/kamar, ijin/boyong, serta ringkasan UWABA — sesuai hak akses role Anda. Mengubah data tetap lewat halaman aplikasi.',
    skills: [
      {
        title: 'Biodata & kontak (ayah/ibu/wali)',
        description:
          'Menjawab dari ringkasan server bila Anda punya akses menu Santri; tidak mengganti formulir resmi.',
        requiresAccess: 'santriBiodataRingkas',
      },
      {
        title: 'Domisili & kamar',
        description: 'Nama daerah asrama dan kamar bila izin Domisili atau Santri tersedia.',
        requiresAccess: 'santriDomisiliKamar',
      },
      {
        title: 'Rombel diniyah & formal',
        description: 'Kelas dan lembaga dari data rombel yang terhubung ke santri.',
        requiresAccess: 'santriRombel',
      },
      {
        title: 'Perizinan & boyong',
        description: 'Cuplikan catatan ijin pulang dan boyong terbaru sesuai izin modul terkait.',
        requiresAccess: 'santriPerizinanBoyong',
      },
      {
        title: 'UWABA, tunggakan & pembayaran',
        description: 'Agregat tagihan dan pembayaran terbaru dari basis data (bukan pengganti laporan resmi).',
        requiresAccess: 'santriUwabaPembayaran',
      },
    ],
  },
  {
    id: 'keuangan',
    title: 'Modul Keuangan',
    subtitle:
      'Asisten membantu merangkum, menjelaskan alur, dan mengarahkan ke halaman resmi. Input dan penyimpanan data tetap di modul Pemasukan, Pengeluaran, dan Dashboard Keuangan.',
    skills: [
      {
        title: 'Mengelola & memahami pemasukan',
        description:
          'Membantu menyusun ringkasan pencatatan, istilah akun, atau langkah di halaman Pemasukan sesuai kebijakan lembaga Anda.',
        requiresAccess: 'keuanganPemasukan',
      },
      {
        title: 'Pengeluaran & realisasi',
        description:
          'Penjelasan tab realisasi, alur edit item, dan hal yang perlu diperhatikan sebelum mencatat pengeluaran.',
        requiresAccess: 'keuanganPengeluaranRealisasi',
      },
      {
        title: 'Rencana pengeluaran & persetujuan',
        description:
          'Membantu memahami tahapan rencana, approve/tolak, dan koordinasi notifikasi terkait alur persetujuan. Di obrolan AI, Anda bisa menanyakan rencana yang belum di-approve — server menyisipkan ringkasannya bila izin pengeluaran memenuhi.',
        requiresAccess: 'keuanganRencanaAlur',
      },
      {
        title: 'Bantu buat rencana pengeluaran (dialog & agen)',
        description:
          'Meminta AI menyusun rencana baru: server menyisipkan cakupan lembaga, kategori valid, tahun ajaran hijriyah aktif (rentang masehi di master), tanggal hijri hari ini, dan sumber uang Cash untuk eksekusi agen — termasuk apakah Anda hanya boleh simpan draft atau juga boleh ajukan pending. AI melengkapi item/nominal dan menanyakan field yang kurang (mis. kategori/lembaga). Bila role Anda punya akses notifikasi draft, Anda bisa meminta kirim atau tidak notifikasi WA/Push saat simpan draft (kirim_notifikasi_draft). Agen (dengan izin konfirmasi tulis) dapat mengeksekusi tool create_rencana_pengeluaran.',
        requiresAccess: 'keuanganRencanaAlur',
      },
      {
        title: 'Review draft & antrian',
        description:
          'Menguraikan perbedaan draft vs rencana yang sudah dikirim, serta apa yang biasanya dicek sebelum disetujui.',
        requiresAccess: 'keuanganReviewDraft',
      },
      {
        title: 'Pengaturan provider WA pengeluaran',
        description:
          'Menjelaskan tab ikon gerigi di Pengeluaran: memilih provider WhatsApp khusus notifikasi pengeluaran (WA sendiri, Evolution, WatZap) atau mengikuti pengaturan umum.',
        requiresAccess: 'keuanganPengeluaranPengaturan',
      },
      {
        title: 'Analisis & ikhtisar keuangan',
        description:
          'Interpretasi ringkas angka di dashboard (tren, perbandingan sederhana) berdasarkan data yang Anda salin atau jelaskan — bukan pengganti laporan resmi.',
        requiresAccess: 'keuanganAnalisisDashboard',
      },
      {
        title: 'Detail transaksi & aktivitas',
        description:
          'Membantu membaca detail baris transaksi, status, atau aktivitas tahun ajaran agar lebih mudah dipahami atau dilaporkan.',
        requiresAccess: 'keuanganLihatDetail',
      },
    ],
  },
  {
    id: 'agen',
    title: 'Agen otomasi',
    subtitle: 'Asisten dapat mengusulkan aksi di aplikasi — dengan konfirmasi Anda.',
    skills: [
      {
        title: 'Usulan aksi',
        description:
          'Model dapat menyarankan langkah (misalnya navigasi atau pengisian ringkas) sesuai kebijakan server.',
        requiresAccess: 'agentUse',
      },
      {
        title: 'Konfirmasi sebelum menulis',
        description:
          'Perubahan data sensitif memerlukan tombol Konfirmasi di chat web, atau balas YA di WhatsApp (nomor terverifikasi) bila usulan masih pending.',
        requiresAccess: 'agentConfirmWrite',
      },
    ],
  },
]
