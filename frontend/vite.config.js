import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function copyAssetDir() {
  let config;

  return {
    name: 'copy-asset-dir',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    closeBundle() {
      const sourceDir = resolve(config.root, 'asset');
      if (!existsSync(sourceDir)) return;

      cpSync(sourceDir, resolve(config.root, config.build.outDir, 'asset'), {
        recursive: true
      });
    }
  };
}

// Sur GitHub Pages le site est servi depuis /emoji-shooter/.
// En local (dev ou build) on garde la racine "/".
const base = process.env.GITHUB_PAGES === 'true' ? '/emoji-shooter/' : '/';

export default defineConfig({
  base,
  build: {
    assetsDir: 'asset'
  },
  plugins: [svelte(), copyAssetDir()]
});
