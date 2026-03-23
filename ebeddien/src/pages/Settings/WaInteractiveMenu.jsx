import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { waInteractiveMenuAPI } from '../../services/api'

let tempIdCounter = -1
function nextTempId() {
  tempIdCounter -= 1
  return tempIdCounter
}

/** Urutkan induk dulu, lalu anak (untuk parent_index). */
function sortNodesForSave(nodes) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const sorted = []
  const done = new Set()
  function visit(id) {
    if (done.has(id)) return
    const n = byId[id]
    if (!n) return
    if (n.parent_id != null && byId[n.parent_id]) visit(n.parent_id)
    sorted.push(n)
    done.add(id)
  }
  nodes.forEach((n) => visit(n.id))
  return sorted
}

function buildPutPayload(nodes) {
  const sorted = sortNodesForSave(nodes)
  const idToIdx = Object.fromEntries(sorted.map((n, i) => [n.id, i]))
  for (const n of sorted) {
    if (n.parent_id != null && idToIdx[n.parent_id] === undefined) {
      throw new Error(`Node "${n.title}" punya parent_id yang tidak valid`)
    }
  }
  return sorted.map((n) => ({
    parent_index: n.parent_id == null ? null : idToIdx[n.parent_id],
    sort_order: n.sort_order ?? 0,
    title: n.title?.trim() || '',
    body_text: n.body_text ?? '',
    triggers: Array.isArray(n.triggers) ? n.triggers.map((t) => String(t).trim()).filter(Boolean) : [],
    action_type: n.action_type || 'menu',
  }))
}

