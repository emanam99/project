import { liveQuery } from 'dexie'
import { ijinAPI } from '../api'
import { ijinOutboxDb } from './ijinOutboxDb'

export function makeIjinSnapKey(idSantri, tahunAjaran) {
  return `${Number(idSantri)}::${tahunAjaran ?? ''}`
}

function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

let localIjinCounter = 0
export function generateLocalIjinId() {
  return -(Date.now() * 1000 + (localIjinCounter++ % 1000) + Math.floor(Math.random() * 100))
}

let draining = false
let pendingDrain = false

export function isNavigatorOnline() {
  return globalThis.navigator?.onLine !== false
}

export function saveIjinSnapshot(idSantri, tahunAjaran, rows) {
  const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
  return ijinOutboxDb.ijinSnapshots.put({
    snapKey,
    idSantri: Number(idSantri),
    tahun_ajaran: tahunAjaran,
    rows: Array.isArray(rows) ? rows : [],
    updatedAt: Date.now()
  })
}

export function getIjinSnapshot(idSantri, tahunAjaran) {
  return ijinOutboxDb.ijinSnapshots.get(makeIjinSnapKey(idSantri, tahunAjaran))
}

/**
 * Aksi lokal (belum sukses ke server) — dipakai di merge tampilan.
 */
async function getActiveOutboxForSnap(snapKey) {
  return ijinOutboxDb.outbox
    .where('snapKey')
    .equals(snapKey)
    .filter(
      (r) => r.status === 'pending' || r.status === 'sending' || r.status === 'failed'
    )
    .toArray()
}

/**
 * Menyatukan data server/snapshot dengan antrean lokal (tampilan optimistik).
 */
export async function mergeIjinListWithOutbox(idSantri, tahunAjaran, baseRows) {
  const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
  const rows = Array.isArray(baseRows) ? baseRows.map((r) => ({ ...r })) : []
  const out = await getActiveOutboxForSnap(snapKey)
  out.sort((a, b) => a.createdAt - b.createdAt)

  for (const job of out) {
    if (job.op === 'create' && job.payload) {
      const p = job.payload
      const id = job.localIjinId
      if (!id) continue
      rows.push({
        id,
        id_santri: Number(p.id_santri ?? idSantri),
        urutan: p.urutan ?? null,
        tahun_ajaran: p.tahun_ajaran ?? tahunAjaran,
        alasan: p.alasan ?? null,
        dari: p.dari ?? null,
        sampai: p.sampai ?? null,
        perpanjang: p.perpanjang ?? null,
        lama: p.lama ?? null,
        tanggal_kembali: p.tanggal_kembali ?? null,
        dari_masehi: p.dari_masehi ?? null,
        sampai_masehi: p.sampai_masehi ?? null,
        perpanjang_masehi: p.perpanjang_masehi ?? null,
        _offline: true
      })
      continue
    }
    if (job.op === 'update' && job.payload) {
      const targetId = job.ijinId
      const idx = rows.findIndex((r) => Number(r.id) === Number(targetId))
      if (idx < 0) continue
      const p = job.payload
      const cur = { ...rows[idx] }
      if (p.tahun_ajaran != null) cur.tahun_ajaran = p.tahun_ajaran
      if (p.alasan !== undefined) cur.alasan = p.alasan
      if (p.dari !== undefined) cur.dari = p.dari
      if (p.sampai !== undefined) cur.sampai = p.sampai
      if (p.perpanjang !== undefined) cur.perpanjang = p.perpanjang
      if (p.lama !== undefined) cur.lama = p.lama
      if (p.tanggal_kembali !== undefined) cur.tanggal_kembali = p.tanggal_kembali
      cur._offline = true
      rows[idx] = cur
    }
    if (job.op === 'delete' && job.ijinId != null) {
      const targetId = job.ijinId
      const filtered = rows.filter((r) => Number(r.id) !== Number(targetId))
      rows.length = 0
      rows.push(...filtered)
    }
    if (job.op === 'markKembali' && job.ijinId != null && job.markPayload) {
      const { set } = job.markPayload
      const targetId = job.ijinId
      const idx = rows.findIndex((r) => Number(r.id) === Number(targetId))
      if (idx < 0) continue
      const tanggal = set ? new Date().toISOString().slice(0, 10) : null
      rows[idx] = { ...rows[idx], tanggal_kembali: tanggal, _offline: true }
    }
  }
  return rows
}

