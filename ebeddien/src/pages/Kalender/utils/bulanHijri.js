/**
 * Nama bulan Hijriyah — sumber tunggal dari JSON (tanpa tabel general___bulan).
 * @type {'hijriyah_ar'|'hijriyah'|'masehi'}
 */
import data from '../data/bulanHijri.json'

export const BULAN_HIJRI = data

/**
 * Ambil nama bulan oleh id (1–12).
 * @param {number|string} id - id_bulan (1–12)
 * @param {'hijriyah_ar'|'hijriyah'|'masehi'} [type='hijriyah_ar'] - hijriyah_ar = Arab, hijriyah = Latin, masehi = nama bulan Masehi
 * @returns {string}
 */
export function getBulanName(id, type = 'hijriyah_ar') {
  const num = typeof id === 'string' ? parseInt(id, 10) : id
  const bulan = BULAN_HIJRI.find((b) => b.id === num)
  return bulan ? bulan[type] || bulan.hijriyah_ar : `Bulan ${num}`
}
