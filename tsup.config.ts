import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['cjs'],
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  splitting: true,
  target: 'es6',
  outDir: 'dist',
})
