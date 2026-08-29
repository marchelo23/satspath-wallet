import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@satspath/resolvers': path.resolve(__dirname, './packages/resolvers/src/index.ts'),
      '@satspath/router': path.resolve(__dirname, './packages/router/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    testTimeout: 15000,
    exclude: ['**/e2e/**', '**/node_modules/**'],
  },
})
