import { useState, useEffect } from 'react'
import { pendaftaranAPI, paymentAPI, uwabaAPI } from '../../../services/api'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'

const formatRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0)

function ListRegistrasi({ santriId }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setList([])
      return
    }
    setLoading(true)
    pendaftaranAPI.getAllRegistrasiBySantri(santriId)
      .then((r) => {
        if (r.success && Array.isArray(r.data)) setList(r.data)
        else setList([])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [santriId])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat registrasi...</div>
  if (!list.length) return <div className="text-xs text-gray-500 py-2">Tidak ada registrasi</div>
  return (
    <ul className="space-y-1.5 text-xs max-h-40 overflow-y-auto">
      {list.map((reg) => (
        <li key={reg.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <span>ID {reg.id} · {reg.tahun_hijriyah || reg.tahun_masehi || '-'}</span>
          <span className="font-medium text-green-600 dark:text-green-400">{formatRp(reg.bayar)}</span>
        </li>
      ))}
    </ul>
  )
}

function ListTransaksi({ santriId }) {
  const [byReg, setByReg] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setByReg([])
      return
    }
    setLoading(true)
    pendaftaranAPI.getAllRegistrasiBySantri(santriId)
      .then((r) => {
        if (!r.success || !Array.isArray(r.data) || r.data.length === 0) {
          setByReg([])
          return
        }
        return Promise.all(
          r.data.map((reg) =>
            pendaftaranAPI.getTransaksi(reg.id).then((tr) => ({
              id_registrasi: reg.id,
              tahun: reg.tahun_hijriyah || reg.tahun_masehi || '-',
              data: (tr.success && tr.data) ? tr.data : []
            }))
          )
        )
      })
      .then((arr) => Array.isArray(arr) ? setByReg(arr) : setByReg([]))
      .catch(() => setByReg([]))
      .finally(() => setLoading(false))
  }, [santriId])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat transaksi...</div>
  const hasAny = byReg.some((x) => x.data && x.data.length > 0)
  if (!hasAny) return <div className="text-xs text-gray-500 py-2">Tidak ada transaksi</div>
  return (
    <ul className="space-y-2 text-xs max-h-40 overflow-y-auto">
      {byReg.map(({ id_registrasi, tahun, data }) => {
        if (!data || data.length === 0) return null
        return (
          <li key={id_registrasi}>
            <div className="font-medium text-gray-600 dark:text-gray-400 mb-1">Reg. {id_registrasi} ({tahun})</div>
            <ul className="space-y-1 pl-2">
              {data.map((t) => (
                <li key={t.id} className="flex justify-between bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1">
                  <span>{t.tanggal || t.waktu_bayar || '-'}</span>
                  <span>{formatRp(t.nominal)}</span>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

function ListBerkas({ santriId }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setList([])
      return
    }
    setLoading(true)
    pendaftaranAPI.getBerkasList(santriId)
      .then((r) => {
        if (r.success && Array.isArray(r.data)) setList(r.data)
        else setList([])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [santriId])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat berkas...</div>
  if (!list.length) return <div className="text-xs text-gray-500 py-2">Tidak ada berkas</div>
  return (
    <ul className="space-y-1.5 text-xs max-h-40 overflow-y-auto">
      {list.map((b) => (
        <li key={b.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1.5">
          <span className="truncate flex-1 mr-2" title={b.jenis_berkas || b.keterangan || ''}>
            {b.jenis_berkas || b.keterangan || 'Berkas'}
          </span>
          <span className={`flex-shrink-0 text-[10px] ${b.status_tidak_ada ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
            {b.status_tidak_ada ? 'Tidak ada' : 'Ada'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RincianListReadOnly({ santriId, mode, title }) {
  const [rincian, setRincian] = useState([])
  const [total, setTotal] = useState({ total: 0, bayar: 0, kurang: 0 })
  const [loading, setLoading] = useState(false)
  const { tahunAjaran } = useTahunAjaranStore()
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setRincian([])
      setTotal({ total: 0, bayar: 0, kurang: 0 })
      return
    }
    setLoading(true)
    if (mode === 'uwaba') {
      uwabaAPI.getData(santriId, tahunAjaran)
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setRincian(res.data)
            const totalWajib = res.data.reduce((s, r) => s + (parseInt(r.wajib, 10) || 0), 0)
            const totalBayar = (res.histori || []).reduce((s, h) => s + (parseInt(h.nominal, 10) || 0), 0)
            setTotal({ total: totalWajib, bayar: totalBayar, kurang: totalWajib - totalBayar })
          } else {
            setRincian([])
            setTotal({ total: 0, bayar: 0, kurang: 0 })
          }
        })
        .catch(() => {
          setRincian([])
          setTotal({ total: 0, bayar: 0, kurang: 0 })
        })
        .finally(() => setLoading(false))
      return
    }
    paymentAPI.getRincian(santriId, mode, null)
      .then((res) => {
        if (res.success && res.data) {
          setRincian(res.data.rincian || [])
          setTotal(res.data.total || { total: 0, bayar: 0, kurang: 0 })
        } else {
          setRincian([])
          setTotal({ total: 0, bayar: 0, kurang: 0 })
        }
      })
      .catch(() => {
        setRincian([])
        setTotal({ total: 0, bayar: 0, kurang: 0 })
      })
      .finally(() => setLoading(false))
  }, [santriId, mode, tahunAjaran])
  if (loading) return <div className="text-xs text-gray-500 py-2">Memuat {title}...</div>
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5 text-gray-600 dark:text-gray-400">
        <span>Total: {formatRp(total.total)}</span>
        <span>Bayar: {formatRp(total.bayar)}</span>
        <span>Kurang: {formatRp(total.kurang)}</span>
      </div>
      {rincian.length === 0 ? (
        <div className="text-xs text-gray-500 py-2">Tidak ada data</div>
      ) : (
        <ul className="space-y-1 text-xs max-h-36 overflow-y-auto">
          {rincian.map((item, idx) => (
            <li key={item.id || item.id_tunggakan || item.id_khusus || idx} className="flex justify-between bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1">
              <span className="truncate">{item.nama || item.keterangan_1 || item.keterangan || item.bulan || '-'}</span>
              <span>{formatRp(item.wajib || item.nominal)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PadukanDataLists({ santriId }) {
  const valid = santriId && /^\d{7}$/.test(String(santriId))
  if (!valid) {
    return (
      <div className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center text-sm text-gray-500 dark:text-gray-400">
        Isi NIS (7 digit) untuk menampilkan list registrasi, transaksi, berkas, dan pembayaran.
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      {/* List Registrasi */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">List Registrasi</h4>
        <ListRegistrasi santriId={santriId} />
      </div>

      {/* List Transaksi Pendaftaran */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">List Transaksi Pendaftaran</h4>
        <ListTransaksi santriId={santriId} />
      </div>

      {/* List Berkas Santri (ikut pindah saat padukan) */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">List Berkas Santri</h4>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">Berkas akan ikut dipindah ke santri utama saat Padukan.</p>
        <ListBerkas santriId={santriId} />
      </div>

      {/* Kotak pemisah */}
      <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-3 min-h-[60px]" />

      {/* List Pembayaran UWABA */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">List Pembayaran UWABA</h4>
        <RincianListReadOnly santriId={santriId} mode="uwaba" title="UWABA" />
      </div>

      {/* List Tunggakan */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">List Tunggakan</h4>
        <RincianListReadOnly santriId={santriId} mode="tunggakan" title="Tunggakan" />
      </div>

      {/* List Khusus */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">List Khusus</h4>
        <RincianListReadOnly santriId={santriId} mode="khusus" title="Khusus" />
      </div>
    </div>
  )
}
