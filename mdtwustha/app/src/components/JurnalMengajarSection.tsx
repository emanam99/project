import { useState, useEffect, useCallback, type ReactNode } from 'react'
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

export type JamKey = 'jam_1' | 'jam_2'
export type JurnalPanel = 'jurnal' | 'absen'

interface JamFormState {
  mapel_id: string
  deskripsi: string
  alasan: string
}

const emptyForm = (): JamFormState => ({ mapel_id: '', deskripsi: '', alasan: '' })

interface Props {
  kelasId: string
  pengurusId: string
  akses?: string
  canEdit: boolean
  onError?: (msg: string) => void
  /** Slot absen santri — hanya ditampilkan di kotak kanan jika fan sudah dipilih */
  absenSlot?: ReactNode
  onSessionChange?: (info: {
    jam: JamKey
    panel: JurnalPanel
    showAbsen: boolean
    fanSelected: boolean
  }) => void
  onSaveMengajarExtras?: () => Promise<boolean>
}

function entryToPanel(entry: JurnalMengajarEntry | null): JurnalPanel {
  if (!entry) return 'jurnal'
  return entry.status === 'mengajar' ? 'jurnal' : 'absen'
}

function entryToForm(entry: JurnalMengajarEntry | null): JamFormState {
  if (!entry) return emptyForm()
  return {
    mapel_id: entry.mapel_id ? String(entry.mapel_id) : '',
    deskripsi: entry.deskripsi || '',
    alasan: entry.alasan || '',
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

export default function JurnalMengajarSection({
  kelasId,
  pengurusId,
  akses,
  canEdit,
  onError,
  absenSlot,
  onSessionChange,
  onSaveMengajarExtras,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [activeJam, setActiveJam] = useState<JamKey>('jam_1')
  const [panel, setPanel] = useState<JurnalPanel>('jurnal')
  const [form, setForm] = useState<JamFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveKind, setSaveKind] = useState<JurnalStatus | null>(null)

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
  const [slots, setSlots] = useState<{
    jam_1: { occupied_by_other: boolean; by_me: boolean }
    jam_2: { occupied_by_other: boolean; by_me: boolean }
  }>({
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

  const mineNow = mine[activeJam]
  const occupiedByOther = slots[activeJam].occupied_by_other && !slots[activeJam].by_me
  const mengajarTerkunci = occupiedByOther && !mineNow
  const isSubmitted = Boolean(mineNow)
  const fanSelected =
    Boolean(form.mapel_id) || (isSubmitted && mineNow?.status === 'mengajar' && Boolean(mineNow.mapel_id))
  const showAbsen = panel === 'jurnal' && !mengajarTerkunci && fanSelected

  useEffect(() => {
    setForm(entryToForm(mineNow))
    const nextPanel = mengajarTerkunci && !mineNow ? 'absen' : entryToPanel(mineNow)
    setPanel(nextPanel)
  }, [mineNow, mengajarTerkunci, activeJam])

  useEffect(() => {
    onSessionChange?.({ jam: activeJam, panel, showAbsen, fanSelected })
  }, [activeJam, panel, showAbsen, fanSelected, onSessionChange])

  const handleSave = async (status: JurnalStatus) => {
    if (!canEdit) return
    if (status === 'mengajar' && mengajarTerkunci) {
      onError?.('Jam ini sudah diisi jurnal mengajar oleh guru lain')
      return
    }

    if (status === 'mengajar') {
      if (!form.mapel_id) {
        onError?.('Fan/mapel wajib dipilih')
        return
      }
      if (!form.deskripsi.trim()) {
        onError?.('Deskripsi materi wajib diisi')
        return
      }
    }
    if ((status === 'ijin' || status === 'sakit') && !form.alasan.trim()) {
      onError?.('Alasan wajib diisi')
      return
    }

    setSaving(true)
    setSaveKind(status)

    if (status === 'mengajar' && onSaveMengajarExtras) {
      const okAbsen = await onSaveMengajarExtras()
      if (!okAbsen) {
        setSaving(false)
        setSaveKind(null)
        return
      }
    }

    const res = await saveJurnalMengajar({
      kelas_id: kelasId,
      pengurus_id: pengurusId,
      jam: activeJam,
      status,
      mapel_id: status === 'mengajar' ? form.mapel_id : undefined,
      deskripsi: status === 'mengajar' ? form.deskripsi.trim() : undefined,
      alasan: status !== 'mengajar' ? form.alasan.trim() : undefined,
    })

    setSaving(false)
    setSaveKind(null)

    if (res.success) {
      await fetchJurnal()
    } else {
      onError?.(res.message || 'Gagal menyimpan jurnal')
    }
  }

  const saveAbsenOnly = async () => {
    if (!onSaveMengajarExtras) return
    setSaving(true)
    setSaveKind('mengajar')
    await onSaveMengajarExtras()
    setSaving(false)
    setSaveKind(null)
  }

  const selectedMapel = mapelList.find((m) => m.id === form.mapel_id)

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

  const jamTabClass = (jam: JamKey) =>
    `flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition border ${
      activeJam === jam
        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
        : 'ui-text-muted border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'
    }`

  if (!pengurusId) return null

  const mengajarForm =
    panel === 'jurnal' && !mengajarTerkunci ? (
      mapelList.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          Belum ada mapel di rombel ini. Admin perlu menambahkan mapel dan menghubungkannya ke rombel di menu Mapel.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="ui-label mb-1.5 block">Fan (Mapel)</label>
            <select
              value={form.mapel_id}
              onChange={(e) => setForm((f) => ({ ...f, mapel_id: e.target.value }))}
              className="ui-input w-full appearance-none"
              disabled={saving || (isSubmitted && mineNow?.status === 'mengajar')}
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
              onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
              placeholder="Materi yang diajarkan hari ini..."
              rows={3}
              className="ui-input w-full resize-none"
              disabled={saving || (isSubmitted && mineNow?.status === 'mengajar')}
            />
          </div>
        </div>
      )
    ) : null

  const izinForm =
    panel === 'absen' || (panel === 'jurnal' && mengajarTerkunci) ? (
      <div className="space-y-3">
        <div>
          <label className="ui-label mb-1.5 block">Alasan</label>
          <textarea
            value={form.alasan}
            onChange={(e) => setForm((f) => ({ ...f, alasan: e.target.value }))}
            placeholder="Tulis alasan izin atau sakit..."
            rows={3}
            className="ui-input w-full resize-none"
            disabled={saving || isSubmitted}
          />
        </div>
        {canEdit && !isSubmitted && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave('ijin')}
              disabled={saving}
              className="flex-1 min-w-[7rem] px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-60"
            >
              {saving && saveKind === 'ijin' ? 'Menyimpan...' : 'Simpan Izin'}
            </button>
            <button
              type="button"
              onClick={() => void handleSave('sakit')}
              disabled={saving}
              className="flex-1 min-w-[7rem] px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition disabled:opacity-60"
            >
              {saving && saveKind === 'sakit' ? 'Menyimpan...' : 'Simpan Sakit'}
            </button>
          </div>
        )}
      </div>
    ) : null

  const rightAbsenPanel = showAbsen ? (
    <div className="space-y-3 flex flex-col min-h-0">
      {absenSlot}
      {canEdit && (
        <button
          type="button"
          onClick={() => void (isSubmitted && mineNow?.status === 'mengajar' ? saveAbsenOnly() : handleSave('mengajar'))}
          disabled={saving || mapelList.length === 0}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-60 shrink-0"
        >
          {saving && saveKind === 'mengajar'
            ? 'Menyimpan...'
            : isSubmitted && mineNow?.status === 'mengajar'
              ? 'Simpan Absen'
              : 'Simpan (Jurnal + Absen)'}
        </button>
      )}
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-4 py-10 ui-text-muted min-h-[12rem]">
      {panel === 'absen' || mengajarTerkunci ? (
        <>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Absen tidak ditampilkan</p>
          <p className="text-xs mt-1 leading-relaxed">Mode izin/sakit tidak memerlukan absen santri.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Pilih fan terlebih dahulu</p>
          <p className="text-xs mt-1 leading-relaxed">Absen santri muncul setelah fan/mapel dipilih di kiri.</p>
        </>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Jurnal & Absen</h2>
        <p className="text-sm ui-text-muted mt-1">
          PC: kiri jurnal/izin, kanan absen. Absen muncul setelah fan dipilih.
          {isAdmin && ' Admin dapat melihat jurnal semua guru.'}
        </p>
      </div>

      {loading ? (
        <div className="ui-card p-6 flex items-center gap-3 justify-center ui-text-muted text-sm">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Memuat jurnal...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Kotak kiri: jurnal / izin-sakit */}
          <div className="ui-card p-4 sm:p-5 space-y-4">
            <div className="flex gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-900/50 border ui-divider">
              {(['jam_1', 'jam_2'] as JamKey[]).map((jam) => (
                <button
                  key={jam}
                  type="button"
                  onClick={() => setActiveJam(jam)}
                  disabled={saving}
                  className={jamTabClass(jam)}
                >
                  {JAM_LABELS[jam]}
                </button>
              ))}
            </div>

            {mineNow ? (
              <div className={`text-sm px-3 py-2 rounded-lg border ${STATUS_BADGE[mineNow.status]}`}>
                <span className="font-medium">
                  Status Anda ({JAM_LABELS[activeJam]}): {STATUS_LABEL[mineNow.status]}
                </span>
                {mineNow.status === 'mengajar' && (
                  <>
                    <span className="block mt-0.5">Mapel: {formatEntryMapel(mineNow)}</span>
                    {mineNow.deskripsi && (
                      <span className="block mt-0.5 text-xs opacity-90">Materi: {mineNow.deskripsi}</span>
                    )}
                  </>
                )}
                {(mineNow.status === 'ijin' || mineNow.status === 'sakit') && mineNow.alasan && (
                  <span className="block mt-0.5 text-xs opacity-90">Alasan: {mineNow.alasan}</span>
                )}
              </div>
            ) : null}

            {canEdit && !isSubmitted ? (
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
                    Mengajar
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
                {panel === 'jurnal' && !mengajarTerkunci ? mengajarForm : izinForm}
              </div>
            ) : !canEdit && !isSubmitted ? (
              <p className="text-sm ui-text-muted">
                Anda belum mengisi jurnal {JAM_LABELS[activeJam].toLowerCase()}.
              </p>
            ) : isSubmitted && mineNow?.status === 'mengajar' ? (
              mengajarForm
            ) : isSubmitted && (mineNow?.status === 'ijin' || mineNow?.status === 'sakit') ? (
              izinForm
            ) : null}

            {isSubmitted && canEdit && (
              <p className="text-xs ui-text-muted">
                Entri sudah tersimpan untuk {JAM_LABELS[activeJam].toLowerCase()} hari ini.
              </p>
            )}

            {isAdmin && (
              <div className="pt-3 border-t ui-divider">
                <p className="text-xs font-medium ui-text-muted mb-2 uppercase tracking-wide">
                  Guru ({JAM_LABELS[activeJam]})
                </p>
                <AdminEntryList entries={entries[activeJam]} />
              </div>
            )}
          </div>

          {/* Kotak kanan: absen */}
          <div className="ui-card p-4 sm:p-5 min-h-[16rem] flex flex-col">{rightAbsenPanel}</div>
        </div>
      )}
    </div>
  )
}
