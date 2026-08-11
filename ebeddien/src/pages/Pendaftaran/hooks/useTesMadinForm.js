import { useState, useEffect, useCallback } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { readTodayPenanggalanSync, idbGetToday, getMasehiKeyHariIni } from '../../../services/hijriPenanggalanStorage'
import { getTanggalFromAPI } from '../../../utils/hijriDate'
import { buildTesMadinPayload, mapTesMadinRowToState, gelombangTesFromPendaftar } from '../print/raporTesMadinUtils'

export function createEmptyTesMadinState(namaKetuaDefault = 'Agil Farobi') {
  return {
    gelombang: '',
    tanggalTesHijriyah: '',
    t1_membaca: '',
    t1_menulis: '',
    t1_jumlah: '',
    t1_keputusan: '',
    t2_kitab: '',
    t2_ns5: '',
    t2_ns6: '',
    t2_jumlah: '',
    t2_keputusan_kelas: '',
    t2_lanjut_t3: false,
    t3_baca: '',
    t3_nahwu: '',
    t3_sharaf: '',
    t3_jumlah: '',
    t3_keputusan_kelas: '',
    t3_lanjut_t4: false,
    t4_baca: '',
    t4_fiqih: '',
    t4_nahwu: '',
    t4_balaghah: '',
    t4_jumlah: '',
    t4_keputusan: '',
    tanggalSuratHijriyah: '',
    namaKetua: namaKetuaDefault
  }
}

async function resolveHijriHariIni() {
  const sync = readTodayPenanggalanSync()
  if (sync?.hijriyah) return sync.hijriyah
  const key = getMasehiKeyHariIni()
  const idb = await idbGetToday(key)
  if (idb?.hijriyah && idb.hijriyah !== '0000-00-00') {
    return String(idb.hijriyah).slice(0, 10)
  }
  const api = await getTanggalFromAPI()
  if (api?.hijriyah && api.hijriyah !== '-') return api.hijriyah
  return null
}

function mergeTesMadinState(base, mapped, seedGelombang = '') {
  const prevGelombang = base?.gelombang
  const merged = { ...createEmptyTesMadinState(), ...base, ...(mapped || {}) }
  const mappedEmpty = !merged.gelombang || String(merged.gelombang).trim() === ''
  if (mappedEmpty && prevGelombang && String(prevGelombang).trim() !== '') {
    merged.gelombang = prevGelombang
  } else if (mappedEmpty && seedGelombang) {
    merged.gelombang = seedGelombang
  }
  return merged
}

export function useTesMadinForm(idSantri, tahunHijriyah, tahunMasehi, seed = {}) {
  const idRegistrasi = seed.id_registrasi ?? null
  const seedGelombang = gelombangTesFromPendaftar(seed)
  const [form, setForm] = useState(() => createEmptyTesMadinState())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')

  const patch = useCallback((partial) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetForm = useCallback(() => {
    setForm(createEmptyTesMadinState())
    setSaveMsg('')
    setSaveErr('')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hariIni = await resolveHijriHariIni()
      if (cancelled || !hariIni) return
      setForm((prev) => ({
        ...prev,
        tanggalSuratHijriyah: prev.tanggalSuratHijriyah || hariIni
      }))
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const sid = idSantri
    const th = String(tahunHijriyah ?? '').trim()
    const tm = String(tahunMasehi ?? '').trim()
    if (!sid || !th || !tm) {
      resetForm()
      return
    }

    let cancelled = false
    setLoading(true)
    setSaveErr('')
    pendaftaranAPI
      .getTesMadin(sid, th, tm, idRegistrasi)
      .then(async (res) => {
        if (cancelled) return
        if (res?.success && res.data) {
          const mapped = mapTesMadinRowToState(res.data)
          if (mapped) {
            setForm((prev) => mergeTesMadinState(prev, mapped, seedGelombang))
            return
          }
        }
        const hariIni = await resolveHijriHariIni()
        if (!cancelled) {
          setForm(mergeTesMadinState(
            { tanggalSuratHijriyah: hariIni || '' },
            null,
            seedGelombang
          ))
        }
      })
      .catch(() => {
        if (!cancelled) setSaveErr('Gagal memuat data tes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [idSantri, tahunHijriyah, tahunMasehi, idRegistrasi, seedGelombang, resetForm])

  const save = useCallback(async () => {
    const sid = idSantri
    const th = String(tahunHijriyah ?? '').trim()
    const tm = String(tahunMasehi ?? '').trim()
    if (!sid || !th || !tm) {
      setSaveErr('ID santri atau tahun ajaran belum lengkap')
      return false
    }
    setSaving(true)
    setSaveMsg('')
    setSaveErr('')
    try {
      const payload = buildTesMadinPayload(sid, th, tm, form, idRegistrasi)
      const res = await pendaftaranAPI.saveTesMadin(payload)
      if (res?.success) {
        setSaveMsg('Tersimpan')
        if (res.data) {
          const mapped = mapTesMadinRowToState(res.data)
          if (mapped) setForm((prev) => mergeTesMadinState(prev, mapped, seedGelombang))
        }
        return true
      }
      setSaveErr(res?.message || 'Gagal menyimpan')
      return false
    } catch {
      setSaveErr('Gagal menyimpan data tes')
      return false
    } finally {
      setSaving(false)
    }
  }, [idSantri, tahunHijriyah, tahunMasehi, form, seedGelombang, idRegistrasi])

  return {
    form,
    patch,
    loading,
    saving,
    saveMsg,
    saveErr,
    save,
    resetForm
  }
}
