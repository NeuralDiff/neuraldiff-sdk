import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    vue: 'src/vue.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['react', 'vue'],
  noExternal: ['axios', 'ws', 'p-limit', 'sharp', 'pixelmatch', 'pngjs'],
  onSuccess: 'echo "Build completed successfully!"',
}); 