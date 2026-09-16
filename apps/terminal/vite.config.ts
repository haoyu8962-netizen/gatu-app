import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv, type Plugin, type PluginOption } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { lingui } from '@lingui/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import {
  createClientChunkGraph,
  removeClientChunkGraphFile,
  resolveClientChunkGraphCacheFile,
  writeClientChunkGraphFile,
} from '../../scripts/client-chunk-graph.mjs'
import { BUILD_META_PATH } from './src/config/api-paths'
import { type BuildMeta, createBuildMeta } from './src/config/build-meta'
import { createHashedChartLibraryEntryPath } from './src/config/chart-library'
import { DOCUMENT_ROUTE_PATHS } from './src/config/document-routes'
import { resolveMobilePairingFeatureFlags } from './src/config/mobile-pairing-flags'
import { chartingLibrarySecurityHeaders, referralJoinHeaders, securityHeaders } from './src/config/security-headers'
import { hashCatalogMessageIds } from './src/lib/i18n-catalog'
import { MOBILE_SYNC_TICKET_API_VERSION } from './src/lib/mobile-sync/one-time-ticket-policy'

// SPA mode: the build prerenders one static shell for every client-rendered application route
// and real HTML for the document routes, so the client output can be hosted without the Nitro
// server. The mask path must match an application surface whose routes are all `ssr: false`;
// `/` cannot be used because its server-side `beforeLoad` redirects.
export const SPA_SHELL_MASK_PATH = '/trade'
export const SPA_SHELL_OUTPUT_PATH = '/_shell'

export function createStartPrerenderPages() {
  return DOCUMENT_ROUTE_PATHS.map((path) => ({
    path,
    prerender: { enabled: true, crawlLinks: false },
  }))
}

export function createTanstackStartOptions() {
  return {
    spa: {
      enabled: true,
      maskPath: SPA_SHELL_MASK_PATH,
      prerender: { outputPath: SPA_SHELL_OUTPUT_PATH, crawlLinks: false },
    },
    pages: createStartPrerenderPages(),
    prerender: {
      enabled: true,
      crawlLinks: false,
      failOnError: true,
      autoStaticPathsDiscovery: false,
    },
  }
}

const isAnalyze = process.env.ANALYZE === 'true'
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const terminalDirectory = fileURLToPath(new URL('.', import.meta.url))
const clientChunkGraphCacheFile = resolveClientChunkGraphCacheFile(terminalDirectory)
const terminalPackage = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

function resolveBuildSha() {
  const environmentSha = process.env.GATU_BUILD_SHA?.trim() || process.env.GITHUB_SHA?.trim()
  if (environmentSha) return environmentSha

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'dev'
  }
}

function createClientChunkGraphPlugin(): Plugin {
  return {
    name: 'gatu-client-chunk-graph',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    buildStart() {
      removeClientChunkGraphFile(clientChunkGraphCacheFile)
    },
    writeBundle(_options, bundle) {
      writeClientChunkGraphFile(
        clientChunkGraphCacheFile,
        createClientChunkGraph(bundle, repositoryRoot),
      )
    },
  }
}

function createPresentationChunksPlugin(name: string, modules: string[]): Plugin {
  return {
    name,
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    buildStart(options) {
      const entries = typeof options.input === 'string'
        ? [options.input]
        : Array.isArray(options.input) ? options.input : Object.values(options.input)
      for (const module of modules) {
        this.emitFile({
          type: 'chunk',
          id: fileURLToPath(new URL(`./src/components/trade/${module}.tsx`, import.meta.url)),
          name: module.split('/').at(-1),
          preserveSignature: 'strict',
          implicitlyLoadedAfterOneOf: entries,
        })
      }
    },
  }
}

export function createOrderSummaryChunksPlugin(): Plugin {
  return createPresentationChunksPlugin('gatu-order-summary-chunks', [
    'tradebox/twap-order-summary',
    'tradebox/scale-order-summary',
  ])
}

export function createTerminalViewChunksPlugin(): Plugin {
  return createPresentationChunksPlugin('gatu-terminal-view-chunks', [
    'mobile/mobile-book-chrome-view',
    'market-overview-view',
  ])
}

const buildSha = resolveBuildSha()
const releaseId = process.env.GATU_RELEASE_ID?.trim() || 'local'
const buildTime = process.env.GATU_BUILD_TIME?.trim() || new Date().toISOString()
const chartLibraryEntryPath = fileURLToPath(new URL('./public/charting_library/charting_library.js', import.meta.url))
const chartLibraryEntry = existsSync(chartLibraryEntryPath) ? readFileSync(chartLibraryEntryPath) : undefined
// Names the immutable copy of the TradingView loader; see `config/chart-library.ts`.
const chartLibraryHash = chartLibraryEntry ? createHash('sha256').update(chartLibraryEntry).digest('hex').slice(0, 16) : ''

/** Only a build emits the hashed loader copy; the dev server serves the plain file, versioned by the commit query instead. */
export function resolveChartLibraryHashForCommand(command: 'build' | 'serve'): string {
  return command === 'build' ? chartLibraryHash : ''
}

export const buildIdentity = Object.freeze({
  version: terminalPackage.version,
  commit: buildSha,
  release: releaseId,
  builtAt: buildTime,
})

// The same build identity that the `/build-meta.json` server route reports, written as a static
// file so a CDN deployment without the Nitro server still exposes it. Flags come from the same
// `VITE_*` environment the client bundle sees for this mode.
export function createBuildMetaForMode(mode: string): BuildMeta {
  return createBuildMeta({
    version: terminalPackage.version,
    commit: buildSha,
    release: releaseId,
    builtAt: buildTime,
    ticketApiVersion: MOBILE_SYNC_TICKET_API_VERSION,
    pairing: resolveMobilePairingFeatureFlags(loadEnv(mode, terminalDirectory, 'VITE_')),
    chartLibraryHash,
  })
}

export function createBuildMetaPlugin(meta: BuildMeta): Plugin {
  return {
    name: 'gatu-build-meta',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: BUILD_META_PATH.slice(1), source: `${JSON.stringify(meta)}\n` })
      if (chartLibraryEntry && chartLibraryHash) {
        this.emitFile({ type: 'asset', fileName: createHashedChartLibraryEntryPath(chartLibraryHash), source: chartLibraryEntry })
      }
    },
  }
}

function createReferralJoinDevRequestGuard(): Plugin {
  return {
    name: 'gatu-referral-join-dev-request-guard',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split(/[?#]/, 1)[0] ?? ''
        if (pathname !== '/join' && !pathname.startsWith('/join/')) {
          next()
          return
        }
        try {
          decodeURI(pathname)
          next()
        } catch {
          response.statusCode = 404
          response.setHeader('cache-control', 'no-store')
          response.setHeader('content-type', 'text/plain; charset=utf-8')
          response.setHeader('referrer-policy', 'no-referrer')
          response.setHeader('x-robots-tag', 'noindex, nofollow')
          response.end('Not Found')
        }
      })
    },
  }
}

const compiledLinguiCatalogPattern =
  /^\/\*eslint-disable\*\/export const messages=JSON\.parse\((.+)\);?\s*$/s

export function compactLinguiCatalogModule(code: string) {
  const match = code.match(compiledLinguiCatalogPattern)
  if (!match?.[1]) throw new Error('Lingui emitted an unsupported catalog module')

  const serializedCatalog = JSON.parse(match[1]) as string
  const messages = JSON.parse(serializedCatalog) as Record<string, unknown>
  if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
    throw new Error('Lingui emitted an invalid message catalog')
  }

  const messageIds = Object.keys(messages)
  const compactMessages = messageIds.map((messageId) => messages[messageId])
  const serializedMessages = JSON.stringify(JSON.stringify(compactMessages))
  return `/*eslint-disable*/export const messages=JSON.parse(${serializedMessages});export const messageIdsHash=${hashCatalogMessageIds(messageIds)};`
}

function createCompactLinguiCatalogPlugin(): Plugin {
  return {
    name: 'gatu-compact-lingui-catalog',
    enforce: 'post',
    transform(code, id) {
      const pathname = id.replace(/\?.*$/, '').replaceAll('\\', '/')
      const localeMatch = pathname.match(/\/src\/locales\/([^/]+)\/messages\.po$/)
      if (!localeMatch || localeMatch[1] === 'en') return

      return { code: compactLinguiCatalogModule(code), map: null }
    },
  }
}

