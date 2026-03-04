import { useState, useEffect } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import SubNavPendaftaran from './SubNavPendaftaran'

function ManageKondisi() {
  const { showNotification } = useNotification()
  const [fields, setFields] = useState([])
  const [values, setValues] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedField, setSelectedField] = useState(null)
  const [selectedValue, setSelectedValue] = useState(null)
  const [activeTab, setActiveTab] = useState('fields') // 'fields' atau 'values'
  const [selectedFieldFilter, setSelectedFieldFilter] = useState('') // Filter field untuk tab values
  const [fieldForm, setFieldForm] = useState({
    field_name: '',
    field_label: '',
    field_type: 'string',
    is_active: 1,
    urutan: ''
  })
  const [valueForm, setValueForm] = useState({
    id_field: '',
    value: '',
    value_label: '',
    is_active: 1,
    urutan: ''
  })
  const [showFormMobileField, setShowFormMobileField] = useState(false)
  const [showFormMobileValue, setShowFormMobileValue] = useState(false)

  useEffect(() => {
    fetchFields()
    fetchValues()
  }, [])

  // Fetch values saat filter field berubah atau saat tab berubah ke values
  useEffect(() => {
    if (activeTab === 'values') {
      if (selectedFieldFilter && fields.length > 0) {
        const selectedFieldObj = fields.find(f => f.id.toString() === selectedFieldFilter)
        if (selectedFieldObj) {
          fetchValues(null, selectedFieldObj.field_name)
        } else {
          fetchValues()
        }
      } else {
        fetchValues()
      }
    }
  }, [selectedFieldFilter, activeTab, fields]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFields = async () => {
    setLoading(true)
    try {
      const result = await pendaftaranAPI.getKondisiFields()
      if (result.success) {
        setFields(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching fields:', error)
      showNotification('Gagal mengambil daftar field', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchValues = async (idField = null, fieldName = null) => {
    try {
      const result = await pendaftaranAPI.getKondisiValues(idField, fieldName)
      if (result.success) {
        setValues(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching values:', error)
      showNotification('Gagal mengambil daftar value', 'error')
    }
  }

  // Helper function untuk reload values dengan filter yang aktif
  const reloadValuesWithFilter = () => {
    if (selectedFieldFilter) {
      const selectedFieldObj = fields.find(f => f.id.toString() === selectedFieldFilter)
      if (selectedFieldObj) {
        fetchValues(null, selectedFieldObj.field_name)
      } else {
        fetchValues()
      }
    } else {
      fetchValues()
    }
  }

  const handleFieldSubmit = async (e) => {
    e.preventDefault()
    try {
      if (selectedField) {
        const result = await pendaftaranAPI.updateKondisiField(selectedField.id, fieldForm)
      if (result.success) {
        showNotification('Field berhasil diupdate', 'success')
        fetchFields()
        resetFieldForm()
        setShowFormMobileField(false)
      }
    } else {
      const result = await pendaftaranAPI.createKondisiField(fieldForm)
      if (result.success) {
        showNotification('Field berhasil dibuat', 'success')
        fetchFields()
        resetFieldForm()
        setShowFormMobileField(false)
      }
    }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Gagal menyimpan field', 'error')
    }
  }

  const handleValueSubmit = async (e) => {
    e.preventDefault()
    try {
      if (selectedValue) {
        const result = await pendaftaranAPI.updateKondisiValue(selectedValue.id, valueForm)
      if (result.success) {
        showNotification('Value berhasil diupdate', 'success')
        reloadValuesWithFilter()
        resetValueForm()
        setShowFormMobileValue(false)
      }
    } else {
      const result = await pendaftaranAPI.createKondisiValue(valueForm)
      if (result.success) {
        showNotification('Value berhasil dibuat', 'success')
        reloadValuesWithFilter()
        resetValueForm()
        setShowFormMobileValue(false)
      }
    }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Gagal menyimpan value', 'error')
    }
  }

  const resetFieldForm = () => {
    setSelectedField(null)
    setFieldForm({
      field_name: '',
      field_label: '',
      field_type: 'string',
      is_active: 1,
      urutan: ''
    })
  }

  const handleCreateField = () => {
    resetFieldForm()
    if (window.innerWidth < 1024) {
      setShowFormMobileField(true)
    }
  }

  const handleCloseFieldForm = () => {
    setShowFormMobileField(false)
    resetFieldForm()
  }

  const resetValueForm = () => {
    setSelectedValue(null)
    setValueForm({
      id_field: '',
      value: '',
      value_label: '',
      is_active: 1,
      urutan: ''
    })
  }

  const handleCreateValue = () => {
    resetValueForm()
    if (window.innerWidth < 1024) {
      setShowFormMobileValue(true)
    }
  }

  const handleCloseValueForm = () => {
    setShowFormMobileValue(false)
    resetValueForm()
  }

  const handleEditField = (field) => {
    setSelectedField(field)
    setFieldForm({
      field_name: field.field_name,
      field_label: field.field_label,
      field_type: field.field_type,
      is_active: field.is_active,
      urutan: field.urutan || ''
    })
    if (window.innerWidth < 1024) {
      setShowFormMobileField(true)
    }
  }

  const handleEditValue = (value) => {
    setSelectedValue(value)
    setValueForm({
      id_field: value.id_field,
      value: value.value,
      value_label: value.value_label || value.value,
      is_active: value.is_active,
      urutan: value.urutan || ''
    })
    if (window.innerWidth < 1024) {
      setShowFormMobileValue(true)
    }
  }

  const handleDeleteField = async (id, fieldLabel) => {
    if (!window.confirm(`Yakin ingin menghapus field "${fieldLabel}"?`)) return
    try {
      const result = await pendaftaranAPI.deleteKondisiField(id)
      if (result.success) {
        showNotification('Field berhasil dihapus', 'success')
        fetchFields()
        resetFieldForm()
        if (selectedField?.id === id) {
          setShowFormMobileField(false)
        }
      }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Gagal menghapus field', 'error')
    }
  }

  const handleDeleteValue = async (id, value) => {
    if (!window.confirm(`Yakin ingin menghapus value "${value}"?`)) return
    try {
      const result = await pendaftaranAPI.deleteKondisiValue(id)
      if (result.success) {
        showNotification('Value berhasil dihapus', 'success')
        reloadValuesWithFilter()
        resetValueForm()
        if (selectedValue?.id === id) {
          setShowFormMobileValue(false)
        }
      }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Gagal menghapus value', 'error')
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SubNavPendaftaran />
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4 flex-shrink-0">
        <button
          onClick={() => setActiveTab('fields')}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === 'fields'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          Field
        </button>
        <button
          onClick={() => setActiveTab('values')}
          className={`px-4 py-2 rounded-md font-medium transition-colors ${
            activeTab === 'values'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          Value
        </button>
      </div>

      {/* Fields Tab */}
      {activeTab === 'fields' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Daftar Field</h3>
              <button
                onClick={handleCreateField}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors"
              >
                + Tambah
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                </div>
              ) : fields.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">Belum ada field</p>
              ) : (
                <div className="space-y-2">
                  {fields.map(field => (
                    <div
                      key={field.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedField?.id === field.id
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => handleEditField(field)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{field.field_label}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{field.field_name}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteField(field.id, field.field_label)
                          }}
                          className="ml-2 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Hapus"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form - Desktop: Always visible, Mobile: Conditional dengan backdrop */}
          {/* Backdrop untuk mobile */}
          {showFormMobileField && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity" 
              onClick={handleCloseFieldForm}
            ></div>
          )}
          
          {/* Form Container - Mobile: Modal, Desktop: Sidebar */}
          <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto transition-all ${
            showFormMobileField 
              ? 'fixed inset-4 z-50 lg:relative lg:inset-0 lg:block' 
              : 'hidden lg:block'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {selectedField ? 'Edit Field' : 'Tambah Field Baru'}
              </h3>
              {/* Close button untuk mobile */}
              <button
                type="button"
                onClick={handleCloseFieldForm}
                className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleFieldSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Field Name *
                </label>
                <input
                  type="text"
                  value={fieldForm.field_name}
                  onChange={(e) => setFieldForm({ ...fieldForm, field_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                  disabled={!!selectedField}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Field Label *
                </label>
                <input
                  type="text"
                  value={fieldForm.field_label}
                  onChange={(e) => setFieldForm({ ...fieldForm, field_label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    value={fieldForm.field_type}
                    onChange={(e) => setFieldForm({ ...fieldForm, field_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Urutan
                  </label>
                  <input
                    type="number"
                    value={fieldForm.urutan}
                    onChange={(e) => setFieldForm({ ...fieldForm, urutan: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors"
                >
                  {selectedField ? 'Update' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseFieldForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Values Tab */}
      {activeTab === 'values' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Daftar Value</h3>
              <button
                onClick={handleCreateValue}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-md transition-colors"
              >
                + Tambah
              </button>
            </div>
            {/* Filter Field */}
            <div className="mb-4 flex-shrink-0">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Filter Field
              </label>
              <select
                value={selectedFieldFilter}
                onChange={(e) => setSelectedFieldFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Semua Field</option>
                {fields.filter(f => f.is_active === 1).map(field => (
                  <option key={field.id} value={field.id.toString()}>
                    {field.field_label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto">
              {values.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">Belum ada value</p>
              ) : (
                <div className="space-y-2">
                  {values.map(value => (
                    <div
                      key={value.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedValue?.id === value.id
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => handleEditValue(value)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{value.value_label || value.value}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {value.field_label} ({value.value})
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteValue(value.id, value.value)
                          }}
                          className="ml-2 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Hapus"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form - Desktop: Always visible, Mobile: Conditional dengan backdrop */}
          {/* Backdrop untuk mobile */}
          {showFormMobileValue && (
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity" 
              onClick={handleCloseValueForm}
            ></div>
          )}
          
          {/* Form Container - Mobile: Modal, Desktop: Sidebar */}
          <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto transition-all ${
            showFormMobileValue 
              ? 'fixed inset-4 z-50 lg:relative lg:inset-0 lg:block' 
              : 'hidden lg:block'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {selectedValue ? 'Edit Value' : 'Tambah Value Baru'}
              </h3>
              {/* Close button untuk mobile */}
              <button
                type="button"
                onClick={handleCloseValueForm}
                className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleValueSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Field *
                </label>
                <select
                  value={valueForm.id_field}
                  onChange={(e) => setValueForm({ ...valueForm, id_field: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                  disabled={!!selectedValue}
                >
                  <option value="">Pilih Field</option>
                  {fields.filter(f => f.is_active === 1).map(field => (
                    <option key={field.id} value={field.id}>{field.field_label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Value *
                </label>
                <input
                  type="text"
                  value={valueForm.value}
                  onChange={(e) => setValueForm({ ...valueForm, value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Value Label
                </label>
                <input
                  type="text"
                  value={valueForm.value_label}
                  onChange={(e) => setValueForm({ ...valueForm, value_label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Kosongkan untuk menggunakan value"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Urutan
                </label>
                <input
                  type="number"
                  value={valueForm.urutan}
                  onChange={(e) => setValueForm({ ...valueForm, urutan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors"
                >
                  {selectedValue ? 'Update' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseValueForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManageKondisi

