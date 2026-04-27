import { useEffect } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { WiridItem } from '../../../types/wirid'
import { parseWiridIdFromSlug, slugify } from '../../../utils/slug'
import { Breadcrumbs } from '../components/Breadcrumbs'

type Props = {
  rows: WiridItem[]
}

export function WiridDetailPage({ rows }: Props) {
  const { babSlug, wiridSlug } = useParams()
  const id = parseWiridIdFromSlug(wiridSlug)
  const item = rows.find((row) => row.id === id && slugify(row.bab) === babSlug)
  const navigate = useNavigate()

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

  if (!item) return <Navigate to="/list" replace />

  return (
    <section className="page-block">
      <Breadcrumbs
        items={[
          { label: 'List Bab', to: '/list' },
          { label: item.bab, to: `/list/${babSlug}` },
          { label: item.judul },
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
        <h2>{item.judul}</h2>
        <div className="isi rich ql-editor nm-preview-isi" dangerouslySetInnerHTML={{ __html: item.isi || '<p>-</p>' }} />
        <div className="arti rich ql-editor nm-preview-arti" dangerouslySetInnerHTML={{ __html: item.arti || '<p>-</p>' }} />
      </div>
    </section>
  )
}
