import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyDisplayPrefsToDocument, loadDisplayPrefs } from '@/lib/displayPrefs';
import App from './App';
import './index.css';

applyDisplayPrefsToDocument(loadDisplayPrefs());

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // 忽略離線註冊失敗
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
