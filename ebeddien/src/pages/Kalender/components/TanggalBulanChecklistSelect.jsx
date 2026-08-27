import { TANGGAL_BULAN_OPTIONS, labelTanggalBulan } from '../utils/tanggalBulan'
import ChecklistSelect from './ChecklistSelect'

export default function TanggalBulanChecklistSelect({ value = [], onChange, id, disabled = false }) {
  return (
    <ChecklistSelect
      id={id}
      disabled={disabled}
      value={value}
      onChange={onChange}
      options={TANGGAL_BULAN_OPTIONS}
      emptyLabel="Pilih tanggal"
      formatSelected={labelTanggalBulan}
    />
  )
}
