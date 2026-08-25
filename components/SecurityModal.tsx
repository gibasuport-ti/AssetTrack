import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { securityService, DEFAULT_SECURITY_CONFIG } from '../services/securityService';
import { AuditLog, SecurityConfig } from '../types';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  user: User | null;
  storageMode: 'cloud' | 'local';
  setStorageMode: (mode: 'cloud' | 'local') => void;
  localGeminiKey: string;
  setLocalGeminiKey: (key: string) => void;
  customFirebaseConfig: string;
  setCustomFirebaseConfig: (config: string) => void;
  onSaveSecurity: () => void;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
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
}) => {
  const [activeTab, setActiveTab] = useState<'auth' | 'access' | 'audit' | 'database'>('auth');
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(() => securityService.getSecurityConfig());
  const [newEmail, setNewEmail] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === 'gibasuporte@gmail.com' || (!user?.isAnonymous && user?.email);

  useEffect(() => {
    if (isOpen) {
      setSecurityConfig(securityService.getSecurityConfig());
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
    setNewDomain('');
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    const updated = {
      ...securityConfig,
      allowedDomains: securityConfig.allowedDomains.filter(d => d !== domainToRemove)
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
  };

  const handleToggleRestriction = (value: boolean) => {
    const updated = {
      ...securityConfig,
      restrictAccessToGoogle: value
    };
    setSecurityConfig(updated);
    securityService.saveSecurityConfig(updated);
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
          {/* ABA 1: Conta Google */}
          {activeTab === 'auth' && (
            <div className="space-y-5">
              <div className={`p-4 rounded-2xl border-2 ${
                user && !user.isAnonymous
                  ? (darkMode ? 'bg-emerald-950/20 border-emerald-800/60' : 'bg-emerald-50 border-emerald-200')
                  : (darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200')
              }`}>
                {user && !user.isAnonymous ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL} 
                          alt="Avatar" 
                          className="w-14 h-14 rounded-2xl border-2 border-emerald-500/50 shadow-md object-cover" 
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-2xl font-black">
                          {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'G'}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-sm sm:text-base">{user.displayName || 'Usuário Autenticado'}</h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {user.email === 'gibasuporte@gmail.com' ? 'Admin Supremo' : 'Autorizado'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono font-semibold">{user.email}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          ID: <span className="font-mono text-[9px] opacity-70">{user.uid}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={onGoogleLogout}
                        className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <i className="fa-solid fa-right-from-bracket"></i>
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xl shrink-0">
                        <i className="fa-solid fa-user-shield"></i>
                      </div>
                      <div>
                        <h4 className="font-black text-sm">Nenhuma Conta Google Conectada</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Faça login com sua Conta Google oficial para garantir rastreabilidade e segurança.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLoginClick}
                      disabled={isLoggingIn}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2.5 border border-slate-300"
                    >
                      <i className="fa-brands fa-google text-red-500 text-sm"></i>
                      <span>{isLoggingIn ? 'Conectando...' : 'Entrar com Google'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Boas Práticas de Segurança em Destaque */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-blue-500 mb-1.5">
                    <i className="fa-solid fa-lock text-sm"></i>
                    <h5 className="text-xs font-black uppercase tracking-wider">Criptografia & Sessão</h5>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Tokens OAuth 2.0 criptografados gerenciados diretamente pelos servidores de identidade do Google e Firebase Auth.
                  </p>
                </div>

                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-2 text-emerald-500 mb-1.5">
                    <i className="fa-solid fa-shield-check text-sm"></i>
                    <h5 className="text-xs font-black uppercase tracking-wider">Regras de Acesso Cloud</h5>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Regras de segurança no Firestore rejeitam requisições não autenticadas ou payloads corrompidos.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: Controle de Acesso e Restrição */}
          {activeTab === 'access' && (
            <div className="space-y-5">
              {/* Card de Ativação do Modo Restrito */}
              <div className={`p-4.5 rounded-2xl border-2 transition-all ${
                securityConfig.restrictAccessToGoogle
                  ? (darkMode ? 'bg-blue-950/25 border-blue-600/60' : 'bg-blue-50 border-blue-300')
                  : (darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200')
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-shield-halved text-blue-500"></i>
                      <h4 className="font-black text-sm">Exigir Autenticação Google Obrigatória</h4>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Ao ativar este modo, usuários não autenticados ou fora da lista de e-mails/domínios autorizados são bloqueados na tela de entrada.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={securityConfig.restrictAccessToGoogle}
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
                    E-mails Autorizados para Acesso
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Apenas contas Google com estes e-mails poderão operar o sistema quando o modo restrito estiver ativo.
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <div className="font-bold text-xs text-slate-200">Cloud Sync (Firebase Firestore)</div>
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
                      <div className="font-bold text-xs text-slate-200">Modo Estático Local (IndexedDB)</div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Armazenamento offline local no navegador.</p>
                    </div>
                  </label>
                </div>
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
