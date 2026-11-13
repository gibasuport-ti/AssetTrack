import React, { useState } from 'react';

interface CorporateDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

export const CorporateDistributionModal: React.FC<CorporateDistributionModalProps> = ({
  isOpen,
  onClose,
  darkMode,
}) => {
  const [activeTab, setActiveTab] = useState<'mobile' | 'channels' | 'entra' | 'compliance' | 'standalone'>('standalone');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedLocalPath, setCopiedLocalPath] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);

  if (!isOpen) return null;

  const currentUrl = window.location.origin;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const localFilePath = "C:\\Users\\Cirion\\Downloads\\coletor-qrcode---controle-de-ativos\\public\\cirion-coletor-standalone.html";

  const handleCopyLocalPath = () => {
    navigator.clipboard.writeText(localFilePath);
    setCopiedLocalPath(true);
    setTimeout(() => setCopiedLocalPath(false), 2500);
  };

  const handleDownloadStandalone = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch('/api/download-standalone-html');
      if (!res.ok) throw new Error('Servidor retornou erro: ' + res.status);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cirion-coletor-ativos-blindado.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.warn('Fallback para download padrão...', err);
      window.location.href = '/api/download-standalone-html';
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        id="corporate-distribution-dialog"
        className={`w-full max-w-3xl rounded-2xl shadow-2xl border flex flex-col max-h-[90vh] overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold tracking-tight">Distribuição &amp; Acesso Mobile</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  Cirion Mobile
                </span>
              </div>
              <p className="text-xs text-blue-100/80 mt-0.5">
                Instruções para abrir no celular, escanear QR Code e publicar no Microsoft 365
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-3 bg-slate-50 dark:bg-slate-800/40 text-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('standalone')}
            className={`pb-3 px-4 font-semibold border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'standalone'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <i className="fa-solid fa-file-code text-emerald-500"></i>
            <span>HTML Blindado (Offline / Qualquer PC)</span>
          </button>
          <button
            onClick={() => setActiveTab('mobile')}
            className={`pb-3 px-4 font-semibold border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'mobile'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <i className="fa-solid fa-mobile-screen-button"></i>
            <span>Acesso no Celular (QR Code)</span>
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`pb-3 px-4 font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'channels'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Canais (Teams, SharePoint, Edge)
          </button>
          <button
            onClick={() => setActiveTab('entra')}
            className={`pb-3 px-4 font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'entra'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Registro Azure Entra ID
          </button>
          <button
            onClick={() => setActiveTab('compliance')}
            className={`pb-3 px-4 font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'compliance'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Segurança &amp; Licença M365
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {activeTab === 'standalone' && (
            <div className="space-y-4">
              {/* Card Destaque: Download do HTML Blindado */}
              <div className="p-5 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50/80 to-blue-50/50 dark:from-emerald-950/20 dark:to-blue-950/20 shadow-md flex flex-col md:flex-row items-center justify-between gap-5">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wider">
                      Single-File Offline
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                      Arquivo HTML Completo &amp; Autônomo
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                    Baixe um único arquivo <strong>.html</strong> que roda em <strong>qualquer computador</strong> (Windows, Mac ou Linux) apenas com dois cliques no navegador. <strong>Sem precisar de Node.js, VS Code ou servidor instalado.</strong>
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <i className="fa-solid fa-shield-halved"></i> Anti-Força Bruta Ativo
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400 font-semibold">
                      <i className="fa-solid fa-hard-drive"></i> IndexedDB Permanente
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-purple-700 dark:text-purple-400 font-semibold">
                      <i className="fa-solid fa-key"></i> Zero Chaves de API Expostas
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={handleDownloadStandalone}
                    disabled={isDownloading}
                    className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] text-center cursor-pointer"
                  >
                    <i className={`fa-solid ${isDownloading ? 'fa-spinner fa-spin' : 'fa-download'} text-sm`}></i>
                    <span>{isDownloading ? 'Gerando Arquivo...' : 'Baixar HTML Blindado (.html)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowLivePreview(!showLivePreview)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors text-center cursor-pointer"
                  >
                    <i className={`fa-solid ${showLivePreview ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    <span>{showLivePreview ? 'Ocultar Teste Integrado' : 'Testar Aqui na Tela'}</span>
                  </button>
                </div>
              </div>

              {/* Se o usuário clicou para testar aqui na tela, exibe o iframe integrado */}
              {showLivePreview && (
                <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <i className="fa-solid fa-circle-check text-emerald-600"></i>
                      Ambiente Autônomo Carregado com Sucesso (PIN Padrão: 1234)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLivePreview(false)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      Fechar Visualização
                    </button>
                  </div>
                  <iframe
                    src="/cirion-coletor-standalone.html"
                    className="w-full h-[520px] rounded-lg border border-slate-300 dark:border-slate-700 shadow-inner bg-slate-900"
                    title="Pré-visualização do HTML Autônomo Blindado"
                  />
                </div>
              )}

              {/* Dica de Acesso Direto no Windows (Arquivo já existente no computador) */}
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
                    <i className="fa-solid fa-folder-open text-amber-600"></i>
                    <span>O arquivo já está salvo no seu computador Windows:</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLocalPath}
                    className="text-[11px] font-bold px-2 py-1 rounded bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 hover:bg-amber-300 transition-colors"
                  >
                    {copiedLocalPath ? '✓ Copiado!' : 'Copiar Caminho'}
                  </button>
                </div>
                <p className="text-[11px] font-mono bg-white/80 dark:bg-slate-900/80 p-2 rounded border border-amber-200 dark:border-amber-800/60 text-slate-800 dark:text-slate-200 break-all select-all">
                  {localFilePath}
                </p>
                <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  💡 <strong>Como abrir no Windows:</strong> Pressione <kbd className="px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-[10px] font-bold">Win + R</kbd>, cole o caminho acima e dê <strong>Enter</strong>. O arquivo abrirá direto no Edge ou Chrome sem precisar de VS Code, terminal ou conexão com internet!
                </p>
              </div>

              {/* Grid com os 3 Pilares de Blindagem e Persistência */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-sm">
                    <i className="fa-solid fa-lock"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs">Proteção Contra Força Bruta</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Bloqueio progressivo em tentativas incorretas de PIN (3 falhas acionam bloqueio de 30s, 60s até 5 minutos). O estado de bloqueio é persistido no disco e não é resetado com F5.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                    <i className="fa-solid fa-floppy-disk"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs">Persistência 100% Blindada</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Utiliza <code>navigator.storage.persist()</code> com <strong>IndexedDB nativo</strong> e espelhamento em LocalStorage. Os dados continuam salvos mesmo se o navegador fechar ou a máquina reiniciar.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                    <i className="fa-solid fa-shield-virus"></i>
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs">Zero Vazamento de Chaves</h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Nenhuma chave de API ou credencial estática fica salva no HTML. O scanner e o reconhecimento de etiquetas corporativas rodam por visão computacional e heurística local no navegador.
                  </p>
                </div>
              </div>

              {/* Dica de Uso */}
              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-2">
                <i className="fa-solid fa-lightbulb text-amber-500 text-sm shrink-0"></i>
                <span>
                  <strong>Como usar no dia a dia:</strong> Basta copiar o arquivo baixado para um pendrive ou pasta na rede interna. Qualquer colaborador pode dar dois cliques nele para cadastrar ativos, ler etiquetas com a webcam/câmera e exportar relatórios Excel.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'mobile' && (
            <div className="space-y-4">
              {/* Alerta de Como Abrir no Celular */}
              <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                  <i className="fa-solid fa-triangle-exclamation text-amber-600"></i>
                  <span>Atenção ao abrir no celular pelo ambiente de desenvolvimento</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11px]">
                  Se você estiver tentando abrir a URL privada de desenvolvimento (<strong>ais-dev-...</strong>) no celular, ela exige que o navegador do celular esteja logado na mesma conta Google.
                  Para que <strong>qualquer smartphone</strong> abra direto sem pedir login da Google, clique no botão <strong>"Share" (Compartilhar)</strong> no topo direito da plataforma para ativar o link público!
                </p>
              </div>

              {/* Card com QR Code e Link */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col md:flex-row items-center gap-6 shadow-sm">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-md">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(currentUrl)}`}
                      alt="QR Code para abrir no celular"
                      className="w-36 h-36"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Aponte a câmera do celular</span>
                </div>

                <div className="flex-1 space-y-3 text-left">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      Link Direto para Celulares e Coletores
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                      Envie para o WhatsApp ou abra no navegador Safari (iPhone) ou Chrome (Android):
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-100 dark:bg-slate-900 rounded-xl font-mono text-[11px] break-all border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400">
                    {currentUrl}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleCopyUrl}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all flex items-center gap-1.5 shadow"
                    >
                      <i className="fa-solid fa-copy"></i>
                      <span>{copiedUrl ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Link do Coletor de Ativos Cirion: ${currentUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all flex items-center gap-1.5 shadow"
                    >
                      <i className="fa-brands fa-whatsapp"></i>
                      <span>Enviar no WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Dica de PWA / Instalação no Celular */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <i className="fa-brands fa-apple text-base"></i>
                    <span>No iPhone (Safari)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Toque no botão de <strong>Compartilhar (ícone do quadrado com seta para cima)</strong> e selecione <strong>"Adicionar à Tela de Início"</strong>. O app funcionará em tela cheia como um aplicativo nativo.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <i className="fa-brands fa-android text-base text-emerald-600"></i>
                    <span>No Android (Chrome)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Toque nos <strong>3 pontinhos do menu</strong> e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>. Ele se tornará o coletor oficial do aparelho.
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    URL Corporativa da Aplicação
                  </span>
                  <p className="text-slate-500 dark:text-slate-400 font-mono text-xs mt-0.5">
                    {currentUrl}
                  </p>
                </div>
                <button
                  onClick={handleCopyUrl}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center space-x-1.5"
                >
                  {copiedUrl ? <span>✓ Copiado!</span> : <span>Copiar URL</span>}
                </button>
              </div>

              {/* Canal 1: Microsoft Teams */}
              <div className={`p-4 rounded-xl border space-y-2 ${
                darkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                    T
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    Opção 1: Guia no Microsoft Teams (Recomendado)
                  </h4>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Adicione o Coletor de Ativos diretamente em uma aba de canal do Teams para que os operadores de TI e inventário acessem sem sair do Teams:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 ml-2">
                  <li>No canal de TI ou Operações do Microsoft Teams, clique no botão <strong>(+) Adicionar uma guia</strong>.</li>
                  <li>Selecione o aplicativo nativo <strong>Site da Web</strong>.</li>
                  <li>Nomeie como <code>Controle de Ativos - Coletor</code> e cole a URL da aplicação.</li>
                  <li>Os colaboradores farão logon único pelo Entra ID com o Microsoft Authenticator.</li>
                </ol>
              </div>

              {/* Canal 2: SharePoint Modern Page Web Part */}
              <div className={`p-4 rounded-xl border space-y-2 ${
                darkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                    S
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    Opção 2: Incorporar no SharePoint (xyzlatam-my.sharepoint.com)
                  </h4>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Incorpore a aplicação em uma página moderna do SharePoint da intranet corporativa:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 ml-2">
                  <li>Acesse o site <code className="text-blue-600 dark:text-blue-400">https://xyzlatam-my.sharepoint.com/</code>.</li>
                  <li>Crie ou edite uma página e adicione a Web Part <strong>Incorporar (Embed)</strong>.</li>
                  <li>Cole o código: <code>&lt;iframe src="{currentUrl}" width="100%" height="800px" style="border:none" allow="camera"&gt;&lt;/iframe&gt;</code>.</li>
                  <li>Salve e publique. A câmera do coletor de código de barras funcionará de forma integrada.</li>
                </ol>
              </div>

              {/* Canal 3: Microsoft Edge Enterprise Managed App / Intune */}
              <div className={`p-4 rounded-xl border space-y-2 ${
                darkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold">
                    E
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    Opção 3: Aplicativo Gerenciado pelo Microsoft Edge / Intune
                  </h4>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Os administradores de Intune podem empacotar o aplicativo como PWA / Web App corporativo nos notebooks da empresa através de política do Microsoft Edge (Menu &gt; Aplicativos &gt; Instalar este site como aplicativo).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'entra' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  Configuração no Portal Azure / Entra ID (portal.azure.com)
                </h4>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Para habilitar a integração corporativa completa com Microsoft Authenticator e permissões do SharePoint:
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    1. Registro de Aplicativo (App Registration)
                  </span>
                  <p className="text-slate-500 dark:text-slate-400">
                    Acesse <strong>Microsoft Entra ID &gt; Registros de aplicativo &gt; Novo registro</strong>. Defina o nome como <code className="text-blue-600">Coletor de Ativos M365</code>.
                  </p>
                </div>

                <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    2. URIs de Redirecionamento (Web &amp; SPA)
                  </span>
                  <p className="text-slate-500 dark:text-slate-400">
                    Adicione na plataforma <strong>Web / SPA</strong> o endereço de callback:
                    <code className="block mt-1 p-1 bg-slate-100 dark:bg-slate-800 rounded font-mono text-blue-600 dark:text-blue-400">
                      {currentUrl}/auth/callback
                    </code>
                  </p>
                </div>

                <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    3. Permissões de API (Microsoft Graph)
                  </span>
                  <p className="text-slate-500 dark:text-slate-400">
                    Adicione as permissões delegadas e conceda consentimento do administrador:
                  </p>
                  <ul className="list-disc list-inside mt-1 text-slate-600 dark:text-slate-300">
                    <li><code>User.Read</code> - Leitura do perfil e validação com Microsoft Authenticator.</li>
                    <li><code>Sites.ReadWrite.All</code> - Leitura e gravação na lista do SharePoint.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compliance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 space-y-1">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Conformidade de Licença M365</span>
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Utiliza os serviços nativos já inclusos no licenciamento corporativo (SharePoint Online e Microsoft Entra ID), sem custos de bancos de dados externos.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/30 space-y-1">
                  <span className="font-bold text-blue-800 dark:text-blue-300 flex items-center space-x-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Proteção Total de Dados</span>
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Marca d'água corporativa em tela, proteção contra injeção de fórmulas no Excel/CSV, sanitização anti-XSS e auditoria completa de acessos.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Políticas de Acesso Condicional Aplicadas
                </span>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-400">
                  <li className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    <span><strong>MFA Obrigatório:</strong> Nenhum dado corporativo é acessado sem validação no Microsoft Authenticator.</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    <span><strong>Whitelisting de Domínio:</strong> Acesso restrito a <code>@ciriontechnologies.com</code>, <code>@ciriontelecom.com</code> e domínios corporativos autorizados.</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    <span><strong>Auto-Bloqueio por Inatividade:</strong> A sessão é protegida automaticamente após 15 minutos sem uso.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30">
          <div className="text-xs text-slate-500">
            Tenant Corporativo: <span className="font-mono text-slate-700 dark:text-slate-300">xyzlatam-my.sharepoint.com</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
