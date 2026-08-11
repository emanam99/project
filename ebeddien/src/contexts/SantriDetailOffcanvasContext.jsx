import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import DetailSantriOffcanvas from '../pages/santri/components/DetailSantriOffcanvas'
import EditSantriOffcanvas from '../pages/santri/components/EditSantriOffcanvas'
import { useOffcanvasBackClose } from '../hooks/useOffcanvasBackClose'
import { DOMISILI_POP_PRIORITY } from '../history/domisiliPopstateStack'
import { useUmumFiturAccess } from '../hooks/useUmumFiturAccess'
import { useNotification } from './NotificationContext'

const SantriDetailOffcanvasContext = createContext(null)

/**
 * Detail + Edit santri global (portal ke document.body; edit di atas detail).
 *
 * @example openSantriDetail(row, { onEditSaved: () => muatUlang() })
 * @example openSantriDetail(row, { hideEdit: true }) — detail saja tanpa tombol Edit
 * @example openSantriDetail(row, { stackBaseZIndex: 110000 }) — di atas offcanvas lain (mis. Cari Santri z tinggi)
 * @example openEditSantri(row, { onSaved: () => muatUlang() })
 */
const DETAIL_HISTORY_STATE = Object.freeze({ santriDetailOffcanvas: true })
const EDIT_HISTORY_STATE = Object.freeze({ santriEditOffcanvas: true })

export function SantriDetailOffcanvasProvider({ children }) {
  const location = useLocation()
  const { showNotification } = useNotification()
  const { canDetailSantri, canEditSantri } = useUmumFiturAccess()
  const [santriRow, setSantriRow] = useState(null)
  /** Lapisan backdrop detail (inline z-index); null = pakai default Tailwind di DetailSantriOffcanvas */
  const [detailStackBaseZ, setDetailStackBaseZ] = useState(null)
  const [detailHideEdit, setDetailHideEdit] = useState(false)
  /** Saat buka Edit dari Detail dengan lapisan ditinggikan, edit harus di atas detail/search */
  const [editStackBaseZ, setEditStackBaseZ] = useState(null)
  const detailStackZHandoffRef = useRef(null)
  const [editRow, setEditRow] = useState(null)
  const onSavedRef = useRef(null)
  const onEditSavedFromDetailRef = useRef(null)

  const closeSantriDetailInternal = useCallback(() => {
    setSantriRow(null)
    setDetailStackBaseZ(null)
    setDetailHideEdit(false)
    detailStackZHandoffRef.current = null
    onEditSavedFromDetailRef.current = null
  }, [])

  const closeSantriDetail = useOffcanvasBackClose(!!santriRow, closeSantriDetailInternal, {
    state: DETAIL_HISTORY_STATE,
    useDomisiliPopstateStack: true,
    domisiliStackId: 'santri-detail',
    domisiliStackPriority: DOMISILI_POP_PRIORITY.santriDetail
  })

  const openSantriDetail = useCallback((row, opts = {}) => {
    if (!row || (row.id == null && row.nis == null)) return
    if (!canDetailSantri) {
      showNotification('Anda tidak memiliki akses Detail Santri (Fitur → Umum)', 'error')
      return
    }
    onEditSavedFromDetailRef.current = typeof opts.onEditSaved === 'function' ? opts.onEditSaved : null
    const hideEdit = opts.hideEdit === true || opts.showEdit === false || !canEditSantri
    setDetailHideEdit(hideEdit)
    const z = opts.stackBaseZIndex
    const zResolved = typeof z === 'number' && Number.isFinite(z) ? Math.floor(z) : null
    detailStackZHandoffRef.current = zResolved
    setDetailStackBaseZ(zResolved)
    setSantriRow(row)
  }, [canDetailSantri, canEditSantri, showNotification])

  const closeEditInternal = useCallback(() => {
    setEditRow(null)
    setEditStackBaseZ(null)
    onSavedRef.current = null
  }, [])

  const closeEditSantri = useOffcanvasBackClose(!!editRow, closeEditInternal, {
    state: EDIT_HISTORY_STATE,
    useDomisiliPopstateStack: true,
    domisiliStackId: 'santri-edit',
    domisiliStackPriority: DOMISILI_POP_PRIORITY.santriEdit
  })

  const openEditSantri = useCallback((row, opts = {}) => {
    if (!row || (row.id == null && row.nis == null)) return
    if (!canEditSantri) {
      showNotification('Anda tidak memiliki akses Edit Santri (Fitur → Umum)', 'error')
      return
    }
    onSavedRef.current = typeof opts.onSaved === 'function' ? opts.onSaved : null
    setEditRow(row)
  }, [canEditSantri, showNotification])

  const handleEditFromDetail = useCallback((santriData) => {
    if (!canEditSantri) {
      showNotification('Anda tidak memiliki akses Edit Santri (Fitur → Umum)', 'error')
      return
    }
    const savedCb = onEditSavedFromDetailRef.current
    onEditSavedFromDetailRef.current = null
    const zHandoff = detailStackZHandoffRef.current
    detailStackZHandoffRef.current = null
    const row =
      santriData && (santriData.id != null || santriData.nis != null) ? santriData : null
    setSantriRow(null)
    setDetailStackBaseZ(null)
    if (row) {
      onSavedRef.current = savedCb
      const ez = typeof zHandoff === 'number' ? zHandoff + 30 : null
      setEditStackBaseZ(ez)
      setEditRow(row)
    }
  }, [canEditSantri, showNotification])

  const handleEditSaved = useCallback(() => {
    const fn = onSavedRef.current
    onSavedRef.current = null
    fn?.()
  }, [])

  /** Tutup detail/edit saat pindah halaman (provider tidak lagi ikut remount AnimatePresence). */
  useEffect(() => {
    closeSantriDetailInternal()
    closeEditInternal()
  }, [location.pathname, closeSantriDetailInternal, closeEditInternal])

  const value = useMemo(
    () => ({
      openSantriDetail,
      closeSantriDetail,
      openEditSantri,
      closeEditSantri,
    }),
    [openSantriDetail, closeSantriDetail, openEditSantri, closeEditSantri]
  )

  const overlays =
    typeof document !== 'undefined'
      ? createPortal(
          <>
            <DetailSantriOffcanvas
              isOpen={!!santriRow}
              onClose={closeSantriDetail}
              santriRow={santriRow}
              onEdit={detailHideEdit ? undefined : handleEditFromDetail}
              stackBaseZIndex={detailStackBaseZ}
            />
            <EditSantriOffcanvas
              isOpen={!!editRow}
              onClose={closeEditSantri}
              santri={editRow}
              onSaved={handleEditSaved}
              stackBaseZIndex={editStackBaseZ}
            />
          </>,
          document.body
        )
      : null

  return (
    <SantriDetailOffcanvasContext.Provider value={value}>
      {children}
      {overlays}
    </SantriDetailOffcanvasContext.Provider>
  )
}

export function useSantriDetailOffcanvas() {
  const ctx = useContext(SantriDetailOffcanvasContext)
  if (!ctx) {
    throw new Error('useSantriDetailOffcanvas harus dipakai di dalam SantriDetailOffcanvasProvider')
  }
  return ctx
}
