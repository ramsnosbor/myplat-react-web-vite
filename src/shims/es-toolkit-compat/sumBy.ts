// Shim ESM: redireciona import default para named export do compat index.
// Evita o bug "var t=t()" do CJS interop do Rolldown ao importar es-toolkit/compat/sumBy
export { sumBy as default, sumBy } from 'es-toolkit/compat'
