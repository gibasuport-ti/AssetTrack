
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Erro fatal na inicialização:", error);
  rootElement.innerHTML = `
    <div style="padding: 20px; color: #7f1d1d; background: #fef2f2; font-family: sans-serif; text-align: center;">
      <h3>Ocorreu um erro ao carregar o aplicativo</h3>
      <p>Verifique o console do navegador para mais detalhes.</p>
      <pre style="text-align: left; background: #fff; padding: 10px; border: 1px solid #fca5a5; overflow: auto;">${error instanceof Error ? error.message : String(error)}</pre>
      <button onclick="window.location.reload()" style="margin-top: 10px; padding: 10px 20px; cursor: pointer;">Recarregar</button>
    </div>
  `;
}
