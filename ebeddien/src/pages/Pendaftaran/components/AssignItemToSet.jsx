import { useState, useEffect } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

function AssignItemToSet() {
  const { showNotification } = useNotification()
  const [itemSets, setItemSets] = useState([])
  const [items, setItems] = useState([])
  const [fields, setFields] = useState([])
  const [values, setValues] = useState([])
  const [selectedSet, setSelectedSet] = useState(null)
  const [selectedSetId, setSelectedSetId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDetailMobile, setShowDetailMobile] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState('kondisi') // 'kondisi' atau 'item'

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (selectedSetId) {
      fetchSetDetail(selectedSetId)
    }
  }, [selectedSetId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [setsResult, itemsResult, fieldsResult, valuesResult] = await Promise.all([
        pendaftaranAPI.getItemSets(),
        pendaftaranAPI.getItemList(),
        pendaftaranAPI.getKondisiFields(),
        pendaftaranAPI.getKondisiValues()
      ])

      if (setsResult.success) setItemSets(setsResult.data || [])
      if (itemsResult.success) setItems(itemsResult.data || [])
      if (fieldsResult.success) setFields(fieldsResult.data || [])
      if (valuesResult.success) setValues(valuesResult.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      showNotification('Gagal mengambil data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchSetDetail = async (id) => {
    try {
      const result = await pendaftaranAPI.getItemSet(id)
      if (result.success) {
        setSelectedSet(result.data)
      }
    } catch (error) {
      console.error('Error fetching set detail:', error)
      showNotification('Gagal mengambil detail item set', 'error')
    }
  }

  const handleSetSelect = (set) => {
    // Hanya update selectedSetId jika berbeda, untuk menghindari re-fetch yang tidak perlu
    if (selectedSetId !== set.id) {
      setSelectedSetId(set.id)
      // Set selectedSet sementara dari data yang sudah ada
      setSelectedSet(set)
    }
    if (window.innerWidth < 1024) {
      setShowDetailMobile(true)
      setActiveDetailTab('kondisi') // Default ke tab kondisi
    }
  }

  const handleBackToList = () => {
    setShowDetailMobile(false)
    setSelectedSet(null)
    setSelectedSetId(null)
  }

  const handleToggleKondisi = async (valueId) => {
    if (!selectedSet || !selectedSetId) return

    const currentKondisiIds = selectedSet.kondisi?.map(k => k.value_id) || []
    const isSelected = currentKondisiIds.includes(valueId)
    
    let newKondisiIds
    if (isSelected) {
      newKondisiIds = currentKondisiIds.filter(id => id !== valueId)
    } else {
      newKondisiIds = [...currentKondisiIds, valueId]
    }

    try {
      const result = await pendaftaranAPI.updateItemSet(selectedSetId, {
        kondisi_value_ids: newKondisiIds
      })
      if (result.success) {
        showNotification('Kondisi berhasil diupdate', 'success')
        fetchSetDetail(selectedSetId)
      }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Gagal mengupdate kondisi', 'error')
    }
  }

  const handleToggleItem = async (itemId) => {
    if (!selectedSet || !selectedSetId) return

    const currentItemIds = selectedSet.items?.map(i => i.id_item) || []
    const isSelected = currentItemIds.includes(itemId)
    
    let newItemIds
    if (isSelected) {
      newItemIds = currentItemIds.filter(id => id !== itemId)
    } else {
      newItemIds = [...currentItemIds, itemId]
    }

    try {
      const result = await pendaftaranAPI.updateItemSet(selectedSetId, {
        item_ids: newItemIds
      })
      if (result.success) {
        showNotification('Item berhasil diupdate', 'success')
        fetchSetDetail(selectedSetId)
      }
    } catch (error) {
      showNotification(error.response?.data?.message || 'Gagal mengupdate item', 'error')
    }
  }

  // Group values by field
  const valuesByField = values.reduce((acc, value) => {
    if (!acc[value.id_field]) {
      acc[value.id_field] = []
    }
    acc[value.id_field].push(value)
    return acc
  }, {})

  const selectedKondisiIds = selectedSet?.kondisi?.map(k => k.value_id) || []
  const selectedItemIds = selectedSet?.items?.map(i => i.id_item) || []
  
  // Group items by category
  const itemsByCategory = items.reduce((acc, item) => {
    const category = item.kategori || 'Lainnya'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(item)
    return acc
  }, {})

  // Sort categories: put 'Lainnya' at the end if it exists
  const sortedCategories = Object.keys(itemsByCategory).sort((a, b) => {
    if (a === 'Lainnya') return 1
    if (b === 'Lainnya') return -1
    return a.localeCompare(b)
  })

  // Calculate total price and count of selected items
  const selectedItemsData = items.filter(item => selectedItemIds.includes(item.id))
  const totalSelectedItems = selectedItemsData.length
  const totalPrice = selectedItemsData.reduce((sum, item) => {
    return sum + parseFloat(item.harga_standar || 0)
  }, 0)

  const mobileScrollBottomPad =
    'pb-[max(6.5rem,calc(env(safe-area-inset-bottom,0px)+5.5rem))]'

  return (
    <div className="h-full flex flex-col overflow-hidden p-2 sm:p-3">
      <div className="flex-1 grid grid-cols-1 gap-4 min-h-0 overflow-hidden max-lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-3">
        {/* Mobile: tab + back di atas (hindari bentrok dengan bottom nav aplikasi) */}
        {showDetailMobile && selectedSet && (
          <div className="lg:hidden col-span-1 flex flex-col gap-2 flex-shrink-0 order-first">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                  aria-label="Kembali ke daftar set"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Item set</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{selectedSet.nama_set}</p>
                </div>
              </div>
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('kondisi')}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeDetailTab === 'kondisi'
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                  }`}
                >
                  Kondisi
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('item')}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors border-l border-gray-200 dark:border-gray-600 ${
                    activeDetailTab === 'item'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80'
                  }`}
                >
                  Item
                </button>
              </div>
              {activeDetailTab === 'item' && (
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Total terpilih</span>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">
                      Rp {totalPrice.toLocaleString('id-ID')}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">{totalSelectedItems} item</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Item Sets List - Mobile: Always visible, Desktop: First column */}
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-hidden flex flex-col ${
          showDetailMobile ? 'hidden lg:flex' : ''
        }`}>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex-shrink-0">
            Daftar Item Set
          </h3>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              </div>
            ) : itemSets.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Belum ada item set</p>
            ) : (
              <div className="space-y-2">
                {itemSets.map(set => {
                  // Calculate total price for items in this set
                  const setItemIds = set.items?.map(i => i.id_item) || []
                  const setItemsData = items.filter(item => setItemIds.includes(item.id))
                  const setTotalPrice = setItemsData.reduce((sum, item) => {
                    return sum + parseFloat(item.harga_standar || 0)
                  }, 0)
                  
                  return (
                    <div
                      key={set.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSet?.id === set.id
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => handleSetSelect(set)}
                    >
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{set.nama_set}</h4>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {set.kondisi?.length || 0} kondisi • {set.items?.length || 0} item
                        {set.items?.length > 0 && (
                          <span className="ml-1">• Rp {setTotalPrice.toLocaleString('id-ID')}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Kondisi Selection - Desktop: Always visible, Mobile: Tab content */}
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-hidden flex flex-col min-h-0 ${
          showDetailMobile 
            ? (activeDetailTab === 'kondisi' ? 'flex max-lg:min-h-0' : 'hidden')
            : 'hidden lg:flex'
        }`}>
          {!showDetailMobile && (
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex-shrink-0">
              Kondisi
              {selectedSet && <span className="text-sm font-normal text-gray-500 ml-2">({selectedSet.nama_set})</span>}
            </h3>
          )}
          <div className={`flex-1 overflow-y-auto min-h-0 ${showDetailMobile ? mobileScrollBottomPad : ''}`}>
            {!selectedSet ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Pilih item set terlebih dahulu</p>
            ) : (
              <div className="space-y-4">
                {fields.filter(f => f.is_active === 1).map(field => {
                  const fieldValues = valuesByField[field.id] || []
                  if (fieldValues.length === 0) return null

                  return (
                    <div key={field.id} className="border-b border-gray-200 dark:border-gray-700 pb-3 last:border-0">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 text-sm">
                        {field.field_label}
                      </h4>
                      <div className="space-y-1">
                        {fieldValues.filter(v => v.is_active === 1).map(value => (
                          <label
                            key={value.id}
                            className="flex items-center p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedKondisiIds.includes(value.id)}
                              onChange={() => handleToggleKondisi(value.id)}
                              className="mr-2 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {value.value_label || value.value}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Items Selection - Desktop: Always visible, Mobile: Tab content */}
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-hidden flex flex-col min-h-0 ${
          showDetailMobile 
            ? (activeDetailTab === 'item' ? 'flex max-lg:min-h-0' : 'hidden')
            : 'hidden lg:flex'
        }`}>
          {!showDetailMobile && (
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Item
              </h3>
              {selectedSet && (
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Rp {totalPrice.toLocaleString('id-ID')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {totalSelectedItems} item
                  </div>
                </div>
              )}
            </div>
          )}
          <div className={`flex-1 overflow-y-auto min-h-0 ${showDetailMobile ? mobileScrollBottomPad : ''}`}>
            {!selectedSet ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Pilih item set terlebih dahulu</p>
            ) : items.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Belum ada item</p>
            ) : (
              <div className="space-y-4">
                {sortedCategories.map(category => (
                  <div key={category} className="space-y-1">
                    <h4 className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider px-2 py-1 bg-teal-50 dark:bg-teal-900/20 rounded">
                      {category}
                    </h4>
                    {itemsByCategory[category].map(item => (
                      <label
                        key={item.id}
                        className="flex items-center p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={() => handleToggleItem(item.id)}
                          className="mr-2 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {item.id} - {item.nama_item}
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Rp {parseFloat(item.harga_standar || 0).toLocaleString('id-ID')}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AssignItemToSet

