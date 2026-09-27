import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ['@napi-rs/image', 'node-unrar-js', '7zip-bin-full', '@electron/asar', 'xmllint-wasm'],
  },
});
