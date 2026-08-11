import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'

function PrintControls({ 
  onLayoutChange, 
  onColorToggle, 
  onPrint, 
  onClose,
  onWhatsAppCheck,
  onWhatsAppSend,
  waNumber,
  onWaNumberChange,
  waStatus,
  isWaRegistered,
  isCheckingWa,
  isSendingWa,
  defaultLayoutMode = null // null = auto, 'portrait' atau 'landscape' = force
}) {
  const { user } = useAuthStore()
  const [layoutMode, setLayoutMode] = useState('portrait')
  const [columnCount, setColumnCount] = useState('1')
  const [useColor, setUseColor] = useState(true)
  const [waNumberInput, setWaNumberInput] = useState(waNumber || '')

  useEffect(() => {
    // Jika defaultLayoutMode di-set, gunakan itu
    if (defaultLayoutMode) {
      setLayoutMode(defaultLayoutMode)
      if (user) {
        setColumnCount('2')
        setUseColor(true)
      } else {
        setColumnCount('1')
        setUseColor(false)
      }
    } else {
      // Auto mode: landscape untuk user login, portrait untuk non-user
      if (user) {
        setLayoutMode('landscape')
        setColumnCount('2')
        setUseColor(true)
      } else {
        setLayoutMode('portrait')
        setColumnCount('1')
        setUseColor(false)
      }
    }
  }, [user, defaultLayoutMode])

  useEffect(() => {
    if (waNumber) {
      setWaNumberInput(waNumber)
    }
  }, [waNumber])

  useEffect(() => {
    if (onLayoutChange) {
      onLayoutChange({ layoutMode, columnCount, useColor })
    }
  }, [layoutMode, columnCount, useColor, onLayoutChange])

  const handleLayoutModeChange = (e) => {
    const newMode = e.target.value
    setLayoutMode(newMode)
    if (onLayoutChange) {
      onLayoutChange({ layoutMode: newMode, columnCount, useColor })
    }
  }

  const handleColumnCountChange = (e) => {
    const newCount = e.target.value
    setColumnCount(newCount)
    if (onLayoutChange) {
      onLayoutChange({ layoutMode, columnCount: newCount, useColor })
    }
  }

  const handleColorToggle = (e) => {
    const newColor = e.target.checked
    setUseColor(newColor)
    if (onColorToggle) {
      onColorToggle(newColor)
    }
    if (onLayoutChange) {
      onLayoutChange({ layoutMode, columnCount, useColor: newColor })
    }
  }

  const handleWaNumberChange = (e) => {
    const value = e.target.value
    setWaNumberInput(value)
    if (onWaNumberChange) {
      onWaNumberChange(value)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="top-right-controls no-print fixed top-0 left-0 right-0 w-full z-[1000] flex flex-col bg-gradient-to-b from-gray-50 to-gray-100 border-b border-gray-300 py-2 px-2 sm:px-5 shadow-md">
      {/* Baris 1 */}
      <div className="ribbon-row grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center min-h-[36px] relative gap-2 sm:gap-0">
        <div className="ribbon-section left flex flex-wrap items-center gap-2 sm:gap-4 justify-center sm:justify-end pr-0 sm:pr-3" id="waSectionRow1">
          <div className="control-group flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-1 rounded transition-colors hover:bg-black/5">
            <label htmlFor="waNumberInput" className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">
              Nomor WA:
            </label>
            <input
              type="text"
              id="waNumberInput"
              value={waNumberInput}
              onChange={handleWaNumberChange}
              placeholder="08xxxxxxxxxx"
              className="w-[120px] sm:w-[150px] px-1 sm:px-2 py-1 rounded border border-gray-300 bg-white text-xs sm:text-sm transition-colors hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button
            className={`btn-wa px-2 sm:px-3 py-1 sm:py-1.5 rounded border-none text-white cursor-pointer font-semibold text-xs sm:text-sm transition-all shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
              isWaRegistered && !isSendingWa
                ? 'bg-green-500 hover:bg-green-600'
                : isSendingWa
                ? 'bg-green-500 opacity-75 cursor-wait'
                : 'bg-green-500 opacity-50 cursor-not-allowed'
            }`}
            id="btnSendWA"
            onClick={onWhatsAppSend}
            disabled={!isWaRegistered || isSendingWa}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="inline-block align-middle mr-1 sm:w-5 sm:h-5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            <span className="hidden sm:inline">Uwaba 1</span>
            <span className="sm:hidden">Uwaba</span>
          </button>
        </div>
        <div className="ribbon-divider hidden sm:block w-px h-6 bg-gray-400 flex-shrink-0 self-center z-10 pointer-events-none mx-2"></div>
        <div className="ribbon-section right flex flex-wrap items-center gap-2 sm:gap-4 justify-center sm:justify-start pl-0 sm:pl-3">
          <div className="control-group flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-1 rounded transition-colors hover:bg-black/5">
            <input
              type="checkbox"
              id="colorToggle"
              checked={useColor}
              onChange={handleColorToggle}
              className="cursor-pointer w-4 h-4 sm:w-auto sm:h-auto"
            />
            <label htmlFor="colorToggle" className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap cursor-pointer">
              Warna Latar
            </label>
          </div>
          <button
            className="btn-print px-2 sm:px-3 py-1 sm:py-1.5 rounded border-none text-white cursor-pointer font-semibold text-xs sm:text-sm transition-all shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm bg-blue-600 hover:bg-blue-700"
            onClick={onPrint}
          >
            🖨️ <span className="hidden sm:inline">Print</span>
          </button>
          <button
            className="btn-close px-2 sm:px-3 py-1 sm:py-1.5 rounded border-none text-white cursor-pointer font-semibold text-xs sm:text-sm transition-all shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm bg-red-600 hover:bg-red-700"
            onClick={onClose}
          >
            ❌ <span className="hidden sm:inline">Tutup</span>
          </button>
        </div>
      </div>

      {/* Baris 2 */}
      <div className="ribbon-row grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center min-h-[36px] relative gap-2 sm:gap-0" id="ribbonRow2">
        <div className="ribbon-section left flex flex-wrap items-center gap-2 sm:gap-4 justify-center sm:justify-end pr-0 sm:pr-2" id="waSectionRow2">
          <button
            className="px-2 sm:px-3 py-1 sm:py-1.5 rounded border-none text-white cursor-pointer font-semibold text-xs sm:text-sm transition-all shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            id="btnCheckWA"
            onClick={onWhatsAppCheck}
            disabled={isCheckingWa}
          >
            {isCheckingWa ? (
              <>
                <span className="mr-1">⏳</span> <span className="hidden sm:inline">Mengecek...</span><span className="sm:hidden">Cek...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="inline-block align-middle mr-1 sm:w-4 sm:h-4">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span className="hidden sm:inline">Cek Nomor</span><span className="sm:hidden">Cek</span>
              </>
            )}
          </button>
          {waStatus && (
            <span
              id="waStatus"
              className={`text-xs sm:text-sm px-1 sm:px-2 ${
                waStatus.includes('✓') || waStatus.includes('terdaftar')
                  ? 'text-green-600 font-semibold'
                  : waStatus.includes('✗') || waStatus.includes('tidak terdaftar')
                  ? 'text-red-600 font-semibold'
                  : 'text-blue-500'
              }`}
            >
              {waStatus}
            </span>
          )}
        </div>
        <div className="ribbon-divider hidden sm:block w-px h-6 bg-gray-400 flex-shrink-0 self-center z-10 pointer-events-none mx-2" id="ribbonDivider2"></div>
        <div className="ribbon-section right flex flex-wrap items-center gap-2 sm:gap-4 justify-center sm:justify-start pl-0 sm:pl-2">
          <div className="control-group flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-1 rounded transition-colors hover:bg-black/5">
            <label htmlFor="layoutMode" className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">
              Orientasi:
            </label>
            <select
              id="layoutMode"
              value={layoutMode}
              onChange={handleLayoutModeChange}
              className="px-1 sm:px-2 py-1 rounded border border-gray-300 bg-white text-xs sm:text-sm cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
          <div className="control-group flex items-center gap-1 sm:gap-2 px-1 sm:px-2 py-1 rounded transition-colors hover:bg-black/5">
            <label htmlFor="columnCount" className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">
              Kolom:
            </label>
            <select
              id="columnCount"
              value={columnCount}
              onChange={handleColumnCountChange}
              className="px-1 sm:px-2 py-1 rounded border border-gray-300 bg-white text-xs sm:text-sm cursor-pointer transition-colors hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrintControls

