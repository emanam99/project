import { useEffect } from 'react'
import { attachSyncOutboxOnlineListener, drainSyncOutbox, isNavigatorOnline } from './ijinOutboxService'

/** Pasang listener `online` + coba drain antrean (seluruh app; berbagai modul nanti). */
export default function GlobalSyncOutboxBridge() {
  useEffect(() => {
    const detach = attachSyncOutboxOnlineListener()
    if (isNavigatorOnline()) {
      void drainSyncOutbox()
    }
    return detach
  }, [])
  return null
}
