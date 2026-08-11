import { pembayaranAPI, profilAPI } from './api'
import { uniqueHistoryById } from '../utils/riwayatPembayaran'
import {
  biodataFingerprint,
  maxTanggalDibuat,
  pembayaranSummaryFingerprint,
  profilFingerprint,
  readSantriCache,
  registrasiFingerprint,
  stableJson,
  writeSantriCache,
} from '../utils/santriCacheStorage'
import { defaultPembayaranSummary, useSantriDataStore } from '../store/santriDataStore'

const inflight = new Map()
/** Hindari spam GET /v2/biodata saat banyak komponen mount bersamaan. */
const biodataSyncMeta = { key: '', at: 0 }
const BIODATA_MIN_SYNC_MS = 60_000

function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

function uwabaYearFingerprint(data) {
  if (!data) return ''
  return stableJson({
    total: data.total,
    rincianLen: data.rincian?.length ?? 0,
    historyMax: maxTanggalDibuat(data.history),
    rincianMax: maxTanggalDibuat(data.rincian),
  })
}

function rincianBundleFingerprint(total, rincian, history) {
  return stableJson({
    total,
    rincianLen: rincian?.length ?? 0,
    historyMax: maxTanggalDibuat(history),
  })
}

export function hydrateSantriStore(santriId, userId) {
  if (!santriId) return
  const cached = readSantriCache(santriId, userId)
  useSantriDataStore.getState().applyHydration(santriId, userId, cached)
}

export function prefetchSantriTabs(santriId, userId) {
  if (!santriId) return
  hydrateSantriStore(santriId, userId)
  void once(`prefetch-santri:${santriId}:${userId}`, async () => {
    await Promise.all([
      syncSantriBiodata(santriId, userId, { background: true }),
      syncSantriProfil(santriId, userId, { background: true }),
      syncSantriPembayaranBundle(santriId, userId, { background: true }),
    ])
  })
}

export async function syncSantriBiodata(santriId, userId, opts = {}) {
  if (!santriId) return null
  const key = `${santriId}:${userId}`
  const store = useSantriDataStore.getState()
  const now = Date.now()
  if (
    !opts.force &&
    store.biodataCached &&
    biodataSyncMeta.key === key &&
    now - biodataSyncMeta.at < BIODATA_MIN_SYNC_MS
  ) {
    return store.biodata
  }
  return once(`sync-biodata:${key}`, async () => {
    const data = await syncSantriBiodataInner(santriId, userId, opts)
    biodataSyncMeta.key = key
    biodataSyncMeta.at = Date.now()
    return data
  })
}

async function syncSantriBiodataInner(santriId, userId, opts = {}) {
  if (!santriId) return null
  const store = useSantriDataStore.getState()
  if (store.santriId !== Number(santriId)) hydrateSantriStore(santriId, userId)

  const fresh = useSantriDataStore.getState()
  const hasCache = fresh.biodataCached
  if (!hasCache && !opts.background) fresh.setBiodataFetching(true)

  try {
    const res = await profilAPI.getBiodata()
    if (!res?.success || !res.data) {
      if (!hasCache) store.setBiodataError(res?.message || 'Gagal memuat biodata')
      return null
    }
    const fp = biodataFingerprint(res.data)
    const latest = useSantriDataStore.getState()
    if (!hasCache || biodataFingerprint(latest.biodata) !== fp) {
      latest.setBiodata(res.data)
      writeSantriCache(santriId, userId, (c) => ({
        ...c,
        biodata: { fingerprint: fp, savedAt: Date.now() },
      }))
    }
    return res.data
  } catch {
    if (!hasCache) store.setBiodataError('Terjadi kesalahan saat memuat biodata')
    return null
  } finally {
    if (!opts.background) store.setBiodataFetching(false)
  }
}

export async function syncSantriProfil(santriId, userId, opts = {}) {
  if (!userId) return null
  return once(`sync-profil:${santriId}:${userId}`, () => syncSantriProfilInner(santriId, userId, opts))
}

