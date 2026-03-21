import { useState, useEffect } from 'react'
import { getGambarUrl } from '../../../config/images'

function formatAlamat(b) {
  if (!b) return '-'
  return [
    b.dusun,
    b.rt && b.rw ? `RT ${b.rt}/RW ${b.rw}` : '',
    b.desa,
    b.kecamatan,
    b.kabupaten,
    b.provinsi,
    b.kode_pos
  ]
    .filter(Boolean)
    .join(', ') || '-'
}

function formatTTL(b) {
  if (!b) return '-'
  const tl = (b.tempat_lahir || '').trim()
  const tg = b.tanggal_lahir
  let tgl = ''
  if (tg) {
    const s = String(tg)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s.slice(0, 10) + 'T12:00:00')
      if (!Number.isNaN(d.getTime())) {
        tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      }
    } else {
      tgl = s
    }
  }
  if (tl && tgl) return `${tl}, ${tgl}`
  if (tl) return tl
  if (tgl) return tgl
  return '-'
}

function domisiliLine(b) {
  if (!b) return '-'
  const parts = [b.daerah, b.kamar].filter(Boolean)
  return parts.length ? parts.join(' — ') : '-'
}

/** Isi cetak slot nilai: kosong = spasi tak terlihat (garis dari CSS), bukan titik teks */
function slotPrintText(v) {
  return v != null && String(v).trim() !== '' ? String(v) : '\u00A0'
}

/** Satu baris nilai: label + slot angka (bisa diisi dari panel atas) */
function NilaiBaris({ label, subLabel, value, onChange, placeholder = '' }) {
  const printText = slotPrintText(value)
  return (
    <div className="rapor-nilai-baris">
      <span className="rapor-bullet">&gt;</span>
      <div className="rapor-nilai-label">
        {label}
        {subLabel ? (
          <>
            <br />
            <span className="rapor-sub">{subLabel}</span>
          </>
        ) : null}
      </div>
      <span className="rapor-nilai-colon">:</span>
      <span className="rapor-nilai-slot">
        <input
          type="text"
          className="rapor-nilai-input no-print"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <span className="rapor-nilai-print">{printText}</span>
      </span>
    </div>
  )
}

function PilihanManual({ children }) {
  return <span className="rapor-pilihan-manual">{children}</span>
}

/**
 * Rapor Tes Madrasah Diniyah — struktur per tahap sesuai format panitia.
 */
