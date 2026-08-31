import React, { useState } from 'react';
import { User } from 'firebase/auth';

interface AccessGateProps {
  darkMode: boolean;
  user: User | null;
  reason?: string;
  onLogin: () => Promise<void>;
  onLogout?: () => Promise<void>;
  onBypassOffline?: () => void;
}

export const AccessGate: React.FC<AccessGateProps> = ({
  darkMode,
  user,
  reason,
  onLogin,
  onLogout,
  onBypassOffline
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await onLogin();
    } catch (err: any) {
      setError(err?.message || 'Falha ao autenticar com o Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 sm:p-6 transition-colors ${
      darkMode ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'
    }`}>
      <div className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border-2 shadow-2xl transition-all text-center space-y-6 ${
        darkMode ? 'bg-slate-900/90 border-slate-700/80' : 'bg-white border-slate-200'
      }`}>
        {/* Ícone de Escudo e Cadeado */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="w-20 h-20 rounded-3xl bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center text-3xl text-blue-500 shadow-inner">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-md">
            <i className="fa-solid fa-lock"></i>
          </div>
        </div>

        {/* Título e Explicação de Segurança */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
            Controle de Acesso
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            {reason || 'Este inventário de patrimônio possui restrição de segurança ativa. É necessário autenticar com uma Conta Google corporativa autorizada.'}
          </p>
        </div>

        {/* Informações do usuário logado se não autorizado */}
        {user && !user.isAnonymous && (
          <div className={`p-3.5 rounded-2xl border text-xs text-left flex items-center justify-between gap-3 ${
            darkMode ? 'bg-red-950/20 border-red-900/40 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="truncate">
              <span className="font-bold block">Conectado como:</span>
              <span className="font-mono text-[11px] truncate block opacity-90">{user.email}</span>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase tracking-wider shrink-0 transition-all active:scale-95"
              >
                Trocar
              </button>
            )}
          </div>
        )}

        {/* Mensagem de Erro */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
            {error}
          </div>
        )}

        {/* Botão de Login com Google */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 border border-slate-300 disabled:opacity-50"
          >
            {loading ? (
              <div className="animate-spin h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full"></div>
            ) : (
              <>
                <i className="fa-brands fa-google text-red-500 text-lg"></i>
                <span>Entrar com Conta Google</span>
              </>
            )}
          </button>
        </div>

        {/* Rodapé de Segurança e Contato */}
        <div className="pt-4 border-t border-slate-700/50 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-center gap-2 text-emerald-500 font-bold">
            <i className="fa-solid fa-shield-check"></i>
            <span>Google OAuth 2.0 & Firestore Security Guard</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Administrador responsável: <span className="font-mono text-blue-400">gibasuporte@gmail.com</span>
          </p>
        </div>
      </div>
    </div>
  );
};
