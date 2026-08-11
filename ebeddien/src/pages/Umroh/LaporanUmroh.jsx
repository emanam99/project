import { motion } from 'framer-motion'

function LaporanUmroh() {
  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
              <h1 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-4">
                Laporan Umroh
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Halaman ini sedang dalam pengembangan
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default LaporanUmroh

