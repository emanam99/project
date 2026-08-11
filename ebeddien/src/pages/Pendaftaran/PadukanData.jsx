import { useSearchParams } from 'react-router-dom'
import PadukanDataWorkspace from './components/PadukanDataWorkspace'

export default function PadukanData() {
  const [searchParams] = useSearchParams()
  const nis = searchParams.get('nis')
  const initial1 = nis && /^\d{7}$/.test(nis) ? nis : null
  return <PadukanDataWorkspace variant="page" syncUrlNis initialSantri1Nis={initial1} />
}