function jobLabel(santriNama, op) {
  const s = santriNama || 'Santri'
  const t = { create: 'Tambah ijin', update: 'Ubah ijin', delete: 'Hapus ijin', markKembali: 'Kembali / batal' }
  return `${t[op] || op} — ${s}`
}

export async function enqueueIjinCreate({
  idSantri,
  tahunAjaran,
  body,
  santriNama,
  localIjinId
}) {
  const clientId = newClientId()
  const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
  const id = await ijinOutboxDb.outbox.add({
    clientId,
    entity: 'ijin',
    op: 'create',
    status: 'pending',
    createdAt: Date.now(),
    snapKey,
    idSantri: Number(idSantri),
    tahun_ajaran: tahunAjaran,
    localIjinId,
    ijinId: null,
    payload: body,
    markPayload: null,
    error: null,
    label: jobLabel(santriNama, 'create')
  })
  scheduleDrain()
  return { queued: true, outboxId: id, clientId, localIjinId }
}

export async function enqueueIjinUpdate({
  idSantri,
  tahunAjaran,
  ijinId,
  body,
  santriNama
}) {
  const clientId = newClientId()
  const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
  const id = await ijinOutboxDb.outbox.add({
    clientId,
    entity: 'ijin',
    op: 'update',
    status: 'pending',
    createdAt: Date.now(),
    snapKey,
    idSantri: Number(idSantri),
    tahun_ajaran: tahunAjaran,
    localIjinId: ijinId < 0 ? ijinId : null,
    ijinId,
    payload: { ...body, id_santri: Number(idSantri) },
    markPayload: null,
    error: null,
    label: jobLabel(santriNama, 'update')
  })
  scheduleDrain()
  return { queued: true, outboxId: id, clientId }
}

export async function enqueueIjinDelete({ idSantri, tahunAjaran, ijinId, santriNama }) {
  if (ijinId < 0) {
    const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
    const rows = await ijinOutboxDb.outbox
      .where('snapKey')
      .equals(snapKey)
      .filter(
        (r) =>
          r.op === 'create' &&
          (r.status === 'pending' || r.status === 'failed') &&
          Number(r.localIjinId) === Number(ijinId)
      )
      .toArray()
    for (const r of rows) {
      await ijinOutboxDb.outbox.delete(r.id)
    }
    return { cancelled: true }
  }

  const clientId = newClientId()
  const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
  const newId = await ijinOutboxDb.outbox.add({
    clientId,
    entity: 'ijin',
    op: 'delete',
    status: 'pending',
    createdAt: Date.now(),
    snapKey,
    idSantri: Number(idSantri),
    tahun_ajaran: tahunAjaran,
    localIjinId: null,
    ijinId,
    payload: null,
    markPayload: null,
    error: null,
    label: jobLabel(santriNama, 'delete')
  })
  scheduleDrain()
  return { queued: true, outboxId: newId, clientId }
}

export async function enqueueIjinMarkKembali({ idSantri, tahunAjaran, ijinId, set, santriNama }) {
  const clientId = newClientId()
  const snapKey = makeIjinSnapKey(idSantri, tahunAjaran)
  const newId = await ijinOutboxDb.outbox.add({
    clientId,
    entity: 'ijin',
    op: 'markKembali',
    status: 'pending',
    createdAt: Date.now(),
    snapKey,
    idSantri: Number(idSantri),
    tahun_ajaran: tahunAjaran,
    localIjinId: ijinId < 0 ? ijinId : null,
    ijinId,
    payload: null,
    markPayload: { set: !!set },
    error: null,
    label: jobLabel(santriNama, 'markKembali')
  })
  scheduleDrain()
  return { queued: true, outboxId: newId, clientId }
}

function resolveIjinId(ijinId, idMap) {
  if (ijinId == null) return null
  if (Number(ijinId) > 0) return Number(ijinId)
  if (idMap.has(Number(ijinId))) return idMap.get(Number(ijinId))
  return null
}

