import { Navigate, NavLink, useParams } from 'react-router-dom'
import type { WiridItem } from '../types/wirid'
import { groupByBab } from '../utils/groupByBab'
import { slugify } from '../utils/slug'
import { stripTags } from '../utils/text'

type Props = {
  rows: WiridItem[]
}

export function BabDetailPage({ rows }: Props) {
  const { babSlug } = useParams()
  const grouped = groupByBab(rows)
  const entry = grouped.find(([bab]) => slugify(bab) === babSlug)
  const bab = entry?.[0] ?? ''
  const list = entry?.[1] ?? []

  if (!entry) return <Navigate to="/list" replace />

  return (
    <section className="page-block">
      <div className="page-head">
        <h2>{bab}</h2>
        <p>{list.length} wirid tersedia.</p>
      </div>
      <div className="cards">
        {list.map((item) => (
          <NavLink key={item.id} to={`/list/${babSlug}/${slugify(item.judul)}-${item.id}`} className="card link-card">
            <strong>{item.judul}</strong>
            <span>{stripTags(item.isi).slice(0, 140) || '-'}</span>
          </NavLink>
        ))}
      </div>
    </section>
  )
}
