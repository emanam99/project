import { motion, AnimatePresence } from 'framer-motion'

/**
 * Kategori & Pendidikan Section Component
 * Menampilkan form untuk kategori dan pendidikan santri.
 * Kategori dari tabel daerah; Daerah/Kamar dari API (select); Diniyah/Formal dari rombel (select).
 *
 * @param {object} props.sectionRef - Ref untuk section
 * @param {object} props.formData - Data form (termasuk id_kamar, id_daerah, id_diniyah, id_formal, kategori, diniyah, formal, kelas_*, kel_*)
 * @param {function} props.onFieldChange - (field, value) => void
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - (field) => void
 * @param {function} props.onBlur - () => void
 * @param {function} props.getLabelClassName - (field) => string
 * @param {string[]} props.kategoriOptions - Opsi kategori dari API (tabel daerah)
 * @param {Array<{id, kategori, daerah}>} props.daerahOptions - Opsi daerah (filter by kategori)
 * @param {Array<{id, id_daerah, kamar}>} props.kamarOptions - Opsi kamar (filter by id_daerah)
 * @param {Array<{id, nama}>} props.lembagaDiniyahOptions - Opsi lembaga kategori Diniyah
 * @param {Array<{id, nama}>} props.lembagaFormalOptions - Opsi lembaga kategori Formal
 * @param {string[]} props.kelasDiniyahOptions - Opsi kelas untuk lembaga diniyah terpilih
 * @param {string[]} props.kelasFormalOptions - Opsi kelas untuk lembaga formal terpilih
 * @param {Array<{id, kel}>} props.kelDiniyahOptions - Opsi kel (rombel) untuk lembaga+kelas diniyah
 * @param {Array<{id, kel}>} props.kelFormalOptions - Opsi kel (rombel) untuk lembaga+kelas formal
 */
function KategoriPendidikanSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  kategoriOptions = [],
  daerahOptions = [],
  kamarOptions = [],
  lembagaDiniyahOptions = [],
  lembagaFormalOptions = [],
  kelasDiniyahOptions = [],
  kelasFormalOptions = [],
  kelDiniyahOptions = [],
  kelFormalOptions = []
}) {
  const handleKategoriChange = (value) => {
    onFieldChange('kategori', value)
    onFieldChange('id_daerah', '')
    onFieldChange('id_kamar', '')
  }

  const handleDaerahChange = (value) => {
    const idDaerah = value === '' ? '' : Number(value)
    onFieldChange('id_daerah', idDaerah)
    onFieldChange('id_kamar', '')
  }

  const handleKamarChange = (value) => {
    const idKamar = value === '' ? '' : Number(value)
    onFieldChange('id_kamar', idKamar)
  }

  const handleLembagaDiniyahChange = (value) => {
    onFieldChange('lembaga_diniyah', value)
    onFieldChange('kelas_diniyah', '')
    onFieldChange('kel_diniyah', '')
    onFieldChange('id_diniyah', '')
  }

  const handleKelasDiniyahChange = (value) => {
    onFieldChange('kelas_diniyah', value)
    onFieldChange('kel_diniyah', '')
    onFieldChange('id_diniyah', '')
  }

  const handleKelDiniyahChange = (e) => {
    const id = e.target.value === '' ? '' : Number(e.target.value)
    onFieldChange('id_diniyah', id)
    const row = kelDiniyahOptions.find((r) => Number(r.id) === id)
    onFieldChange('kel_diniyah', row ? (row.kel ?? '') : '')
  }

  const handleLembagaFormalChange = (value) => {
    onFieldChange('lembaga_formal', value)
    onFieldChange('kelas_formal', '')
    onFieldChange('kel_formal', '')
    onFieldChange('id_formal', '')
  }

  const handleKelasFormalChange = (value) => {
    onFieldChange('kelas_formal', value)
    onFieldChange('kel_formal', '')
    onFieldChange('id_formal', '')
  }

  const handleKelFormalChange = (e) => {
    const id = e.target.value === '' ? '' : Number(e.target.value)
    onFieldChange('id_formal', id)
    const row = kelFormalOptions.find((r) => Number(r.id) === id)
    onFieldChange('kel_formal', row ? (row.kel ?? '') : '')
  }

  const handleTidakSekolahDiniyahChange = (checked) => {
    onFieldChange('tidak_sekolah_diniyah', checked)
    if (checked) {
      onFieldChange('lembaga_diniyah', '')
      onFieldChange('kelas_diniyah', '')
      onFieldChange('kel_diniyah', '')
      onFieldChange('id_diniyah', '')
      onFieldChange('nim_diniyah', '')
    }
  }

  const handleTidakSekolahFormalChange = (checked) => {
    onFieldChange('tidak_sekolah_formal', checked)
    if (checked) {
      onFieldChange('lembaga_formal', '')
      onFieldChange('kelas_formal', '')
      onFieldChange('kel_formal', '')
      onFieldChange('id_formal', '')
      onFieldChange('nim_formal', '')
    }
  }

  const tidakSekolahDiniyah = !!formData.tidak_sekolah_diniyah
  const tidakSekolahFormal = !!formData.tidak_sekolah_formal

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Kategori & Pendidikan
      </h3>

      {/* Status Santri */}
      <div className="mb-4">
        <label className={getLabelClassName('status_santri')}>
          Status Santri
        </label>
        <select
          value={formData.status_santri}
          onChange={(e) => onFieldChange('status_santri', e.target.value)}
          onFocus={() => onFocus('status_santri')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Status Santri</option>
          <option value="Mukim">Mukim</option>
          <option value="Khoriji">Khoriji</option>
          <option value="Boyong">Boyong</option>
          <option value="Guru Tugas">Guru Tugas</option>
          <option value="Pengurus">Pengurus</option>
        </select>
      </div>

      {/* Kategori - dari tabel daerah (tidak tergantung status_santri) */}
      <div className="mb-4">
        <label className={getLabelClassName('kategori')}>
          Kategori
        </label>
        <select
          value={formData.kategori}
          onChange={(e) => handleKategoriChange(e.target.value)}
          onFocus={() => onFocus('kategori')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Kategori</option>
          {kategoriOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Daerah & Kamar - hanya tampil jika status santri Mukim (nilai tetap disimpan) */}
      {formData.status_santri === 'Mukim' && (
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className={getLabelClassName('daerah')}>
              Daerah
            </label>
            <select
              value={formData.id_daerah ?? ''}
              onChange={(e) => handleDaerahChange(e.target.value)}
              onFocus={() => onFocus('id_daerah')}
              onBlur={onBlur}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            >
              <option value="">Pilih Daerah</option>
              {daerahOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.daerah}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className={getLabelClassName('kamar')}>
              Kamar
            </label>
            <select
              value={formData.id_kamar ?? ''}
              onChange={(e) => handleKamarChange(e.target.value)}
              onFocus={() => onFocus('id_kamar')}
              onBlur={onBlur}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              disabled={!formData.id_daerah}
            >
              <option value="">Pilih Kamar</option>
              {kamarOptions.map((k) => (
                <option key={k.id} value={k.id}>{k.kamar}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Diniyah: centang Tidak Sekolah atau pilih Diniyah → Kelas → Kel */}
      <div className="mb-4 mt-10">
        <div className="flex items-center gap-3 mb-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tidakSekolahDiniyah}
              onChange={(e) => handleTidakSekolahDiniyahChange(e.target.checked)}
              onFocus={() => onFocus('tidak_sekolah_diniyah')}
              onBlur={onBlur}
              className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500 dark:bg-gray-700"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak Sekolah (Diniyah)</span>
          </label>
        </div>
        <AnimatePresence initial={false}>
          {!tidakSekolahDiniyah && (
            <motion.div
              key="diniyah-content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-1">
                <div className="flex gap-4 flex-nowrap">
                  <div className="flex-1 min-w-0">
                    <label className={getLabelClassName('lembaga_diniyah')}>
                      Diniyah
                    </label>
                    <select
                      value={formData.lembaga_diniyah ?? ''}
                      onChange={(e) => handleLembagaDiniyahChange(e.target.value)}
                      onFocus={() => onFocus('lembaga_diniyah')}
                      onBlur={onBlur}
                      className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Pilih Diniyah</option>
                  {lembagaDiniyahOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className={getLabelClassName('kelas_diniyah')}>
                  Kelas
                </label>
                <select
                  value={formData.kelas_diniyah ?? ''}
                  onChange={(e) => handleKelasDiniyahChange(e.target.value)}
                  onFocus={() => onFocus('kelas_diniyah')}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  disabled={!formData.lembaga_diniyah}
                >
                  <option value="">Pilih Kelas</option>
                  {kelasDiniyahOptions.map((k) => (
                    <option key={k} value={k}>{k || '-'}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className={getLabelClassName('kel_diniyah')}>
                  Kel
                </label>
                <select
                  value={formData.id_diniyah ?? ''}
                  onChange={handleKelDiniyahChange}
                  onFocus={() => onFocus('id_diniyah')}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  disabled={!formData.lembaga_diniyah || !formData.kelas_diniyah}
                >
                  <option value="">Pilih Kel</option>
                  {kelDiniyahOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="max-w-xs">
              <label className={getLabelClassName('nim_diniyah')}>
                NIM
              </label>
              <input
                type="text"
                value={formData.nim_diniyah}
                onChange={(e) => onFieldChange('nim_diniyah', e.target.value)}
                onFocus={() => onFocus('nim_diniyah')}
                onBlur={onBlur}
                className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
                placeholder="NIM Diniyah"
              />
            </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Formal: centang Tidak Sekolah atau pilih Formal → Kelas → Kel */}
      <div className="mb-4 mt-10">
        <div className="flex items-center gap-3 mb-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tidakSekolahFormal}
              onChange={(e) => handleTidakSekolahFormalChange(e.target.checked)}
              onFocus={() => onFocus('tidak_sekolah_formal')}
              onBlur={onBlur}
              className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500 dark:bg-gray-700"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak Sekolah (Formal)</span>
          </label>
        </div>
        <AnimatePresence initial={false}>
          {!tidakSekolahFormal && (
            <motion.div
              key="formal-content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-1">
                <div className="flex gap-4 flex-nowrap">
                  <div className="flex-1 min-w-0">
                    <label className={getLabelClassName('lembaga_formal')}>
                      Formal
                    </label>
                    <select
                      value={formData.lembaga_formal ?? ''}
                      onChange={(e) => handleLembagaFormalChange(e.target.value)}
                      onFocus={() => onFocus('lembaga_formal')}
                      onBlur={onBlur}
                      className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Pilih Formal</option>
                  {lembagaFormalOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className={getLabelClassName('kelas_formal')}>
                  Kelas
                </label>
                <select
                  value={formData.kelas_formal ?? ''}
                  onChange={(e) => handleKelasFormalChange(e.target.value)}
                  onFocus={() => onFocus('kelas_formal')}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  disabled={!formData.lembaga_formal}
                >
                  <option value="">Pilih Kelas</option>
                  {kelasFormalOptions.map((k) => (
                    <option key={k} value={k}>{k || '-'}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className={getLabelClassName('kel_formal')}>
                  Kel
                </label>
                <select
                  value={formData.id_formal ?? ''}
                  onChange={handleKelFormalChange}
                  onFocus={() => onFocus('id_formal')}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  disabled={!formData.lembaga_formal || !formData.kelas_formal}
                >
                  <option value="">Pilih Kel</option>
                  {kelFormalOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="max-w-xs">
              <label className={getLabelClassName('nim_formal')}>
                NIM
              </label>
              <input
                type="text"
                value={formData.nim_formal}
                onChange={(e) => onFieldChange('nim_formal', e.target.value)}
                onFocus={() => onFocus('nim_formal')}
                onBlur={onBlur}
                className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
                placeholder="NIM Formal"
              />
            </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* LTTQ */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className={getLabelClassName('lttq')}>
            LTTQ
          </label>
          <select
            value={formData.lttq}
            onChange={(e) => onFieldChange('lttq', e.target.value)}
            onFocus={() => onFocus('lttq')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          >
            <option value="">Pilih LTTQ</option>
            <option value="Asfal">Asfal</option>
            <option value="Ibtidaiyah">Ibtidaiyah</option>
            <option value="Tsanawiyah">Tsanawiyah</option>
            <option value="Aliyah">Aliyah</option>
            <option value="Mualim">Mualim</option>
            <option value="Ngaji Kitab">Ngaji Kitab</option>
            <option value="Tidak Mengaji">Tidak Mengaji</option>
          </select>
        </div>
        <div>
          <label className={getLabelClassName('kelas_lttq')}>
            Kelas
          </label>
          <input
            type="text"
            value={formData.kelas_lttq}
            onChange={(e) => onFieldChange('kelas_lttq', e.target.value)}
            onFocus={() => onFocus('kelas_lttq')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
            style={{ width: '3.5em' }}
          />
        </div>
        <div>
          <label className={getLabelClassName('kel_lttq')}>
            Kel
          </label>
          <input
            type="text"
            value={formData.kel_lttq}
            onChange={(e) => onFieldChange('kel_lttq', e.target.value)}
            onFocus={() => onFocus('kel_lttq')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
            style={{ width: '3.5em' }}
          />
        </div>
      </div>
    </div>
  )
}

export default KategoriPendidikanSection
