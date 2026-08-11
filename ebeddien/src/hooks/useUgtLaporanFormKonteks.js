import { useState, useEffect, useRef, useCallback } from 'react'
import { ugtGuruTugasTugasanAPI, ugtLaporanPjgtAPI } from '../services/api'
import { uniqueSantriGtAktifUntukTa, formatSantriGtLabel } from '../utils/ugtGuruTugasPenugasan'

/**
 * Konteks TA + bulan hijriyah otomatis, serta santri (guru tugas aktif) per madrasah.
 * Pola selaras mybeddien LaporanPjgtOffcanvas.
 */
export function useUgtLaporanFormKonteks({
  isOpen,
  isEdit,
  idMadrasah,
  idTahunAjaran,
  setForm,
  showNotification,
  getSantriOptions
}) {
  const [konteksLoading, setKonteksLoading] = useState(false)
  const [gtSantriCandidates, setGtSantriCandidates] = useState([])
  const [gtSantriLoading, setGtSantriLoading] = useState(false)
  const [santriPickManual, setSantriPickManual] = useState(false)
  const [santriOptions, setSantriOptions] = useState([])
  const [santriOpen, setSantriOpen] = useState(false)
  const [santriLoading, setSantriLoading] = useState(false)
  const searchTimerRef = useRef(null)
  const prevMadrasahRef = useRef('')

  const applyKonteksToForm = useCallback((data) => {
    if (!data) return
    const { id_tahun_ajaran: ta, bulan_hijriyah: bh } = data
    setForm((prev) => ({
      ...prev,
      id_tahun_ajaran: ta != null && String(ta).trim() !== '' ? String(ta).trim() : '',
      bulan:
        bh != null && Number.isFinite(Number(bh)) && Number(bh) >= 1 && Number(bh) <= 12
          ? Number(bh)
          : 0
    }))
  }, [setForm])

  const pickSantri = useCallback((s) => {
    if (!s?.id) return
    setForm((prev) => ({
      ...prev,
      id_santri: String(s.id),
      santriLabel: formatSantriGtLabel(s),
      santriSearch: ''
    }))
    setSantriPickManual(false)
    setSantriOpen(false)
    setSantriOptions([])
  }, [setForm])

  const resetSantriPick = useCallback(() => {
    setSantriPickManual(true)
    setForm((p) => ({ ...p, id_santri: '', santriLabel: '', santriSearch: '' }))
  }, [setForm])

  // Muat TA + bulan saat form tambah dibuka
  useEffect(() => {
    if (!isOpen || isEdit) return
    let cancelled = false

    const finish = (res) => {
      if (cancelled) return
      if (!res?.success || !res.data) {
        showNotification?.('Gagal memuat tahun ajaran dan bulan otomatis.', 'error')
        return
      }
      applyKonteksToForm(res.data)
      const warns = Array.isArray(res.warnings) ? res.warnings.filter(Boolean) : []
      if (warns.length) showNotification?.(warns.join(' '), 'warning')
    }

    setKonteksLoading(true)
    ugtLaporanPjgtAPI
      .getKonteksSekarang()
      .then(finish)
      .catch(() => {
        if (!cancelled) showNotification?.('Gagal memuat tahun ajaran dan bulan otomatis.', 'error')
      })
      .finally(() => {
        if (!cancelled) setKonteksLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, isEdit, applyKonteksToForm, showNotification])

  // Reset santri saat madrasah berubah
  useEffect(() => {
    if (!isOpen || isEdit) return
    const mid = String(idMadrasah ?? '').trim()
    if (mid === prevMadrasahRef.current) return
    prevMadrasahRef.current = mid
    if (!mid) {
      setGtSantriCandidates([])
      setGtSantriLoading(false)
      return
    }
    setSantriPickManual(false)
    setForm((p) =>
      p.id_madrasah === mid
        ? { ...p, id_santri: '', santriLabel: '', santriSearch: '' }
        : p
    )
  }, [isOpen, isEdit, idMadrasah, setForm])

  // Muat kandidat guru tugas aktif per madrasah + TA
  useEffect(() => {
    if (!isOpen || isEdit) return
    const mid = String(idMadrasah ?? '').trim()
    const ta = String(idTahunAjaran ?? '').trim()
    if (!mid || !ta || konteksLoading) {
      if (!mid) setGtSantriCandidates([])
      return
    }

    const applyGtRows = (rows) => {
      const list = uniqueSantriGtAktifUntukTa(rows, ta)
      setGtSantriCandidates(list)
      if (list.length === 1 && !santriPickManual) pickSantri(list[0])
    }

    let cancelled = false
    setGtSantriLoading(true)
    ugtGuruTugasTugasanAPI
      .listByMadrasah(mid)
      .then((res) => {
        if (cancelled) return
        const rows = res?.success && Array.isArray(res.data) ? res.data : []
        applyGtRows(rows)
      })
      .catch(() => {
        if (!cancelled) setGtSantriCandidates([])
      })
      .finally(() => {
        if (!cancelled) setGtSantriLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    isOpen,
    isEdit,
    idMadrasah,
    idTahunAjaran,
    konteksLoading,
    santriPickManual,
    pickSantri
  ])

  const fetchSantri = useCallback(
    (q) => {
      if (!getSantriOptions) return
      setSantriLoading(true)
      getSantriOptions({ search: q, limit: 50 })
        .then((res) => {
          if (res?.success && Array.isArray(res.data)) setSantriOptions(res.data)
          else setSantriOptions([])
        })
        .catch(() => setSantriOptions([]))
        .finally(() => setSantriLoading(false))
    },
    [getSantriOptions]
  )

  const onSantriSearchChange = useCallback(
    (value) => {
      setForm((prev) => ({ ...prev, santriSearch: value, santriLabel: value ? prev.santriLabel : '' }))
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if ((value || '').trim().length < 1) {
        setSantriOptions([])
        return
      }
      searchTimerRef.current = setTimeout(() => fetchSantri(value.trim()), 300)
    },
    [setForm, fetchSantri]
  )

  const clearSantriState = useCallback(() => {
    setSantriOptions([])
    setSantriOpen(false)
    setSantriPickManual(false)
    setGtSantriCandidates([])
    prevMadrasahRef.current = ''
  }, [])

  return {
    konteksLoading,
    gtSantriCandidates,
    gtSantriLoading,
    santriPickManual,
    setSantriPickManual,
    pickSantri,
    resetSantriPick,
    santriOptions,
    santriOpen,
    setSantriOpen,
    santriLoading,
    onSantriSearchChange,
    clearSantriState,
    formatSantriGtLabel
  }
}
