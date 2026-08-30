/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Base API khusus OAuth Google (default localhost). */
  readonly VITE_OAUTH_API_URL?: string
  readonly VITE_APP_BASE?: string
  readonly VITE_GAMBAR_BASE?: string
  readonly VITE_TENANT_BASE_DOMAIN?: string
  readonly VITE_LANDING_HOST?: string
  readonly VITE_PLATFORM_ADMIN_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
