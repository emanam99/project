import { Link } from 'react-router-dom'
import { APP_VERSION } from '../../config/version'
import { getGambarUrl } from '../../config/images'

const APP_NAME = 'eBeddien'
const APP_SUBTITLE = 'Digital Service Center'
const DEVELOPER = 'Beddian IT'
const currentYear = new Date().getFullYear()

export default function InfoAplikasi() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-md mx-auto px-4 py-8 pb-24 flex flex-col items-center justify-center min-h-[70vh]">
        <img
          src={getGambarUrl('/icon/ebeddien192.png')}
          alt="Logo"
          className="w-24 h-24 mb-6 rounded-2xl object-contain shadow-lg"
        />
        <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400 text-center">
          {APP_NAME}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{APP_SUBTITLE}</p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Versi {APP_VERSION}
        </p>
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          © {currentYear}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          {DEVELOPER}
        </p>

        <div className="text-center mt-10 space-x-4">
          <Link to="/tentang" className="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            Tentang
          </Link>
          <Link to="/version" className="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            Versi
          </Link>
          <Link to="/" className="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            Beranda
          </Link>
        </div>
      </div>
    </div>
  )
}