async function syncSantriProfilInner(santriId, userId, opts = {}) {
  if (!userId) return null
  const store = useSantriDataStore.getState()
  if (store.santriId !== Number(santriId)) hydrateSantriStore(santriId, userId)

  const hasCache = store.profilCached
  if (!hasCache && !opts.background) store.setProfilFetching(true)

  try {
    const res = await profilAPI.getProfil('santri')
    if (!res?.success) return store.profil
    const data = {
      user: res.user,
      nama: res.nama,
      foto_profil: res.foto_profil ?? null,
      madrasah: res.madrasah ?? null,
    }
    const fp = profilFingerprint(data)
    if (!hasCache || profilFingerprint(store.profil) !== fp) {
      store.setProfil(data)
      writeSantriCache(santriId, userId, (c) => ({
        ...c,
        profil: { fingerprint: fp, savedAt: Date.now() },
      }))
    }
    return data
  } catch {
    return store.profil
  } finally {
    if (!opts.background) store.setProfilFetching(false)
  }
}

async function buildPembayaranBundle(idSantri) {
  const summary = defaultPembayaranSummary()
  let registrasi = []
  let tahunList = []
  const uwabaByYear = {}
  let khusus = null
  let tunggakan = null

  const regRes = await pembayaranAPI.getAllRegistrasiBySantri(idSantri)
  if (regRes?.success && Array.isArray(regRes.data)) {
    registrasi = regRes.data
    registrasi.forEach((row) => {
      const w = Number(row.wajib) || 0
      const b = Number(row.bayar) || 0
      summary.pendaftaran.total += w
      summary.pendaftaran.bayar += b
      summary.pendaftaran.kurang += Number(row.kurang) ?? w - b
    })
  }

  let uwabaListRes = await pembayaranAPI.getUwabaTahunList(idSantri)
  tahunList =
    uwabaListRes?.success && Array.isArray(uwabaListRes.data?.tahun_ajaran)
      ? uwabaListRes.data.tahun_ajaran
      : []
  if (tahunList.length === 0) {
    const fallback = await pembayaranAPI.getTahunAjaranList()
    tahunList =
      fallback?.success && Array.isArray(fallback.data?.tahun_hijriyah)
        ? fallback.data.tahun_hijriyah
        : []
  }

  if (tahunList.length > 0) {
    const yearResults = await Promise.all(
      tahunList.map((tahun) =>
        Promise.all([
          pembayaranAPI.getRincian(idSantri, 'uwaba', tahun),
          pembayaranAPI.getHistory(idSantri, 'uwaba', tahun),
        ]).then(([r1, r2]) => {
          const yearData = {
            total:
              r1?.success && r1?.data?.total
                ? {
                    total: r1.data.total.total ?? 0,
                    bayar: r1.data.total.bayar ?? 0,
                    kurang: r1.data.total.kurang ?? 0,
                  }
                : { total: 0, bayar: 0, kurang: 0 },
            fetchMessage: !r1?.success && r1?.message ? r1.message : '',
            rincian: r1?.success && Array.isArray(r1?.data?.rincian) ? r1.data.rincian : [],
            history: r2?.success && Array.isArray(r2?.data) ? uniqueHistoryById(r2.data) : [],
          }
          return { tahun, yearData }
        })
      )
    )
    yearResults.forEach(({ tahun, yearData }) => {
      uwabaByYear[tahun] = yearData
      summary.uwaba.total += Number(yearData.total.total) || 0
      summary.uwaba.bayar += Number(yearData.total.bayar) || 0
    })
    summary.uwaba.kurang = summary.uwaba.total - summary.uwaba.bayar
  }

  const khususRes = await pembayaranAPI.getRincian(idSantri, 'khusus')
  if (khususRes?.success && khususRes.data) {
    const total = khususRes.data.total || { total: 0, bayar: 0, kurang: 0 }
    summary.khusus.total = Number(total.total) || 0
    summary.khusus.bayar = Number(total.bayar) || 0
    summary.khusus.kurang = Number(total.kurang) ?? summary.khusus.total - summary.khusus.bayar
    const histRes = await pembayaranAPI.getHistory(idSantri, 'khusus')
    khusus = {
      total,
      rincian: Array.isArray(khususRes.data.rincian) ? khususRes.data.rincian : [],
      history: histRes?.success && Array.isArray(histRes.data) ? uniqueHistoryById(histRes.data) : [],
    }
  }

  const tunggakanRes = await pembayaranAPI.getRincian(idSantri, 'tunggakan')
  if (tunggakanRes?.success && tunggakanRes.data) {
    const total = tunggakanRes.data.total || { total: 0, bayar: 0, kurang: 0 }
    summary.tunggakan.total = Number(total.total) || 0
    summary.tunggakan.bayar = Number(total.bayar) || 0
    summary.tunggakan.kurang = Number(total.kurang) ?? summary.tunggakan.total - summary.tunggakan.bayar
    const histRes = await pembayaranAPI.getHistory(idSantri, 'tunggakan')
    tunggakan = {
      total,
      rincian: Array.isArray(tunggakanRes.data.rincian) ? tunggakanRes.data.rincian : [],
      history: histRes?.success && Array.isArray(histRes.data) ? uniqueHistoryById(histRes.data) : [],
    }
  }

  return { summary, tahunList, registrasi, uwabaByYear, khusus, tunggakan }
}

