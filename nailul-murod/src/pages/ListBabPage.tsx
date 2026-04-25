import { NavLink } from 'react-router-dom'
import type { WiridItem } from '../types/wirid'
import { groupByBab } from '../utils/groupByBab'
import { slugify } from '../utils/slug'

type Props = {
  rows: WiridItem[]
}

export function ListBabPage({ rows }: Props) {
  const grouped = groupByBab(rows)

  return (
    <section className="page-block">
      <div className="page-head">
        <h2>List Bab</h2>
        <p>Pilih bab untuk melihat daftar wirid/dzikir.</p>
      </div>
      <div className="cards">
        {grouped.map(([bab, list]) => (
          <NavLink key={bab} to={`/list/${slugify(bab)}`} className="card link-card">
            <strong>{bab}</strong>
            <span>{list.length} wirid</span>
          </NavLink>
        ))}
      </div>
    </section>
  )
}
