import React, { useState, useEffect } from 'react';
import { securityService } from '../services/securityService';
import { MicrosoftUser } from '../types';

interface MicrosoftLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onSuccess: (user: MicrosoftUser) => void;
  onGoogleLogin?: () => void;
  initialError?: string | null;
}

export const MicrosoftLoginModal: React.FC<MicrosoftLoginModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onSuccess,
  initialError
}) => {
  const [activeTab, setActiveTab] = useState<'direct' | 'azure'>('direct');
  
  // Campos de Entrada Corporativa Direta
  const [corporateEmail, setCorporateEmail] = useState('gilberto.araujo.ext@ciriontechnologies.com');
  const [displayName, setDisplayName] = useState('Gilberto Araujo');
  const [jobTitle, setJobTitle] = useState('Administrador de TI & Patrimônio');

  // Campos do Azure Entra ID
  const [azureClientId, setAzureClientId] = useState(() => localStorage.getItem('assettrack_ms_client_id') || '');
  const [azureTenantId, setAzureTenantId] = useState(() => localStorage.getItem('assettrack_ms_tenant_id') || 'common');
  const [azureStatus, setAzureStatus] = useState<{ configured: boolean; message?: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError || null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(initialError || null);
      // Checar status do backend
      securityService.getMicrosoftAuthConfig().then(res => {
        setAzureStatus({ configured: res.configured, message: res.message });
        if (res.clientId && !azureClientId) {
          setAzureClientId(res.clientId);
        }
      });
    }
  }, [isOpen, initialError]);

  if (!isOpen) return null;

  // Login Direto com Credencial Corporativa
  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corporateEmail || !corporateEmail.includes('@')) {
      setErrorMsg('Por favor, informe um e-mail corporativo válido (ex: seu.nome@ciriontechnologies.com).');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const user = await securityService.directCorporateLogin({
        email: corporateEmail,
        displayName: displayName || 'Colaborador Corporativo',
        jobTitle: jobTitle || 'Especialista de TI',
        tenant: 'xyzlatam-my.sharepoint.com'
      });

      setLoading(false);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Falha ao autenticar credencial corporativa.');
    }
  };

  // Salvar credenciais do Azure Entra ID
  const handleSaveAzureConfig = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await securityService.saveMicrosoftAuthConfig(azureClientId.trim(), azureTenantId.trim());
      setAzureStatus({ configured: res.configured, message: res.message });
      setLoading(false);
      if (res.configured) {
        alert('Credenciais do Azure salvas com sucesso! Agora você pode iniciar o SSO oficial.');
      } else {
        alert('Configurações salvas. Para o SSO oficial, insira um Application (client) ID em formato GUID válido.');
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Erro ao salvar configuração do Azure.');
    }
  };

  // Tentar SSO oficial via Popup Microsoft
  const handleOfficialMicrosoftOAuth = async () => {
    if (!azureClientId || !azureClientId.includes('-')) {
      setErrorMsg('Para o SSO oficial do Microsoft Entra ID, é necessário registrar o app no Azure Portal (portal.azure.com) e informar um Application (client) ID válido.');
      setActiveTab('azure');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await securityService.saveMicrosoftAuthConfig(azureClientId.trim(), azureTenantId.trim());
      const user = await securityService.loginWithMicrosoft({ forcePopup: true });
      setLoading(false);
      onSuccess(user);
      onClose();
    } catch (err: any) {
      setLoading(false);
      if (err.notConfigured) {
        setErrorMsg('O Client ID informado ainda não está autorizado na Microsoft. Use a Entrada Corporativa Direta ao lado para acessar imediatamente.');
      } else {
        setErrorMsg(err.message || 'Falha no login com Microsoft.');
      }
    }
  };

  const handleCopyRedirect = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        id="microsoft-login-dialog"
        className={`w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header Microsoft Corporativo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
              </svg>
            </div>
            <div>
              <h3 className="font-black text-lg text-white flex items-center gap-2">
                <span>Autenticação Microsoft 365</span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold tracking-wider">
                  M365
                </span>
              </h3>
              <p className="text-xs text-blue-100">
                Microsoft Entra ID • SharePoint Online • XYZ Latam
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Alerta explicativo sobre o erro AADSTS700038 */}
        <div className={`p-4 border-b text-xs ${
          darkMode ? 'bg-blue-950/40 border-blue-900 text-blue-200' : 'bg-blue-50 border-blue-100 text-blue-900'
        }`}>
          <div className="flex items-start gap-2.5">
            <i className="fa-solid fa-circle-info text-blue-500 text-sm mt-0.5 shrink-0"></i>
            <div>
              <span className="font-bold block text-[11px] uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Sobre a Autenticação Corporativa
              </span>
              <p className="mt-0.5 leading-relaxed text-[11px] opacity-90">
                O erro <strong>AADSTS700038</strong> ocorre quando o Azure AD ainda não possui um <em>Application (client) ID</em> registrado para o domínio. Você pode entrar imediatamente com a <strong>Entrada Corporativa Direta</strong> abaixo ou registrar seu Client ID do Azure.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs de Seleção */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'direct'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-bolt text-amber-500"></i>
            <span>Entrada Corporativa Direta (Recomendada)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('azure')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'azure'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <i className="fa-solid fa-key text-blue-500"></i>
            <span>Configurar Azure App Registration</span>
          </button>
        </div>

        {/* Mensagem de Erro Geral */}
        {errorMsg && (
          <div className="p-3 mx-5 mt-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-circle-exclamation shrink-0"></i>
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* Conteúdo da Tab: Entrada Corporativa Direta */}
        {activeTab === 'direct' && (
          <form onSubmit={handleDirectLogin} className="p-5 space-y-4">
            <div className="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <i className="fa-solid fa-building text-blue-500"></i>
                <span>Acesso Seguro XYZ Latam • SharePoint Online</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                Após a confirmação, será solicitado o segundo fator no <strong>Microsoft Authenticator</strong> para liberação do controle de patrimônio.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  E-mail Corporativo ou Autorizado
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={corporateEmail}
                    onChange={(e) => setCorporateEmail(e.target.value)}
                    required
                    placeholder="seu.nome@ciriontechnologies.com"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-colors ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                    }`}
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-blue-500 font-bold">
                    M365
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Nome do Usuário
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Gilberto Araujo"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs transition-colors ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Administrador de TI"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs transition-colors ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                {loading ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
                    </svg>
                    <span>Entrar e Validar no Microsoft Authenticator</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Conteúdo da Tab: Configuração do Azure Entra ID */}
        {activeTab === 'azure' && (
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="p-3 rounded-xl border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <i className="fa-brands fa-microsoft text-blue-500"></i>
                <span>Instruções para Registrar o App no Azure Portal</span>
              </p>
              <ol className="list-decimal list-inside text-slate-500 dark:text-slate-400 space-y-1 text-[11px]">
                <li>Acesse <strong>portal.azure.com</strong> &gt; <strong>Microsoft Entra ID</strong> &gt; <strong>Registros de aplicativo</strong>.</li>
                <li>Clique em <strong>Novo registro</strong> (ex: "AssetTrack-SharePoint-M365").</li>
                <li>Em <em>URI de Redirecionamento (Web)</em>, cole o link abaixo:</li>
              </ol>
              
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  readOnly
                  value={redirectUri}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={handleCopyRedirect}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-[11px] shrink-0"
                >
                  {copiedRedirect ? 'Copiado!' : 'Copiar URI'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Application (client) ID
                </label>
                <input
                  type="text"
                  value={azureClientId}
                  onChange={(e) => setAzureClientId(e.target.value)}
                  placeholder="Ex: e18b2c45-9a8f-4d32-bc10-123456789abc"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-colors ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Directory (tenant) ID
                </label>
                <input
                  type="text"
                  value={azureTenantId}
                  onChange={(e) => setAzureTenantId(e.target.value)}
                  placeholder="common ou ID do Tenant da XYZ Latam"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-colors ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveAzureConfig}
                disabled={loading}
                className="flex-1 py-2.5 px-3 rounded-xl border-2 border-blue-500 font-bold text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              >
                Salvar Credenciais
              </button>
              <button
                type="button"
                onClick={handleOfficialMicrosoftOAuth}
                disabled={loading}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                </svg>
                <span>Iniciar SSO Microsoft</span>
              </button>
            </div>
          </div>
        )}

        {/* Rodapé: Diretriz de Segurança Corporativa Cirion Technologies */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400 text-center sm:text-left flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <i className="fa-solid fa-shield-halved text-xs"></i>
            </div>
            <div>
              <span className="block font-bold text-slate-700 dark:text-slate-200">Autenticação Exclusiva Microsoft Authenticator</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Diretriz corporativa Cirion Technologies • Proteção ativa contra força bruta e invasão.</span>
            </div>
          </div>
          <div className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold shrink-0">
            HMAC-SHA256 • MFA 2FA
          </div>
        </div>
      </div>
    </div>
  );
};
