import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? ''

const api = axios.create({
  baseURL,
  timeout: 75000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export default api
