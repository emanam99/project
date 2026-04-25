import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { WiridItem } from '../types/wirid'
import { parseWiridIdFromSlug, slugify } from '../utils/slug'

type Props = {
  rows: WiridItem[]
}

export function WiridDetailPage({ rows }: Props) {
  const { babSlug, wiridSlug } = useParams()
  const id = parseWiridIdFromSlug(wiridSlug)
  const item = rows.find((row) => row.id === id && slugify(row.bab) === babSlug)
  const navigate = useNavigate()

  if (!item) return <Navigate to="/list" replace />

  return (
    <section className="page-block">
      <button className="theme-btn back-btn" onClick={() => navigate(-1)}>
        ← Kembali
      </button>
      <div className="reader-card">
        <p className="reader-bab">{item.bab}</p>
        <h2>{item.judul}</h2>
        <div className="isi rich ql-editor nm-preview-isi" dangerouslySetInnerHTML={{ __html: item.isi || '<p>-</p>' }} />
        <div className="arti rich ql-editor nm-preview-arti" dangerouslySetInnerHTML={{ __html: item.arti || '<p>-</p>' }} />
      </div>
    </section>
  )
}
