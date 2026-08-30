import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { WiridBabMeta, WiridItem } from '../../../types/wirid'
import { ListSearchMorph } from '../../../components/search/ListSearchMorph'
import { groupByBab } from '../../../utils/groupByBab'
import { slugify } from '../../../utils/slug'
import { babNameSearchText, resolveBabLabel, wiridTitleSearchText } from '../../../utils/wiridTitle'
import { useTitleLang } from '../../../hooks/useTitleLang'
import { listCardsContainerVariants, listCardsItemVariants } from '../listCardsMotion'

type Props = {
  rows: WiridItem[]
  babList?: WiridBabMeta[]
}

export function ListBabPage({ rows, babList = [] }: Props) {
  const { lang: titleLang } = useTitleLang()
  const grouped = useMemo(() => groupByBab(rows, babList), [rows, babList])
  const [search, setSearch] = useState('')

  const normalizedSearch = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!normalizedSearch) return grouped
    return grouped.filter(([canonical, list]) => {
      const meta = babList.find((b) => b.nama === canonical)
      const label = resolveBabLabel(canonical, babList, titleLang).toLowerCase()
      const metaText = meta ? babNameSearchText(meta) : canonical.toLowerCase()
      return label.includes(normalizedSearch) || metaText.includes(normalizedSearch)
        || list.some((w) => wiridTitleSearchText(w).includes(normalizedSearch))
    })
  }, [grouped, normalizedSearch, babList, titleLang])

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
        {filtered.map(([canonical, list]) => {
          const label = resolveBabLabel(canonical, babList, titleLang)
          const isArab = titleLang === 'ar'
          return (
          <motion.div key={canonical} variants={listCardsItemVariants} className="cards__motion-item">
            <NavLink to={`/list/${slugify(canonical)}`} className="card link-card">
              <strong className={isArab ? 'card__title--ar' : undefined} dir={isArab ? 'rtl' : undefined} lang={isArab ? 'ar' : 'id'}>
                {label}
              </strong>
              <span>{list.length} wirid</span>
            </NavLink>
          </motion.div>
          )
        })}
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