export async function drainIjinOutbox() {
  if (draining) {
    pendingDrain = true
    return
  }
  if (!isNavigatorOnline()) return
  draining = true
  try {
    const idMap = new Map()
    for (;;) {
      const batch = await ijinOutboxDb.outbox
        .where('status')
        .anyOf(['pending', 'failed'])
        .sortBy('createdAt')
      if (!batch.length) break

      const job = batch[0]
      await ijinOutboxDb.outbox.update(job.id, { status: 'sending', error: null })

      try {
        if (job.entity !== 'ijin' || !job.op) {
          await ijinOutboxDb.outbox.delete(job.id)
          continue
        }
        if (job.op === 'create') {
          const res = await ijinAPI.create(job.payload)
          if (!res?.success) {
            throw new Error(res?.message || 'Gagal create ijin')
          }
          const sid = res.data?.id
          if (job.localIjinId != null && Number.isFinite(Number(sid))) {
            const lid = Number(job.localIjinId)
            const nSid = Number(sid)
            idMap.set(lid, nSid)
            const toPatch = await ijinOutboxDb.outbox
              .where('snapKey')
              .equals(job.snapKey)
              .filter(
                (o) =>
                  o.id !== job.id &&
                  (Number(o.ijinId) === lid || Number(o.localIjinId) === lid)
              )
              .toArray()
            for (const o of toPatch) {
              await ijinOutboxDb.outbox.update(o.id, { ijinId: nSid, localIjinId: null })
            }
          }
          await ijinOutboxDb.outbox.delete(job.id)
        } else if (job.op === 'update') {
          const realId = resolveIjinId(job.ijinId, idMap)
          if (realId == null || realId < 0) {
            throw new Error('Ijin tergantung antrean; urutan sinkron terganggu. Coba lagi.')
          }
          const p = { ...job.payload }
          const { id: _drop, ...rest } = p
          const res = await ijinAPI.update(realId, rest)
          if (!res?.success) {
            throw new Error(res?.message || 'Gagal update ijin')
          }
          await ijinOutboxDb.outbox.delete(job.id)
        } else if (job.op === 'delete') {
          const realId = resolveIjinId(job.ijinId, idMap)
          if (realId == null || realId < 0) {
            throw new Error('Hapus ijin: ID belum tersinkron')
          }
          const res = await ijinAPI.delete(realId)
          if (!res?.success) {
            throw new Error(res?.message || 'Gagal hapus ijin')
          }
          await ijinOutboxDb.outbox.delete(job.id)
        } else if (job.op === 'markKembali') {
          const realId = resolveIjinId(job.ijinId, idMap)
          if (realId == null || realId < 0) {
            throw new Error('Status kembali: ID belum tersinkron')
          }
          const res = await ijinAPI.markKembali(realId, job.markPayload?.set !== false)
          if (!res?.success) {
            throw new Error(res?.message || 'Gagal tandai kembali')
          }
          await ijinOutboxDb.outbox.delete(job.id)
        } else {
          await ijinOutboxDb.outbox.delete(job.id)
        }
      } catch (e) {
        const msg = e?.message || String(e)
        await ijinOutboxDb.outbox.update(job.id, { status: 'failed', error: msg })
        break
      }
    }
  } finally {
    draining = false
    if (pendingDrain && isNavigatorOnline()) {
      pendingDrain = false
      return drainIjinOutbox()
    }
    pendingDrain = false
  }
}

function scheduleDrain() {
  if (!isNavigatorOnline()) return
  void drainIjinOutbox()
}

/**
 * Coba segera: online + API — hanya antre bila offline / error jaringan.
 */
export async function tryIjinCreate(idSantri, tahunAjaran, body, santriNama) {
  if (!isNavigatorOnline()) {
    const localIjinId = generateLocalIjinId()
    await enqueueIjinCreate({ idSantri, tahunAjaran, body, santriNama, localIjinId })
    return { success: true, offline: true, localIjinId, data: { id: localIjinId } }
  }
  try {
    const res = await ijinAPI.create(body)
    if (res?.success) {
      return { success: true, data: res.data, raw: res }
    }
    return { success: false, message: res?.message || 'Gagal menyimpan ijin' }
  } catch (e) {
    const localIjinId = generateLocalIjinId()
    await enqueueIjinCreate({ idSantri, tahunAjaran, body, santriNama, localIjinId })
    return { success: true, offline: true, localIjinId, data: { id: localIjinId } }
  }
}

