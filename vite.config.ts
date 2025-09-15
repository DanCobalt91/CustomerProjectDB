import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Update base for GitHub Pages repo deployment
export default defineConfig({
  base: '/CustomerProjectDB/',
  plugins: [react()],
})
