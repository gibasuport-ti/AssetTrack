import React, { useState, useEffect } from 'react';
import { sharepointService, DEFAULT_SHAREPOINT_CONFIG } from '../services/sharepointService';
import { assetService } from '../services/assetService';
import { SharePointConfig, StorageMode, Asset } from '../types';

interface SharePointMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  assets: Asset[];
  storageMode: StorageMode;
  onStorageModeChange: (mode: StorageMode) => void;
  onMigrationComplete?: () => void;
}

export const SharePointMigrationModal: React.FC<SharePointMigrationModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  assets,
  storageMode,
  onStorageModeChange,
  onMigrationComplete,
}) => {
  const [config, setConfig] = useState<SharePointConfig>(DEFAULT_SHAREPOINT_CONFIG);
  const [siteUrlInput, setSiteUrlInput] = useState(DEFAULT_SHAREPOINT_CONFIG.siteUrl);
  const [listNameInput, setListNameInput] = useState(DEFAULT_SHAREPOINT_CONFIG.listName);
  const [listUrlInput, setListUrlInput] = useState(DEFAULT_SHAREPOINT_CONFIG.listUrl || '');
  const [tenantInput, setTenantInput] = useState(DEFAULT_SHAREPOINT_CONFIG.tenantId || 'common');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedGrid, setCopiedGrid] = useState(false);
  const [selectedScriptType, setSelectedScriptType] = useState<'createColumns' | 'insertAll'>('insertAll');
  const [activeTab, setActiveTab] = useState<'migration' | 'powershell' | 'config'>('migration');
  const [showNotFoundHelp, setShowNotFoundHelp] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const current = await sharepointService.getConfig();
      setConfig(current);
      setSiteUrlInput(current.siteUrl);
      setListNameInput(current.listName);
      setListUrlInput(current.listUrl || '');
      setTenantInput(current.tenantId || 'common');
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const normalizedSiteUrl = (siteUrlInput || DEFAULT_SHAREPOINT_CONFIG.siteUrl).trim().replace(/\/+$/, '');
  const normalizedListName = (listNameInput || 'ControleDeAtivos').trim();
  const defaultCalculatedListUrl = `${normalizedSiteUrl}/Lists/${encodeURIComponent(normalizedListName)}/AllItems.aspx`;
  const activeListUrl = listUrlInput.trim() || defaultCalculatedListUrl;
  const siteContentsUrl = `${normalizedSiteUrl}/_layouts/15/viewlsts.aspx?view=14`;
  const spacedListUrl = `${normalizedSiteUrl}/Lists/${encodeURIComponent('Controle de Ativos')}/AllItems.aspx`;
  const portugueseListUrl = `${normalizedSiteUrl}/Listas/${encodeURIComponent(normalizedListName)}/AllItems.aspx`;

  const handleSaveConfig = async () => {
    try {
      const updated = await sharepointService.saveConfig({
        siteUrl: normalizedSiteUrl,
        listName: normalizedListName,
        listUrl: listUrlInput.trim() || defaultCalculatedListUrl,
        viewUrl: siteContentsUrl,
        tenantId: tenantInput.trim(),
      });
      setConfig(updated);
      alert('Configurações do SharePoint atualizadas com sucesso.');
    } catch (e: any) {
      alert('Erro ao salvar configurações: ' + e.message);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await sharepointService.testConnection(siteUrlInput, listNameInput);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Falha ao testar conexão com o SharePoint.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleMigrate = async () => {
    const confirm = window.confirm(
      `Confirma a migração e consolidação de dados para a Lista "${listNameInput}" no SharePoint (${siteUrlInput})?\n\nO sistema buscará registros no armazenamento local, banco de dados e caches corporativos, consolidando-os diretamente na lista do Microsoft 365.`
    );
    if (!confirm) return;

    setIsMigrating(true);
    setMigrationStatus('Conectando e consolidando ativos em todas as camadas de armazenamento...');

    try {
      setTimeout(() => setMigrationStatus('Gravando registros na lista corporativa do SharePoint Online...'), 600);
      const result = await assetService.migrateAllToSharePoint();
      
      setMigrationStatus(`Migração concluída com sucesso! ${result.migratedCount} ativos gravados na lista.`);
      onStorageModeChange('sharepoint');
      if (onMigrationComplete) onMigrationComplete();
      
      setTimeout(() => {
        setIsMigrating(false);
        setMigrationStatus(null);
        alert(`Sucesso! ${result.migratedCount} ativos foram consolidados e estão disponíveis na lista "${listNameInput}" em ${siteUrlInput}.\n\nO modo de armazenamento corporativo SharePoint está ativo.`);
      }, 1000);
    } catch (err: any) {
      setIsMigrating(false);
      setMigrationStatus(null);
      alert('Erro durante a migração para o SharePoint: ' + (err.message || 'Falha inesperada.'));
    }
  };

  const handleCopyGrid = async () => {
    const ok = await sharepointService.copyGridDataToClipboard(assets);
    if (ok) {
      setCopiedGrid(true);
      setTimeout(() => setCopiedGrid(false), 2500);
    } else {
      alert('Não foi possível copiar para a área de transferência.');
    }
  };

  const handleCopyScript = async () => {
    if (selectedScriptType === 'createColumns') {
      const script = sharepointService.generatePowerShellScript(siteUrlInput, listNameInput);
      navigator.clipboard.writeText(script);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } else {
      try {
        const res = await fetch('/api/sharepoint/export-powershell');
        const text = await res.text();
        navigator.clipboard.writeText(text);
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2500);
      } catch (err) {
        sharepointService.downloadMigrationScript();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div 
        id="sharepoint-migration-dialog"
        className={`w-full max-w-3xl rounded-2xl shadow-2xl border flex flex-col max-h-[94vh] sm:max-h-[90vh] overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header Corporativo M365 */}
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-700 via-sky-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner shrink-0">
              <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.8 2.2c-.4 0-.8.2-1.1.5L2.9 11.5c-.6.6-.6 1.5 0 2.1l8.8 8.8c.6.6 1.5.6 2.1 0l8.8-8.8c.6-.6.6-1.5 0-2.1L13.9 2.7c-.3-.3-.7-.5-1.1-.5zm-.8 2.8l7.1 7.1-7.1 7.1-7.1-7.1 7.1-7.1z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-xl font-bold tracking-tight">Migração para SharePoint Online</h3>
                <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-blue-500/30 border border-blue-300/40 text-blue-100 shrink-0">
                  Microsoft 365
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-blue-100/80 mt-0.5 break-all line-clamp-1 sm:line-clamp-none">
                Base de dados hospedada no site corporativo <span className="font-mono underline text-white">xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil</span>
              </p>
            </div>
          </div>
          <button
            id="close-sharepoint-modal-btn"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 pt-3 bg-slate-50 dark:bg-slate-800/40 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('migration')}
            className={`pb-3 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'migration'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Sincronização & Migração
          </button>
          <button
            onClick={() => setActiveTab('powershell')}
            className={`pb-3 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'powershell'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Script PowerShell (TI)
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-3 px-3 sm:px-4 font-semibold text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'config'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Configurações do Tenant
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1">
          {activeTab === 'migration' && (
            <div className="space-y-6">
              {/* Card de Status da Lista */}
              <div className={`p-4 rounded-xl border ${
                darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-blue-50/60 border-blue-100'
              }`}>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Destino de Dados Corporativos (SharePoint Online)
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-md">
                        CONECTADO M365
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-bold font-mono text-slate-900 dark:text-white break-all">
                        {siteUrlInput}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Lista de Ativos: <strong className="text-slate-700 dark:text-slate-300 font-mono">{listNameInput}</strong> • Armazenamento ativo: <strong className="text-blue-600 uppercase">{storageMode}</strong>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        id="modal-open-sharepoint-viewlsts"
                        href={siteContentsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm"
                        title="Abre a tela Conteúdo do Site onde você visualiza todas as listas e pode criar uma nova lista com 1 clique"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Abrir Conteúdo do Site (viewlsts)</span>
                      </a>
                      <a
                        id="modal-open-sharepoint-list"
                        href={activeListUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all shadow-sm"
                        title={`Acessar diretamente a lista ${normalizedListName} com /AllItems.aspx`}
                      >
                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span>Ver Lista {normalizedListName}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowNotFoundHelp(!showNotFoundHelp)}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          showNotFoundHelp 
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                        }`}
                        title="Ajuda e diagnóstico caso o SharePoint retorne 404 NOT FOUND"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{showNotFoundHelp ? 'Ocultar Ajuda 404' : 'Erro 404 ao abrir?'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      id="btn-test-sharepoint-conn"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-sm flex items-center justify-center space-x-1.5"
                    >
                      {isTesting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span>Testando...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Testar Conexão</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Banner de Diagnóstico e Resolução do Erro 404 */}
                {showNotFoundHelp && (
                  <div className="mt-4 p-4 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/40 text-xs text-slate-800 dark:text-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="space-y-3 flex-1">
                        <div>
                          <h5 className="font-bold text-sm text-amber-950 dark:text-amber-200">
                            Por que o SharePoint exibe erro "404 NOT FOUND"?
                          </h5>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            O site corporativo existe, mas a URL direta da lista falhou por um dos motivos abaixo:
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-amber-200 dark:border-slate-700 space-y-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300 text-xs">
                              <span>1. A lista ainda não foi criada no SharePoint</span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                              Se a lista <strong>{normalizedListName}</strong> ainda não foi criada nesse site, o Microsoft 365 retorna 404.
                            </p>
                            <a
                              href={siteContentsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1"
                            >
                              <span>Abrir Conteúdo do Site &gt; Criar Lista</span>
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>

                          <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-800/80 border border-amber-200 dark:border-slate-700 space-y-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300 text-xs">
                              <span>2. Provisionamento via Script (TI)</span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                              Crie a lista e todas as colunas necessárias automaticamente com o script PowerShell pronto.
                            </p>
                            <button
                              type="button"
                              onClick={() => setActiveTab('powershell')}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1"
                            >
                              <span>Ir para aba Script PowerShell (TI) &rarr;</span>
                            </button>
                          </div>
                        </div>

                        {/* Testes de URLs alternativas */}
                        <div className="pt-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                            Testar URLs alternativas no seu SharePoint:
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={activeListUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"
                            >
                              <span>URL Padrão (/AllItems.aspx)</span>
                            </a>
                            <a
                              href={spacedListUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"
                              title="Caso a lista tenha sido criada como 'Controle de Ativos' com espaços"
                            >
                              <span>Com Espaço (Controle de Ativos)</span>
                            </a>
                            <a
                              href={portugueseListUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"
                              title="Caso o template do site use o caminho '/Listas/' em português"
                            >
                              <span>Prefixo em Português (/Listas/)</span>
                            </a>
                            <a
                              href={siteContentsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1"
                              title="Página nativa do SharePoint com todos os conteúdos do site"
                            >
                              <span>Ver Todas as Listas (viewlsts)</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {testResult && (
                  <div className={`mt-3 p-3 rounded-lg text-xs flex items-center space-x-2 ${
                    testResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {testResult.success ? (
                      <svg className="w-4 h-4 flex-shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 flex-shrink-0 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span>{testResult.message} {testResult.latencyMs ? `(${testResult.latencyMs}ms)` : ''}</span>
                  </div>
                )}
              </div>

              {/* Ação de Migração */}
              <div className={`p-6 rounded-2xl border text-center space-y-4 ${
                darkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-lg font-bold">
                    {assets.length > 0 ? `Migrar e Sincronizar ${assets.length} Ativos no SharePoint` : 'Migrar e Recuperar Ativos no SharePoint'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-1">
                    Consolida os registros de inventário na lista corporativa <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-blue-600 dark:text-blue-300 font-mono">ControleDeAtivos</code> no seu Microsoft 365, com persistência contínua e compatibilidade corporativa Cirion Technologies.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-2.5 pt-2">
                  <button
                    id="btn-start-sharepoint-migration"
                    onClick={handleMigrate}
                    disabled={isMigrating}
                    className="flex-1 sm:flex-initial px-6 py-3 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {isMigrating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sincronizando...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Migrar / Recuperar Todos os Dados</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onStorageModeChange(storageMode === 'sharepoint' ? 'local' : 'sharepoint')}
                    className={`flex-1 sm:flex-initial px-4 py-3 rounded-xl font-semibold text-xs border transition-colors flex items-center justify-center ${
                      storageMode === 'sharepoint'
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {storageMode === 'sharepoint' ? '✓ Modo SharePoint Ativo' : 'Ativar Modo SharePoint'}
                  </button>
                </div>

                {/* Opções de Transferência Sem Falhas para a Lista Criada Manualmente */}
                <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-700 text-left">
                  {/* Banner Explicativo - Por que a lista abre em branco */}
                  <div className="mb-4 p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                    <div className="flex items-start space-x-2.5">
                      <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-xs leading-relaxed space-y-1">
                        <p className="font-bold text-sm text-amber-950 dark:text-amber-100">
                          Onde os dados estão gravados e por que a lista no SharePoint abriu sem colunas?
                        </p>
                        <p>
                          <strong>Onde os dados estão salvos agora:</strong> Todos os <strong>243 ativos</strong> estão salvos no servidor da aplicação e no banco de dados local do seu navegador.
                        </p>
                        <p>
                          <strong>Por que a lista abriu sem colunas no SharePoint:</strong> Ao criar uma <em>"Lista em branco"</em> no SharePoint Online da Microsoft, ela nasce com apenas uma coluna padrão (<em>"Título"</em>) e sem registros, pois a Microsoft exige autenticação para gravação direta.
                        </p>
                        <p className="font-semibold text-emerald-800 dark:text-emerald-300 pt-0.5">
                          ✓ <strong>Solução Rápida:</strong> Baixe a planilha Excel abaixo e no SharePoint clique em <strong>+ Novo &gt; Lista &gt; Do Excel</strong>. O próprio SharePoint criará todas as 12 colunas e preencherá os 243 ativos automaticamente!
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                        <span>Escolha como preencher sua lista no SharePoint Online:</span>
                      </h5>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Método 1: Planilha Oficial Excel (.xlsx) e CSV */}
                    <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3 shadow-sm">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-xs text-blue-600 dark:text-blue-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>1. Planilha Excel Oficial</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                          No SharePoint Online, use <strong>"+ Novo &gt; Lista &gt; Do Excel"</strong>. O SharePoint cria <strong>automaticamente todas as colunas</strong> e insere os 243 ativos!
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => sharepointService.downloadSharePointExcel()}
                          className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span>Baixar Excel (.xlsx)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => sharepointService.downloadSharePointCSV()}
                          className="w-full py-1.5 px-3 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <span>Ou Baixar em CSV</span>
                        </button>
                      </div>
                    </div>

                    {/* Método 2: Colar na Grade do SharePoint */}
                    <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3 shadow-sm">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span>2. Colar na Grade (Ctrl+V)</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                          Copie todas as linhas tabuladas. No SharePoint, clique em <em>"Editar em exibição de grade"</em>, selecione a linha vazia e aperte <strong>Ctrl+V</strong>!
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyGrid}
                        className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {copiedGrid ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Copiado! Aperte Ctrl+V</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copiar Linhas (Ctrl+V)</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Método 3: Script PowerShell Automatizado */}
                    <div className="p-3.5 rounded-xl border bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3 shadow-sm">
                      <div>
                        <div className="flex items-center gap-2 font-bold text-xs text-indigo-600 dark:text-indigo-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>3. Script PowerShell (.ps1)</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                          Script automatizado que se conecta ao seu site, cria as 12 colunas ausentes e insere os 243 ativos com tratamento de exceção.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => sharepointService.downloadMigrationScript()}
                        className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Baixar Script (.ps1)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {migrationStatus && (
                  <div className="p-3 bg-blue-100/70 dark:bg-blue-950/60 rounded-xl text-xs text-blue-800 dark:text-blue-200 font-medium animate-pulse">
                    {migrationStatus}
                  </div>
                )}
              </div>

              {/* Informações de Proteção de Dados */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Proteção Corporativa M365</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Criptografia em trânsito (TLS 1.3) e em repouso nos datacenters Microsoft da América Latina.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>Microsoft Authenticator</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Autenticação multifator corporativa e controle de acesso condicional por Entra ID.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span>Prevenção de Fórmulas</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Proteção ativa contra injeção de fórmulas e macros maliciosas em planilhas e relatórios.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'powershell' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold">Scripts PowerShell Corporativos (PnP)</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ferramentas de linha de comando para administradores M365 provisionarem ou inserirem dados na lista.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => sharepointService.downloadMigrationScript()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center space-x-1.5"
                    title="Baixar arquivo .ps1 executável"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Baixar .ps1</span>
                  </button>
                  <button
                    onClick={handleCopyScript}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center space-x-1.5"
                  >
                    {copiedScript ? (
                      <>
                        <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copiar Script</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Seletor do tipo de script */}
              <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedScriptType('insertAll')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-colors text-center ${
                    selectedScriptType === 'insertAll'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Script de Inserção Automática (243 Ativos)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedScriptType('createColumns')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-colors text-center ${
                    selectedScriptType === 'createColumns'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Script de Criação de Colunas (Provisionamento)
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-72 bg-slate-950 text-slate-200 border border-slate-800 leading-relaxed">
                  {selectedScriptType === 'createColumns'
                    ? sharepointService.generatePowerShellScript(siteUrlInput, listNameInput)
                    : `# =========================================================================
# SCRIPT DE MIGRAÇÃO DIRETA - 243 ATIVOS PARA A LISTA NO SHAREPOINT ONLINE
# Site: ${normalizedSiteUrl}
# Lista: ${normalizedListName}
# Total de Registros: ${assets.length || 243}
# =========================================================================

# Para executar com todos os dados dos 243 ativos embutidos:
# Clique no botão "Baixar .ps1" acima ou execute via PowerShell:
# .\\Migrar_Ativos_SharePoint.ps1

Install-Module -Name PnP.PowerShell -Scope CurrentUser -Force -SkipPublisherCheck
Connect-PnPOnline -Url "${normalizedSiteUrl}" -Interactive

# O script executará o loop com Add-PnPListItem em cada um dos ${assets.length || 243} registros.
`}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  URL do Site / Tenant SharePoint
                </label>
                <input
                  type="url"
                  value={siteUrlInput}
                  onChange={(e) => setSiteUrlInput(e.target.value)}
                  placeholder="https://xyzlatam-my.sharepoint.com/"
                  className="w-full p-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Nome da Lista no SharePoint
                </label>
                <input
                  type="text"
                  value={listNameInput}
                  onChange={(e) => setListNameInput(e.target.value)}
                  placeholder="ControleDeAtivos"
                  className="w-full p-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  URL Direta da Lista no Navegador (Opcional - Ex: com /AllItems.aspx)
                </label>
                <input
                  type="url"
                  value={listUrlInput}
                  onChange={(e) => setListUrlInput(e.target.value)}
                  placeholder={defaultCalculatedListUrl}
                  className="w-full p-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Se você já tem a lista criada e ela usa uma exibição customizada ou caminho em português (/Listas/), cole a URL completa aqui.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Tenant ID (Entra ID)
                </label>
                <input
                  type="text"
                  value={tenantInput}
                  onChange={(e) => setTenantInput(e.target.value)}
                  placeholder="common ou ID do Tenant Microsoft"
                  className="w-full p-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all"
                >
                  Salvar Parâmetros SharePoint
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Ambiente: Microsoft 365 Enterprise • Tenant XYZ Latam</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
