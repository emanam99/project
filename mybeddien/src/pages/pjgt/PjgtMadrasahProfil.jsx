import { useEffect, useMemo, useState, memo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { madrasahPjgtAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { usePjgtMadrasahId, usePjgtProfil } from '../../hooks/usePjgtCachedResources'
import {
  MADRASAH_HIDDEN_DETAIL_KEYS,
  buildKegiatanBelajarLines,
  tingkatanDisplayText,
} from '../../utils/madrasahDisplayConfig'

/** Tidak pernah sebagai baris data; `id` hanya di header Identitas */
const NEVER_SHOW_KEYS = new Set(['id', 'id_pjgt'])

const SECTION_DEFS = [
  {
    id: 'identitas',
    title: 'Identitas & klasifikasi',
    subtitle: 'Nama resmi, identitas, dan status lembaga',
    keys: ['nama', 'identitas', 'kategori', 'status', 'sektor'],
  },
  {
    id: 'alamat',
    title: 'Alamat & wilayah',
    subtitle: 'Lokasi beserta referensi alamat di basis data',
    keys: [
      'id_alamat',
      'dusun',
      'rt',
      'rw',
      'desa',
      'kecamatan',
      'kabupaten',
      'provinsi',
      'kode_pos',
      'alamat_nama',
      'alamat_tipe',
      'alamat_kode_pos',
    ],
  },
  {
    id: 'pengasuh',
    title: 'Pengasuh',
    subtitle: 'Data tercatat pada madrasah & akun eBeddien',
    keys: ['nama_pengasuh', 'id_pengasuh', 'no_pengasuh', 'pengasuh_nama', 'pengasuh_wa', 'pengasuh_telp'],
  },
  {
    id: 'pjgt',
    title: 'PJGT',
    subtitle: 'Data tercatat pada madrasah & akun eBeddien',
    keys: ['nama_pjgt', 'no_pjgt', 'pjgt_nama', 'pjgt_wa', 'pjgt_telp'],
  },
  {
    id: 'koordinator',
    title: 'Koordinator wilayah UGT',
    subtitle: 'Penanggung jawab wilayah di eBeddien',
    keys: ['koordinator_nama', 'id_koordinator', 'koordinator_wa', 'koordinator_telp'],
  },
  {
    id: 'struktur',
    title: 'Struktur lembaga',
    subtitle: 'Kepala, sekretaris, bendahara',
    keys: ['kepala', 'sekretaris', 'bendahara'],
  },
  {
    id: 'tingkatan',
    title: 'Tingkatan & kurikulum',
    subtitle: 'Jenjang, kelas tertinggi, jumlah murid',
    keys: ['tingkatan', 'kelas_tertinggi', 'kurikulum', 'jumlah_murid'],
  },
  {
    id: 'kegiatan',
    title: 'Kegiatan & sejarah',
    subtitle: 'Jadwal belajar per waktu, tempat, tahun berdiri, catatan',
    keys: ['kegiatan_belajar', 'tempat', 'berdiri_tahun', 'keterangan'],
  },
  {
    id: 'sarana',
    title: 'Sarana, kebiasaan & lingkungan',
    subtitle: 'Fasilitas, seragam, syahriah, jarak, dsb.',
    keys: [
      'banin_banat',
      'seragam',
      'syahriah',
      'pengelola',
      'gedung_madrasah',
      'kantor',
      'bangku',
      'kamar_mandi_murid',
      'kamar_gt',
      'kamar_mandi_gt',
      'km_bersifat',
      'konsumsi',
      'kamar_gt_jarak',
      'masyarakat',
      'alumni',
      'jarak_md_lain',
    ],
  },
  {
    id: 'meta',
    title: 'Audit data',
    subtitle: 'Tanggal dibuat dan terakhir diubah di server',
    keys: ['tanggal_dibuat', 'tanggal_update'],
  },
]

const LABEL_OVERRIDE = {
  id_alamat: 'ID alamat (referensi)',
  identitas: 'Identitas madrasah',
  nama_pengasuh: 'Nama pengasuh',
  nama_pjgt: 'Nama PJGT',
  id_pengasuh: 'ID pengguna — pengasuh',
  id_koordinator: 'ID koordinator',
  tingkatan: 'Tingkatan',
  kegiatan_belajar: 'Kegiatan belajar',
  kelas_tertinggi: 'Kelas tertinggi',
  jumlah_murid: 'Jumlah murid',
  berdiri_tahun: 'Tahun berdiri',
  kamar_mandi_murid: 'Kamar mandi murid',
  kamar_mandi_gt: 'Kamar mandi guru tugas',
  kamar_gt_jarak: 'Jarak kamar guru tugas',
  jarak_md_lain: 'Jarak madrasah lain',
  pengasuh_nama: 'Username akun pengasuh',
  pengasuh_wa: 'Nomor WA (akun pengasuh)',
  pengasuh_telp: 'Kolom WA users — pengasuh',
  pjgt_nama: 'Username akun PJGT',
  pjgt_wa: 'Nomor WA (akun PJGT)',
  pjgt_telp: 'Kolom WA users — PJGT',
  koordinator_nama: 'Nama koordinator',
  koordinator_wa: 'Nomor WA koordinator',
  koordinator_telp: 'Kolom WA users — koordinator',
  alamat_nama: 'Alamat terhubung — nama',
  alamat_tipe: 'Alamat terhubung — tipe',
  alamat_kode_pos: 'Alamat terhubung — kode pos',
  tanggal_dibuat: 'Dibuat',
  tanggal_update: 'Terakhir diubah',
}

function labelForKey(key) {
  if (LABEL_OVERRIDE[key]) return LABEL_OVERRIDE[key]
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function formatScalar(key, raw, data = {}) {
  if (key === 'tingkatan') {
    return tingkatanDisplayText(data)
  }
  if (key === 'kegiatan_belajar') {
    return buildKegiatanBelajarLines(data).length > 0 ? '__kegiatan__' : null
  }
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'object') return JSON.stringify(raw)
  const s = String(raw).trim()
  if (s === '') return null
  if (key === 'tanggal_dibuat' || key === 'tanggal_update') {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    }
  }
  return s
}

function collectAssignedKeys() {
  const s = new Set()
  for (const sec of SECTION_DEFS) {
    for (const k of sec.keys) s.add(k)
  }
  return s
}

const ASSIGNED = collectAssignedKeys()

function TingkatanPills({ text }) {
  const items = text.split(',').map((t) => t.trim()).filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((label) => (
        <span
          key={label}
          className="inline-flex rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/45 dark:text-primary-200"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function KegiatanBelajarBlock({ data }) {
  const lines = buildKegiatanBelajarLines(data)
  if (!lines.length) return null
  return (
    <ul className="space-y-2">
      {lines.map(({ label, jam }) => (
        <li
          key={label}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
        >
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
          <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">{jam}</span>
        </li>
      ))}
    </ul>
  )
}

function FieldCell({ k, data }) {
  if (NEVER_SHOW_KEYS.has(k)) return null

  if (k === 'kegiatan_belajar') {
    const lines = buildKegiatanBelajarLines(data)
    if (!lines.length) return null
    return (
      <div className="sm:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          {labelForKey(k)}
        </p>
        <KegiatanBelajarBlock data={data} />
      </div>
    )
  }

  const raw = data[k]
  const formatted = formatScalar(k, raw, data)
  if (formatted === null) return null

  const fullWidth = k === 'keterangan' || k === 'tingkatan'

  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
        {labelForKey(k)}
      </p>
      {k === 'tingkatan' ? (
        <TingkatanPills text={formatted} />
      ) : (
        <p
          className={`text-sm text-gray-900 dark:text-gray-100 leading-relaxed ${
            k === 'keterangan' ? 'whitespace-pre-wrap' : ''
          }`}
        >
          {formatted}
        </p>
      )}
    </div>
  )
}

function SectionCard({ title, subtitle, titleRight, children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-2xl border border-gray-200/90 bg-white/90 shadow-sm ring-1 ring-black/3 dark:border-gray-700/90 dark:bg-gray-800/90 dark:ring-white/4"
    >
      <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700/80">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-linear-to-b from-primary-500 to-primary-700" aria-hidden />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
              {subtitle ? <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
            </div>
          </div>
          {titleRight ? <div className="shrink-0 pt-0.5">{titleRight}</div> : null}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </motion.section>
  )
}

const MadrasahPhoto = memo(function MadrasahPhoto({ path, alt, className }) {
  const [src, setSrc] = useState(null)
  const blobRef = useRef(null)
  useEffect(() => {
    let cancelled = false
    setSrc(null)
    if (!path) {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
      return undefined
    }
    madrasahPjgtAPI.fetchAssetBlobUrl(path).then((url) => {
      if (cancelled || !url) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      blobRef.current = url
      setSrc(url)
    })
    return () => {
      cancelled = true
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current)
        blobRef.current = null
      }
    }
  }, [path])
  if (!path) {
    return (
      <div
        className={`flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-200 text-gray-400 dark:from-gray-800 dark:to-gray-900 ${className}`}
        aria-hidden
      >
        <svg className="w-14 h-14 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
          />
        </svg>
      </div>
    )
  }
  if (!src) {
    return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 ${className}`} aria-hidden />
  }
  return <img src={src} alt={alt} className={className} />
})

export default function PjgtMadrasahProfil() {
  const user = useAuthStore((s) => s.user)
  const madrasahId = usePjgtMadrasahId()
  const { data, loading, error: err } = usePjgtProfil()
  const [pengajuanAktif, setPengajuanAktif] = useState(null)

  useEffect(() => {
    if (!madrasahId) {
      setPengajuanAktif(null)
      return
    }
    let cancelled = false
    madrasahPjgtAPI
      .getPengajuan()
      .then((res) => {
        if (cancelled) return
        setPengajuanAktif(res?.data?.aktif || null)
      })
      .catch(() => {
        if (!cancelled) setPengajuanAktif(null)
      })
    return () => {
      cancelled = true
    }
  }, [madrasahId])

  const changedKeys = useMemo(() => {
    if (!pengajuanAktif?.data_lama || !pengajuanAktif?.data_baru) return []
    const lama = pengajuanAktif.data_lama
    const baru = pengajuanAktif.data_baru
    const keys = new Set([...Object.keys(lama), ...Object.keys(baru)])
    const out = []
    for (const k of keys) {
      const a = lama[k] == null ? '' : String(lama[k])
      const b = baru[k] == null ? '' : String(baru[k])
      if (a !== b) out.push(k)
    }
    if (pengajuanAktif.foto_path_baru) out.push('foto')
    if (pengajuanAktif.logo_path_baru) out.push('logo')
    return out
  }, [pengajuanAktif])

  const lainnyaKeys = useMemo(() => {
    if (!data || typeof data !== 'object') return []
    return Object.keys(data)
      .filter(
        (k) =>
          !MADRASAH_HIDDEN_DETAIL_KEYS.has(k) &&
          !NEVER_SHOW_KEYS.has(k) &&
          !ASSIGNED.has(k)
      )
      .sort((a, b) => a.localeCompare(b))
  }, [data])

  const namaJudul = useMemo(() => {
    const n = data?.nama != null ? String(data.nama).trim() : ''
    if (n) return n
    return (user?.nama || '').trim() || 'Madrasah'
  }, [data?.nama, user?.nama])

  const badges = useMemo(() => {
    const out = []
    if (data?.kategori) out.push({ label: String(data.kategori), key: 'kat' })
    if (data?.status) out.push({ label: String(data.status), key: 'st' })
    return out
  }, [data?.kategori, data?.status])

  const sectionHasContent = (sec, rowData) => {
    if (sec.id === 'identitas') {
      return (
        sec.keys.some((k) => formatScalar(k, rowData?.[k], rowData) !== null) ||
        (rowData?.id != null && String(rowData.id).trim() !== '')
      )
    }
    return sec.keys.some((k) => formatScalar(k, rowData?.[k], rowData) !== null)
  }

  if (!madrasahId) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Akun PJGT belum terhubung ke data madrasah.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] p-4 sm:p-6 max-w-4xl mx-auto space-y-6 pb-16">
      <div>
        <Link
          to="/pjgt/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Beranda PJGT
        </Link>
      </div>

      {err && (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {err}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border border-gray-200/90 bg-gray-900 shadow-lg ring-1 ring-black/5 dark:border-gray-700 dark:ring-white/10"
      >
        <div className="relative aspect-2/1 min-h-[160px] max-h-[280px] sm:aspect-21/9">
          <MadrasahPhoto
            path={data?.foto_path}
            alt="Foto madrasah"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
          {data?.logo_path ? (
            <div className="absolute bottom-4 right-4 z-10 rounded-2xl border border-white/25 bg-white/95 p-2 shadow-xl backdrop-blur-sm dark:bg-gray-900/95">
              <MadrasahPhoto path={data.logo_path} alt="Logo" className="h-14 w-14 object-contain sm:h-16 sm:w-16" />
            </div>
          ) : null}
          <div className="absolute bottom-0 left-0 right-0 z-10 p-5 sm:p-6">
            {loading || !data ? (
              <div className="space-y-2">
                <div className="h-8 w-3/4 max-w-md animate-pulse rounded-lg bg-white/20" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-white/15" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md sm:text-2xl">{namaJudul}</h1>
                  {badges.map((b) => (
                    <span
                      key={b.key}
                      className="inline-flex rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white backdrop-blur-md ring-1 ring-white/30"
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 max-w-xl text-xs text-white/85 sm:text-sm">
                  Data resmi UGT. Ajukan perubahan lewat tombol edit — ditinjau admin sebelum berlaku.
                </p>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/pjgt/madrasah/edit"
          className="inline-flex items-center justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          {pengajuanAktif ? 'Perbarui pengajuan' : 'Edit profil'}
        </Link>
      </div>

      {pengajuanAktif ? (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">Sedang ditinjau UGT</p>
          <p className="mt-1 text-xs sm:text-sm opacity-90">
            Pengajuan edit menunggu keputusan admin.
            {changedKeys.length > 0
              ? ` Bidang berubah: ${changedKeys.slice(0, 8).join(', ')}${changedKeys.length > 8 ? '…' : ''}.`
              : null}
          </p>
          {pengajuanAktif.catatan_pengaju ? (
            <p className="mt-1 text-xs opacity-80">Catatan: {pengajuanAktif.catatan_pengaju}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5">
        {loading || !data ? (
          <SectionCard title="Memuat biodata" subtitle="Mengambil data dari server">
            <div className="grid gap-5 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-4 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
          </SectionCard>
        ) : (
          <>
            {SECTION_DEFS.map((sec, idx) => {
              if (!sectionHasContent(sec, data)) return null

              const identitasIdBadge =
                sec.id === 'identitas' && data?.id != null && String(data.id).trim() !== '' ? (
                  <span className="tabular-nums text-sm font-semibold tracking-tight text-primary-700 dark:text-primary-300">
                    #{data.id}
                  </span>
                ) : null

              return (
                <SectionCard
                  key={sec.id}
                  title={sec.title}
                  subtitle={sec.subtitle}
                  titleRight={identitasIdBadge}
                  delay={idx * 0.04}
                >
                  <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                    {sec.keys.map((k) => (
                      <FieldCell key={k} k={k} data={data} />
                    ))}
                  </div>
                </SectionCard>
              )
            })}

            {lainnyaKeys.length > 0 ? (
              <SectionCard title="Field tambahan" subtitle="Kolom lain dari server" delay={0.12}>
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {lainnyaKeys.map((k) => (
                    <FieldCell key={k} k={k} data={data} />
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
