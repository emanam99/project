import { useParams, useNavigate } from 'react-router-dom'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import CetakKartuCashlessOffcanvas from './components/CetakKartuCashlessOffcanvas'

/**
 * Halaman route /cashless/cetak-kartu/:id
 * Menampilkan offcanvas bawah (sama seperti print UWABA). Saat tutup, redirect ke pembuatan akun.
 */
export default function CetakKartuCashless() {
  const { id } = useParams()
  const navigate = useNavigate()

  const handleClose = () => {
    navigate('/cashless/pembuatan-akun', { replace: true })
  }
  const closeWithBack = useOffcanvasBackClose(!!id, handleClose)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {id ? (
        <CetakKartuCashlessOffcanvas
          isOpen={true}
          onClose={closeWithBack}
          accountId={id}
        />
      ) : (
        <div className="min-h-screen flex items-center justify-center p-4">
          <p className="text-red-600 dark:text-red-400">ID akun tidak ada.</p>
        </div>
      )}
    </div>
  )
}