export default function WaInteractiveMenu() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [enabledSaving, setEnabledSaving] = useState(false)
  const [nodes, setNodes] = useState([])

  const load = useCallback(() => {
    setLoading(true)
    return waInteractiveMenuAPI
      .getTree()
      .then((res) => {
        if (res?.success && res?.data) {
          setEnabled(!!res.data.enabled)
          const raw = res.data.nodes || []
          setNodes(
            raw.map((n) => ({
              id: n.id,
              parent_id: n.parent_id,
              sort_order: n.sort_order ?? 0,
              title: n.title ?? '',
              body_text: n.body_text ?? '',
              triggers: Array.isArray(n.triggers) ? n.triggers : [],
              action_type: n.action_type || 'menu',
            }))
          )
        }
      })
      .catch((err) => {
        showNotification(err?.response?.data?.message || err?.message || 'Gagal memuat menu', 'error')
      })
      .finally(() => setLoading(false))
  }, [showNotification])

  useEffect(() => {
    load()
  }, [load])

  const parentOptions = useMemo(() => {
    return nodes.map((n) => ({ id: n.id, label: `${n.title || '(tanpa judul)'} [id ${n.id}]` }))
  }, [nodes])

  const updateNode = (id, patch) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  const removeNode = (id) => {
    setNodes((prev) => {
      const hasChild = prev.some((n) => n.parent_id === id)
      if (hasChild) {
        showNotification('Hapus anak dulu atau pindahkan ke parent lain', 'warning')
        return prev
      }
      return prev.filter((n) => n.id !== id)
    })
  }

  const addNode = (parentId = null) => {
    setNodes((prev) => [
      ...prev,
      {
        id: nextTempId(),
        parent_id: parentId,
        sort_order: prev.filter((p) => p.parent_id === parentId).length,
        title: 'Judul menu',
        body_text: '',
        triggers: [],
        action_type: 'menu',
      },
    ])
  }

  /** Urutan sort tertinggi di level menu utama (parent null). */
  const maxRootSortOrder = (prev) => {
    const roots = prev.filter((p) => p.parent_id === null)
    return roots.reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), -1)
  }

  /** Preset: 4 pilihan menu utama (isi teks bisa Anda edit). */
  const addPresetFourMain = () => {
    setNodes((prev) => {
      const start = maxRootSortOrder(prev) + 1
      const preset = [
        {
          title: 'Info Pesantren',
          body_text:
            'Selamat datang. Di sini informasi umum pesantren.\n\nSesuaikan teks ini. Pengguna bisa membalas dengan angka 1 atau kata kunci di kolom Pemicu.',
          triggers: ['1', 'info pesantren', 'pesantren'],
          action_type: 'menu',
        },
        {
          title: 'Info Pendaftaran',
          body_text: 'Informasi pendaftaran, jadwal, dan persyaratan.\n\nSesuaikan isi sesuai kebijakan lembaga.',
          triggers: ['2', 'info pendaftaran', 'psb', 'pendaftaran'],
          action_type: 'menu',
        },
        {
          title: 'Daftar Notifikasi WA',
          body_text:
            'Untuk mengaktifkan notifikasi WhatsApp, kirim pesan dengan format:\n\nDaftar Notifikasi\nNama: ...\nNIK: ...\n\n(Sesuaikan dengan alur Daftar Notifikasi di sistem.)',
          triggers: ['3', 'daftar notifikasi', 'notifikasi'],
          action_type: 'daftar_notif',
        },
        {
          title: 'Menu & bantuan',
          body_text: 'Untuk kembali ke daftar menu utama, pengguna bisa membalas: 0 (nol) atau ketik "menu" / "utama".',
          triggers: ['4', 'menu', 'bantuan', 'utama'],
          action_type: 'reply',
        },
      ]
      const added = preset.map((p, i) => ({
        id: nextTempId(),
        parent_id: null,
        sort_order: start + i,
        title: p.title,
        body_text: p.body_text,
        triggers: p.triggers,
        action_type: p.action_type,
      }))
      return [...prev, ...added]
    })
    showNotification('Preset 4 menu utama ditambahkan. Sesuaikan teks lalu Simpan struktur.', 'success')
  }

  /** Preset: dua jawaban Ya / Tidak (cocok untuk cabang konfirmasi). */
  const addPresetYaTidak = () => {
    setNodes((prev) => {
      const start = maxRootSortOrder(prev) + 1
      const pair = [
        {
          title: 'Ya',
          body_text: 'Terima kasih, pilihan Anda: Ya.\n\n(Sesuaikan balasan lanjutan atau tambahkan submenu.)',
          triggers: ['ya', 'iya', 'y', 'yes', 'ok', 'oke'],
          action_type: 'reply',
        },
        {
          title: 'Tidak',
          body_text: 'Baik, pilihan Anda: Tidak.\n\n(Sesuaikan balasan atau arahkan ke menu lain.)',
          triggers: ['tidak', 'belum', 'no', 'n', 'batal'],
          action_type: 'reply',
        },
      ]
      const added = pair.map((p, i) => ({
        id: nextTempId(),
        parent_id: null,
        sort_order: start + i,
        title: p.title,
        body_text: p.body_text,
        triggers: p.triggers,
        action_type: p.action_type,
      }))
      return [...prev, ...added]
    })
    showNotification('Preset Ya/Tidak ditambahkan. Pindahkan ke submenu (Induk) jika perlu.', 'success')
  }

  const handleSaveEnabled = async () => {
    setEnabledSaving(true)
    try {
      const res = await waInteractiveMenuAPI.putSettings({ enabled })
      showNotification(res?.message ?? 'Disimpan', res?.success ? 'success' : 'error')
      if (res?.data?.enabled !== undefined) setEnabled(!!res.data.enabled)
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setEnabledSaving(false)
    }
  }

  const handleSaveTree = async () => {
    for (const n of nodes) {
      if (!n.title?.trim()) {
        showNotification('Semua baris wajib punya judul', 'warning')
        return
      }
    }
    let payload
    try {
      payload = buildPutPayload(nodes)
    } catch (e) {
      showNotification(e.message || 'Struktur menu tidak valid', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await waInteractiveMenuAPI.putTree({ nodes: payload })
      showNotification(res?.message ?? 'Menu disimpan', 'success')
      await load()
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="max-w-5xl mx-auto px-4 py-6 pb-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Menu WA interaktif</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Balasan otomatis bercabang untuk pesan masuk (WA server sendiri &amp; WatZap). Urutan angka di daftar (1, 2, 3, ...) dan teks pemicu bisa Anda atur per baris.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/settings/notifikasi"
                className="text-sm text-teal-600 dark:text-teal-400 hover:underline self-center"
              >
                &larr; Notifikasi
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Aktifkan balasan otomatis menu</span>
              </label>
              <button
                type="button"
                onClick={handleSaveEnabled}
                disabled={enabledSaving}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {enabledSaving ? 'Menyimpan...' : 'Simpan pengaturan'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Jika aktif, setiap pesan masuk diarahkan ke menu ini (kecuali sedang dalam alur &quot;Daftar Notifikasi&quot;). Ketik{' '}
              <strong>0</strong> untuk kembali ke menu utama.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Struktur menu</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addNode(null)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                >
                  + Menu utama
                </button>
                <button
                  type="button"
                  onClick={handleSaveTree}
                  disabled={saving || loading}
                  className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan struktur'}
                </button>
              </div>
            </div>

            {!loading && (
              <div className="rounded-lg border border-dashed border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-900/15 p-3 space-y-2">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Balas cepat (preset)</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Di sisi pengguna WhatsApp, balasan tetap berupa <strong>teks atau angka</strong> (bukan tombol tap seperti aplikasi).
                  Banyak penyedia API juga mengirim menu interaktif sebagai teks. Tombol di bawah hanya <strong>menambah kerangka baris</strong> di tabel
                  agar Anda tidak mengetik dari nol.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={addPresetFourMain}
                    className="px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-white dark:bg-gray-800 border border-teal-300 dark:border-teal-600 text-teal-800 dark:text-teal-200 hover:bg-teal-100/80 dark:hover:bg-teal-900/40"
                  >
                    + 4 menu utama (contoh)
                  </button>
                  <button
                    type="button"
                    onClick={addPresetYaTidak}
                    className="px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-white dark:bg-gray-800 border border-teal-300 dark:border-teal-600 text-teal-800 dark:text-teal-200 hover:bg-teal-100/80 dark:hover:bg-teal-900/40"
                  >
                    + Ya / Tidak
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-gray-500">Memuat...</p>
            ) : nodes.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Belum ada menu. Tambah &quot;Menu utama&quot; lalu isi judul, teks, dan pemicu (mis.{' '}
                <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">1</code>,{' '}
                <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">info pesantren</code>).
              </p>
            ) : (
              <div className="space-y-4">
                {nodes.map((n) => (
                  <div
                    key={n.id}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2 bg-gray-50/80 dark:bg-gray-900/40"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Judul (tampil di daftar)</label>
                        <input
                          type="text"
                          value={n.title}
                          onChange={(e) => updateNode(n.id, { title: e.target.value })}
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Induk (submenu)</label>
                        <select
                          value={n.parent_id ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            updateNode(n.id, { parent_id: v === '' ? null : Number(v) })
                          }}
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        >
                          <option value="">- Menu utama -</option>
                          {parentOptions
                            .filter((o) => o.id !== n.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Urutan (sort)</label>
                        <input
                          type="number"
                          value={n.sort_order}
                          onChange={(e) => updateNode(n.id, { sort_order: parseInt(e.target.value, 10) || 0 })}
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Aksi</label>
                        <select
                          value={n.action_type}
                          onChange={(e) => updateNode(n.id, { action_type: e.target.value })}
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        >
                          <option value="menu">Submenu / daftar pilihan</option>
                          <option value="reply">Hanya balas teks (daun)</option>
                          <option value="daftar_notif">Petunjuk daftar notifikasi (teks saja)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pemicu (koma)</label>
                        <input
                          type="text"
                          value={Array.isArray(n.triggers) ? n.triggers.join(', ') : ''}
                          onChange={(e) =>
                            updateNode(n.id, {
                              triggers: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="1, iya, info pesantren"
                          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Isi balasan (teks panjang)</label>
                      <textarea
                        value={n.body_text}
                        onChange={(e) => updateNode(n.id, { body_text: e.target.value })}
                        rows={4}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm font-mono"
                        placeholder="Teks yang dikirim saat pengguna memilih menu ini (jika ada submenu, teks ini ditampilkan di atas daftar pilihan)."
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => addNode(n.id)}
                        className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                      >
                        + Anak di bawah ini
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNode(n.id)}
                        className="text-sm text-red-600 dark:text-red-400 hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
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
