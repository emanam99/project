import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import ProfilLayout from './ProfilLayout'

const ProfilView = lazy(() => import('./ProfilView'))
const EditProfil = lazy(() => import('./EditProfil'))

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
  </div>
)

export default function ProfilIndex() {
  return (
    <ProfilLayout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route index element={<ProfilView />} />
          <Route path="edit" element={<EditProfil />} />
          <Route path="*" element={<Navigate to="/profil" replace />} />
        </Routes>
      </Suspense>
    </ProfilLayout>
  )
}
