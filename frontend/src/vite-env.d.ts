/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HYPERDX_API_KEY: string
  readonly VITE_OTEL_ENDPOINT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
