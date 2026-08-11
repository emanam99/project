/**
 * import() dengan satu kali reload otomatis di dev bila deps Vite kedaluwarsa (504 Outdated Optimize Dep).
 */
export async function viteDynamicImport(importer) {
  try {
    return await importer()
  } catch (err) {
    const msg = String(err?.message || err)
    const outdated =
      msg.includes('Outdated Optimize Dep') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed')
    if (import.meta.env.DEV && outdated && !sessionStorage.getItem('vite_dep_reload')) {
      sessionStorage.setItem('vite_dep_reload', '1')
      window.location.reload()
      return new Promise(() => {})
    }
    sessionStorage.removeItem('vite_dep_reload')
    throw err
  }
}
