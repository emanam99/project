import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import BarangBarcodeScanner from './BarangBarcodeScanner'

const ease = [0.32, 0.72, 0, 1]

/**
 * Kotak kamera QR dengan animasi buka/tutup.
 * Saat collapsed, active=false segera (stream dimatikan), UI dianimasikan tutup.
 */
export default function BarangScannerSection({
  expanded,
  onScan,
  scannerRef,
  pageActive = true,
  compact = false,
}) {
  const cameraActive = Boolean(expanded && pageActive)
  const [mountScanner, setMountScanner] = useState(() => Boolean(expanded))

  useEffect(() => {
    if (expanded) {
      setMountScanner(true)
      return undefined
    }
    // Matikan stream segera; unmount setelah animasi tinggi selesai
    scannerRef?.current?.stop?.()
    const t = window.setTimeout(() => setMountScanner(false), 320)
    return () => clearTimeout(t)
  }, [expanded, scannerRef])

  return (
    <motion.div
      initial={false}
      animate={{
        height: expanded ? 'auto' : 0,
        opacity: expanded ? 1 : 0,
      }}
      transition={{ duration: 0.28, ease }}
      className="shrink-0 overflow-hidden"
      aria-hidden={!expanded}
    >
      {mountScanner ? (
        <BarangBarcodeScanner
          ref={scannerRef}
          onScan={onScan}
          active={cameraActive}
          compact={compact}
        />
      ) : null}
    </motion.div>
  )
}
