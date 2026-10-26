import { defineConfig } from 'tsup';

// Bundle the workspace packages (they ship as TypeScript source); keep real dependencies external.
export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate-cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: [/^@saathi\//],
  // SQL migrations are read at runtime from this folder next to the bundle.
  onSuccess: 'node -e "require(\'fs\').cpSync(\'src/db/migrations\',\'dist/migrations\',{recursive:true})"',
});
