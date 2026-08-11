import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { WiridItem } from '../../../types/wirid'
import { ListSearchMorph } from '../../../components/search/ListSearchMorph'
import { groupByBab } from '../../../utils/groupByBab'
import { slugify } from '../../../utils/slug'
import { listCardsContainerVariants, listCardsItemVariants } from '../listCardsMotion'

type Props = {
  rows: WiridItem[]
}

export function ListBabPage({ rows }: Props) {
  const grouped = useMemo(() => groupByBab(rows), [rows])
  const [search, setSearch] = useState('')

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!normalizedSearch) return grouped
    return grouped.filter(([bab]) => bab.toLowerCase().includes(normalizedSearch))
  }, [grouped, normalizedSearch])

  return (
    <section className="page-block">
      <ListSearchMorph
        inputId="list-bab-search"
        placeholder="Cari bab..."
        search={search}
        onSearchChange={setSearch}
      />
      <motion.div
        key={normalizedSearch}
        className="cards"
        initial="hidden"
        animate="visible"
        variants={listCardsContainerVariants}
      >
        {filtered.map(([bab, list]) => (
          <motion.div key={bab} variants={listCardsItemVariants} className="cards__motion-item">
            <NavLink to={`/list/${slugify(bab)}`} className="card link-card">
              <strong>{bab}</strong>
              <span>{list.length} wirid</span>
            </NavLink>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <motion.div variants={listCardsItemVariants} className="cards__motion-item">
            <div className="card">
              <strong>Tidak ada hasil</strong>
              <span>Coba kata kunci lain untuk mencari bab.</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}
