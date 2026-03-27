import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { authAPI } from '../services/api'

export { browserSupportsWebAuthn }

/**
 * Daftarkan passkey untuk akun yang sedang login (Bearer JWT).
 * @returns {Promise<void>}
 */
export async function registerPasskey() {
  if (!browserSupportsWebAuthn()) {
    throw new Error('Perangkat atau browser ini tidak mendukung passkey / WebAuthn.')
  }
  const optRes = await authAPI.webauthnRegisterOptions()
  if (!optRes.success || !optRes.data?.options || !optRes.data?.challengeId) {
    throw new Error(optRes.message || 'Gagal memulai pendaftaran passkey.')
  }
  const credential = await startRegistration({ optionsJSON: optRes.data.options })
  const verifyRes = await authAPI.webauthnRegisterVerify(optRes.data.challengeId, credential)
  if (!verifyRes.success) {
    throw new Error(verifyRes.message || 'Verifikasi passkey gagal.')
  }
}
