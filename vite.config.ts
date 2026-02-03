import { defineConfig } from 'vite'

// GitHub Pages serves sites from a sub-path: https://<user>.github.io/<repo>/
// We make the base path configurable for CI (and still default to root for local dev).
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
})
