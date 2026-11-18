import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/sweep.ts'],
  // Single-file bundles per entry: the published package must be self-contained
  // (see #20 — code-split chunks were missing from the 0.5.0 tarball).
  splitting: false,
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: true,
});
