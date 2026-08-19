import type { LeftTab } from '../store/useMockupStore'
import { useMockupStore } from '../store/useMockupStore'

const TABS: { id: LeftTab; label: string; icon: string }[] = [
  { id: 'upload', label: 'Unggah', icon: 'upload' },
  { id: 'elements', label: 'Elemen', icon: 'elements' },
  { id: 'text', label: 'Teks', icon: 'text' },
  { id: 'ai', label: 'Logo AI', icon: 'ai' },
]

function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? '#6E56F8' : '#8b8b93'
  if (name === 'upload') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 16V5m0 0l-4 4m4-4l4 4M5 19h14" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'elements') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="7" height="7" rx="1.4" stroke={stroke} strokeWidth="1.7" />
        <circle cx="16.5" cy="7.5" r="3.5" stroke={stroke} strokeWidth="1.7" />
        <path d="M8 20l4-7 4 7H8Z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'text') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 6h14M12 6v13M8 19h8" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 4l1.6 4.8L18.5 10l-4.2 3 1.3 5L12 15.4 8.4 18l1.3-5L5.5 10l4.9-1.2L12 4Z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export default function LeftRail() {
  const leftTab = useMockupStore((s) => s.leftTab)
  const setLeftTab = useMockupStore((s) => s.setLeftTab)

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-[#ececef] bg-white pt-3">
      {TABS.map((tab) => {
        const active = leftTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLeftTab(tab.id)}
            className={`flex w-[64px] flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] ${
              active ? 'bg-[#f3f0ff] font-medium text-[#6E56F8]' : 'text-[#8b8b93] hover:bg-neutral-50'
            }`}
          >
            <Icon name={tab.icon} active={active} />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
