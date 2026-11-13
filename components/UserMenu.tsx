import React, { useState, useRef, useEffect } from 'react';
import { MicrosoftUser } from '../types';

interface UserMenuProps {
  msUser: MicrosoftUser;
  darkMode: boolean;
  onLogout: () => void;
  onRevalidateMfa: () => void;
  onOpenSecurity: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  msUser,
  darkMode,
  onLogout,
  onRevalidateMfa,
  onOpenSecurity,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = (msUser.email || '').toLowerCase().includes('admin') || 
                  (msUser.email || '').toLowerCase().includes('giba') ||
                  msUser.role === 'admin';
  const hostname = window.location.hostname;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const copyDomain = () => {
    navigator.clipboard.writeText(hostname);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Botão Gatilho do Cabeçalho */}
      <button
        type="button"
        id="user-profile-header-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 transition-all text-left group cursor-pointer ${
          darkMode 
            ? 'bg-slate-800/90 border-slate-700 hover:border-blue-500/60' 
            : 'bg-white border-slate-200 hover:border-blue-400 shadow-sm'
        }`}
        title={`Conectado como ${msUser.email}. Validado no Microsoft Authenticator.`}
      >
        {/* Avatar com logo Microsoft */}
        <div className="relative">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-xs font-black flex items-center justify-center shadow-sm">
            {(msUser.displayName || msUser.email || 'M').charAt(0).toUpperCase()}
          </div>
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center p-0.5 shadow-sm border border-slate-200 dark:border-slate-700">
            <svg className="w-2.5 h-2.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
            </svg>
          </span>
        </div>

        <div className="hidden md:flex flex-col text-left">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-[11px] font-black max-w-[130px] truncate">
              {msUser.displayName || msUser.email?.split('@')[0]}
            </span>
            <span 
              className={`w-2 h-2 rounded-full ring-2 ${
                msUser.mfaVerified 
                  ? 'bg-emerald-500 ring-emerald-500/30' 
                  : 'bg-amber-500 ring-amber-500/30'
              }`}
              title={msUser.mfaVerified ? 'MFA Authenticator Ativo' : 'MFA Pendente'}
            ></span>
          </div>
          <span className="text-[9px] text-slate-400 font-mono font-bold mt-0.5 flex items-center gap-1">
            <i className="fa-solid fa-shield-halved text-emerald-500 text-[8px]"></i>
            <span>{msUser.mfaVerified ? 'MFA Validado' : 'MFA Pendente'}</span>
          </span>
        </div>
        <i className={`fa-solid fa-chevron-down text-[10px] opacity-40 group-hover:opacity-100 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>

      {/* Menu Dropdown Flutuante */}
      {isOpen && (
        <div 
          className={`absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl shadow-2xl border-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          {/* Cabeçalho do Perfil Microsoft Entra ID */}
          <div className={`p-4 border-b-2 flex items-center gap-3 ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white text-lg font-black flex items-center justify-center shadow-md">
                {(msUser.displayName || msUser.email || 'M').charAt(0).toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                </svg>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-black truncate">{msUser.displayName || 'Usuário Corporativo'}</h4>
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate">{msUser.email}</p>
              {msUser.jobTitle && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{msUser.jobTitle}</p>
              )}
              
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  isAdmin 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                    : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                }`}>
                  {isAdmin ? '👑 Administrador TI' : 'Colaborador'}
                </span>
                
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ${
                  msUser.mfaVerified
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                }`}>
                  <i className={`fa-solid ${msUser.mfaVerified ? 'fa-check' : 'fa-clock'}`}></i>
                  {msUser.mfaVerified ? 'Authenticator 2FA' : '2FA Pendente'}
                </span>
              </div>
            </div>
          </div>

          {/* Selo de Segurança Anti-Invasão Ativo */}
          <div className="px-4 py-2.5 bg-emerald-500/5 border-b border-emerald-500/20 flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span>Proteção Anti-Invasão HMAC Ativa</span>
            </div>
            <span className="font-mono text-[9px] text-slate-400">SHA-256</span>
          </div>

          {/* Opções de Ação */}
          <div className="p-2 space-y-1">
            <button
              type="button"
              id="revalidate-authenticator-btn"
              onClick={() => {
                setIsOpen(false);
                onRevalidateMfa();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                darkMode ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="w-5 h-5 rounded bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
                </svg>
              </div>
              <div>
                <span className="block font-bold">Validar no Microsoft Authenticator</span>
                <span className="text-[10px] text-slate-400 font-normal">Renovar segundo fator TOTP / Push</span>
              </div>
            </button>

            <button
              type="button"
              id="open-security-from-menu-btn"
              onClick={() => {
                setIsOpen(false);
                onOpenSecurity();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                darkMode ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <div className="w-5 h-5 rounded bg-indigo-600/15 text-indigo-500 flex items-center justify-center shrink-0">
                <i className="fa-solid fa-shield-halved text-xs"></i>
              </div>
              <div>
                <span className="block font-bold">Central de Segurança & Auditoria</span>
                <span className="text-[10px] text-slate-400 font-normal">Logs de intrusão, whitelist e políticas</span>
              </div>
            </button>

            {/* Rede Corporativa Cirion Technologies */}
            <div className={`p-2.5 rounded-xl border text-[10px] space-y-1.5 mt-1 ${
              darkMode ? 'bg-slate-850 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Rede Cirion Technologies
                </span>
                <button 
                  type="button" 
                  onClick={copyDomain}
                  className="text-blue-500 hover:text-blue-400 flex items-center gap-1 font-black"
                >
                  <i className={`fa-solid ${copied ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <code className="block bg-black/20 p-1 rounded font-mono text-[9px] truncate">
                {hostname}
              </code>
            </div>

            <div className={`h-[1px] my-1 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>

            <button
              type="button"
              id="logout-btn"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black text-red-500 hover:bg-red-500/10 transition-all text-left"
            >
              <i className="fa-solid fa-right-from-bracket text-sm w-5 text-center"></i>
              <span>Desconectar Conta Microsoft</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
