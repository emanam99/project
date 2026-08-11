import { Link } from 'react-router-dom'

type BreadcrumbItem = {
  label: string
  to?: string
}

type Props = {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={`${item.label}-${index}`} className="crumb-item">
            {item.to && !isLast ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            {!isLast ? <span className="crumb-sep">/</span> : null}
          </span>
        )
      })}
    </nav>
  )
}
