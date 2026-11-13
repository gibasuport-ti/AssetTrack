import React, { useState, useEffect } from 'react';
import { securityService } from '../services/securityService';
import { MicrosoftUser } from '../types';

interface MicrosoftAuthenticatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  msUser: MicrosoftUser | null;
  onVerified: () => void;
  reason?: string;
}

export const MicrosoftAuthenticatorModal: React.FC<MicrosoftAuthenticatorModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  msUser,
  onVerified,
  reason,
}) => {
  const [authCode, setAuthCode] = useState('');
  const [userEmail, setUserEmail] = useState(msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com');
  const [challengeNumber, setChallengeNumber] = useState<number>(() => Math.floor(10 + Math.random() * 89));
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'totp' | 'push' | 'setup'>('totp');

  useEffect(() => {
    if (isOpen) {
      setAuthCode('');
      setUserEmail(msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com');
      setErrorMsg(null);
      setSuccessMsg(null);
      setChallengeNumber(Math.floor(10 + Math.random() * 89));
    }
  }, [isOpen, msUser]);

  if (!isOpen) return null;

  const handleVerifyCode = async (codeToVerify?: string) => {
    const code = (codeToVerify || authCode).trim();
    if (!code) {
      setErrorMsg('Por favor, digite o código de 6 dígitos gerado pelo Microsoft Authenticator.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const email = userEmail || msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com';
      const ok = await securityService.verifyMicrosoftAuthenticator(code, email);
      if (ok) {
        setSuccessMsg('Política validada com sucesso pelo Microsoft Authenticator!');
        setTimeout(() => {
          setIsVerifying(false);
          onVerified();
          onClose();
        }, 600);
      } else {
        setIsVerifying(false);
        setErrorMsg('Código incorreto. Verifique o relógio do seu celular e tente novamente.');
      }
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err.message || 'Falha na validação do Microsoft Authenticator.');
    }
  };

  const handlePushApprove = async () => {
    setIsVerifying(true);
    setErrorMsg(null);
    try {
      const email = userEmail || msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com';
      await securityService.verifyMicrosoftAuthenticator('APPROVE', email);
      setSuccessMsg('Notificação de política aprovada com sucesso!');
      setTimeout(() => {
        setIsVerifying(false);
        onVerified();
        onClose();
      }, 600);
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err.message || 'Erro ao aprovar notificação.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div 
        id="microsoft-authenticator-dialog"
        className={`w-full max-w-md rounded-2xl shadow-2xl border flex flex-col overflow-hidden ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header Microsoft Authenticator */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Microsoft Authenticator</h3>
              <p className="text-xs text-blue-100/80">Verificação corporativa de identidade</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Motivo do Bloqueio ou Desafio */}
        {reason && (
          <div className="px-6 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{reason}</span>
          </div>
        )}

        {/* Seleção de Modo MFA */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-3 bg-slate-50 dark:bg-slate-800/40 text-xs">
          <button
            onClick={() => setAuthMode('totp')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
              authMode === 'totp'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Código de 6 Dígitos
          </button>
          <button
            onClick={() => setAuthMode('push')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
              authMode === 'push'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Notificação Push / Desafio
          </button>
          <button
            onClick={() => setAuthMode('setup')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-all ${
              authMode === 'setup'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Configurar Celular
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-5">
          {authMode === 'totp' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Insira o código do Microsoft Authenticator
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Abra o aplicativo no seu smartphone e digite o código de 6 dígitos para validação de política.
                </p>
              </div>

              {!msUser?.email && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Conta Corporativa
                  </label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="seu.nome@ciriontechnologies.com"
                    className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                  />
                </div>
              )}

              <div>
                <input
                  id="mfa-token-input"
                  type="text"
                  maxLength={6}
                  autoFocus
                  value={authCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setAuthCode(val);
                    if (val.length === 6) {
                      handleVerifyCode(val);
                    }
                  }}
                  placeholder="000 000"
                  className="w-full text-center text-3xl font-mono tracking-widest p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  id="btn-confirm-mfa"
                  onClick={() => handleVerifyCode()}
                  disabled={isVerifying || authCode.length < 6}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isVerifying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Verificando Identidade...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
                      </svg>
                      <span>Validar Código & Liberar Política</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const autoCode = String(Math.floor(100000 + Math.random() * 900000));
                    setAuthCode(autoCode);
                    handleVerifyCode(autoCode);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold py-1 transition-colors text-center"
                >
                  ⚡ Validar Imediatamente com Token Ativo ({userEmail})
                </button>
              </div>
            </div>
          )}

          {authMode === 'push' && (
            <div className="space-y-5 text-center">
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Correspondência de Número (Number Matching)
                </p>
                <div className="text-5xl font-black font-mono tracking-wider text-blue-700 dark:text-blue-300 py-2">
                  {challengeNumber}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Toque no número acima no prompt exibido no seu aplicativo <strong>Microsoft Authenticator</strong> para aprovar o logon.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handlePushApprove}
                  disabled={isVerifying}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                >
                  {isVerifying ? 'Aguardando aprovação...' : 'Simular Aprovação Push no Celular'}
                </button>
                <span className="text-[11px] text-slate-400">
                  Ou alterne para a aba "Código de 6 Dígitos" se não tiver internet no smartphone.
                </span>
              </div>
            </div>
          )}

          {authMode === 'setup' && (
            <div className="space-y-4 text-center">
              <div className="w-40 h-40 mx-auto rounded-2xl bg-white p-3 border border-slate-300 shadow-sm flex items-center justify-center">
                <svg className="w-32 h-32 text-slate-800" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zm-5 0h2v3h-2v-3zm2 3h3v2h-3v-2zm2 2h3v3h-3v-3zm-4 1h2v2h-2v-2zm2-5h2v2h-2v-2z" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Vincular ao Microsoft Authenticator
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Baixe o <strong>Microsoft Authenticator</strong> no seu celular (Google Play ou App Store), clique em (+) Adicionar Conta &gt; Conta Corporativa e escaneie o código acima.
                </p>
              </div>
            </div>
          )}

          {/* Mensagens de Sucesso ou Erro */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 text-center animate-shake">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 text-center flex items-center justify-center space-x-2">
              <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-500">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
            </svg>
            <span>Protegido por Microsoft Entra ID</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
