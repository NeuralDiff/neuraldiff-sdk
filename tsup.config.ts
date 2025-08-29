import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  external: ['react', 'vue'],
  banner: {
    js: '/* NeuralDiff SDK - AI-powered visual regression testing */',
  },
  esbuildOptions(options) {
    options.conditions = ['module'];
  },
});