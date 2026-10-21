import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

if (import.meta.env.VITE_DESKTOP === '1') {
  import('./fonts-offline.js')
  window.addEventListener('online', () => window.desktop?.refreshTeams?.().catch(() => {}))
}

createRoot(document.getElementById('root')).render(<App />)
