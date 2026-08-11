import { create } from 'zustand'

/** Bandingkan payload konteks cache↔store agar referensi `konteks` stabil (hindari loop hydrate). */
function konteksPayloadEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    String(a.id_tahun_ajaran ?? '') === String(b.id_tahun_ajaran ?? '') &&
    Number(a.bulan_hijriyah ?? a.bulanHijriyah ?? 0) === Number(b.bulan_hijriyah ?? b.bulanHijriyah ?? 0) &&
    String(a.tanggal_masehi ?? a.tanggalMasehi ?? '') === String(b.tanggal_masehi ?? b.tanggalMasehi ?? '')
  )
}

export const usePjgtDataStore = create((set, get) => ({
  madrasahId: 0,
  profil: null,
  profilError: '',
  profilFetching: false,
  konteks: null,
  konteksWarnings: [],
  konteksFetching: false,
  /** true setelah sync konteks-sekarang selesai (sukses/gagal) untuk madrasah aktif */
  konteksSettled: false,
  gtRiwayat: [],
  gtFingerprint: '',
  gtCached: false,
  gtError: '',
  gtFetching: false,
  laporanByTa: {},
  laporanMetaByTa: {},
  laporanFetchingByTa: {},
  laporanAll: [],
  laporanAllMax: '',
  laporanAllCached: false,
  laporanAllFetching: false,

  applyHydration(madrasahId, cached) {
    const prev = get()
    const nextMadrasahId = Number(madrasahId) || 0
    const sameMadrasah = nextMadrasahId > 0 && nextMadrasahId === Number(prev.madrasahId)

    const laporanByTa = {}
    const laporanMetaByTa = {}
    if (cached?.laporanByTa && typeof cached.laporanByTa === 'object') {
      for (const [ta, slice] of Object.entries(cached.laporanByTa)) {
        if (slice?.data) {
          laporanByTa[ta] = slice.data
          laporanMetaByTa[ta] = { maxTanggalDibuat: slice.maxTanggalDibuat || '' }
        }
      }
    }

    const nextKonteksRaw = cached?.konteks?.data ?? null
    const konteks =
      sameMadrasah && prev.konteks && nextKonteksRaw && konteksPayloadEqual(prev.konteks, nextKonteksRaw)
        ? prev.konteks
        : nextKonteksRaw

    const nextWarnings = Array.isArray(cached?.konteks?.warnings) ? cached.konteks.warnings : []
    const konteksWarnings =
      konteks === prev.konteks && sameMadrasah ? prev.konteksWarnings : nextWarnings

    const nextGtFp = cached?.gtRiwayat?.fingerprint || ''
    const nextGtRows = Array.isArray(cached?.gtRiwayat?.data) ? cached.gtRiwayat.data : []
    const gtFpMatch = sameMadrasah && prev.gtFingerprint === nextGtFp
    const gtRiwayat = gtFpMatch ? prev.gtRiwayat : nextGtRows
    const gtFingerprint = gtFpMatch ? prev.gtFingerprint : nextGtFp
    const gtCached = gtFpMatch ? prev.gtCached : Boolean(cached?.gtRiwayat)

    set({
      madrasahId: nextMadrasahId,
      profil: cached?.profil?.data ?? null,
      profilError: '',
      profilFetching: false,
      konteks,
      konteksWarnings,
      konteksFetching: false,
      konteksSettled: sameMadrasah ? prev.konteksSettled : false,
      gtRiwayat,
      gtFingerprint,
      gtCached,
      gtError: '',
      gtFetching: false,
      laporanByTa,
      laporanMetaByTa,
      laporanFetchingByTa: {},
      laporanAll: Array.isArray(cached?.laporanAll?.data) ? cached.laporanAll.data : [],
      laporanAllMax: cached?.laporanAll?.maxTanggalDibuat ?? '',
      laporanAllCached: Boolean(cached?.laporanAll),
      laporanAllFetching: false,
    })
  },

  reset() {
    set({
      madrasahId: 0,
      profil: null,
      profilError: '',
      profilFetching: false,
      konteks: null,
      konteksWarnings: [],
      konteksFetching: false,
      konteksSettled: false,
      gtRiwayat: [],
      gtFingerprint: '',
      gtCached: false,
      gtError: '',
      gtFetching: false,
      laporanByTa: {},
      laporanMetaByTa: {},
      laporanFetchingByTa: {},
      laporanAll: [],
      laporanAllMax: '',
      laporanAllCached: false,
      laporanAllFetching: false,
    })
  },

  setProfil(data) {
    set({ profil: data })
  },
  setProfilError(msg) {
    set({ profilError: msg || '' })
  },
  setProfilFetching(v) {
    set({ profilFetching: v })
  },

  setKonteks(data, warnings = []) {
    set({ konteks: data, konteksWarnings: warnings })
  },
  setKonteksFetching(v) {
    set({ konteksFetching: v })
  },
  setKonteksSettled(v) {
    set({ konteksSettled: Boolean(v) })
  },

  setGtRiwayat(rows, fingerprint) {
    set({ gtRiwayat: rows, gtFingerprint: fingerprint, gtCached: true })
  },
  setGtError(msg) {
    set({ gtError: msg || '' })
  },
  setGtFetching(v) {
    set({ gtFetching: v })
  },

  setLaporanForTa(ta, rows, maxTanggalDibuat) {
    set((s) => ({
      laporanByTa: { ...s.laporanByTa, [ta]: rows },
      laporanMetaByTa: { ...s.laporanMetaByTa, [ta]: { maxTanggalDibuat } },
    }))
  },
  setLaporanFetching(ta, v) {
    set((s) => ({
      laporanFetchingByTa: { ...s.laporanFetchingByTa, [ta]: v },
    }))
  },

  setLaporanAll(rows, maxTd) {
    set({ laporanAll: rows, laporanAllMax: maxTd, laporanAllCached: true })
  },
  setLaporanAllFetching(v) {
    set({ laporanAllFetching: v })
  },
}))
