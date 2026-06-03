// Shim ESM: redireciona import default para named export do compat index.
// Evita o bug "var t=t()" do CJS interop do Rolldown ao importar es-toolkit/compat/range
export { range as default, range } from 'es-toolkit/compat'
