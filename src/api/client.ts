import axios from 'axios'
import Cookies from 'js-cookie'

// ─── Instância base do axios ──────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request interceptor: injeta Bearer token ─────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('myplat_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response interceptor: 401 → redireciona ao login ────────────────────────

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Limpa cookie e redireciona
      Cookies.remove('myplat_token')
      // Redireciona sem depender do React Router (funciona fora de componentes)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