export async function tryIjinUpdate(ijinId, idSantri, tahunAjaran, body, santriNama) {
  if (ijinId < 0 || !isNavigatorOnline()) {
    await enqueueIjinUpdate({ idSantri, tahunAjaran, ijinId, body, santriNama })
    return { success: true, offline: true }
  }
  try {
    const res = await ijinAPI.update(ijinId, body)
    if (res?.success) {
      return { success: true, data: res, raw: res }
    }
    return { success: false, message: res?.message || 'Gagal mengubah ijin' }
  } catch (e) {
    await enqueueIjinUpdate({ idSantri, tahunAjaran, ijinId, body, santriNama })
    return { success: true, offline: true }
  }
}

export async function tryIjinDelete(ijinId, idSantri, tahunAjaran, santriNama) {
  if (ijinId < 0) {
    const c = await enqueueIjinDelete({ idSantri, tahunAjaran, ijinId, santriNama })
    return c.cancelled
      ? { success: true, offline: true, cancelled: true }
      : { success: true, offline: true }
  }
  if (!isNavigatorOnline()) {
    await enqueueIjinDelete({ idSantri, tahunAjaran, ijinId, santriNama })
    return { success: true, offline: true }
  }
  try {
    const res = await ijinAPI.delete(ijinId)
    if (res?.success) {
      return { success: true, raw: res }
    }
    return { success: false, message: res?.message || 'Gagal menghapus' }
  } catch (e) {
    await enqueueIjinDelete({ idSantri, tahunAjaran, ijinId, santriNama })
    return { success: true, offline: true }
  }
}

export async function tryIjinMarkKembali(ijinId, set, idSantri, tahunAjaran, santriNama) {
  if (ijinId < 0 || !isNavigatorOnline()) {
    await enqueueIjinMarkKembali({ idSantri, tahunAjaran, ijinId, set, santriNama })
    return { success: true, offline: true, tanggal_kembali: set ? new Date().toISOString().slice(0, 10) : null }
  }
  try {
    const res = await ijinAPI.markKembali(ijinId, set)
    if (res?.success) {
      return {
        success: true,
        data: res.data,
        raw: res,
        tanggal_kembali: res.data?.tanggal_kembali ?? (set ? new Date().toISOString().slice(0, 10) : null)
      }
    }
    return { success: false, message: res?.message || 'Gagal memperbarui tanggal kembali' }
  } catch (e) {
    await enqueueIjinMarkKembali({ idSantri, tahunAjaran, ijinId, set, santriNama })
    return {
      success: true,
      offline: true,
      tanggal_kembali: set ? new Date().toISOString().slice(0, 10) : null
    }
  }
}

export async function listOutboxForUi() {
  return ijinOutboxDb.outbox.orderBy('createdAt').reverse().toArray()
}

export async function getPendingOrFailedCount() {
  return ijinOutboxDb.outbox
    .where('status')
    .anyOf(['pending', 'failed'])
    .count()
}

export function observeOutboxPendingCount() {
  return liveQuery(() =>
    ijinOutboxDb.outbox
      .where('status')
      .anyOf(['pending', 'failed'])
      .count()
  )
}

export async function resendOutboxItem(id) {
  const row = await ijinOutboxDb.outbox.get(id)
  if (!row) return
  if (row.status === 'sending') return
  await ijinOutboxDb.outbox.update(id, { status: 'pending', error: null })
  if (isNavigatorOnline()) {
    return drainIjinOutbox()
  }
}

export async function removeOutboxItem(id) {
  return ijinOutboxDb.outbox.delete(id)
}

export function attachIjinOutboxOnlineListener() {
  const fn = () => {
    if (isNavigatorOnline()) {
      void drainIjinOutbox()
    }
  }
  globalThis.addEventListener?.('online', fn)
  return () => globalThis.removeEventListener?.('online', fn)
}

/** Alias untuk UI antrean global; proses saat ini mencakup antrean ijin (nanti modul lain menyusul). */
export const drainSyncOutbox = drainIjinOutbox
export const attachSyncOutboxOnlineListener = attachIjinOutboxOnlineListener
