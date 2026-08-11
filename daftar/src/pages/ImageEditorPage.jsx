import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import ImageEditor from '../components/ImageEditor/ImageEditor'
import { compressImage } from '../utils/imageCompression'

function ImageEditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [imageFile, setImageFile] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    // Ambil file dari state atau query params
    const stateFile = location.state?.file
    if (stateFile) {
      setImageFile(stateFile)
    } else {
      // Jika tidak ada file, kembali ke berkas
      navigate('/berkas')
    }
  }, [location, navigate])

  const handleSave = async (editedFile) => {
    setIsProcessing(true)
    try {
      console.log('Saving edited file:', editedFile.name, editedFile.size, 'bytes')
      
      // Kompres jika perlu
      const compressibleImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      const fileExtension = editedFile.name.split('.').pop()?.toLowerCase()
      const compressibleExtensions = ['jpg', 'jpeg', 'png', 'webp']
      const isCompressibleImage = 
        (compressibleImageTypes.includes(editedFile.type) || compressibleExtensions.includes(fileExtension)) &&
        editedFile.size > 512 * 1024
      
      let fileToUse = editedFile
      
      if (isCompressibleImage) {
        try {
          console.log('Compressing image...')
          fileToUse = await compressImage(editedFile, 0.5)
          console.log('Compressed:', fileToUse.name, fileToUse.size, 'bytes')
        } catch (err) {
          console.error('Error compressing image:', err)
          fileToUse = editedFile
        }
      }

      // Simpan file di sessionStorage untuk diambil di halaman berkas
      const fileData = {
        name: fileToUse.name,
        size: fileToUse.size,
        type: fileToUse.type || 'image/jpeg',
        lastModified: fileToUse.lastModified || Date.now()
      }
      
      console.log('Saving to sessionStorage:', fileData)
      
      // Convert file to base64 untuk disimpan
      const reader = new FileReader()
      reader.onload = () => {
        try {
          sessionStorage.setItem('editedImageData', reader.result)
          sessionStorage.setItem('editedImageMeta', JSON.stringify(fileData))
          
          // Cek halaman asal dari sessionStorage
          const returnPage = sessionStorage.getItem('editorReturnPage') || '/berkas'
          console.log('File saved to sessionStorage, navigating to', returnPage)
          
          navigate(returnPage, {
            state: {
              returnFromEditor: true
            }
          })
        } catch (err) {
          console.error('Error saving to sessionStorage:', err)
          alert('Gagal menyimpan file. Silakan coba lagi.')
          setIsProcessing(false)
        }
      }
      reader.onerror = () => {
        console.error('FileReader error')
        alert('Gagal membaca file. Silakan coba lagi.')
        setIsProcessing(false)
      }
      reader.readAsDataURL(fileToUse)
    } catch (error) {
      console.error('Error saving edited image:', error)
      alert('Gagal menyimpan gambar. Silakan coba lagi.')
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    // Cek halaman asal dari sessionStorage
    const returnPage = sessionStorage.getItem('editorReturnPage') || '/berkas'
    navigate(returnPage)
  }

  if (!imageFile) {
    return (
      <div className="fixed inset-0 min-h-screen w-full bg-gray-900 flex items-center justify-center z-[9999]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat gambar...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 min-h-screen w-full bg-gray-900 z-[9999] flex flex-col">
      <ImageEditor
        imageFile={imageFile}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  )
}

export default ImageEditorPage