function PrintRaporTesMadin({ biodata, tahunAjaranLabel, tahunAjaranRaw }) {
  const b = biodata || {}

  const [tesHari, setTesHari] = useState('')
  const [tesBulan, setTesBulan] = useState('')
  const [tesTahunH, setTesTahunH] = useState('1446')

  /* Tahap 1 */
  const [t1_membaca, setT1_membaca] = useState('')
  const [t1_menulis, setT1_menulis] = useState('')
  const [t1_jumlah, setT1_jumlah] = useState('')

  /* Tahap 2 */
  const [t2_kitab, setT2_kitab] = useState('')
  const [t2_ns5, setT2_ns5] = useState('')
  const [t2_ns6, setT2_ns6] = useState('')
  const [t2_jumlah, setT2_jumlah] = useState('')

  /* Tahap 3 */
  const [t3_baca, setT3_baca] = useState('')
  const [t3_nahwu, setT3_nahwu] = useState('')
  const [t3_sharaf, setT3_sharaf] = useState('')
  const [t3_jumlah, setT3_jumlah] = useState('')

  /* Tahap 4 */
  const [t4_baca, setT4_baca] = useState('')
  const [t4_fiqih, setT4_fiqih] = useState('')
  const [t4_nahwu, setT4_nahwu] = useState('')
  const [t4_balaghah, setT4_balaghah] = useState('')
  const [t4_jumlah, setT4_jumlah] = useState('')

  const [tanggalSurat, setTanggalSurat] = useState(() => {
    const d = new Date()
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  })
  const [namaKetua, setNamaKetua] = useState('Agil Farobi')

  useEffect(() => {
    const ta = tahunAjaranRaw || '1446-1447'
    const y = String(ta).split(/[-\s]+/)[0] || '1446'
    setTesTahunH(y)
  }, [tahunAjaranRaw])

  const idSantri = b.nis ?? b.id ?? '-'
  const nama = b.nama || '-'
  const formal = b.formal || '-'

  return (
    <div className="print-rapor-tes-madin">
      <div className="no-print rapor-tes-edit-panel mb-3 p-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-gray-900/40 text-xs space-y-3">
        <div className="font-semibold text-teal-800 dark:text-teal-300">Isi nilai (opsional)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-600 dark:text-gray-400">Tanggal tes — hari</span>
            <input
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              value={tesHari}
              onChange={(e) => setTesHari(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-600 dark:text-gray-400">Bulan</span>
            <input
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              value={tesBulan}
              onChange={(e) => setTesBulan(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-gray-600 dark:text-gray-400">Tahun (H)</span>
            <input
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              value={tesTahunH}
              onChange={(e) => setTesTahunH(e.target.value)}
            />
          </label>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 1</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5">
              <span>Membaca Arab Pegon</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t1_membaca} onChange={(e) => setT1_membaca(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Menulis Arab Pegon</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t1_menulis} onChange={(e) => setT1_menulis(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t1_jumlah} onChange={(e) => setT1_jumlah(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 2</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span>Kitab / Lafadz &amp; Makna</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t2_kitab} onChange={(e) => setT2_kitab(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu &amp; Sharaf (5)</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t2_ns5} onChange={(e) => setT2_ns5(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu &amp; Sharaf (6)</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t2_ns6} onChange={(e) => setT2_ns6(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah nilai</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t2_jumlah} onChange={(e) => setT2_jumlah(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 3</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex flex-col gap-0.5">
              <span>Baca Kitab &amp; Pemahaman</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t3_baca} onChange={(e) => setT3_baca(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t3_nahwu} onChange={(e) => setT3_nahwu(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Sharaf</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t3_sharaf} onChange={(e) => setT3_sharaf(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah nilai</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t3_jumlah} onChange={(e) => setT3_jumlah(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="border-t border-teal-200/60 dark:border-teal-700 pt-2 space-y-2">
          <div className="font-medium text-teal-700 dark:text-teal-400">Tahap 4</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span>Baca Kitab &amp; Pemahaman</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t4_baca} onChange={(e) => setT4_baca(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Fiqih</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t4_fiqih} onChange={(e) => setT4_fiqih(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Nahwu</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t4_nahwu} onChange={(e) => setT4_nahwu(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Balaghah</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t4_balaghah} onChange={(e) => setT4_balaghah(e.target.value)} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>Jumlah nilai</span>
              <input className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" value={t4_jumlah} onChange={(e) => setT4_jumlah(e.target.value)} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-teal-200/60 dark:border-teal-700 pt-2">
          <label className="flex flex-col gap-0.5">
            <span>Tanggal surat (Bondowoso)</span>
            <input
              type="text"
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              value={tanggalSurat}
              onChange={(e) => setTanggalSurat(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Nama Ketua Panitia</span>
            <input
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              value={namaKetua}
              onChange={(e) => setNamaKetua(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="rapor-tes-body">
        <div className="rapor-tes-header">
          <div className="rapor-tes-logo-row">
            <img
              src={getGambarUrl('/kop.png')}
              alt="Logo"
              className="header-logo rapor-kop-img"
              width={72}
              height={72}
            />
          </div>
          <h1 className="rapor-tes-title">Rapor Tes Madrasah Diniyah</h1>
        </div>

        <p className="rapor-tes-intro">
          Yang bertandatangan di bawah ini panitia tes Madrasah Diniyah Pesantren Salafiyah Al-Utsmani Tahun Ajaran{' '}
          <strong>{tahunAjaranLabel}</strong>. Menyatakan bahwa :
        </p>

        <table className="rapor-tes-identitas">
          <tbody>
            <tr>
              <td className="lbl">Nama</td>
              <td className="sep">:</td>
              <td>{nama}</td>
            </tr>
            <tr>
              <td className="lbl">ID</td>
              <td className="sep">:</td>
              <td>{idSantri}</td>
            </tr>
            <tr>
              <td className="lbl">TTL</td>
              <td className="sep">:</td>
              <td>{formatTTL(b)}</td>
            </tr>
            <tr>
              <td className="lbl">Alamat</td>
              <td className="sep">:</td>
              <td>{formatAlamat(b)}</td>
            </tr>
            <tr>
              <td className="lbl">Formal</td>
              <td className="sep">:</td>
              <td>{formal}</td>
            </tr>
            <tr>
              <td className="lbl">Domisili</td>
              <td className="sep">:</td>
              <td>{domisiliLine(b)}</td>
            </tr>
          </tbody>
        </table>

        <p className="rapor-tes-par">
          Nama tersebut benar-benar telah mengikuti tes masuk Madrasah Diniyah pada tanggal :{' '}
          <span className="rapor-fill">{slotPrintText(tesHari)}</span> / <span className="rapor-fill">{slotPrintText(tesBulan)}</span> /{' '}
          <span className="rapor-fill">{slotPrintText(tesTahunH)}</span> H. Dengan hasil sebagai berikut :
        </p>

        <div className="rapor-tahap-baris rapor-tahap-baris-12">
          {/* —— Tahap 1 —— */}
          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 1</h2>
            <NilaiBaris label="Membaca Arab Pegon" value={t1_membaca} onChange={setT1_membaca} />
            <NilaiBaris label="Menulis Arab Pegon" value={t1_menulis} onChange={setT1_menulis} />
            <div className="rapor-jumlah-baris">
              <span className="rapor-jumlah-label">Jumlah</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot">
                <input type="text" className="rapor-nilai-input no-print" value={t1_jumlah} onChange={(e) => setT1_jumlah(e.target.value)} />
                <span className="rapor-nilai-print">{slotPrintText(t1_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-t1-masuk">
                <span>Keputusan : Masuk</span>
                <PilihanManual>[ Program Isti&apos;dadiyah ]</PilihanManual>
              </div>
              <div className="rapor-keputusan-opsi rapor-t1-lanjut">
                <PilihanManual>[ Lanjut Tahap 2 ]</PilihanManual>
              </div>
            </div>
          </section>

          {/* —— Tahap 2 —— */}
          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 2</h2>
            <NilaiBaris
              label="Memaknai dan membaca kitab,"
              subLabel="Lafadz dan Makna"
              value={t2_kitab}
              onChange={setT2_kitab}
            />
            <NilaiBaris label="Nahwu & Sharaf (5)" value={t2_ns5} onChange={setT2_ns5} />
            <NilaiBaris label="Nahwu & Sharaf (6)" value={t2_ns6} onChange={setT2_ns6} />
            <div className="rapor-jumlah-baris rapor-jumlah-panjang">
              <span className="rapor-jumlah-label">Jumlah Nilai</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot rapor-slot-panjang">
                <input type="text" className="rapor-nilai-input no-print" value={t2_jumlah} onChange={(e) => setT2_jumlah(e.target.value)} />
                <span className="rapor-nilai-print">{slotPrintText(t2_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-keputusan-wrap">
                <span>Keputusan : Masuk Ula, Kelas</span>
                <span className="rapor-keputusan-kelas">
                  <PilihanManual>[ 4 ]</PilihanManual>
                  <span className="rapor-dash"> - </span>
                  <PilihanManual>[ 5 ]</PilihanManual>
                  <span className="rapor-dash"> - </span>
                  <PilihanManual>[ 6 ]</PilihanManual>
                </span>
              </div>
              <div className="rapor-keputusan-opsi">
                <PilihanManual>[ Lanjut Tahap 3 ]</PilihanManual>
              </div>
            </div>
          </section>
        </div>

        <div className="rapor-tahap-baris rapor-tahap-baris-34">
          {/* —— Tahap 3 —— */}
          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 3</h2>
            <NilaiBaris label="Baca Kitab dan Pemahaman" value={t3_baca} onChange={setT3_baca} />
            <NilaiBaris label="Nahwu" value={t3_nahwu} onChange={setT3_nahwu} />
            <NilaiBaris label="Sharaf" value={t3_sharaf} onChange={setT3_sharaf} />
            <div className="rapor-jumlah-baris rapor-jumlah-panjang">
              <span className="rapor-jumlah-label">Jumlah Nilai</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot rapor-slot-panjang">
                <input type="text" className="rapor-nilai-input no-print" value={t3_jumlah} onChange={(e) => setT3_jumlah(e.target.value)} />
                <span className="rapor-nilai-print">{slotPrintText(t3_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-keputusan-wrap">
                <span>Keputusan : Masuk Wustha, Kelas</span>
                <span className="rapor-keputusan-kelas">
                  <PilihanManual>[ 1 ]</PilihanManual>
                  <span className="rapor-dash"> - </span>
                  <PilihanManual>[ 2 ]</PilihanManual>
                </span>
              </div>
              <div className="rapor-keputusan-opsi">
                <PilihanManual>[ Lanjut Tahap 4 ]</PilihanManual>
              </div>
            </div>
          </section>

          {/* —— Tahap 4 —— */}
          <section className="rapor-tahap">
            <h2 className="rapor-tahap-judul">Tes Tahap 4</h2>
            <NilaiBaris label="Baca Kitab dan Pemahaman" value={t4_baca} onChange={setT4_baca} />
            <NilaiBaris label="Fiqih" value={t4_fiqih} onChange={setT4_fiqih} />
            <NilaiBaris label="Nahwu" value={t4_nahwu} onChange={setT4_nahwu} />
            <NilaiBaris label="Balaghah" value={t4_balaghah} onChange={setT4_balaghah} />
            <div className="rapor-jumlah-baris rapor-jumlah-panjang">
              <span className="rapor-jumlah-label">Jumlah Nilai</span>
              <span className="rapor-jumlah-colon">:</span>
              <span className="rapor-nilai-slot rapor-slot-panjang">
                <input type="text" className="rapor-nilai-input no-print" value={t4_jumlah} onChange={(e) => setT4_jumlah(e.target.value)} />
                <span className="rapor-nilai-print">{slotPrintText(t4_jumlah)}</span>
              </span>
            </div>
            <div className="rapor-keputusan-block">
              <div className="rapor-keputusan-baris rapor-keputusan-wrap">
                <span>Keputusan : Masuk kelas</span>
                <span className="rapor-keputusan-kelas">
                  <PilihanManual>[ 3 Wustha ]</PilihanManual>
                </span>
              </div>
              <div className="rapor-keputusan-opsi">
                <PilihanManual>[ 1 Ulya ]</PilihanManual>
              </div>
            </div>
          </section>
        </div>

        <p className="rapor-tes-par">Demikian rapor ini dibuat, untuk digunakan sebagaimana mestinya.</p>

        <div className="rapor-tes-ttd">
          <p className="rapor-tes-kota">Bondowoso, {tanggalSurat}</p>
          <p className="rapor-tes-jabatan">Ketua Panitia Tes Madrasah Diniyah</p>
          <div className="rapor-tes-spacer" />
          <p className="rapor-tes-nama">{namaKetua || 'Agil Farobi'}</p>
        </div>
      </div>
    </div>
  )
}

export default PrintRaporTesMadin
