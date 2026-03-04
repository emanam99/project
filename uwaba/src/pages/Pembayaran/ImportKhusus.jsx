import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as XLSX from 'xlsx'
import { paymentAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { useAuthStore } from '../../store/authStore'

function ImportKhusus() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user } = useAuthStore()
  const { options, optionsMasehi } = useTahunAjaranStore()
  const [file, setFile] = useState(null)
  const [importData, setImportData] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Khusus options yang diizinkan
  const khususOptions = ['UJBA', 'Guru Tugas', 'KKN', 'PLP/PPL', 'Skripsi', 'Wisuda']
  
  // Lembaga options
  const lembagaOptions = [
    'PSA', 'Isti\'dadiyah', 'Ula', 'Wustha', 'Ulya',
    'PAUD', 'SMP', 'MTs', 'SMAI', 'STAI', 'LTTQ', 'LPBA'
  ]

  // Validasi format tahun ajaran (hijriyah atau masehi)
  const validateTahunAjaran = (tahunAjaran) => {
    if (!tahunAjaran || tahunAjaran.toString().trim() === '') {
      return { valid: false, message: 'Tahun ajaran harus diisi' }
    }
    
    const tahunStr = tahunAjaran.toString().trim()
    
    // Format hijriyah: 1446-1447
    const hijriyahPattern = /^\d{4}-\d{4}$/
    // Format masehi: 2025-2026
    const masehiPattern = /^\d{4}-\d{4}$/
    
    // Cek apakah sesuai format tahun ajaran hijriyah atau masehi
    const isHijriyah = hijriyahPattern.test(tahunStr) && parseInt(tahunStr.split('-')[0]) >= 1400
    const isMasehi = masehiPattern.test(tahunStr) && parseInt(tahunStr.split('-')[0]) >= 2000
    
    // Cek apakah ada di options
    const inHijriyahOptions = options.some(opt => opt.value === tahunStr)
    const inMasehiOptions = optionsMasehi.some(opt => opt.value === tahunStr)
    
    if (!isHijriyah && !isMasehi) {
      return { valid: false, message: 'Format tahun ajaran tidak valid. Gunakan format: 1446-1447 (Hijriyah) atau 2025-2026 (Masehi)' }
    }
    
    if (!inHijriyahOptions && !inMasehiOptions) {
      return { valid: false, message: 'Tahun ajaran tidak ditemukan di daftar tahun ajaran yang tersedia' }
    }
    
    return { valid: true, message: '' }
  }

  // Validasi data row
  const validateRow = (row, index) => {
    const errors = []

    // Validasi NIS (required, harus 7 digit)
    if (!row.id_santri || row.id_santri.toString().trim() === '') {
      errors.push('NIS harus diisi')
    } else {
      const idStr = row.id_santri.toString().trim()
      if (!/^\d{7}$/.test(idStr)) {
        errors.push('NIS harus berupa 7 digit angka')
      }
    }

    // Validasi Keterangan 1 (required, harus salah satu dari khususOptions)
    if (!row.keterangan_1 || row.keterangan_1.toString().trim() === '') {
      errors.push('Keterangan 1 harus diisi')
    } else {
      const keterangan1 = row.keterangan_1.toString().trim()
      if (!khususOptions.includes(keterangan1)) {
        errors.push(`Keterangan 1 tidak valid. Harus salah satu dari: ${khususOptions.join(', ')}`)
      }
    }

    // Validasi Tahun Ajaran (required)
    const tahunAjaranValidation = validateTahunAjaran(row.tahun_ajaran)
    if (!tahunAjaranValidation.valid) {
      errors.push(tahunAjaranValidation.message)
    }

    // Validasi Lembaga (required)
    if (!row.lembaga || row.lembaga.toString().trim() === '') {
      errors.push('Lembaga harus diisi')
    } else {
      const lembaga = row.lembaga.toString().trim()
      if (!lembagaOptions.includes(lembaga)) {
        errors.push(`Lembaga tidak valid. Harus salah satu dari: ${lembagaOptions.join(', ')}`)
      }
    }

    // Validasi Total (required, harus angka positif)
    if (!row.total || row.total.toString().trim() === '') {
      errors.push('Total harus diisi')
    } else {
      const total = parseFloat(row.total)
      if (isNaN(total) || total <= 0) {
        errors.push('Total harus berupa angka positif')
      }
    }

    // Keterangan 2 (opsional)
    // Tidak perlu validasi khusus

    return { errors, warnings: [] }
  }

  // Download template Excel
  const downloadTemplate = () => {
    const templateData = [
      {
        'NIS': '1234567',
        'Keterangan 1': 'UJBA',
        'Keterangan 2': 'Contoh keterangan tambahan (opsional)',
        'Tahun Ajaran': '1446-1447',
        'Lembaga': 'Ulya',
        'Total': '500000'
      },
      {
        'NIS': '',
        'Keterangan 1': '',
        'Keterangan 2': '',
        'Tahun Ajaran': '',
        'Lembaga': '',
        'Total': ''
      }
    ]

    // Tambahkan sheet dengan keterangan
    const wsData = [
      ['KETERANGAN:'],
      ['Kolom Keterangan 1 hanya boleh diisi dengan:'],
      ...khususOptions.map(opt => [opt]),
      [''],
      ['Format Tahun Ajaran:'],
      ['- Hijriyah: 1446-1447 (contoh)'],
      ['- Masehi: 2025-2026 (contoh)'],
      [''],
      ['Lembaga yang tersedia:'],
      ...lembagaOptions.map(opt => [opt]),
      [''],
      ['DATA:'],
      ['NIS', 'Keterangan 1', 'Keterangan 2', 'Tahun Ajaran', 'Lembaga', 'Total']
    ]

    // Tambahkan contoh data
    templateData.forEach(row => {
      wsData.push([
        row['NIS'] || '',
        row['Keterangan 1'] || '',
        row['Keterangan 2'] || '',
        row['Tahun Ajaran'] || '',
        row['Lembaga'] || '',
        row['Total'] || ''
      ])
    })

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // NIS
      { wch: 15 }, // Keterangan 1
      { wch: 30 }, // Keterangan 2
      { wch: 15 }, // Tahun Ajaran
      { wch: 15 }, // Lembaga
      { wch: 12 }  // Total
    ]

    XLSX.writeFile(wb, 'template_import_khusus.xlsx')
  }

  // Handle file upload
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    // Validasi file type
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()
    if (!validExtensions.includes(fileExtension)) {
      setError('File harus berformat Excel (.xlsx, .xls) atau CSV')
      return
    }

    setFile(selectedFile)
    setError('')
    setSuccess('')
    setProcessing(true)

    try {
      // Read Excel file
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })

          if (jsonData.length < 2) {
            setError('File Excel tidak memiliki data atau hanya header')
            setProcessing(false)
            return
          }

          // Cari baris "DATA:" untuk mulai membaca data
          let dataStartIndex = 0
          for (let i = 0; i < jsonData.length; i++) {
            if (jsonData[i] && jsonData[i][0] && jsonData[i][0].toString().toLowerCase().includes('data')) {
              dataStartIndex = i + 1
              break
            }
          }

          // Jika tidak ditemukan "DATA:", gunakan baris pertama sebagai header
          if (dataStartIndex === 0) {
            dataStartIndex = 1
          }

          // Parse header
          const headers = jsonData[dataStartIndex - 1].map(h => h ? h.toString().toLowerCase().trim() : '')
          
          // Map header ke field yang diharapkan
          const headerMap = {
            'nis': 'id_santri',
            'id santri': 'id_santri',
            'id_santri': 'id_santri',
            'keterangan 1': 'keterangan_1',
            'keterangan_1': 'keterangan_1',
            'keterangan 2': 'keterangan_2',
            'keterangan_2': 'keterangan_2',
            'tahun ajaran': 'tahun_ajaran',
            'tahun_ajaran': 'tahun_ajaran',
            'lembaga': 'lembaga',
            'total': 'total'
          }

          // Parse data rows
          const processedData = []
          for (let i = dataStartIndex; i < jsonData.length; i++) {
            const row = jsonData[i]
            if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
              continue // Skip empty rows
            }

            const rowData = {}
            headers.forEach((header, index) => {
              const mappedField = headerMap[header]
              if (mappedField && row[index] !== undefined) {
                rowData[mappedField] = row[index]
              }
            })

            // Validasi row
            const validation = validateRow(rowData, i)
            
            processedData.push({
              rowNumber: i + 1,
              data: rowData,
              errors: validation.errors,
              warnings: validation.warnings,
              isValid: validation.errors.length === 0
            })
          }

          if (processedData.length === 0) {
            setError('Tidak ada data yang valid untuk diimport')
            setProcessing(false)
            return
          }

          setImportData(processedData)
          setProcessing(false)
        } catch (err) {
          console.error('Error parsing Excel:', err)
          setError('Gagal membaca file Excel: ' + err.message)
          setProcessing(false)
        }
      }
      reader.readAsArrayBuffer(selectedFile)
    } catch (err) {
      console.error('Error reading file:', err)
      setError('Gagal membaca file: ' + err.message)
      setProcessing(false)
    }
  }

  // Update row data
  const updateRowData = (index, field, value) => {
    const newData = [...importData]
    newData[index].data[field] = value
    
    // Re-validate
    const validation = validateRow(newData[index].data, newData[index].rowNumber)
    newData[index].errors = validation.errors
    newData[index].warnings = validation.warnings
    newData[index].isValid = validation.errors.length === 0

    setImportData(newData)
  }

  // Save to database
  const handleSave = async () => {
    // Filter hanya data yang valid
    const validData = importData.filter(item => item.isValid)
    
    if (validData.length === 0) {
      setError('Tidak ada data yang valid untuk disimpan. Silakan perbaiki error terlebih dahulu.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      let successCount = 0
      let errorCount = 0
      const errors = []

      for (const item of validData) {
        try {
          const dataToSend = {
            id_santri: item.data.id_santri.toString().trim(),
            keterangan_1: item.data.keterangan_1.toString().trim(),
            keterangan_2: item.data.keterangan_2 ? item.data.keterangan_2.toString().trim() : null,
            tahun_ajaran: item.data.tahun_ajaran.toString().trim(),
            lembaga: item.data.lembaga.toString().trim(),
            total: parseFloat(item.data.total),
            admin: user?.nama || 'System',
            id_admin: user?.id || null,
            page: 'khusus'
          }

          const response = await paymentAPI.insertTunggakanKhusus(dataToSend, 'khusus')
          if (response.success) {
            successCount++
          } else {
            errorCount++
            errors.push(`Row ${item.rowNumber}: ${response.message}`)
          }
        } catch (err) {
          errorCount++
          errors.push(`Row ${item.rowNumber}: ${err.response?.data?.message || err.message}`)
        }
      }

      if (errorCount > 0) {
        setError(`${successCount} data berhasil disimpan, ${errorCount} data gagal. Error: ${errors.join('; ')}`)
      } else {
        setSuccess(`${successCount} data berhasil disimpan.`)
        setTimeout(() => {
          navigate('/pembayaran/khusus')
        }, 2000)
      }
    } catch (err) {
      console.error('Error saving data:', err)
      setError('Terjadi kesalahan saat menyimpan data: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const validCount = importData.filter(item => item.isValid).length
  const invalidCount = importData.filter(item => !item.isValid).length

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Header */}
            <div className="mb-6">
              <button
                onClick={() => navigate('/pembayaran/khusus')}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                Kembali ke Data Khusus
              </button>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Import Data Khusus dari Excel</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Upload file Excel untuk menambah data khusus
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg">
                {success}
              </div>
            )}

            {/* Download Template & File Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <button
                  onClick={downloadTemplate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download Template
                </button>
              </div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Pilih File Excel (.xlsx, .xls)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={processing || saving}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Format kolom: NIS (7 digit), Keterangan 1 (UJBA/Guru Tugas/KKN/PLP/PPL/Skripsi/Wisuda), Keterangan 2 (opsional), Tahun Ajaran (1446-1447 atau 2025-2026), Lembaga, Total (angka)
              </p>
            </div>

            {/* Processing Indicator */}
            {processing && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Memproses file...</span>
                </div>
              </div>
            )}

            {/* Preview Data */}
            {importData.length > 0 && !processing && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Summary */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Total Data:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">{importData.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Valid:</span>
                      <span className="ml-2 font-semibold text-green-600 dark:text-green-400">{validCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Error:</span>
                      <span className="ml-2 font-semibold text-red-600 dark:text-red-400">{invalidCount}</span>
                    </div>
                  </div>
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Row</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIS</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Keterangan 1</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Keterangan 2</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tahun Ajaran</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Lembaga</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {importData.map((item, index) => (
                        <tr
                          key={index}
                          className={item.isValid ? 'bg-white dark:bg-gray-800' : 'bg-red-50 dark:bg-red-900/20'}
                        >
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.rowNumber}</td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.id_santri || ''}
                              onChange={(e) => updateRowData(index, 'id_santri', e.target.value)}
                              className={`w-24 px-2 py-1 border rounded text-xs dark:bg-gray-700 dark:text-gray-200 ${
                                item.errors.some(e => e.includes('NIS')) 
                                  ? 'border-red-500' 
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              placeholder="1234567"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.data.keterangan_1 || ''}
                              onChange={(e) => updateRowData(index, 'keterangan_1', e.target.value)}
                              className={`w-32 px-2 py-1 border rounded text-xs dark:bg-gray-700 dark:text-gray-200 ${
                                item.errors.some(e => e.includes('Keterangan 1')) 
                                  ? 'border-red-500' 
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <option value="">Pilih...</option>
                              {khususOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.keterangan_2 || ''}
                              onChange={(e) => updateRowData(index, 'keterangan_2', e.target.value)}
                              className="w-40 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                              placeholder="Opsional"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.tahun_ajaran || ''}
                              onChange={(e) => updateRowData(index, 'tahun_ajaran', e.target.value)}
                              className={`w-28 px-2 py-1 border rounded text-xs dark:bg-gray-700 dark:text-gray-200 ${
                                item.errors.some(e => e.includes('Tahun Ajaran')) 
                                  ? 'border-red-500' 
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              placeholder="1446-1447"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.data.lembaga || ''}
                              onChange={(e) => updateRowData(index, 'lembaga', e.target.value)}
                              className={`w-32 px-2 py-1 border rounded text-xs dark:bg-gray-700 dark:text-gray-200 ${
                                item.errors.some(e => e.includes('Lembaga')) 
                                  ? 'border-red-500' 
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                            >
                              <option value="">Pilih...</option>
                              {lembagaOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.data.total || ''}
                              onChange={(e) => updateRowData(index, 'total', e.target.value)}
                              className={`w-28 px-2 py-1 border rounded text-xs dark:bg-gray-700 dark:text-gray-200 ${
                                item.errors.some(e => e.includes('Total')) 
                                  ? 'border-red-500' 
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              placeholder="500000"
                              min="0"
                              step="1"
                            />
                          </td>
                          <td className="px-4 py-3">
                            {item.errors.length > 0 && (
                              <div className="text-xs text-red-600 dark:text-red-400 max-w-xs">
                                {item.errors.map((err, i) => (
                                  <div key={i}>• {err}</div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action Buttons */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
                  <button
                    onClick={() => navigate('/pembayaran/khusus')}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    disabled={saving}
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || validCount === 0}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Simpan ({validCount})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default ImportKhusus
