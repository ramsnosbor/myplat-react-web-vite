// Shim ESM: redireciona import default para named export do compat index.
// Evita o bug "var t=t()" do CJS interop do Rolldown ao importar es-toolkit/compat/throttle
export { throttle as default, throttle } from 'es-toolkit/compat'
