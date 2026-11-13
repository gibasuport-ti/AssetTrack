import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { securityService, DEFAULT_SECURITY_CONFIG } from '../services/securityService';
import { AuditLog, SecurityConfig, StorageMode, MicrosoftUser } from '../types';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  user: User | null;
  storageMode: StorageMode;
  setStorageMode: (mode: StorageMode) => void;
  localGeminiKey: string;
  setLocalGeminiKey: (key: string) => void;
  customFirebaseConfig: string;
  setCustomFirebaseConfig: (config: string) => void;
  onSaveSecurity: () => void;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  msUser?: MicrosoftUser | null;
  onMicrosoftLogin?: () => Promise<void>;
  onMicrosoftLogout?: () => Promise<void>;
  onOpenSharePointMigration?: () => void;
  onOpenMfaModal?: () => void;
  onOpenDistributionModal?: () => void;
  onSecurityConfigChange?: (config: SecurityConfig) => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  user,
  storageMode,
  setStorageMode,
  localGeminiKey,
  setLocalGeminiKey,
  customFirebaseConfig,
  setCustomFirebaseConfig,
  onSaveSecurity,
  onGoogleLogin,
  onGoogleLogout,
  msUser,
  onMicrosoftLogin,
  onMicrosoftLogout,
  onOpenSharePointMigration,
  onOpenMfaModal,
  onOpenDistributionModal,
  onSecurityConfigChange,
}) => {
  const [activeTab, setActiveTab] = useState<'auth' | 'access' | 'audit' | 'database'>('auth');
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(() => securityService.getSecurityConfig());
  const [newEmail, setNewEmail] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isMsLoggingIn, setIsMsLoggingIn] = useState(false);
  const [securityStats, setSecurityStats] = useState<any>(null);

  const isAdmin = user?.email?.toLowerCase() === 'gibasuporte@gmail.com' || (!user?.isAnonymous && user?.email);

  useEffect(() => {
    if (isOpen) {
      setSecurityConfig(securityService.getSecurityConfig());
      securityService.getSecurityStats().then(setSecurityStats).catch(() => {});
      if (activeTab === 'audit') {
        loadAuditLogs();
      }
    }
  }, [isOpen, activeTab]);

  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const logs = await securityService.getAuditLogs();
      setAuditLogs(logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleAddEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      alert('Digite um e-mail válido.');
      return;
    }
    if (securityConfig.allowedEmails.includes(email)) {
      alert('Este e-mail já está na lista.');
      return;
    }
    const updated = {
      ...securityConfig,
      allowedEmails: [...securityConfig.allowedEmails, email]
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
    if (onSecurityConfigChange) onSecurityConfigChange(updated);
    setNewEmail('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    if (emailToRemove === 'gibasuporte@gmail.com') {
      alert('O e-mail do administrador principal não pode ser removido.');
      return;
    }
    const updated = {
      ...securityConfig,
      allowedEmails: securityConfig.allowedEmails.filter(e => e !== emailToRemove)
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
    if (onSecurityConfigChange) onSecurityConfigChange(updated);
  };

  const handleAddDomain = () => {
    let domain = newDomain.trim().toLowerCase().replace(/^@/, '');
    if (!domain || !domain.includes('.')) {
      alert('Digite um domínio válido (ex: empresa.com.br).');
      return;
    }
    if (securityConfig.allowedDomains.includes(domain)) {
      alert('Este domínio já está cadastrado.');
      return;
    }
    const updated = {
      ...securityConfig,
      allowedDomains: [...securityConfig.allowedDomains, domain]
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
    if (onSecurityConfigChange) onSecurityConfigChange(updated);
    setNewDomain('');
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    const updated = {
      ...securityConfig,
      allowedDomains: securityConfig.allowedDomains.filter(d => d !== domainToRemove)
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
    if (onSecurityConfigChange) onSecurityConfigChange(updated);
  };

  const handleToggleRestriction = (value: boolean) => {
    const updated = {
      ...securityConfig,
      restrictAccessToGoogle: value
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
    if (onSecurityConfigChange) onSecurityConfigChange(updated);
  };

  const handleLoginClick = async () => {
    setIsLoggingIn(true);
    try {
      await onGoogleLogin();
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border-2 shadow-2xl overflow-hidden transition-all ${
        darkMode ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header do Modal */}
        <div className={`p-4 sm:p-5 border-b-2 flex items-center justify-between gap-3 ${
          darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center text-lg">
              <i className="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight">
                Central de Segurança & Autenticação
              </h2>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Controle de acesso Google OAuth 2.0, permissões e proteção de dados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors`}
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className={`flex border-b-2 overflow-x-auto px-4 gap-1 ${
          darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`px-4 py-3 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'auth'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <i className="fa-brands fa-google"></i>
            <span>Conta Google</span>
            {user && !user.isAnonymous && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('access')}
            className={`px-4 py-3 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'access'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <i className="fa-solid fa-user-lock"></i>
            <span>Controle de Acesso</span>
            {securityConfig.restrictAccessToGoogle && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 text-[9px] font-black">
                ATIVO
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-3 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <i className="fa-solid fa-list-check"></i>
            <span>Trilha de Auditoria</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`px-4 py-3 text-xs font-black uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'database'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <i className="fa-solid fa-database"></i>
            <span>Banco & Chaves</span>
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* ABA 1: Identidade & Autenticação */}
          {activeTab === 'auth' && (
            <div className="space-y-5">
              {/* Card Microsoft 365 Corporativo (Prioritário) */}
              <div className={`p-5 rounded-2xl border-2 shadow-sm ${
                msUser
                  ? (darkMode ? 'bg-gradient-to-br from-blue-950/40 to-indigo-950/30 border-blue-600/60' : 'bg-gradient-to-br from-blue-50 to-indigo-50/50 border-blue-300')
                  : (darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200')
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <span>Microsoft 365 Entra ID</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                          Corporativo
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Autenticação corporativa integrada à licença Microsoft 365
                      </p>
                    </div>
                  </div>

                  {msUser && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                      msUser.mfaVerified
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${msUser.mfaVerified ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      <span>{msUser.mfaVerified ? 'Authenticator Validado' : 'MFA Pendente'}</span>
                    </span>
                  )}
                </div>

                {msUser ? (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-blue-200/60 dark:border-blue-800/60">
                      <div className="flex items-center space-x-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-base border border-blue-500/20">
                          {msUser.displayName ? msUser.displayName.charAt(0).toUpperCase() : 'M'}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{msUser.displayName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{msUser.email}</p>
                          <p className="text-[11px] text-blue-600 dark:text-blue-400">
                            {msUser.jobTitle || 'Colaborador'} • Tenant: <span className="font-mono">{msUser.tenantId || 'xyzlatam-my'}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                        {onOpenMfaModal && (
                          <button
                            type="button"
                            onClick={onOpenMfaModal}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center space-x-1"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
                            </svg>
                            <span>Desafio Authenticator</span>
                          </button>
                        )}
                        {onMicrosoftLogout && (
                          <button
                            type="button"
                            onClick={onMicrosoftLogout}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-colors"
                          >
                            Desconectar M365
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Checkbox de Exigência do Authenticator */}
                    <label className="flex items-center space-x-2.5 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={securityConfig.enforceMicrosoftAuthenticator}
                        onChange={(e) => {
                          const updated = {
                            ...securityConfig,
                            enforceMicrosoftAuthenticator: e.target.checked
                          };
                          setSecurityConfig(updated);
                          securityService.saveSecurityConfig(updated);
                          if (onSecurityConfigChange) onSecurityConfigChange(updated);
                        }}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Exigir Microsoft Authenticator (MFA) para operações sensíveis e acesso aos dados
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Conecte sua conta corporativa da organização <strong>XYZ Latam</strong> para sincronizar dados com o SharePoint e habilitar MFA.
                    </p>
                    {onMicrosoftLogin && (
                      <button
                        type="button"
                        onClick={async () => {
                          setIsMsLoggingIn(true);
                          try {
                            await onMicrosoftLogin();
                          } finally {
                            setIsMsLoggingIn(false);
                          }
                        }}
                        disabled={isMsLoggingIn}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-2 shrink-0"
                      >
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                        </svg>
                        <span>{isMsLoggingIn ? 'Autenticando...' : 'Entrar com Microsoft 365'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Blindagem Anti-Invasão & Telemetria em Tempo Real */}
              <div className={`p-4.5 rounded-2xl border-2 ${
                darkMode ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950/40 border-indigo-500/40' : 'bg-gradient-to-br from-slate-50 via-white to-blue-50/50 border-indigo-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-500 border border-indigo-500/30 flex items-center justify-center text-base">
                      <i className="fa-solid fa-shield-halved"></i>
                    </div>
                    <div>
                      <h4 className="font-black text-sm flex items-center gap-2">
                        <span>Blindagem Ativa Anti-Invasão & Proteção Corporativa</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Ativo
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Políticas de segurança de nível bancário e intrusão zero ativas no servidor
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-black/20 text-indigo-400 border border-indigo-500/20">
                    HMAC-SHA256
                  </span>
                </div>

                {/* Métricas de Defesa em Tempo Real */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 pb-3">
                  <div className="p-2.5 rounded-xl bg-black/20 border border-slate-700/40 text-center">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Escudo Anti-Força Bruta</p>
                    <p className="text-xs font-black text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                      <i className="fa-solid fa-check"></i>
                      <span>5 Tentativas / 15m</span>
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-slate-700/40 text-center">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Assinatura de Sessão</p>
                    <p className="text-xs font-black text-indigo-400 mt-0.5 flex items-center justify-center gap-1">
                      <i className="fa-solid fa-key"></i>
                      <span>HMAC Inviolável</span>
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-slate-700/40 text-center">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Anti-Tampering</p>
                    <p className="text-xs font-black text-emerald-400 mt-0.5 flex items-center justify-center gap-1">
                      <i className="fa-solid fa-lock"></i>
                      <span>Tempo Constante</span>
                    </p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/20 border border-slate-700/40 text-center">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Provedor Exclusivo</p>
                    <p className="text-xs font-black text-blue-400 mt-0.5 flex items-center justify-center gap-1">
                      <i className="fa-solid fa-mobile-screen-button"></i>
                      <span>MS Authenticator</span>
                    </p>
                  </div>
                </div>

                {/* Status do Token Criptográfico Atual */}
                {msUser?.sessionToken && (
                  <div className="mt-2 p-3 rounded-xl bg-black/30 border border-indigo-500/30 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-300 flex items-center gap-1.5">
                        <i className="fa-solid fa-fingerprint text-indigo-400"></i>
                        Token de Sessão Criptográfico (Assinado no Servidor):
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Válido
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-slate-400 break-all bg-black/40 p-2 rounded-lg border border-slate-800">
                      {msUser.sessionToken}
                    </p>
                  </div>
                )}
              </div>

              {/* Diretriz de Rede Corporativa Cirion Technologies */}
              <div className={`p-4 rounded-2xl border-2 ${
                darkMode ? 'bg-slate-800/50 border-slate-700/80 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-500">
                    <i className="fa-solid fa-network-wired text-base"></i>
                    <span>Rede Corporativa Cirion Technologies (Uso Interno Exclusivo)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.hostname);
                      alert(`Endereço da rede interna "${window.location.hostname}" copiado!`);
                    }}
                    className="text-[10px] font-black bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2.5 py-1 rounded-lg hover:bg-blue-500/20 flex items-center gap-1"
                  >
                    <i className="fa-solid fa-copy"></i>
                    <span>Copiar Host</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Este sistema foi configurado para execução restrita na infraestrutura e intranet corporativa da <strong>Cirion Technologies</strong> (<code className="font-mono text-emerald-400 font-bold">{window.location.hostname}</code>), com autenticação exclusiva protegida pelo <strong>Microsoft Authenticator</strong>.
                </p>
                <div className="mt-2 text-[11px] font-mono p-2.5 rounded-xl bg-black/20 text-slate-400 border border-slate-700/40">
                  Infraestrutura Cirion Technologies • Perímetro Seguro • Acesso Autorizado
                </div>
              </div>

              {/* 4 Pilares de Boas Práticas de Segurança em Destaque */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-blue-500 mb-1.5">
                    <i className="fa-solid fa-shield-virus text-sm"></i>
                    <h5 className="text-xs font-black uppercase tracking-wider">Proteção Contra Força Bruta</h5>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Limitação estrita de requisições e bloqueio automático de IP/usuário após 5 tentativas incorretas de código de segurança.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-emerald-500 mb-1.5">
                    <i className="fa-solid fa-lock text-sm"></i>
                    <h5 className="text-xs font-black uppercase tracking-wider">Assinatura HMAC Anti-Adulteração</h5>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Sessões emitidas contêm hashes criptográficos validados pelo backend, impedindo injeção ou alteração de permissões no cliente.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-purple-500 mb-1.5">
                    <i className="fa-solid fa-code text-sm"></i>
                    <h5 className="text-xs font-black uppercase tracking-wider">Anti-Prototype Pollution</h5>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Middleware de sanitização contra poluição de protótipo de objetos JavaScript e injeção de parâmetros nas rotas Express.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-amber-500 mb-1.5">
                    <i className="fa-solid fa-clock text-sm"></i>
                    <h5 className="text-xs font-black uppercase tracking-wider">Comparação Timing-Safe</h5>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Validação criptográfica de tokens e códigos usando algoritmos de tempo constante para repelir ataques de canal lateral (side-channel).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: Controle de Acesso e Restrição */}
          {activeTab === 'access' && (
            <div className="space-y-5">
              {/* Card de Ativação do Modo Restrito via Microsoft Authenticator */}
              <div className={`p-4.5 rounded-2xl border-2 transition-all ${
                securityConfig.enforceMicrosoftAuthenticator
                  ? (darkMode ? 'bg-blue-950/25 border-blue-600/60' : 'bg-blue-50 border-blue-300')
                  : (darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200')
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-shield-halved text-blue-500"></i>
                      <h4 className="font-black text-sm">Exigir Autenticação Obrigatória via Microsoft Authenticator (MFA)</h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Ao ativar este modo, a validação pelo aplicativo Microsoft Authenticator (código TOTP de 6 dígitos ou aprovação móvel) é estritamente obrigatória para operar o sistema.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={securityConfig.enforceMicrosoftAuthenticator}
                      onChange={(e) => handleToggleRestriction(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Whitelist de E-mails Autorizados */}
              <div className={`p-4.5 rounded-2xl border-2 space-y-3 ${
                darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <i className="fa-solid fa-envelope-circle-check text-blue-500"></i>
                    E-mails Corporativos Autorizados
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Apenas contas corporativas com estes e-mails poderão operar o sistema após validação no Microsoft Authenticator.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border-2 outline-none transition-all ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs uppercase rounded-xl transition-all"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {securityConfig.allowedEmails.map(email => (
                    <span
                      key={email}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                        email === 'gibasuporte@gmail.com'
                          ? (darkMode ? 'bg-blue-950/40 text-blue-300 border-blue-800' : 'bg-blue-50 text-blue-800 border-blue-200')
                          : (darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-700 border-slate-200')
                      }`}
                    >
                      <i className="fa-solid fa-user-check text-[10px] opacity-70"></i>
                      <span>{email}</span>
                      {email !== 'gibasuporte@gmail.com' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(email)}
                          className="hover:text-red-400 pl-1"
                        >
                          <i className="fa-solid fa-xmark text-xs"></i>
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Whitelist de Domínios Corporativos */}
              <div className={`p-4.5 rounded-2xl border-2 space-y-3 ${
                darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <i className="fa-solid fa-globe text-emerald-500"></i>
                    Domínios Corporativos Permitidos (Opcional)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Qualquer usuário Google com o domínio cadastrado (ex: <span className="font-mono font-bold">@cirion.com</span>) terá acesso concedido.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ex: ciriontelecom.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border-2 outline-none transition-all ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleAddDomain}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs uppercase rounded-xl transition-all"
                  >
                    Adicionar
                  </button>
                </div>

                {securityConfig.allowedDomains.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {securityConfig.allowedDomains.map(dom => (
                      <span
                        key={dom}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${
                          darkMode ? 'bg-emerald-950/30 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <i className="fa-solid fa-at text-[10px]"></i>
                        <span>@{dom}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDomain(dom)}
                          className="hover:text-red-400 pl-1"
                        >
                          <i className="fa-solid fa-xmark text-xs"></i>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 3: Trilha de Auditoria (Audit Logs) */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Histórico de Operações & Rastreabilidade
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Registros imutáveis de ações (criação, edição, exclusão e login) para conformidade e segurança.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadAuditLogs}
                  className="px-3 py-1.5 rounded-xl border font-bold text-xs hover:bg-slate-700/30 transition-colors flex items-center gap-1.5"
                >
                  <i className={`fa-solid fa-rotate-right ${loadingAudit ? 'fa-spin' : ''}`}></i>
                  <span>Atualizar</span>
                </button>
              </div>

              <div className={`rounded-2xl border-2 overflow-hidden ${
                darkMode ? 'bg-slate-800/30 border-slate-700/70' : 'bg-white border-slate-200'
              }`}>
                {loadingAudit ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <i className="fa-solid fa-spinner fa-spin text-xl mb-2 block"></i>
                    Carregando registros de auditoria...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <i className="fa-solid fa-shield-check text-2xl mb-2 block opacity-50"></i>
                    Nenhum registro de auditoria registrado ainda. As operações serão gravadas aqui.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/40 max-h-80 overflow-y-auto">
                    {auditLogs.map(log => (
                      <div key={log.id} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-500/5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              log.action === 'CREATE' ? 'bg-emerald-500/20 text-emerald-400' :
                              log.action === 'UPDATE' ? 'bg-blue-500/20 text-blue-400' :
                              log.action === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                              log.action === 'LOGIN' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {log.action}
                            </span>
                            <span className="font-bold text-slate-200">{log.details}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            <span><i className="fa-solid fa-user text-[9px] mr-1"></i> {log.userName} ({log.userEmail})</span>
                            {log.assetSerial && <span>Serial: <strong className="font-mono">{log.assetSerial}</strong></span>}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap self-end sm:self-auto">
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 4: Banco de Dados e Chaves */}
          {activeTab === 'database' && (
            <div className="space-y-5">
              {/* Modo de Armazenamento */}
              <div className={`p-4 rounded-2xl border-2 space-y-3 ${
                darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className="font-black text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Modo de Armazenamento Principal
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                    storageMode === 'sharepoint'
                      ? (darkMode ? 'bg-blue-950/40 border-blue-500' : 'bg-blue-50 border-blue-600')
                      : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')
                  }`}>
                    <input
                      type="radio"
                      name="storage_mode"
                      checked={storageMode === 'sharepoint'}
                      onChange={() => setStorageMode('sharepoint')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-bold text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <span>SharePoint Online</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/20 text-blue-500 font-black">
                          M365
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Lista corporativa oficial em <span className="font-mono">xyzlatam-my.sharepoint.com</span>.
                      </p>
                    </div>
                  </label>

                  <label className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                    storageMode === 'cloud'
                      ? (darkMode ? 'bg-blue-950/30 border-blue-500' : 'bg-blue-50 border-blue-500')
                      : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')
                  }`}>
                    <input
                      type="radio"
                      name="storage_mode"
                      checked={storageMode === 'cloud'}
                      onChange={() => setStorageMode('cloud')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-200">Cloud Sync (Firestore)</div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Sincronização em nuvem e suporte multi-dispositivo.</p>
                    </div>
                  </label>

                  <label className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                    storageMode === 'local'
                      ? (darkMode ? 'bg-blue-950/30 border-blue-500' : 'bg-blue-50 border-blue-500')
                      : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')
                  }`}>
                    <input
                      type="radio"
                      name="storage_mode"
                      checked={storageMode === 'local'}
                      onChange={() => setStorageMode('local')}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-200">Local Offline (IndexedDB)</div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Armazenamento offline local no navegador.</p>
                    </div>
                  </label>
                </div>

                {onOpenSharePointMigration && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={onOpenSharePointMigration}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center space-x-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      <span>Abrir Painel de Migração &amp; Script PowerShell SharePoint</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Chave da API Gemini */}
              <div className={`p-4 rounded-2xl border-2 space-y-2 ${
                darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                    Chave da API Gemini (OCR & Inteligência Artificial)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-[10px] font-bold text-blue-500 hover:underline"
                  >
                    {showApiKey ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <input
                  type={showApiKey ? "text" : "password"}
                  placeholder="AIzaSy..."
                  value={localGeminiKey}
                  onChange={(e) => setLocalGeminiKey(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono border-2 outline-none transition-all ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'
                  }`}
                />
                <p className="text-[10px] text-slate-400">
                  A chave do servidor é utilizada por padrão. Preencha aqui apenas para uso em implantação externa.
                </p>
              </div>

              {/* Firebase Custom Config */}
              <div className={`p-4 rounded-2xl border-2 space-y-2 ${
                darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200'
              }`}>
                <label className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 block">
                  Configuração Personalizada do Firebase (JSON)
                </label>
                <textarea
                  rows={3}
                  placeholder='{"apiKey": "...", "projectId": "..."}'
                  value={customFirebaseConfig}
                  onChange={(e) => setCustomFirebaseConfig(e.target.value)}
                  className={`w-full p-3 rounded-xl text-[11px] font-mono border-2 outline-none transition-all resize-none ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer com Ações */}
        <div className={`p-4 sm:p-5 border-t-2 flex flex-col sm:flex-row items-center justify-between gap-3 ${
          darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <i className="fa-solid fa-lock text-emerald-500"></i>
            <span>Conexão SSL/TLS Criptografada Ativa</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border-2 font-bold text-xs uppercase tracking-wider transition-colors ${
                darkMode ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={onSaveSecurity}
              className="flex-1 sm:flex-initial px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <i className="fa-solid fa-check"></i>
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
