import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  // loadEnv sem prefixo VITE_ para ler as vars de proxy (server-side only)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        // Shims ESM para es-toolkit/compat: evitam o bug "var t=t()" do CJS interop do Rolldown.
        // Recharts importa essas funções via CJS wrappers (es-toolkit/compat/*.js),
        // que causam colisão de nomes após minificação. Os shims redirecionam para .mjs puros.
        ...['get', 'isPlainObject', 'last', 'maxBy', 'minBy', 'omit', 'range', 'sortBy', 'sumBy', 'throttle', 'uniqBy'].map(fn => ({
          find: `es-toolkit/compat/${fn}`,
          replacement: path.resolve(__dirname, `./src/shims/es-toolkit-compat/${fn}.ts`),
        })),
      ],
    },

    // Garante que dependências CJS de recharts (es-toolkit/compat) sejam
    // pré-bundladas pelo esbuild, evitando o bug "var t=t()" do Rollup.
    define: {
      global: 'globalThis',
    },

    optimizeDeps: {
      include: [
        'recharts',
        'es-toolkit',
        'es-toolkit/compat',
        'react-pivottable',
        'react-pivottable/PivotTableUI',
        'react-pivottable/TableRenderers',
        'react-pivottable/Utilities',
      ],
    },

    server: {
      proxy: {
        // /proxy/sso/** → https://apisso.myplat.com.br/sso/**
        '/proxy/sso': {
          target: env.PROXY_SSO_TARGET,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/sso/, '/sso'),
        },
        // /proxy/api/** → https://api.myplat.net.br/pfs/**
        '/proxy/api': {
          target: env.PROXY_API_TARGET,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/api/, '/pfs'),
        },
        // /proxy/nfe/** → https://apinfe.myplat.net.br/nfe/**
        '/proxy/nfe': {
          target: env.PROXY_NFE_TARGET,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/proxy\/nfe/, '/nfe'),
        },
      },
    },
  }
})
