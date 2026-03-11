import CariPengurusOffcanvas from '../../../components/CariPengurusOffcanvas'

/**
 * Offcanvas cari pengurus untuk dipilih sebagai koordinator (UGT).
 * Menggunakan komponen umum CariPengurusOffcanvas dengan filter role UGT.
 */
export default function CariKoordinatorOffcanvas({ isOpen, onClose, onSelect }) {
  return (
    <CariPengurusOffcanvas
      isOpen={isOpen}
      onClose={onClose}
      onSelect={onSelect}
      title="Cari Pengurus"
      roleKeys="admin_ugt,koordinator_ugt"
    />
  )
}
