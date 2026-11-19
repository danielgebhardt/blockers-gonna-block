import { defineConfig } from 'vitest/config';

import { readFileSync } from 'node:fs';
import { webApp } from './scripts/lib/webapp';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const run = process.env.GITHUB_RUN_NUMBER;

export default defineConfig({
  base: './',
  plugins: [webApp()],
  define: { __APP_VERSION__: JSON.stringify(run ? `1.0.${run}` : `${pkg.version}-dev`) },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60_000 },
});
