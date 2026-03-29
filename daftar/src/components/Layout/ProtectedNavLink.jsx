import { useCallback, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext'
import UnsavedChangesModal from '../Modal/UnsavedChangesModal'
import RequiredFieldsModal from '../Modal/RequiredFieldsModal'
import { useLocation } from 'react-router-dom'

function ProtectedNavLink({ to, children, ...props }) {
  const location = useLocation()
  const {
    hasUnsavedChanges,
    setPendingNav,
    clearPendingNav,
    handleSaveAndNavigate,
    validateBeforeNavigate
  } = useUnsavedChanges()
  const [showModal, setShowModal] = useState(false)
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false)
  const [missingFields, setMissingFields] = useState([])

  const handleClick = useCallback((e) => {
    // Skip validasi jika sudah di halaman yang sama
    if (location.pathname === to) {
      return // Biarkan NavLink handle navigasi normal
    }

    // Cek validasi field wajib terlebih dahulu (hanya jika di halaman biodata)
    if (location.pathname === '/biodata') {
      const validation = validateBeforeNavigate()
      if (!validation.valid && validation.missingFields && validation.missingFields.length > 0) {
        e.preventDefault()
        setMissingFields(validation.missingFields)
        setShowRequiredFieldsModal(true)
        return
      }
    }

    // Jika tidak ada unsaved changes, biarkan navigasi normal
    if (!hasUnsavedChanges) {
      return // Biarkan NavLink handle navigasi normal
    }

    // Jika ada unsaved changes, prevent default dan tampilkan modal
    e.preventDefault()
    setPendingNav(to)
    setShowModal(true)
  }, [hasUnsavedChanges, to, setPendingNav, location.pathname, validateBeforeNavigate])

  const handleSave = useCallback(async () => {
    const saved = await handleSaveAndNavigate()
    if (saved) {
      setShowModal(false)
      clearPendingNav()
    }
  }, [handleSaveAndNavigate, clearPendingNav])

  const handleClose = useCallback(() => {
    setShowModal(false)
    clearPendingNav()
  }, [clearPendingNav])

  return (
    <>
      <NavLink
        to={to}
        onClick={handleClick}
        {...props}
      >
        {children}
      </NavLink>
      <UnsavedChangesModal
        isOpen={showModal}
        onClose={handleClose}
        onSave={handleSave}
      />
      <RequiredFieldsModal
        isOpen={showRequiredFieldsModal}
        onClose={() => setShowRequiredFieldsModal(false)}
        requiredFields={missingFields}
      />
    </>
  )
}

export default ProtectedNavLink
