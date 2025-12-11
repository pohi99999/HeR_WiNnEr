/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string
  readonly GEMINI_API_KEY: string
  // több env változó itt...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
