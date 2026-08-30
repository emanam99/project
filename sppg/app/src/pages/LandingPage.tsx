import { Link } from 'react-router-dom'
import { gambarUrl } from '../utils/gambar'

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src={gambarUrl('icon/sppg.v3.u64.png')} alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-display font-bold text-lg">SPPG</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="ui-btn-ghost text-sm">
              Masuk
            </Link>
            <Link to="/daftar" className="ui-btn-primary text-sm">
              Daftar SPPG
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-14">
        <section className="text-center space-y-4 pt-4">
          <p className="text-sm font-semibold text-[var(--accent)] uppercase tracking-wide">Catatan belanja dapur santri</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
            Kelola belanja, rekening, porsi, dan ekspor BNI dalam satu aplikasi
          </h1>
          <p className="text-muted max-w-2xl mx-auto text-[15px]">
            SPPG membantu pengelola dapur santri mencatat belanja harian, mengelola rekening penerima, memantau porsi
            bergizi, dan mengekspor data ke format BNI dengan kontrol role yang jelas.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link to="/daftar" className="ui-btn-primary">
              Mulai daftar SPPG
            </Link>
            <Link to="/login" className="ui-btn-ghost">
              Sudah punya akun
            </Link>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { title: 'Belanja', desc: 'Catat item, kategori, rekening, dan status BNI.' },
            { title: 'Rekening', desc: 'Kelola nomor rekening VA/Rek untuk pembayaran.' },
            { title: 'Porsi', desc: 'Dokumentasi porsi bergizi PB/PK per hari.' },
            { title: 'Role & arsip', desc: 'Admin maker/approve, ekspor CSV/Excel terarsip.' },
          ].map((f) => (
            <div key={f.title} className="ui-card p-4 space-y-1.5">
              <h2 className="font-semibold text-ink">{f.title}</h2>
              <p className="text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="ui-card p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold">Langganan sederhana</h2>
            <p className="text-muted mt-1">Biaya per SPPG, data terisolasi antar unit.</p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-3xl font-bold tabular-nums text-[var(--accent)]">Rp 50.000</div>
            <div className="text-sm text-muted">per bulan</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-sm text-muted">
        SPPG — pencatatan belanja dapur santri
      </footer>
    </div>
  )
}
