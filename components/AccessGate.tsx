import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { MicrosoftUser } from '../types';
import { securityService } from '../services/securityService';

interface AccessGateProps {
  darkMode: boolean;
  user: User | null;
  msUser?: MicrosoftUser | null;
  reason?: string;
  requiresMfa?: boolean;
  onLogin: () => Promise<void>;
  onLogout?: () => Promise<void>;
  onMicrosoftLogin?: () => Promise<void>;
  onMicrosoftLogout?: () => Promise<void>;
  onOpenMfaModal?: () => void;
  onMfaVerified?: () => void;
  onBypassOffline?: () => void;
}

export const AccessGate: React.FC<AccessGateProps> = ({
  darkMode,
  user,
  msUser,
  reason,
  requiresMfa,
  onLogin,
  onLogout,
  onMicrosoftLogin,
  onMicrosoftLogout,
  onOpenMfaModal,
  onMfaVerified,
  onBypassOffline
}) => {
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMs, setLoadingMs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para o campo de digitação do código do Microsoft Authenticator
  const [inlineMfaCode, setInlineMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const [mfaSuccess, setMfaSuccess] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const handleVerifyInlineMfa = async (codeToVerify?: string) => {
    const code = (codeToVerify || inlineMfaCode).trim().replace(/\s/g, '');
    if (!code || code.length < 6) {
      setMfaError('Por favor, digite os 6 dígitos exibidos no Microsoft Authenticator.');
      return;
    }

    setVerifyingMfa(true);
    setMfaError(null);
    setMfaSuccess(null);

    try {
      const email = msUser?.email || user?.email || 'gilberto.araujo.ext@ciriontechnologies.com';
      const ok = await securityService.verifyMicrosoftAuthenticator(code, email);
      if (ok) {
        setMfaSuccess('Código validado com sucesso! Liberando acesso...');
        setTimeout(() => {
          setVerifyingMfa(false);
          if (onMfaVerified) {
            onMfaVerified();
          }
        }, 600);
      } else {
        setVerifyingMfa(false);
        setMfaError('Código incorreto. Verifique o Microsoft Authenticator e tente novamente.');
      }
    } catch (err: any) {
      setVerifyingMfa(false);
      setMfaError(err.message || 'Falha ao validar o código no Microsoft Authenticator.');
    }
  };

  const handleInlinePushApprove = async () => {
    setVerifyingMfa(true);
    setMfaError(null);
    setMfaSuccess(null);
    try {
      const email = msUser?.email || user?.email || 'gilberto.araujo.ext@ciriontechnologies.com';
      await securityService.verifyMicrosoftAuthenticator('APPROVE', email);
      setMfaSuccess('Notificação aprovada no celular! Liberando acesso...');
      setTimeout(() => {
        setVerifyingMfa(false);
        if (onMfaVerified) {
          onMfaVerified();
        }
      }, 600);
    } catch (err: any) {
      setVerifyingMfa(false);
      setMfaError(err.message || 'Erro ao aprovar notificação.');
    }
  };

  const handleGoogleLogin = async () => {
    setLoadingGoogle(true);
    setError(null);
    try {
      await onLogin();
    } catch (err: any) {
      setError(err?.message || 'Falha ao autenticar com o Google.');
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleMsLogin = async () => {
    if (!onMicrosoftLogin) return;
    setLoadingMs(true);
    setError(null);
    try {
      await onMicrosoftLogin();
    } catch (err: any) {
      setError(err?.message || 'Falha ao autenticar com a conta corporativa Microsoft 365.');
    } finally {
      setLoadingMs(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 sm:p-6 transition-colors ${
      darkMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'
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
            Acesso Corporativo Seguro
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            {reason || 'Este inventário de patrimônio corporativo possui restrição de segurança ativa. É necessário autenticar com sua credencial Microsoft 365 ou Google autorizada.'}
          </p>
        </div>

        {/* Desafio de Microsoft Authenticator (MFA) */}
        {requiresMfa && (
          <div className={`p-4 sm:p-5 rounded-2xl border-2 text-left space-y-3.5 transition-all shadow-md ${
            darkMode ? 'bg-amber-950/30 border-amber-500/60 text-amber-100' : 'bg-amber-50 border-amber-400 text-amber-900'
          }`}>
            <div className="flex items-start space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-500 mt-0.5">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-xs sm:text-sm">Microsoft Authenticator Exigido</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    2FA / MFA
                  </span>
                </div>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Digite o código temporário de 6 dígitos gerado no app <strong>Microsoft Authenticator</strong> ou confirme a notificação.
                </p>
              </div>
            </div>

            {/* Campo para Digitar o Código de 6 Dígitos */}
            <div className="space-y-1.5 pt-1">
              <label htmlFor="authenticator-code-input" className="block text-[11px] font-bold tracking-wide uppercase opacity-90">
                Código do Authenticator (6 Dígitos):
              </label>
              <div className="relative">
                <input
                  id="authenticator-code-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  value={inlineMfaCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setInlineMfaCode(val);
                    setMfaError(null);
                    if (val.length === 6) {
                      handleVerifyInlineMfa(val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inlineMfaCode.length === 6) {
                      e.preventDefault();
                      handleVerifyInlineMfa();
                    }
                  }}
                  placeholder="000 000"
                  className={`w-full py-3 px-4 rounded-xl border-2 text-center text-2xl sm:text-3xl font-mono font-black tracking-[0.35em] outline-none transition-all shadow-inner ${
                    darkMode 
                      ? 'bg-slate-900/90 border-amber-500/60 text-amber-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30' 
                      : 'bg-white border-amber-400 text-amber-950 focus:border-amber-600 focus:ring-2 focus:ring-amber-400/30'
                  }`}
                />
                {inlineMfaCode && (
                  <button
                    type="button"
                    onClick={() => {
                      setInlineMfaCode('');
                      setMfaError(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1"
                    title="Limpar código"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Mensagens de Sucesso ou Erro */}
            {mfaSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center space-x-2">
                <i className="fa-solid fa-circle-check shrink-0"></i>
                <span>{mfaSuccess}</span>
              </div>
            )}

            {mfaError && (
              <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-600 dark:text-red-400 text-xs font-bold flex items-center space-x-2">
                <i className="fa-solid fa-circle-exclamation shrink-0"></i>
                <span>{mfaError}</span>
              </div>
            )}

            {/* Botão de Validação Principal */}
            <button
              id="btn-validate-authenticator-code"
              type="button"
              disabled={verifyingMfa || inlineMfaCode.length < 6}
              onClick={() => handleVerifyInlineMfa()}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifyingMfa ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Validando Código...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-slate-950" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  <span>Validar Microsoft Authenticator</span>
                </>
              )}
            </button>

            {/* Opções alternativas: Aprovação Push ou Modal de Opções */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-amber-500/20 text-[11px]">
              <button
                type="button"
                onClick={handleInlinePushApprove}
                disabled={verifyingMfa}
                className="text-amber-700 dark:text-amber-300 hover:underline font-bold flex items-center gap-1.5"
              >
                <i className="fa-solid fa-mobile-screen"></i>
                <span>Aprovar via Notificação Push</span>
              </button>

              {onOpenMfaModal && (
                <button
                  type="button"
                  onClick={onOpenMfaModal}
                  className="text-amber-700 dark:text-amber-300 hover:underline font-bold flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-qrcode"></i>
                  <span>Opções Avançadas / QR Code</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Informações do usuário logado se não autorizado */}
        {(msUser || (user && !user.isAnonymous)) && (
          <div className={`p-3.5 rounded-2xl border text-xs text-left flex items-center justify-between gap-3 ${
            darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className="truncate">
              <span className="font-bold block text-[11px] text-slate-400">Conectado como:</span>
              <span className="font-mono text-xs truncate block font-bold">
                {msUser ? `${msUser.displayName} (${msUser.email})` : user?.email}
              </span>
            </div>
            <button
              type="button"
              onClick={msUser ? onMicrosoftLogout : onLogout}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] uppercase tracking-wider shrink-0 transition-all active:scale-95"
            >
              Trocar
            </button>
          </div>
        )}

        {/* Mensagem de Erro */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold">
            {error}
          </div>
        )}

        {/* Botões de Login Corporativo */}
        <div className="space-y-2.5 pt-2">
          {/* Microsoft 365 (Principal Corporativo) */}
          {onMicrosoftLogin && (
            <button
              type="button"
              onClick={handleMsLogin}
              disabled={loadingMs}
              className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loadingMs ? (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <>
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
                  </svg>
                  <span>Entrar com Microsoft 365</span>
                </>
              )}
            </button>
          )}

          {/* Google (Alternativo) */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loadingGoogle}
            className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center justify-center gap-3 border border-slate-300 disabled:opacity-50"
          >
            {loadingGoogle ? (
              <div className="animate-spin h-4 w-4 border-2 border-slate-800 border-t-transparent rounded-full"></div>
            ) : (
              <>
                <i className="fa-brands fa-google text-red-500 text-sm"></i>
                <span>Entrar com Google</span>
              </>
            )}
          </button>

          {/* Acesso Direto / Modo Coletor Mobile */}
          <button
            type="button"
            onClick={() => {
              if (onBypassOffline) {
                onBypassOffline();
              } else {
                securityService.createMobileOperatorUser();
                window.location.reload();
              }
            }}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2.5 border border-emerald-500/40"
          >
            <i className="fa-solid fa-mobile-screen text-sm"></i>
            <span>Continuar para o Aplicativo (Modo Coletor Mobile)</span>
          </button>
        </div>

        {/* Rodapé de Segurança e Compliance */}
        <div className="pt-4 border-t border-slate-700/50 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-center gap-2 text-emerald-500 font-bold">
            <i className="fa-solid fa-network-wired"></i>
            <span>Rede Corporativa Cirion Technologies • Uso Interno Exclusivo</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Microsoft Entra ID &amp; Authenticator • Acesso Restrito
          </p>
        </div>
      </div>
    </div>
  );
};
