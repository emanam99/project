import { create } from 'zustand'

const defaultSummary = () => ({
  pendaftaran: { total: 0, bayar: 0, kurang: 0 },
  uwaba: { total: 0, bayar: 0, kurang: 0 },
  khusus: { total: 0, bayar: 0, kurang: 0 },
  tunggakan: { total: 0, bayar: 0, kurang: 0 },
})

export const useSantriDataStore = create((set) => ({
  santriId: 0,
  userId: 0,

  biodata: null,
  biodataCached: false,
  biodataFetching: false,
  biodataError: '',

  profil: null,
  profilCached: false,
  profilFetching: false,

  pembayaranSummary: defaultSummary(),
  pembayaranTahunList: [],
  pembayaranRegistrasi: [],
  pembayaranCached: false,
  pembayaranFetching: false,

  uwabaByYear: {},
  uwabaYearsCached: false,

  registrasiCached: false,
  khususBundle: null,
  khususCached: false,
  tunggakanBundle: null,
  tunggakanCached: false,

  applyHydration(santriId, userId, cached) {
    const sid = Number(santriId) || 0
    const uid = Number(userId) || 0
    const pembayaran = cached?.pembayaran
    set((state) => {
      const sameIdentity = state.santriId === sid && state.userId === uid
      if (sameIdentity) {
        return { santriId: sid, userId: uid }
      }
      return {
        santriId: sid,
        userId: uid,
        biodata: null,
        biodataCached: false,
        biodataFetching: false,
        biodataError: '',
        profil: null,
        profilCached: false,
        profilFetching: false,
        pembayaranSummary: pembayaran?.summary ?? defaultSummary(),
        pembayaranTahunList: Array.isArray(pembayaran?.tahunList) ? pembayaran.tahunList : [],
        pembayaranRegistrasi: [],
        pembayaranCached: Boolean(pembayaran?.summaryFingerprint),
        pembayaranFetching: false,
        uwabaByYear: {},
        uwabaYearsCached: false,
        registrasiCached: false,
        khususBundle: null,
        khususCached: false,
        tunggakanBundle: null,
        tunggakanCached: false,
      }
    })
  },

  reset() {
    set({
      santriId: 0,
      userId: 0,
      biodata: null,
      biodataCached: false,
      biodataFetching: false,
      biodataError: '',
      profil: null,
      profilCached: false,
      profilFetching: false,
      pembayaranSummary: defaultSummary(),
      pembayaranTahunList: [],
      pembayaranRegistrasi: [],
      pembayaranCached: false,
      pembayaranFetching: false,
      uwabaByYear: {},
      uwabaYearsCached: false,
      registrasiCached: false,
      khususBundle: null,
      khususCached: false,
      tunggakanBundle: null,
      tunggakanCached: false,
    })
  },

  setBiodata(data) {
    set({ biodata: data, biodataCached: true, biodataError: '' })
  },
  setBiodataError(msg) {
    set({ biodataError: msg || '' })
  },
  setBiodataFetching(v) {
    set({ biodataFetching: v })
  },

  setProfil(data) {
    set({ profil: data, profilCached: true })
  },
  setProfilFetching(v) {
    set({ profilFetching: v })
  },

  setPembayaranBundle({ summary, tahunList, registrasi, khusus, tunggakan, uwabaByYear }) {
    set((s) => ({
      pembayaranSummary: summary ?? s.pembayaranSummary,
      pembayaranTahunList: tahunList ?? s.pembayaranTahunList,
      pembayaranRegistrasi: registrasi ?? s.pembayaranRegistrasi,
      pembayaranCached: true,
      registrasiCached: Array.isArray(registrasi),
      khususBundle: khusus ?? s.khususBundle,
      khususCached: khusus != null,
      tunggakanBundle: tunggakan ?? s.tunggakanBundle,
      tunggakanCached: tunggakan != null,
      uwabaByYear: uwabaByYear ? { ...s.uwabaByYear, ...uwabaByYear } : s.uwabaByYear,
      uwabaYearsCached: uwabaByYear ? true : s.uwabaYearsCached,
    }))
  },
  setPembayaranFetching(v) {
    set({ pembayaranFetching: v })
  },

  setUwabaYear(tahun, data) {
    set((s) => ({
      uwabaByYear: { ...s.uwabaByYear, [tahun]: data },
      uwabaYearsCached: true,
    }))
  },
}))

export { defaultSummary as defaultPembayaranSummary }
