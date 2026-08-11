import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import type { WiridItem } from '../../../types/wirid'
import { ListSearchMorph } from '../../../components/search/ListSearchMorph'
import { groupByBab } from '../../../utils/groupByBab'
import { slugify } from '../../../utils/slug'
import { isiToSingleLineStarHtml } from '../../../utils/wiridPreview'
import { sanitizeHtml } from '../../../utils/safeHtml'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { listCardsContainerVariants, listCardsItemVariants } from '../listCardsMotion'

type Props = {
  rows: WiridItem[]
}

export function BabDetailPage({ rows }: Props) {
  const { babSlug } = useParams()
  const grouped = useMemo(() => groupByBab(rows), [rows])
  const entry = grouped.find(([bab]) => slugify(bab) === babSlug)
  const list = entry?.[1] ?? []
  const [search, setSearch] = useState('')

  const normalizedSearch = search.trim().toLowerCase()
  const filteredList = useMemo(() => {
    if (!normalizedSearch) return list
    return list.filter((item) => item.judul.toLowerCase().includes(normalizedSearch))
  }, [list, normalizedSearch])

  const previewHtmlById = useMemo(() => {
    const m = new Map<number, string>()
    for (const item of filteredList) {
      m.set(item.id, isiToSingleLineStarHtml(item.isi))
    }
    return m
  }, [filteredList])

  if (!entry) return <Navigate to="/list" replace />

  return (
    <section className="page-block">
      <Breadcrumbs items={[{ label: 'List Bab', to: '/list' }]} />
      <ListSearchMorph
        inputId="list-wirid-search"
        placeholder="Cari judul wirid..."
        search={search}
        onSearchChange={setSearch}
      />
      <motion.div
        key={`${babSlug ?? ''}-${normalizedSearch}`}
        className="cards"
        initial="hidden"
        animate="visible"
        variants={listCardsContainerVariants}
      >
        {filteredList.map((item) => (
          <motion.div key={item.id} variants={listCardsItemVariants} className="cards__motion-item">
            <NavLink to={`/list/${babSlug}/${slugify(item.judul)}-${item.id}`} className="card link-card">
              <strong>{item.judul}</strong>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtmlById.get(item.id) ?? '') }} />
            </NavLink>
          </motion.div>
        ))}
        {filteredList.length === 0 && (
          <motion.div variants={listCardsItemVariants} className="cards__motion-item">
            <div className="card">
              <strong>Tidak ada hasil</strong>
              <span>Coba kata kunci lain untuk mencari judul wirid.</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </section>
  )
}
