import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'RedactEye',
    description: 'Privacy-preserving browser visual agent',
    version: '0.1.0',
    permissions: ['sidePanel'],
    action: {
      default_title: 'Open RedactEye Side Panel',
    },
  },
});
