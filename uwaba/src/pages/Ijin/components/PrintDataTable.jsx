import { useEffect, useRef } from 'react'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getQrCodeUrl } from '../../../utils/qrCodeCache'
import './PrintDataTable.css'

const availableColumns = [
  { key: 'id', label: 'ID' },
  { key: 'nama', label: 'Nama' },
  { key: 'ayah', label: 'Ayah' },
  { key: 'ibu', label: 'Ibu' },
  { key: 'gender', label: 'Gender' },
  { key: 'status_santri', label: 'Status' },
  { key: 'domisili', label: 'Domisili' }, // Gabungan daerah + kamar
  { key: 'diniyah', label: 'Diniyah' }, // Gabungan diniyah + kelas_diniyah + kel_diniyah
  { key: 'formal', label: 'Formal' }, // Gabungan formal + kelas_formal + kel_formal
  { key: 'wajib', label: 'Wajib' },
  { key: 'bayar', label: 'Bayar' },
  { key: 'ket', label: 'Ket' }
]

function PrintDataTable({ data, selectedColumns, filters, fontSize = 9 }) {
  const { tahunAjaran } = useTahunAjaranStore()
  const printAreaRef = useRef(null)

  // Generate QR code URL dengan filter
  const generateFilterUrl = () => {
    const params = new URLSearchParams()
    params.set('tahun_ajaran', tahunAjaran)
    
    if (filters.searchTerm) params.set('search', filters.searchTerm)
    if (filters.genderFilter) params.set('gender', filters.genderFilter)
    if (filters.statusSantriFilter && filters.statusSantriFilter.length > 0) {
      params.set('status', filters.statusSantriFilter.join(','))
    }
    if (filters.daerahFilter) params.set('daerah', filters.daerahFilter)
    if (filters.kamarFilter) params.set('kamar', filters.kamarFilter)
    if (filters.diniyahFilter) params.set('diniyah', filters.diniyahFilter)
    if (filters.kelasDiniyahFilter) params.set('kelas_diniyah', filters.kelasDiniyahFilter)
    if (filters.kelDiniyahFilter) params.set('kel_diniyah', filters.kelDiniyahFilter)
    if (filters.formalFilter) params.set('formal', filters.formalFilter)
    if (filters.kelasFormalFilter) params.set('kelas_formal', filters.kelasFormalFilter)
    if (filters.kelFormalFilter) params.set('kel_formal', filters.kelFormalFilter)
    if (filters.ketFilter) params.set('ket', filters.ketFilter)
    
    return `${window.location.origin}/ijin/data-ijin?${params.toString()}`
  }

  const qrUrl = generateFilterUrl()
  // Gunakan cache untuk QR code
  const qrCodeUrl = qrUrl ? getQrCodeUrl(qrUrl, 100, 'url') : ''

  // Get filter text untuk ditampilkan
  const getFilterText = () => {
    const activeFilters = []
    
    if (filters.searchTerm) activeFilters.push(`Pencarian: "${filters.searchTerm}"`)
    if (filters.genderFilter) activeFilters.push(`Gender: ${filters.genderFilter}`)
    if (filters.statusSantriFilter && filters.statusSantriFilter.length > 0) {
      activeFilters.push(`Status: ${filters.statusSantriFilter.join(', ')}`)
    }
    if (filters.daerahFilter) activeFilters.push(`Daerah: ${filters.daerahFilter}`)
    if (filters.kamarFilter) activeFilters.push(`Kamar: ${filters.kamarFilter}`)
    if (filters.diniyahFilter) activeFilters.push(`Diniyah: ${filters.diniyahFilter}`)
    if (filters.kelasDiniyahFilter) activeFilters.push(`KD: ${filters.kelasDiniyahFilter}`)
    if (filters.kelDiniyahFilter) activeFilters.push(`KelD: ${filters.kelDiniyahFilter}`)
    if (filters.formalFilter) activeFilters.push(`Formal: ${filters.formalFilter}`)
    if (filters.kelasFormalFilter) activeFilters.push(`KF: ${filters.kelasFormalFilter}`)
    if (filters.kelFormalFilter) activeFilters.push(`KelF: ${filters.kelFormalFilter}`)
    if (filters.ketFilter) activeFilters.push(`Ket: ${filters.ketFilter}`)
    
    return activeFilters.length > 0 ? activeFilters.join(' | ') : 'Semua Data'
  }

  // Get column labels
  const getColumnLabel = (key) => {
    const column = availableColumns.find(col => col.key === key)
    return column ? column.label : key
  }

  // Get cell value based on column key (handle combined columns)
  const getCellValue = (santri, key) => {
    switch (key) {
      case 'domisili':
        // Format: [daerah.kamar]
        const daerah = santri.daerah || ''
        const kamar = santri.kamar || ''
        if (!daerah && !kamar) return '-'
        return `[${daerah || '-'}.${kamar || '-'}]`
      case 'diniyah':
        // Gabungkan diniyah + kelas_diniyah + kel_diniyah
        const diniyah = santri.diniyah || ''
        const kelasDiniyah = santri.kelas_diniyah || ''
        const kelDiniyah = santri.kel_diniyah || ''
        const diniyahParts = [diniyah, kelasDiniyah, kelDiniyah].filter(p => p && p !== '-')
        return diniyahParts.length > 0 ? diniyahParts.join(' ') : '-'
      case 'formal':
        // Gabungkan formal + kelas_formal + kel_formal
        const formal = santri.formal || ''
        const kelasFormal = santri.kelas_formal || ''
        const kelFormal = santri.kel_formal || ''
        const formalParts = [formal, kelasFormal, kelFormal].filter(p => p && p !== '-')
        return formalParts.length > 0 ? formalParts.join(' ') : '-'
      case 'wajib':
        // Format angka dengan separator
        const wajib = santri.wajib || 0
        return new Intl.NumberFormat('id-ID').format(wajib)
      case 'bayar':
        // Format angka dengan separator
        const bayar = santri.bayar || 0
        return new Intl.NumberFormat('id-ID').format(bayar)
      case 'ket':
        // Tentukan keterangan pembayaran
        const wajibKet = santri.wajib || 0
        const bayarKet = santri.bayar || 0
        if (wajibKet === 0) return 'belum'
        if (bayarKet >= wajibKet) return 'lunas'
        if (bayarKet > 0) return 'kurang'
        return 'belum'
      default:
        return santri[key] || '-'
    }
  }

  // Setup print - tidak perlu lagi karena sudah dihandle di offcanvas
  // useEffect(() => {
  //   if (printAreaRef.current) {
  //     document.body.classList.add('print-data-active')
  //     
  //     return () => {
  //       document.body.classList.remove('print-data-active')
  //     }
  //   }
  // }, [])

  // Filter selectedColumns untuk menghilangkan kolom yang sudah digabungkan
  const filteredColumns = selectedColumns.filter(key => {
    // Jika domisili dipilih, jangan tampilkan daerah dan kamar
    if (selectedColumns.includes('domisili')) {
      if (key === 'daerah' || key === 'kamar') return false
    }
    // Jika diniyah dipilih, jangan tampilkan kelas_diniyah dan kel_diniyah
    if (selectedColumns.includes('diniyah')) {
      if (key === 'kelas_diniyah' || key === 'kel_diniyah') return false
    }
    // Jika formal dipilih, jangan tampilkan kelas_formal dan kel_formal
    if (selectedColumns.includes('formal')) {
      if (key === 'kelas_formal' || key === 'kel_formal') return false
    }
    return true
  })

  // Style untuk CSS variable
  const tableWrapperStyle = {
    '--table-font-size': `${fontSize}px`
  }

  return (
    <div ref={printAreaRef} className="print-data-container">
      {/* Header dengan QR Code - akan berulang di setiap halaman */}
      <div className="print-data-header" id="print-data-header">
        <div className="print-data-header-content">
          <div className="print-data-title-section">
            <h1 className="print-data-title">Data Ijin Santri</h1>
            <p className="print-data-subtitle">Pesantren Salafiyah Al-Utsmani</p>
            <p className="print-data-tahun">Tahun Ajaran: {tahunAjaran}</p>
            <p className="print-data-filter">Filter: {getFilterText()}</p>
            <p className="print-data-info">
              Total Data: {data.length} | Dicetak: {new Date().toLocaleString('id-ID')}
            </p>
          </div>
          <div className="print-data-qr">
            <img src={qrCodeUrl} alt="QR Code" className="print-data-qr-image" />
            <p className="print-data-qr-label">Scan untuk Akses data</p>
          </div>
        </div>
      </div>

      {/* Table - Rata tengah horizontal */}
      <div 
        className="print-data-table-wrapper" 
        style={tableWrapperStyle}
      >
        <table className="print-data-table">
          <thead>
            <tr>
              <th className="print-data-th-no">No</th>
              {filteredColumns.map((key) => (
                <th key={key} className="print-data-th">
                  {getColumnLabel(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((santri, index) => (
              <tr key={santri.id}>
                <td className="print-data-td-no">{index + 1}</td>
                {filteredColumns.map((key) => (
                  <td key={key} className="print-data-td">
                    {getCellValue(santri, key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PrintDataTable
