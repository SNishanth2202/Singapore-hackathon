import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? ''

const api = axios.create({
  baseURL,
  timeout: 75000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Propagate so callers can handle and fall back to mock data
    return Promise.reject(error)
  },
)

export default api