const tanstackChunkByPackage = new Map([
  ['query-core', 'vendor-tanstack-query'],
  ['query-persist-client-core', 'vendor-tanstack-query'],
  ['query-sync-storage-persister', 'vendor-tanstack-query'],
  ['react-query', 'vendor-tanstack-query'],
  ['react-query-persist-client', 'vendor-tanstack-query'],
  ['react-table', 'vendor-tanstack-table'],
  ['table-core', 'vendor-tanstack-table'],
  ['react-virtual', 'vendor-tanstack-virtual'],
  ['virtual-core', 'vendor-tanstack-virtual'],
])

function resolveTanstackChunk(id: string) {
  const packageName = id.match(/node_modules\/@tanstack\/([^/]+)/)?.[1]
  if (!packageName) return

  return tanstackChunkByPackage.get(packageName) ?? 'vendor-tanstack-router'
}

export function createManualChunks(id: string) {
  if (id.includes('node_modules')) {
    if (id.includes('@base-ui')) return 'vendor-base-ui'
    if (id.includes('@phosphor-icons/react')) return 'vendor-icons'
    if (id.includes('@radix-ui')) return 'vendor-radix'
    if (id.includes('@tanstack')) return resolveTanstackChunk(id)
    if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
  }
}

const config = defineConfig({
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
    'import.meta.env.VITE_GATU_APP_VERSION': JSON.stringify(terminalPackage.version),
    'import.meta.env.VITE_GATU_BUILD_SHA': JSON.stringify(buildSha),
    'import.meta.env.VITE_GATU_RELEASE_ID': JSON.stringify(releaseId),
    'import.meta.env.VITE_GATU_BUILD_TIME': JSON.stringify(buildTime),
  },
  server: {
    strictPort: true,
    headers: {
      'Cache-Control': 'no-cache',
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query', 'wagmi'],
  },
  optimizeDeps: {
    include: ['@lifi/sdk', '@tanstack/react-table', '@tanstack/react-virtual', '@privy-io/react-auth', '@privy-io/wagmi'],
  },
  build: {
    minify: 'terser',
    sourcemap: isAnalyze,
    terserOptions: {
      compress: { passes: 2 },
    },
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
    createReferralJoinDevRequestGuard(),
    createClientChunkGraphPlugin(),
    createOrderSummaryChunksPlugin(),
    createTerminalViewChunksPlugin(),
    nitro({
      compressPublicAssets: true,
      publicAssets: [
        {
          dir: './public/charting_library',
          baseURL: '/charting_library',
          maxAge: 0,
          fallthrough: false,
        },
      ],
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
        '/charting_library/bundles/**': {
          headers: { ...chartingLibrarySecurityHeaders, 'cache-control': 'public, max-age=31536000, immutable' },
        },
        '/tradingview-theme-*.css': {
          headers: { ...securityHeaders, 'cache-control': 'public, max-age=0, must-revalidate' },
        },
        '/sw.js': {
          headers: { ...securityHeaders, 'cache-control': 'no-store' },
        },
        '/build-meta.json': {
          headers: { ...securityHeaders, 'cache-control': 'no-store' },
        },
        '/join': {
          headers: referralJoinHeaders,
        },
        '/join/**': {
          headers: referralJoinHeaders,
        },
        '/mobile-agent-sync-ticket': {
          headers: {
            ...securityHeaders,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          },
        },
        '/mobile-agent-sync-ticket/**': {
          headers: {
            ...securityHeaders,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          },
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
    createCompactLinguiCatalogPlugin(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(createTanstackStartOptions()),
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

export default defineConfig(({ command, mode }) => ({
  ...config,
  define: {
    ...config.define,
    'import.meta.env.VITE_GATU_CHART_LIBRARY_HASH': JSON.stringify(resolveChartLibraryHashForCommand(command)),
  },
  plugins: [...(config.plugins ?? []), createBuildMetaPlugin(createBuildMetaForMode(mode))],
}))
