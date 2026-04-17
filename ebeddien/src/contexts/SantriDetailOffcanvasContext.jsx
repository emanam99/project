import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DetailSantriOffcanvas from '../pages/santri/components/DetailSantriOffcanvas'
import EditSantriOffcanvas from '../pages/santri/components/EditSantriOffcanvas'
import { useOffcanvasBackClose } from '../hooks/useOffcanvasBackClose'
import { DOMISILI_POP_PRIORITY } from '../history/domisiliPopstateStack'

const SantriDetailOffcanvasContext = createContext(null)

/**
 * Detail + Edit santri global (portal ke document.body; edit di atas detail).
 *
 * @example openSantriDetail(row, { onEditSaved: () => muatUlang() })
 * @example openEditSantri(row, { onSaved: () => muatUlang() })
 */
const DETAIL_HISTORY_STATE = Object.freeze({ santriDetailOffcanvas: true })
const EDIT_HISTORY_STATE = Object.freeze({ santriEditOffcanvas: true })

export function SantriDetailOffcanvasProvider({ children }) {
  const [santriRow, setSantriRow] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const onSavedRef = useRef(null)
  const onEditSavedFromDetailRef = useRef(null)

  const closeSantriDetailInternal = useCallback(() => {
    setSantriRow(null)
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
    onEditSavedFromDetailRef.current = typeof opts.onEditSaved === 'function' ? opts.onEditSaved : null
    setSantriRow(row)
  }, [])

  const closeEditInternal = useCallback(() => {
    setEditRow(null)
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
    onSavedRef.current = typeof opts.onSaved === 'function' ? opts.onSaved : null
    setEditRow(row)
  }, [])

  const handleEditFromDetail = useCallback((santriData) => {
    const savedCb = onEditSavedFromDetailRef.current
    onEditSavedFromDetailRef.current = null
    const row =
      santriData && (santriData.id != null || santriData.nis != null) ? santriData : null
    setSantriRow(null)
    if (row) {
      onSavedRef.current = savedCb
      setEditRow(row)
    }
  }, [])

  const handleEditSaved = useCallback(() => {
    const fn = onSavedRef.current
    onSavedRef.current = null
    fn?.()
  }, [])

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
              onEdit={handleEditFromDetail}
            />
            <EditSantriOffcanvas
              isOpen={!!editRow}
              onClose={closeEditSantri}
              santri={editRow}
              onSaved={handleEditSaved}
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
