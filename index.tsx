
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  console.error("Erro fatal na inicialização:", error);
  rootElement.innerHTML = `
    <div style="padding: 24px; color: #7f1d1d; background: #fef2f2; font-family: sans-serif; text-align: center; border-radius: 16px; margin: 20px auto; max-width: 500px; border: 1px solid #fca5a5;">
      <h3 style="margin-top: 0; font-size: 18px; font-weight: bold;">Erro ao carregar o aplicativo</h3>
      <p style="font-size: 14px; color: #991b1b;">Ocorreu uma falha na montagem inicial.</p>
      <pre style="text-align: left; background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #fca5a5; overflow: auto; font-size: 12px;">${error instanceof Error ? error.message : String(error)}</pre>
      <button onclick="localStorage.removeItem('assettrack_custom_firebase_config'); localStorage.setItem('assettrack_storage_mode', 'local'); window.location.reload()" style="margin-top: 12px; padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Recarregar em Modo Local</button>
    </div>
  `;
}

