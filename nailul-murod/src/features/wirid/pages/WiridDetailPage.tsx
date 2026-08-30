import { useEffect, useLayoutEffect, useRef } from 'react'
import { useSyiirReader } from '../../../contexts/SyiirReaderContext'
import { hasSyiirPattern, useSyiirPairedLayout } from '../../../hooks/useSyiirPairedLayout'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { WiridItem } from '../../../types/wirid'
import { parseWiridIdFromSlug, slugify } from '../../../utils/slug'
import { wiridBabLabel } from '../../../utils/groupByBab'
import { recordWiridOpen } from '../../../utils/wiridOpenStats'
import { sanitizeHtml } from '../../../utils/safeHtml'
import { Breadcrumbs } from '../components/Breadcrumbs'

type Props = {
  rows: WiridItem[]
}

export function WiridDetailPage({ rows }: Props) {
  const { babSlug, wiridSlug } = useParams()
  const id = parseWiridIdFromSlug(wiridSlug)
  const item = rows.find(
    (row) => row.id === id && slugify(wiridBabLabel(row.bab)) === babSlug
  )
  const navigate = useNavigate()
  const isiRef = useRef<HTMLDivElement>(null)
  const syiirContentKey = item ? `${item.id}:${item.isi ?? ''}` : ''
  const safeIsiHtml = sanitizeHtml(item?.isi || '<p>-</p>')
  const safeArtiHtml = sanitizeHtml(item?.arti || '<p>-</p>')
  const { registerHasSyiir, layoutMode } = useSyiirReader()
  const syiirPairedActive = Boolean(item) && layoutMode === 'paired'

  useLayoutEffect(() => {
    if (!item) {
      registerHasSyiir(false)
      return
    }
    const el = isiRef.current
    registerHasSyiir(el ? hasSyiirPattern(el) : false)
    return () => registerHasSyiir(false)
  }, [item, syiirContentKey, registerHasSyiir])

  useSyiirPairedLayout(isiRef, syiirPairedActive, syiirContentKey)

  useEffect(() => {
    const blockCopyShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'c' || key === 'x' || key === 'a') {
        event.preventDefault()
      }
    }
    document.addEventListener('keydown', blockCopyShortcuts, true)
    return () => document.removeEventListener('keydown', blockCopyShortcuts, true)
  }, [])

  useEffect(() => {
    if (!item) return
    recordWiridOpen(item)
  }, [babSlug, wiridSlug, item?.id])

  if (!item) return <Navigate to="/list" replace />

  return (
    <section className="page-block">
      <Breadcrumbs
        items={[
          { label: 'List Bab', to: '/list' },
          { label: item.bab, to: `/list/${babSlug}` },
        ]}
      />
      <button className="theme-btn back-btn" onClick={() => navigate(-1)}>
        ← Kembali
      </button>
      <div
        className="reader-card reader-locked"
        onContextMenu={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        <p className="reader-bab">{item.bab}</p>
        <div
          ref={isiRef}
          className="isi rich ql-editor nm-preview-isi"
          dangerouslySetInnerHTML={{ __html: safeIsiHtml }}
        />
        <div className="arti rich ql-editor nm-preview-arti" dangerouslySetInnerHTML={{ __html: safeArtiHtml }} />
      </div>
    </section>
  )
}
