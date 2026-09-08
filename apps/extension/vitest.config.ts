import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@redact-eye/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@redact-eye/browser-utils': path.resolve(__dirname, '../../packages/browser-utils/src'),
    },
  },
});
