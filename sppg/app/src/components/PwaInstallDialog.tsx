import { useEffect, useMemo, useState } from 'react'
import { uploadSppgPwaLogo, updateSppgProfile } from '../api/apiClient'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import { getSessionContext, getStoredUser, isSuperAdminRole, saveSession, getToken } from '../utils/auth'
import { gambarUrl } from '../utils/gambar'
import { applyDynamicManifest, buildInstallManifest } from '../utils/pwaBranding'

type Props = {
  open: boolean
  onClose: () => void
}

export default function PwaInstallDialog({ open, onClose }: Props) {
  const { promptInstall } = usePwaInstallPrompt()
  const ctx = getSessionContext()
  const sppg = ctx?.sppg ?? null
  const user = getStoredUser()
  const isSuperAdmin = isSuperAdminRole(user?.role)

  const defaultShortName = sppg?.pwa_short_name?.trim() || sppg?.nama_unit?.trim() || 'SPPG'
  const defaultLogoUrl = sppg?.pwa_logo_url || gambarUrl('icon/sppg.v3.u192.png')

  const [shortName, setShortName] = useState(defaultShortName)
  const [logoPreview, setLogoPreview] = useState(defaultLogoUrl)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoMime, setLogoMime] = useState('image/png')
  const [saveDefault, setSaveDefault] = useState(isSuperAdmin)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setShortName(defaultShortName)
    setLogoPreview(defaultLogoUrl)
    setLogoFile(null)
    setLogoMime('image/png')
    setSaveDefault(isSuperAdmin)
    setError('')
  }, [open, defaultShortName, defaultLogoUrl, isSuperAdmin])

  const logoBlobUrl = useMemo(() => {
    if (!logoFile) return null
    return URL.createObjectURL(logoFile)
  }, [logoFile])

  useEffect(() => {
    return () => {
      if (logoBlobUrl) URL.revokeObjectURL(logoBlobUrl)
    }
  }, [logoBlobUrl])

  const onPickLogo = (file: File | null) => {
    if (!file) return
    if (file.size > 512 * 1024) {
      setError('Logo maksimal 512 KB')
      return
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError('Logo harus PNG, JPG, atau WebP')
      return
    }
    setError('')
    setLogoFile(file)
    setLogoMime(file.type || 'image/png')
    setLogoPreview(URL.createObjectURL(file))
  }

  const install = async () => {
    const trimmed = shortName.trim()
    if (!trimmed) {
      setError('Nama aplikasi wajib diisi')
      return
    }
    if (trimmed.length > 64) {
      setError('Nama aplikasi maksimal 64 karakter')
      return
    }

    setBusy(true)
    setError('')

    try {
      let logoUrl = sppg?.pwa_logo_url ?? null

      if (saveDefault && isSuperAdmin && sppg) {
        const profileRes = await updateSppgProfile({
          nama_unit: sppg.nama_unit,
          nama_yayasan: sppg.nama_yayasan,
          alamat: sppg.alamat ?? undefined,
          telepon: sppg.telepon ?? undefined,
          email_kontak: sppg.email_kontak ?? undefined,
          pwa_short_name: trimmed,
        })
        if (!profileRes.success) {
          setError(profileRes.message || 'Gagal menyimpan nama default')
          setBusy(false)
          return
        }
        if (logoFile) {
          const logoRes = await uploadSppgPwaLogo(logoFile)
          if (!logoRes.success) {
            setError(logoRes.message || 'Gagal mengunggah logo')
            setBusy(false)
            return
          }
          logoUrl = logoRes.data?.sppg?.pwa_logo_url ?? logoUrl
        }
        const token = getToken()
        const u = getStoredUser()
        if (token && u && profileRes.data) {
          saveSession(token, u, {
            sppg: profileRes.data.sppg,
            subscription: profileRes.data.subscription,
            subscription_active: ctx?.subscription_active,
          })
        }
      }

      const manifest = buildInstallManifest({
        slug: sppg?.slug ?? 'sppg',
        namaUnit: sppg?.nama_unit ?? trimmed,
        shortName: trimmed,
        logoUrl: logoBlobUrl ? null : logoUrl,
        logoBlobUrl,
        logoMime,
      })
      applyDynamicManifest(manifest)

      const ok = await promptInstall()
      if (ok) onClose()
    } catch (err) {
      console.warn('[SPPG] PWA install:', err)
      setError('Gagal memulai instalasi')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface shadow-xl border border-line p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <img
            src={logoPreview}
            alt=""
            className="h-14 w-14 rounded-xl border border-line object-cover bg-surface-soft shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h2 id="pwa-install-title" className="text-base font-semibold text-ink">
              Install aplikasi
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Atur nama dan logo yang tampil di layar utama perangkat Anda.
            </p>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Nama aplikasi</span>
          <input
            className="ui-input w-full"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            maxLength={64}
            placeholder="Contoh: SPPG Jambesari"
          />
          <span className="text-[11px] text-muted">Maks. 12 karakter disarankan untuk ikon di layar utama.</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Logo aplikasi</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="ui-input w-full text-sm"
            onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
          />
          <span className="text-[11px] text-muted">PNG/JPG/WebP, maks. 512 KB. Disarankan persegi 512×512 px.</span>
        </label>

        {isSuperAdmin ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveDefault}
              onChange={(e) => setSaveDefault(e.target.checked)}
              className="rounded border-line"
            />
            Simpan sebagai default SPPG
          </label>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <button type="button" className="ui-btn-ghost flex-1" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className="ui-btn-primary flex-1" onClick={() => void install()} disabled={busy}>
            {busy ? 'Menyiapkan…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}
