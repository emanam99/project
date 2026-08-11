import { useState, useEffect, useCallback } from 'react'
import {
  getJurnalMengajar,
  saveJurnalMengajar,
  type JurnalMengajarEntry,
  type JurnalStatus,
  type MapelRow,
} from '../api/apiClient'
import { formatMapelLabel } from '../utils/formatMapel'

const JAM_LABELS = { jam_1: 'Jam 1', jam_2: 'Jam 2' } as const

const STATUS_LABEL: Record<JurnalStatus, string> = {
  mengajar: 'Mengajar',
  ijin: 'Izin',
  sakit: 'Sakit',
}

const STATUS_BADGE: Record<JurnalStatus, string> = {
  mengajar: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  ijin: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  sakit: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
}

type JamKey = 'jam_1' | 'jam_2'
type FormPanel = 'jurnal' | 'absen'

interface JamFormState {
  mapel_id: string
  deskripsi: string
  alasan: string
  mode: 'mengajar' | 'ijin' | 'sakit' | null
}

const emptyForm = (): JamFormState => ({ mapel_id: '', deskripsi: '', alasan: '', mode: null })

interface Props {
  kelasId: string
  pengurusId: string
  akses?: string
  canEdit: boolean
  onError?: (msg: string) => void
}

function entryToPanel(entry: JurnalMengajarEntry | null): FormPanel {
  if (!entry) return 'jurnal'
  return entry.status === 'mengajar' ? 'jurnal' : 'absen'
}

function entryToForm(entry: JurnalMengajarEntry | null): JamFormState {
  if (!entry) return emptyForm()
  return {
    mapel_id: entry.mapel_id ? String(entry.mapel_id) : '',
    deskripsi: entry.deskripsi || '',
    alasan: entry.alasan || '',
    mode: entry.status,
  }
}

function formatEntryMapel(e: JurnalMengajarEntry) {
  if (e.mapel_fan) {
    return formatMapelLabel({
      fan: e.mapel_fan,
      kitab_nama: e.mapel_kitab || '',
      musonnif: e.mapel_musonnif || '',
      dari: e.mapel_dari || '',
      sampai: e.mapel_sampai || '',
    })
  }
  return e.pelajaran || '—'
}

