import CariPengurusOffcanvas, {
  CARI_PENGURUS_Z_BACKDROP,
  CARI_PENGURUS_Z_PANEL
} from '../../../components/CariPengurusOffcanvas'

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
      zIndexBackdrop={CARI_PENGURUS_Z_BACKDROP}
      zIndexPanel={CARI_PENGURUS_Z_PANEL}
    />
  )
}
