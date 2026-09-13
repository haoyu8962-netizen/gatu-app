import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { buildIdentity } from './vite.config'

// Bundles the same-origin API handlers (`/api/geo`, `/api/referral-geo`, `/api/client-error-report`,
// `/api/leaderboard`) into one self-contained Node module for an AWS Lambda function URL. It shares
// the build identity with the client bundle so `release`/`commit` in error reports match.
export default defineConfig({
  define: {
    'import.meta.env.VITE_GATU_APP_VERSION': JSON.stringify(buildIdentity.version),
    'import.meta.env.VITE_GATU_BUILD_SHA': JSON.stringify(buildIdentity.commit),
    'import.meta.env.VITE_GATU_RELEASE_ID': JSON.stringify(buildIdentity.release),
    'import.meta.env.VITE_GATU_BUILD_TIME': JSON.stringify(buildIdentity.builtAt),
  },
  publicDir: false,
  plugins: [viteTsConfigPaths({ projects: ['./tsconfig.json'] })],
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/edge/lambda-handler.ts',
    outDir: 'dist-lambda',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: 'index.mjs', format: 'es' } },
  },
})
