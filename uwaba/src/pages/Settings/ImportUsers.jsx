import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import * as XLSX from 'xlsx'
import { manageUsersAPI } from '../../services/api'

function ImportUsers() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [importData, setImportData] = useState([])
  const [existingUsers, setExistingUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Load existing users untuk cek ID
  const loadExistingUsers = async () => {
    try {
      const response = await manageUsersAPI.getAll({ limit: 10000 })
      if (response.success) {
        setExistingUsers(response.data.users || [])
      }
    } catch (err) {
      console.error('Error loading existing users:', err)
    }
  }

  // Validasi data row (NIP opsional: kosong = generate otomatis dengan gender + tahun_hijriyah)
  const validateRow = (row, index) => {
    const errors = []
    const warnings = []

    const nipStr = (row.nip ?? row.id ?? '').toString().trim().replace(/\D/g, '').slice(0, 7)
    const hasNip = nipStr.length > 0

    if (hasNip) {
      if (nipStr.length > 7) {
        errors.push('NIP maksimal 7 digit')
      }
    } else {
      // NIP kosong = generate otomatis, wajib gender + tahun_hijriyah
      const gender = (row.gender ?? '').toString().trim()
      const tahun = (row.tahun_hijriyah ?? row['tahun ajaran hijriyah'] ?? '').toString().trim()
      if (!gender) {
        errors.push('NIP kosong: Gender wajib (L/P) untuk generate NIP')
      }
      if (!tahun) {
        errors.push('NIP kosong: Tahun Hijriyah wajib (contoh: 1447-1448) untuk generate NIP')
      }
    }

    // Validasi Nama (required)
    if (!row.nama || row.nama.toString().trim() === '') {
      errors.push('Nama harus diisi')
    }

    // Validasi Status
    const allowedStatuses = ['active', 'inactive', 'pending', 'aktif', 'tidak aktif']
    if (row.status && !allowedStatuses.map(s => s.toLowerCase()).includes(row.status.toLowerCase())) {
      errors.push(`Status tidak valid. Harus salah satu dari: ${allowedStatuses.join(', ')}`)
    }

    // Validasi Email format (jika ada)
    if (row.email && row.email.toString().trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(row.email.toString().trim())) {
        errors.push('Format email tidak valid')
      }
    }

    // Validasi Grup (jika ada)
    if (row.grup !== undefined && row.grup !== null && row.grup !== '') {
      const grup = parseInt(row.grup)
      if (isNaN(grup) || grup < 1) {
        errors.push('Grup harus berupa angka positif')
      }
    }

    return { errors, warnings }
  }

  // Handle file upload
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    // Validasi file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ]
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
      // Load existing users first
      await loadExistingUsers()

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

          // Parse header (baris pertama)
          const headers = jsonData[0].map(h => h ? h.toString().toLowerCase().trim() : '')
          
          // Map header ke field yang diharapkan (NIP / id untuk backward compat; gender + tahun_hijriyah untuk generate NIP)
          const headerMap = {
            'nip': 'nip',
            'id': 'nip',
            'nama': 'nama',
            'gender': 'gender',
            'tahun_hijriyah': 'tahun_hijriyah',
            'tahun ajaran hijriyah': 'tahun_hijriyah',
            'tahun hijriyah': 'tahun_hijriyah',
            'email': 'email',
            'whatsapp': 'whatsapp',
            'status': 'status',
            'grup': 'grup'
          }

          // Parse data rows
          const processedData = []
          for (let i = 1; i < jsonData.length; i++) {
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
            
            // Cek apakah NIP/id sudah ada (match by nip dulu, lalu id)
            let action = 'insert'
            let existingUser = null
            const nipVal = (rowData.nip ?? rowData.id ?? '').toString().trim().replace(/\D/g, '').slice(0, 7)
            if (nipVal) {
              existingUser = existingUsers.find(u =>
                (u.nip != null && String(u.nip) === nipVal) || (u.id != null && String(u.id) === nipVal)
              )
              if (existingUser) {
                action = 'update'
              }
            }

            processedData.push({
              rowNumber: i + 1,
              data: rowData,
              action,
              existingUser,
              errors: validation.errors,
              warnings: validation.warnings,
              isValid: validation.errors.length === 0
            })
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

    // Re-check action (insert/update) by NIP atau id
    const nipVal = (newData[index].data.nip ?? newData[index].data.id ?? '').toString().trim().replace(/\D/g, '').slice(0, 7)
    if (nipVal) {
      const existingUser = existingUsers.find(u =>
        (u.nip != null && String(u.nip) === nipVal) || (u.id != null && String(u.id) === nipVal)
      )
      if (existingUser) {
        newData[index].action = 'update'
        newData[index].existingUser = existingUser
      } else {
        newData[index].action = 'insert'
        newData[index].existingUser = null
      }
    } else {
      newData[index].action = 'insert'
      newData[index].existingUser = null
    }

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
          if (item.action === 'insert') {
            // Create new user (NIP manual atau generate: gender + tahun_hijriyah)
            const userData = {
              nama: item.data.nama.toString().trim(),
              status: (item.data.status || 'active').toLowerCase(),
              grup: item.data.grup ? parseInt(item.data.grup) : 1
            }

            const nipVal = (item.data.nip ?? item.data.id ?? '').toString().trim().replace(/\D/g, '').slice(0, 7)
            if (nipVal) {
              userData.nip = nipVal
            } else {
              userData.gender = (item.data.gender ?? '').toString().trim()
              userData.tahun_hijriyah = (item.data.tahun_hijriyah ?? item.data['tahun ajaran hijriyah'] ?? '').toString().trim()
            }

            if (item.data.email && item.data.email.toString().trim() !== '') {
              userData.email = item.data.email.toString().trim()
            }

            if (item.data.whatsapp && item.data.whatsapp.toString().trim() !== '') {
              userData.whatsapp = item.data.whatsapp.toString().trim()
            }

            const response = await manageUsersAPI.create(userData)
            if (response.success) {
              successCount++
            } else {
              errorCount++
              errors.push(`Row ${item.rowNumber}: ${response.message}`)
            }
          } else {
            // Update existing user (identifier = NIP atau id, backend resolve)
            const userData = {
              nama: item.data.nama.toString().trim(),
              status: (item.data.status || item.existingUser?.status || 'active').toLowerCase()
            }

            if (item.data.email !== undefined) {
              userData.email = item.data.email ? item.data.email.toString().trim() : null
            }

            if (item.data.whatsapp !== undefined) {
              userData.whatsapp = item.data.whatsapp ? item.data.whatsapp.toString().trim() : null
            }

            const identifier = (item.data.nip ?? item.data.id ?? item.existingUser?.nip ?? item.existingUser?.id)?.toString().trim()
            const response = await manageUsersAPI.update(identifier, userData)
            if (response.success) {
              successCount++
            } else {
              errorCount++
              errors.push(`Row ${item.rowNumber}: ${response.message}`)
            }
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
          navigate('/manage-users')
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
  const insertCount = importData.filter(item => item.action === 'insert' && item.isValid).length
  const updateCount = importData.filter(item => item.action === 'update' && item.isValid).length

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
                onClick={() => navigate('/manage-users')}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
                Kembali ke Manage Users
              </button>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Import Users dari Excel</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Upload file Excel untuk menambah atau memperbarui user
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

            {/* File Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-4">
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
                Format kolom: NIP (opsional, kosong = generate otomatis), Nama (wajib), Gender (L/P untuk NIP otomatis), Tahun Hijriyah (contoh 1447-1448), Email, WhatsApp, Status, Grup
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Insert:</span>
                      <span className="ml-2 font-semibold text-blue-600 dark:text-blue-400">{insertCount}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-2">Update:</span>
                      <span className="ml-1 font-semibold text-orange-600 dark:text-orange-400">{updateCount}</span>
                    </div>
                  </div>
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Row</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">NIP</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Gender</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tahun Hijriyah</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">WhatsApp</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Grup</th>
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
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.action === 'insert' 
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' 
                                : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                            }`}>
                              {item.action === 'insert' ? 'Insert' : 'Update'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.nip ?? item.data.id ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 7)
                                updateRowData(index, 'nip', v)
                              }}
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200 font-mono"
                              placeholder="Auto"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.nama || ''}
                              onChange={(e) => updateRowData(index, 'nama', e.target.value)}
                              className={`w-32 px-2 py-1 border rounded text-xs dark:bg-gray-700 dark:text-gray-200 ${
                                item.errors.some(e => e.includes('Nama')) 
                                  ? 'border-red-500' 
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.data.gender || ''}
                              onChange={(e) => updateRowData(index, 'gender', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">—</option>
                              <option value="L">L</option>
                              <option value="P">P</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.tahun_hijriyah ?? item.data['tahun ajaran hijriyah'] ?? ''}
                              onChange={(e) => updateRowData(index, 'tahun_hijriyah', e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                              placeholder="1447-1448"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="email"
                              value={item.data.email || ''}
                              onChange={(e) => updateRowData(index, 'email', e.target.value)}
                              className="w-40 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.data.whatsapp || ''}
                              onChange={(e) => updateRowData(index, 'whatsapp', e.target.value)}
                              className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={item.data.status || 'active'}
                              onChange={(e) => updateRowData(index, 'status', e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="active">Aktif</option>
                              <option value="inactive">Tidak Aktif</option>
                              <option value="pending">Pending</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={item.data.grup || 1}
                              onChange={(e) => updateRowData(index, 'grup', e.target.value)}
                              className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700 dark:text-gray-200"
                              min="1"
                            />
                          </td>
                          <td className="px-4 py-3">
                            {item.errors.length > 0 && (
                              <div className="text-xs text-red-600 dark:text-red-400">
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
                    onClick={() => navigate('/manage-users')}
                    disabled={saving}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || validCount === 0}
                    className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      `Simpan ${validCount} Data`
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

export default ImportUsers

