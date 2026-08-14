import { defineConfig } from 'tsdown'

/**
 * Self-contained transpile of `src/` to ESM `lib/` — no project references,
 * no type checking, no monorepo assumptions. This is what `prepare` runs
 * after a `dsh plugin --profile <name> add github:...` git install, so it must
 * work from a plain node_modules context.
 */
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/evidence-service.ts',
    'src/guard-service.ts',
    'src/governed-builder-skill.ts',
    'src/github-issue-provider.ts',
    'src/github-issue-authority-service.ts',
  ],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
})
