/// <reference types="vitest/config" />
import { createRequire } from 'node:module'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

export default defineConfig(async ({ mode }) => {
  const plugins: PluginOption[] = [react()]
  const isVitest = mode === 'test' || process.env.VITEST === 'true'

  if (!isVitest) {
    const tailwindPackage = '@tailwindcss' + '/vite'
    const { default: tailwindcss } = require(tailwindPackage) as { default: () => PluginOption }
    plugins.push(tailwindcss())
  }

  return {
    plugins,
	  server: {
    port: 10020,
    strictPort: true,
  },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
