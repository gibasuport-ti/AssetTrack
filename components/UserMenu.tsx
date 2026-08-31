import React, { useState, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';

interface UserMenuProps {
  user: User;
  darkMode: boolean;
  onLogout: () => void;
  onSwitchAccount: () => void;
  onOpenSecurity: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  user,
  darkMode,
  onLogout,
  onSwitchAccount,
  onOpenSecurity,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = (user.email || '').toLowerCase() === 'gibasuporte@gmail.com';
  const hostname = window.location.hostname;
  const isGitHub = hostname.includes('github.io') || hostname !== 'localhost';

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
        title={`Conectado como ${user.email}. Clique para opções da conta.`}
      >
        {user.photoURL ? (
          <img 
            src={user.photoURL} 
            alt="Avatar" 
            referrerPolicy="no-referrer"
            className="w-7 h-7 rounded-lg object-cover border border-emerald-500/50 shrink-0" 
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">
            {(user.displayName || user.email || 'G').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="hidden md:flex flex-col text-left">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-[11px] font-black max-w-[130px] truncate">
              {user.displayName || user.email?.split('@')[0]}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30"></span>
          </div>
          <span className="text-[9px] text-slate-400 font-mono font-bold mt-0.5">
            {isAdmin ? 'Admin Supremo' : 'Google Auth'}
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
          {/* Cabeçalho do Perfil */}
          <div className={`p-4 border-b-2 flex items-center gap-3 ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Avatar" 
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-xl object-cover border-2 border-emerald-500 shadow-sm" 
              />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-blue-600 text-white text-lg font-black flex items-center justify-center shadow-md">
                {(user.displayName || user.email || 'G').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black truncate">{user.displayName || 'Usuário Conectado'}</h4>
              <p className="text-[11px] text-slate-400 font-mono truncate">{user.email}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  isAdmin 
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                }`}>
                  {isAdmin ? '👑 Administrador' : '✓ Autenticado'}
                </span>
              </div>
            </div>
          </div>

          {/* Opções de Ação */}
          <div className="p-2 space-y-1">
            <button
              type="button"
              id="switch-account-btn"
              onClick={() => {
                setIsOpen(false);
                onSwitchAccount();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                darkMode ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <i className="fa-brands fa-google text-blue-500 text-sm w-4"></i>
              <span>Trocar de Conta Google</span>
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
              <i className="fa-solid fa-shield-halved text-purple-500 text-sm w-4"></i>
              <span>Central de Segurança & Auditoria</span>
            </button>

            {/* Helper para GitHub Pages */}
            {isGitHub && (
              <div className={`p-2.5 rounded-xl border text-[10px] space-y-1.5 mt-1 ${
                darkMode ? 'bg-slate-800/50 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>Domínio Atual:</span>
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
            )}

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
              <i className="fa-solid fa-right-from-bracket text-sm w-4"></i>
              <span>Sair da Conta (Logout)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
