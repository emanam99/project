import { HARI_PEKAN_OPTIONS, labelHariPekan } from '../utils/hariPekan'
import ChecklistSelect from './ChecklistSelect'

export default function HariPekanChecklistSelect({ value = [], onChange, id, disabled = false }) {
  return (
    <ChecklistSelect
      id={id}
      disabled={disabled}
      value={value}
      onChange={onChange}
      options={HARI_PEKAN_OPTIONS}
      emptyLabel="Pilih hari"
      formatSelected={labelHariPekan}
    />
  )
}
