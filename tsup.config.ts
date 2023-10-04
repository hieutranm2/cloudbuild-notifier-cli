import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['cjs'],
  dts: false,
  sourcemap: false,
  minify: true,
  clean: true,
  splitting: false,
  target: 'es6',
  outDir: 'dist',
})
