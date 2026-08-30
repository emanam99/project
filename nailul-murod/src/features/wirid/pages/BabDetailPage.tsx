import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import type { WiridBabMeta, WiridItem } from '../../../types/wirid'
import { ListSearchMorph } from '../../../components/search/ListSearchMorph'
import { groupByBab } from '../../../utils/groupByBab'
import { slugify } from '../../../utils/slug'
import { resolveBabLabel, resolveWiridTitle, wiridTitleSearchText } from '../../../utils/wiridTitle'
import { useTitleLang } from '../../../hooks/useTitleLang'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { listCardsContainerVariants, listCardsItemVariants } from '../listCardsMotion'

type Props = {
  rows: WiridItem[]
  babList?: WiridBabMeta[]
}

export function BabDetailPage({ rows, babList = [] }: Props) {
  const { babSlug } = useParams()
  const { lang: titleLang } = useTitleLang()
  const grouped = useMemo(() => groupByBab(rows, babList), [rows, babList])
  const entry = grouped.find(([bab]) => slugify(bab) === babSlug)
  const list = entry?.[1] ?? []
  const [search, setSearch] = useState('')

  const normalizedSearch = search.trim().toLowerCase()
  const filteredList = useMemo(() => {
    if (!normalizedSearch) return list
    return list.filter((item) => wiridTitleSearchText(item).includes(normalizedSearch))
  }, [list, normalizedSearch])

  if (!entry) return <Navigate to="/list" replace />

  const [babTitleCanonical] = entry
  const babTitle = resolveBabLabel(babTitleCanonical, babList, titleLang)

  return (
    <section className="page-block">
      <Breadcrumbs items={[{ label: 'List Bab', to: '/list' }]} />
      <header className="wirid-title-list-head">
        <h2 className={`wirid-title-list-head__title${titleLang === 'ar' ? ' wirid-title-list-head__title--ar' : ''}`} dir={titleLang === 'ar' ? 'rtl' : undefined} lang={titleLang === 'ar' ? 'ar' : 'id'}>
          {babTitle}
        </h2>
        <p className="wirid-title-list-head__meta">{filteredList.length} judul</p>
      </header>
      <ListSearchMorph
        inputId="list-wirid-search"
        placeholder="Cari judul wirid..."
        search={search}
        onSearchChange={setSearch}
      />
      <motion.ul
        key={`${babSlug ?? ''}-${normalizedSearch}`}
        className="wirid-title-list"
        initial="hidden"
        animate="visible"
        variants={listCardsContainerVariants}
      >
        {filteredList.map((item, index) => {
          const label = resolveWiridTitle(item, titleLang)
          const titleClass =
            titleLang === 'ar' ? 'wirid-title-list__label wirid-title-list__label--ar' : 'wirid-title-list__label'
          return (
          <motion.li key={item.id} variants={listCardsItemVariants} className="wirid-title-list__item">
            <NavLink
              to={`/list/${babSlug}/${slugify(item.judul)}-${item.id}`}
              className="wirid-title-list__link"
            >
              <span className="wirid-title-list__index" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={titleClass}>{label}</span>
              <span className="wirid-title-list__chevron" aria-hidden>
                ›
              </span>
            </NavLink>
          </motion.li>
          )
        })}
        {filteredList.length === 0 && (
          <motion.li variants={listCardsItemVariants} className="wirid-title-list__item">
            <div className="wirid-title-list__empty">
              <strong>Tidak ada hasil</strong>
              <span>Coba kata kunci lain untuk mencari judul wirid.</span>
            </div>
          </motion.li>
        )}
      </motion.ul>
    </section>
  )
}
