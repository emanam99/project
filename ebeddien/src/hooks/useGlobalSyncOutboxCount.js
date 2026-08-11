import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { ijinOutboxDb } from '../services/ijinOutbox/ijinOutboxDb'

/** Jumlah item antrean sinkron (pending + failed) dari IndexedDB — sumber global untuk semua modul. */
export function useGlobalSyncOutboxCount() {
  const [n, setN] = useState(0)

  useEffect(() => {
    const sub = liveQuery(() =>
      ijinOutboxDb.outbox
        .where('status')
        .anyOf(['pending', 'failed'])
        .count()
    ).subscribe({
      next: (c) => setN(typeof c === 'number' ? c : 0),
      error: () => setN(0)
    })
    return () => {
      if (sub && typeof sub.unsubscribe === 'function') {
        sub.unsubscribe()
      }
    }
  }, [])

  return { n, showBadge: n > 0 }
}
