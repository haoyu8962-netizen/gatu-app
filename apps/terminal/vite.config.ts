import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, type PluginOption } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { lingui } from '@lingui/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import { chartingLibrarySecurityHeaders, securityHeaders } from './src/config/security-headers'

const isAnalyze = process.env.ANALYZE === 'true'
const terminalPackage = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

function resolveBuildSha() {
  const environmentSha = process.env.GATU_BUILD_SHA?.trim() || process.env.GITHUB_SHA?.trim()
  if (environmentSha) return environmentSha

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'dev'
  }
}

const buildSha = resolveBuildSha()
const releaseId = process.env.GATU_RELEASE_ID?.trim() || 'local'
const buildTime = process.env.GATU_BUILD_TIME?.trim() || new Date().toISOString()

function createManualChunks(id: string) {
  if (id.includes('node_modules')) {
    if (id.includes('@base-ui')) return 'vendor-base-ui'
    if (id.includes('@phosphor-icons/react')) return 'vendor-icons'
    if (id.includes('@radix-ui')) return 'vendor-radix'
    if (id.includes('@tanstack')) return 'vendor-tanstack'
    if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
  }
}

const config = defineConfig({
  define: {
    'import.meta.env.VITE_GATU_APP_VERSION': JSON.stringify(terminalPackage.version),
    'import.meta.env.VITE_GATU_BUILD_SHA': JSON.stringify(buildSha),
    'import.meta.env.VITE_GATU_RELEASE_ID': JSON.stringify(releaseId),
    'import.meta.env.VITE_GATU_BUILD_TIME': JSON.stringify(buildTime),
  },
  server: {
    strictPort: false,
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query', 'wagmi'],
  },
  optimizeDeps: {
    include: ['@lifi/sdk', '@tanstack/react-table', '@tanstack/react-virtual', '@privy-io/react-auth', '@privy-io/wagmi'],
  },
  build: {
    sourcemap: isAnalyze,
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks: createManualChunks,
          },
        },
      },
    },
  },
  plugins: [
    nitro({
      compressPublicAssets: true,
      routeRules: {
        '/**': {
          headers: securityHeaders,
        },
        '/assets/**': {
          headers: { ...securityHeaders, 'cache-control': 'public, max-age=31536000, immutable' },
        },
        '/charting_library/**': {
          headers: { ...chartingLibrarySecurityHeaders, 'cache-control': 'public, max-age=0, must-revalidate' },
        },
        '/tradingview-theme.css': {
          headers: { ...securityHeaders, 'cache-control': 'public, max-age=0, must-revalidate' },
        },
        '/build-meta.json': {
          headers: { ...securityHeaders, 'cache-control': 'no-store' },
        },
        '/mobile-agent-sync': {
          headers: {
            ...securityHeaders,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          },
        },
        '/mobile-agent-sync/': {
          headers: {
            ...securityHeaders,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          },
        },
      },
    }),
    lingui(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: ['@lingui/babel-plugin-lingui-macro', 'babel-plugin-react-compiler'],
      },
    }),
    isAnalyze &&
      (visualizer({
        filename: 'dist/stats.html',
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }) as PluginOption),
  ].filter(Boolean),
})

export default config
