import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        scan: resolve(import.meta.dirname, 'scan.html'),
        howItWorks: resolve(import.meta.dirname, 'how-it-works.html'),
        vendors: resolve(import.meta.dirname, 'vendors.html'),
        partner: resolve(import.meta.dirname, 'partner.html'),
        report: resolve(import.meta.dirname, 'report.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
        terms: resolve(import.meta.dirname, 'terms.html'),
      },
    },
  },
})
