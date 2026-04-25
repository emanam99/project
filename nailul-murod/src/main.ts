import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './style.css'

const root = document.getElementById('app')
if (!root) throw new Error('Root #app tidak ditemukan')

createRoot(root).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(BrowserRouter, { basename: import.meta.env.BASE_URL }, React.createElement(App))
  )
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
