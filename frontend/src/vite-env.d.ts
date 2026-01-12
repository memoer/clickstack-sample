/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVICE_NAME: string;
  readonly VITE_OTEL_ENDPOINT: string;
  readonly VITE_HYPERDX_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