export async function syncSantriPembayaranBundle(santriId, userId, opts = {}) {
  if (!santriId) return null
  const store = useSantriDataStore.getState()
  if (store.santriId !== Number(santriId)) hydrateSantriStore(santriId, userId)

  const fresh = useSantriDataStore.getState()
  const hasCache = fresh.pembayaranCached
  // localStorage hanya menyimpan summary — registrasi/khusus/tunggakan harus diisi ulang dari API
  const needsDetail = !fresh.registrasiCached || !fresh.khususCached || !fresh.tunggakanCached
  if ((!hasCache || needsDetail || opts.force) && !opts.background) fresh.setPembayaranFetching(true)

  try {
    const bundle = await buildPembayaranBundle(santriId)
    const fp = pembayaranSummaryFingerprint(bundle.summary, bundle.tahunList)
    const regFp = registrasiFingerprint(bundle.registrasi)
    const cachedPembayaran = readSantriCache(santriId, userId)?.pembayaran
    const cachedFp = cachedPembayaran?.summaryFingerprint ?? ''
    const cachedRegFp = cachedPembayaran?.registrasiFingerprint ?? ''
    const live = useSantriDataStore.getState()
    const stillNeedsDetail =
      !live.registrasiCached || !live.khususCached || !live.tunggakanCached

    if (
      opts.force ||
      !hasCache ||
      stillNeedsDetail ||
      fp !== cachedFp ||
      regFp !== cachedRegFp
    ) {
      live.setPembayaranBundle(bundle)
      writeSantriCache(santriId, userId, (c) => ({
        ...c,
        pembayaran: {
          summary: bundle.summary,
          summaryFingerprint: fp,
          registrasiFingerprint: regFp,
          tahunList: bundle.tahunList,
          savedAt: Date.now(),
        },
      }))
    }
    return bundle
  } catch {
    return null
  } finally {
    if (!opts.background) useSantriDataStore.getState().setPembayaranFetching(false)
  }
}

export async function syncSantriUwabaYear(santriId, userId, tahun, opts = {}) {
  if (!santriId || !tahun) return null
  const store = useSantriDataStore.getState()
  const cached = store.uwabaByYear[tahun]
  const hasCache = Boolean(cached) && !opts.force

  try {
    const [r1, r2] = await Promise.all([
      pembayaranAPI.getRincian(santriId, 'uwaba', tahun),
      pembayaranAPI.getHistory(santriId, 'uwaba', tahun),
    ])
    const yearData = {
      total:
        r1?.success && r1?.data?.total
          ? {
              total: r1.data.total.total ?? 0,
              bayar: r1.data.total.bayar ?? 0,
              kurang: r1.data.total.kurang ?? 0,
            }
          : { total: 0, bayar: 0, kurang: 0 },
      fetchMessage: !r1?.success && r1?.message ? r1.message : '',
      rincian: r1?.success && Array.isArray(r1?.data?.rincian) ? r1.data.rincian : [],
      history: r2?.success && Array.isArray(r2?.data) ? uniqueHistoryById(r2.data) : [],
    }
    const fp = uwabaYearFingerprint(yearData)
    if (!hasCache || uwabaYearFingerprint(cached) !== fp) {
      store.setUwabaYear(tahun, yearData)
      writeSantriCache(santriId, userId, (c) => ({
        ...c,
        pembayaran: {
          ...(c?.pembayaran || {}),
          uwabaFingerprints: {
            ...(c?.pembayaran?.uwabaFingerprints || {}),
            [tahun]: fp,
          },
        },
      }))
    }
    return yearData
  } catch {
    return cached ?? null
  }
}

export function refreshSantriPembayaran(santriId, userId) {
  void syncSantriPembayaranBundle(santriId, userId, { background: true, force: true })
}

export function refreshSantriUwabaYear(santriId, userId, tahun) {
  void syncSantriUwabaYear(santriId, userId, tahun, { force: true })
  void syncSantriPembayaranBundle(santriId, userId, { background: true, force: true })
}
