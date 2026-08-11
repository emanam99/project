import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ACCESS_MODE, listAvailableAccessModes } from '../config/accessMode'
import { useSantriDataStore } from '../store/santriDataStore'
import {
  hydrateSantriStore,
  prefetchSantriTabs,
  syncSantriBiodata,
  syncSantriPembayaranBundle,
  syncSantriProfil,
  syncSantriUwabaYear,
} from '../services/santriDataService'

export function useSantriIds() {
  const user = useAuthStore((s) => s.user)
  const santriId = user?.santri_id ? Number(user.santri_id) : user?.id ? Number(user.id) : 0
  const userId = user?.id ? Number(user.id) : 0
  return { santriId, userId, user }
}

export function useSantriPrefetch() {
  const { userId } = useSantriIds()
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const jwtSantriId = user?.santri_id ? Number(user.santri_id) : 0

  useEffect(() => {
    if (!jwtSantriId || activeAccess !== ACCESS_MODE.santri) return
    hydrateSantriStore(jwtSantriId, userId)
    prefetchSantriTabs(jwtSantriId, userId)
  }, [jwtSantriId, userId, activeAccess])
}

/** Hanya baca cache biodata — sync dipusatkan di useSantriPrefetch / syncSantriBiodata. */
export function useSantriBiodata() {
  const user = useAuthStore((s) => s.user)
  const jwtSantriId = user?.santri_id ? Number(user.santri_id) : 0
  const portalIncludesSantri = useMemo(
    () => listAvailableAccessModes(user).some((m) => m.key === ACCESS_MODE.santri),
    [user]
  )
  const biodata = useSantriDataStore((s) => s.biodata)
  const biodataCached = useSantriDataStore((s) => s.biodataCached)
  const fetching = useSantriDataStore((s) => s.biodataFetching)
  const error = useSantriDataStore((s) => s.biodataError)

  return {
    biodata,
    loading:
      jwtSantriId <= 0 || !portalIncludesSantri ? false : !biodataCached && fetching,
    error,
  }
}

export function useSantriProfilCache() {
  const { santriId, userId } = useSantriIds()
  const profil = useSantriDataStore((s) => s.profil)
  const profilCached = useSantriDataStore((s) => s.profilCached)
  const fetching = useSantriDataStore((s) => s.profilFetching)

  useEffect(() => {
    if (!userId) return
    hydrateSantriStore(santriId, userId)
    const hasCache = useSantriDataStore.getState().profilCached
    void syncSantriProfil(santriId, userId, { background: hasCache })
  }, [santriId, userId])

  return {
    profil,
    loading: !profilCached && fetching,
  }
}

/** Paksa refresh biodata (halaman Biodata santri). */
export function useSantriBiodataPageSync() {
  const user = useAuthStore((s) => s.user)
  const activeAccess = useAuthStore((s) => s.activeAccess)
  const jwtSantriId = user?.santri_id ? Number(user.santri_id) : 0
  const userId = user?.id ? Number(user.id) : 0
  const { pathname } = useLocation()

  useEffect(() => {
    if (activeAccess !== ACCESS_MODE.santri || jwtSantriId <= 0) return
    if (!pathname.startsWith('/santri/biodata')) return
    hydrateSantriStore(jwtSantriId, userId)
    void syncSantriBiodata(jwtSantriId, userId, { background: false, force: true })
  }, [activeAccess, jwtSantriId, userId, pathname])
}

export function useSantriPembayaranIndex() {
  const { santriId, userId } = useSantriIds()
  const summary = useSantriDataStore((s) => s.pembayaranSummary)
  const tahunAjaranList = useSantriDataStore((s) => s.pembayaranTahunList)
  const cached = useSantriDataStore((s) => s.pembayaranCached)
  const fetching = useSantriDataStore((s) => s.pembayaranFetching)

  useEffect(() => {
    if (!santriId) return
    hydrateSantriStore(santriId, userId)
    void syncSantriPembayaranBundle(santriId, userId, { background: cached })
  }, [santriId, userId, cached])

  return {
    summary,
    tahunAjaranList,
    loading: !cached && fetching,
  }
}

export function useSantriUwabaData() {
  const { santriId, userId } = useSantriIds()
  const tahunList = useSantriDataStore((s) => s.pembayaranTahunList)
  const dataByYear = useSantriDataStore((s) => s.uwabaByYear)
  const yearsCached = useSantriDataStore((s) => s.uwabaYearsCached)
  const pembayaranCached = useSantriDataStore((s) => s.pembayaranCached)
  const fetching = useSantriDataStore((s) => s.pembayaranFetching)

  useEffect(() => {
    if (!santriId) return
    hydrateSantriStore(santriId, userId)
    if (!pembayaranCached) {
      void syncSantriPembayaranBundle(santriId, userId, { background: false })
    } else if (tahunList.length > 0) {
      tahunList.forEach((ta) => {
        if (!dataByYear[ta]) void syncSantriUwabaYear(santriId, userId, ta, { background: true })
      })
    }
  }, [santriId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !pembayaranCached && fetching

  return { tahunList, dataByYear, loading, yearsCached }
}

export function useSantriRegistrasi() {
  const { santriId, userId } = useSantriIds()
  const registrasi = useSantriDataStore((s) => s.pembayaranRegistrasi)
  const cached = useSantriDataStore((s) => s.registrasiCached)
  const fetching = useSantriDataStore((s) => s.pembayaranFetching)

  useEffect(() => {
    if (!santriId) return
    hydrateSantriStore(santriId, userId)
    void syncSantriPembayaranBundle(santriId, userId, { background: cached })
  }, [santriId, userId, cached])

  return {
    registrasi,
    loading: !cached && fetching,
  }
}

export function useSantriKhususBundle() {
  const { santriId, userId } = useSantriIds()
  const bundle = useSantriDataStore((s) => s.khususBundle)
  const cached = useSantriDataStore((s) => s.khususCached)
  const fetching = useSantriDataStore((s) => s.pembayaranFetching)

  useEffect(() => {
    if (!santriId) return
    hydrateSantriStore(santriId, userId)
    void syncSantriPembayaranBundle(santriId, userId, { background: cached })
  }, [santriId, userId, cached])

  return { bundle, loading: !cached && fetching }
}

export function useSantriTunggakanBundle() {
  const { santriId, userId } = useSantriIds()
  const bundle = useSantriDataStore((s) => s.tunggakanBundle)
  const cached = useSantriDataStore((s) => s.tunggakanCached)
  const fetching = useSantriDataStore((s) => s.pembayaranFetching)

  useEffect(() => {
    if (!santriId) return
    hydrateSantriStore(santriId, userId)
    void syncSantriPembayaranBundle(santriId, userId, { background: cached })
  }, [santriId, userId, cached])

  return { bundle, loading: !cached && fetching }
}