function AdminEntryList({ entries }: { entries: JurnalMengajarEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs ui-text-muted italic">Belum ada entri.</p>
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-start gap-2 text-sm px-3 py-2 rounded-lg border ui-divider bg-slate-50/80 dark:bg-slate-900/30"
        >
          <span className="font-medium text-slate-800 dark:text-slate-200">{e.pengurus_nama}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-medium ${STATUS_BADGE[e.status]}`}>
            {STATUS_LABEL[e.status]}
          </span>
          {e.status === 'mengajar' && (
            <>
              <span className="ui-text-muted w-full text-xs">{formatEntryMapel(e)}</span>
              {e.deskripsi && (
                <span className="ui-text-muted w-full text-xs mt-0.5">Materi: {e.deskripsi}</span>
              )}
            </>
          )}
          {(e.status === 'ijin' || e.status === 'sakit') && e.alasan && (
            <span className="ui-text-muted w-full text-xs mt-0.5">Alasan: {e.alasan}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function JamJurnalCard({
  jam,
  kelasId,
  pengurusId,
  canEdit,
  mine,
  adminEntries,
  isAdmin,
  occupiedByOther,
  mapelList,
  onSaved,
  onError,
}: {
  jam: JamKey
  kelasId: string
  pengurusId: string
  canEdit: boolean
  mine: JurnalMengajarEntry | null
  adminEntries: JurnalMengajarEntry[]
  isAdmin: boolean
  occupiedByOther: boolean
  mapelList: MapelRow[]
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const mengajarTerkunci = occupiedByOther && !mine
  const [form, setForm] = useState<JamFormState>(() => entryToForm(mine))
  const [panel, setPanel] = useState<FormPanel>(() =>
    mengajarTerkunci && !mine ? 'absen' : entryToPanel(mine)
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(entryToForm(mine))
    setPanel(mengajarTerkunci && !mine ? 'absen' : entryToPanel(mine))
  }, [mine, mengajarTerkunci])

  const handleSave = async (status: JurnalStatus) => {
    if (!canEdit) return
    if (status === 'mengajar' && mengajarTerkunci) {
      onError('Jam ini sudah diisi jurnal mengajar oleh guru lain')
      return
    }

    if (status === 'mengajar') {
      if (!form.mapel_id) {
        onError('Fan/mapel wajib dipilih')
        return
      }
      if (!form.deskripsi.trim()) {
        onError('Deskripsi materi wajib diisi')
        return
      }
    }
    if ((status === 'ijin' || status === 'sakit') && !form.alasan.trim()) {
      onError('Alasan wajib diisi')
      return
    }

    setSaving(true)
    const res = await saveJurnalMengajar({
      kelas_id: kelasId,
      pengurus_id: pengurusId,
      jam,
      status,
      mapel_id: status === 'mengajar' ? form.mapel_id : undefined,
      deskripsi: status === 'mengajar' ? form.deskripsi.trim() : undefined,
      alasan: status !== 'mengajar' ? form.alasan.trim() : undefined,
    })
    setSaving(false)

    if (res.success) {
      setForm((f) => ({ ...f, mode: status }))
      onSaved()
    } else {
      onError(res.message || 'Gagal menyimpan jurnal')
    }
  }

  const selectedMapel = mapelList.find((m) => m.id === form.mapel_id)
  const isSubmitted = Boolean(mine)

  const toggleClass = (active: boolean, variant: 'jurnal' | 'absen') => {
    const base = 'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition border'
    if (!active) {
      return `${base} ui-text-muted border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50`
    }
    if (variant === 'jurnal') {
      return `${base} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40`
    }
    return `${base} bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40`
  }

  return (
    <div className="rounded-xl border ui-divider p-4 space-y-4">
      <h3 className="font-semibold text-slate-800 dark:text-slate-200">{JAM_LABELS[jam]}</h3>

      {mine ? (
        <div className={`text-sm px-3 py-2 rounded-lg border ${STATUS_BADGE[mine.status]}`}>
          <span className="font-medium">Status Anda: {STATUS_LABEL[mine.status]}</span>
          {mine.status === 'mengajar' && (
            <>
              <span className="block mt-0.5">Mapel: {formatEntryMapel(mine)}</span>
              {mine.deskripsi && <span className="block mt-0.5 text-xs opacity-90">Materi: {mine.deskripsi}</span>}
            </>
          )}
          {(mine.status === 'ijin' || mine.status === 'sakit') && mine.alasan && (
            <span className="block mt-0.5 text-xs opacity-90">Alasan: {mine.alasan}</span>
          )}
        </div>
      ) : canEdit ? (
        <div className="space-y-3">
          {mengajarTerkunci && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Jurnal mengajar jam ini sudah diisi guru lain. Anda masih bisa melaporkan izin atau sakit.
            </p>
          )}
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-900/50 border ui-divider">
            <button
              type="button"
              onClick={() => setPanel('jurnal')}
              disabled={saving || mengajarTerkunci}
              className={toggleClass(panel === 'jurnal', 'jurnal')}
            >
              Jurnal Mengajar
            </button>
            <button
              type="button"
              onClick={() => setPanel('absen')}
              disabled={saving}
              className={toggleClass(panel === 'absen', 'absen')}
            >
              Izin / Sakit
            </button>
          </div>

          {panel === 'jurnal' && !mengajarTerkunci ? (
            mapelList.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                Belum ada mapel di rombel ini. Admin perlu menambahkan mapel dan menghubungkannya ke rombel di menu Mapel.
              </p>
            ) : (
              <>
                <div>
                  <label className="ui-label mb-1.5 block">Fan (Mapel)</label>
                  <select
                    value={form.mapel_id}
                    onChange={(e) => setForm((f) => ({ ...f, mapel_id: e.target.value, mode: 'mengajar' }))}
                    className="ui-input w-full appearance-none"
                    disabled={saving}
                  >
                    <option value="">Pilih fan...</option>
                    {mapelList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatMapelLabel(m)}
                      </option>
                    ))}
                  </select>
                  {selectedMapel && (selectedMapel.dari || selectedMapel.sampai) && (
                    <p className="text-xs ui-text-muted mt-1">
                      Batas pelajaran: {selectedMapel.dari || '…'} – {selectedMapel.sampai || '…'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Deskripsi materi hari ini</label>
                  <textarea
                    value={form.deskripsi}
                    onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value, mode: 'mengajar' }))}
                    placeholder="Materi yang diajarkan hari ini..."
                    rows={3}
                    className="ui-input w-full resize-none"
                    disabled={saving}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSave('mengajar')}
                  disabled={saving || mapelList.length === 0}
                  className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-60"
                >
                  {saving && form.mode === 'mengajar' ? 'Menyimpan...' : 'Simpan Jurnal'}
                </button>
              </>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <label className="ui-label mb-1.5 block">Alasan</label>
                <textarea
                  value={form.alasan}
                  onChange={(e) => setForm((f) => ({ ...f, alasan: e.target.value }))}
                  placeholder="Tulis alasan izin atau sakit..."
                  rows={3}
                  className="ui-input w-full resize-none"
                  disabled={saving}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSave('ijin')}
                  disabled={saving}
                  className="flex-1 min-w-[7rem] px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-60"
                >
                  {saving && form.mode === 'ijin' ? 'Menyimpan...' : 'Simpan Izin'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave('sakit')}
                  disabled={saving}
                  className="flex-1 min-w-[7rem] px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-60"
                >
                  {saving && form.mode === 'sakit' ? 'Menyimpan...' : 'Simpan Sakit'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm ui-text-muted">Anda belum mengisi jurnal {JAM_LABELS[jam].toLowerCase()}.</p>
      )}

      {isSubmitted && canEdit && (
        <p className="text-xs ui-text-muted">Entri sudah tersimpan untuk {JAM_LABELS[jam].toLowerCase()} hari ini.</p>
      )}

      {isAdmin && (
        <div className="pt-3 border-t ui-divider">
          <p className="text-xs font-medium ui-text-muted mb-2 uppercase tracking-wide">Guru ({JAM_LABELS[jam]})</p>
          <AdminEntryList entries={adminEntries} />
        </div>
      )}
    </div>
  )
}

export default function JurnalMengajarSection({
  kelasId,
  pengurusId,
  akses,
  canEdit,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<{ jam_1: JurnalMengajarEntry[]; jam_2: JurnalMengajarEntry[] }>({
    jam_1: [],
    jam_2: [],
  })
  const [mine, setMine] = useState<{ jam_1: JurnalMengajarEntry | null; jam_2: JurnalMengajarEntry | null }>({
    jam_1: null,
    jam_2: null,
  })
  const [mapelList, setMapelList] = useState<MapelRow[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [slots, setSlots] = useState<{ jam_1: { occupied_by_other: boolean; by_me: boolean }; jam_2: { occupied_by_other: boolean; by_me: boolean } }>({
    jam_1: { occupied_by_other: false, by_me: false },
    jam_2: { occupied_by_other: false, by_me: false },
  })

  const fetchJurnal = useCallback(async () => {
    if (!kelasId || !pengurusId) return
    setLoading(true)
    const res = await getJurnalMengajar(kelasId, pengurusId, akses)
    if (res.success) {
      setEntries(res.entries || { jam_1: [], jam_2: [] })
      setMine(res.mine || { jam_1: null, jam_2: null })
      setMapelList(res.mapel_list || [])
      setSlots(
        res.slots || {
          jam_1: { occupied_by_other: false, by_me: false },
          jam_2: { occupied_by_other: false, by_me: false },
        }
      )
      setIsAdmin(res.meta?.is_admin ?? false)
    } else {
      onError?.(res.message || 'Gagal memuat jurnal mengajar')
    }
    setLoading(false)
  }, [kelasId, pengurusId, akses, onError])

  useEffect(() => {
    fetchJurnal()
  }, [fetchJurnal])

  if (!pengurusId) return null

  // User biasa tetap melihat form (izin/sakit) meski slot mengajar sudah terisi guru lain
  const visibleJams: JamKey[] = ['jam_1', 'jam_2']

  return (
    <div className="ui-card p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Jurnal Mengajar</h2>
        <p className="text-sm ui-text-muted mt-1">
          Isi jurnal mengajar atau laporkan izin/sakit. Gunakan tombol di atas form untuk berganti mode.
          {isAdmin && ' Sebagai admin, Anda dapat melihat jurnal semua guru.'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-6 justify-center ui-text-muted text-sm">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Memuat jurnal...
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${visibleJams.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {visibleJams.map((jam) => (
            <JamJurnalCard
              key={jam}
              jam={jam}
              kelasId={kelasId}
              pengurusId={pengurusId}
              canEdit={canEdit}
              mine={mine[jam]}
              adminEntries={entries[jam]}
              isAdmin={isAdmin}
              occupiedByOther={slots[jam].occupied_by_other && !slots[jam].by_me}
              mapelList={mapelList}
              onSaved={fetchJurnal}
              onError={(msg) => onError?.(msg)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
