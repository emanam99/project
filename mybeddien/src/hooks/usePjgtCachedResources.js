import { useEffect, useLayoutEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { usePjgtDataStore } from '../store/pjgtDataStore'
import {
  hydratePjgtStore,
  prefetchPjgtTabs,
  syncPjgtGtRiwayat,
  syncPjgtKonteks,
  syncPjgtLaporan,
  syncPjgtLaporanAll,
  syncPjgtProfil,
} from '../services/pjgtDataService'
import { ACCESS_MODE } from '../config/accessMode'

export function usePjgtMadrasahId() {
  const user = useAuthStore((s) => s.user)
  return user?.madrasah_id ? Number(user.madrasah_id) : 0
}

/** Prefetch saat mode PJGT aktif — dipanggil sekali dari Layout. */
export function usePjgtPrefetch() {
  const madrasahId = usePjgtMadrasahId()
  const activeAccess = useAuthStore((s) => s.activeAccess)

  useEffect(() => {
    if (!madrasahId || activeAccess !== ACCESS_MODE.pjgt) return
    hydratePjgtStore(madrasahId)
    prefetchPjgtTabs(madrasahId)
  }, [madrasahId, activeAccess])
}

export function usePjgtProfil() {
  const madrasahId = usePjgtMadrasahId()
  const profil = usePjgtDataStore((s) => s.profil)
  const error = usePjgtDataStore((s) => s.profilError)
  const fetching = usePjgtDataStore((s) => s.profilFetching)

  useEffect(() => {
    if (!madrasahId) return
    hydratePjgtStore(madrasahId)
    void syncPjgtProfil(madrasahId, { background: profil != null })
  }, [madrasahId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data: profil,
    loading: profil == null && fetching,
    error,
  }
}

export function usePjgtKonteks() {
  const madrasahId = usePjgtMadrasahId()

  const konteks = usePjgtDataStore((s) => s.konteks)
  const warnings = usePjgtDataStore((s) => s.konteksWarnings)
  const fetching = usePjgtDataStore((s) => s.konteksFetching)
  const settled = usePjgtDataStore((s) => s.konteksSettled)

  useLayoutEffect(() => {
    if (!madrasahId) return
    hydratePjgtStore(madrasahId)
  }, [madrasahId])

  useEffect(() => {
    if (!madrasahId) return
    void syncPjgtKonteks(madrasahId, { background: konteks != null })
  }, [madrasahId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tahunAjaranAktif =
    konteks?.id_tahun_ajaran != null ? String(konteks.id_tahun_ajaran).trim() : ''

  const loading =
    Boolean(madrasahId) &&
    !tahunAjaranAktif &&
    (fetching || !settled)

  return {
    konteks,
    tahunAjaranAktif,
    warnings,
    konteksSettled: settled,
    loading,
  }
}

export function usePjgtGtRiwayat() {
  const madrasahId = usePjgtMadrasahId()
  const rows = usePjgtDataStore((s) => s.gtRiwayat)
  const error = usePjgtDataStore((s) => s.gtError)
  const gtCached = usePjgtDataStore((s) => s.gtCached)
  const fetching = usePjgtDataStore((s) => s.gtFetching)

  useEffect(() => {
    if (!madrasahId) return
    hydratePjgtStore(madrasahId)
    void syncPjgtGtRiwayat(madrasahId, { background: gtCached })
  }, [madrasahId, gtCached])

  return {
    rows,
    loading: !gtCached && fetching,
    error,
  }
}

export function usePjgtLaporanList(tahunAjaranAktif) {
  const madrasahId = usePjgtMadrasahId()
  const ta = String(tahunAjaranAktif || '').trim()
  const list = usePjgtDataStore((s) => (ta ? s.laporanByTa[ta] : undefined))
  const hasCache = usePjgtDataStore((s) => Boolean(ta && ta in s.laporanByTa))
  const fetching = usePjgtDataStore((s) => (ta ? s.laporanFetchingByTa[ta] : false))

  useEffect(() => {
    if (!madrasahId || !ta) return
    hydratePjgtStore(madrasahId)
    void syncPjgtLaporan(madrasahId, ta, { background: hasCache })
  }, [madrasahId, ta, hasCache])

  return {
    list: Array.isArray(list) ? list : [],
    loading: !hasCache && Boolean(fetching),
  }
}

export function usePjgtDashboardBundle() {
  const madrasahId = usePjgtMadrasahId()
  const profil = usePjgtDataStore((s) => s.profil)
  const profilError = usePjgtDataStore((s) => s.profilError)
  const laporanAll = usePjgtDataStore((s) => s.laporanAll)
  const konteks = usePjgtDataStore((s) => s.konteks)
  const gtRiwayat = usePjgtDataStore((s) => s.gtRiwayat)
  const profilFetching = usePjgtDataStore((s) => s.profilFetching)
  const laporanAllFetching = usePjgtDataStore((s) => s.laporanAllFetching)

  useEffect(() => {
    if (!madrasahId) return
    hydratePjgtStore(madrasahId)
    const st = usePjgtDataStore.getState()
    void syncPjgtProfil(madrasahId, { background: st.profil != null })
    void syncPjgtKonteks(madrasahId, { background: st.konteks != null })
    void syncPjgtGtRiwayat(madrasahId, { background: true })
    void syncPjgtLaporanAll(madrasahId, { background: st.laporanAllCached })
  }, [madrasahId])

  const tahunAjaranAktif =
    konteks?.id_tahun_ajaran != null ? String(konteks.id_tahun_ajaran).trim() : ''

  const laporanAllCached = usePjgtDataStore((s) => s.laporanAllCached)
  const gtCached = usePjgtDataStore((s) => s.gtCached)

  const hasAny =
    profil != null || laporanAllCached || konteks != null || gtCached

  const loading = !hasAny && (profilFetching || laporanAllFetching)

  return {
    madrasah: profil,
    profilError,
    laporanTerakhir: Array.isArray(laporanAll) ? laporanAll.slice(0, 8) : [],
    tahunAjaranAktif,
    gtRows: gtRiwayat,
    loading,
  }
}
