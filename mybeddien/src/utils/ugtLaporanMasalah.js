let masalahRowKeySeq = 1

function nextMasalahKey() {
  masalahRowKeySeq += 1
  return `masalah-${masalahRowKeySeq}`
}

export function emptyMasalahRow() {
  return { _key: nextMasalahKey(), masalah: '', solusi: '', saran: '' }
}

export function mapApiMasalahToItems(list) {
  if (!Array.isArray(list) || list.length === 0) return [emptyMasalahRow()]
  return list.map((x) => ({
    _key: nextMasalahKey(),
    masalah: x.masalah ?? '',
    solusi: x.solusi ?? '',
    saran: x.saran ?? ''
  }))
}

import { sanitizeUgtMasalahList } from './ugtLaporanSanitize'

export function buildMasalahListPayload(masalahItems) {
  const raw = (masalahItems || []).map((x) => ({
    masalah: x.masalah || '',
    solusi: x.solusi || '',
    saran: x.saran || '',
  }))
  return sanitizeUgtMasalahList(raw)
}
