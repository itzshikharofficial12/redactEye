import { defineConfig } from 'wxt';
import path from 'path';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    resolve: {
      alias: {
        '@redact-eye/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
        '@redact-eye/browser-utils': path.resolve(__dirname, '../../packages/browser-utils/src'),
        '@redact-eye/privacy-engine': path.resolve(__dirname, '../../packages/privacy-engine/src'),
      },
    },
  }),
  manifest: {
    name: 'RedactEye',
    description: 'Privacy-preserving browser visual agent',
    version: '0.1.0',
    permissions: ['sidePanel', 'activeTab'],
    action: {
      default_title: 'Open RedactEye Side Panel',
    },
  },
});
