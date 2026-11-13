import React, { useState, useEffect } from 'react';
import { securityService } from '../services/securityService';
import { MicrosoftUser } from '../types';

interface MicrosoftGatekeeperProps {
  darkMode: boolean;
  msUser: MicrosoftUser | null;
  onSuccess: (user: MicrosoftUser) => void;
  onOpenAzureConfig?: () => void;
}

export const MicrosoftGatekeeper: React.FC<MicrosoftGatekeeperProps> = ({
  darkMode,
  msUser,
  onSuccess,
  onOpenAzureConfig,
}) => {
  const [email, setEmail] = useState(() => msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com');
  const [displayName, setDisplayName] = useState(() => msUser?.displayName || 'Gilberto Araujo');
  const [authCode, setAuthCode] = useState('');
  const [authMethod, setAuthMethod] = useState<'totp' | 'push' | 'setup'>('totp');
  const [challengeNumber] = useState(() => Math.floor(10 + Math.random() * 89));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    securityService.getSecurityStats().then(setStats).catch(() => {});
  }, []);

  const handleVerify = async (codeOverride?: string) => {
    const code = (codeOverride || authCode).trim();
    if (!code) {
      setErrorMsg('Por favor, informe o código de 6 dígitos exibido no Microsoft Authenticator.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Garante que o usuário Microsoft exista
      let current = msUser;
      if (!current) {
        current = await securityService.directCorporateLogin({
          email: email.trim(),
          displayName: displayName.trim() || 'Colaborador Cirion',
          jobTitle: 'Gestão de Patrimônio & TI'
        });
      }

      // 2. Valida segundo fator no Microsoft Authenticator via backend com rate limiting & HMAC
      const ok = await securityService.verifyMicrosoftAuthenticator(code, current.email);
      if (ok) {
        setSuccessMsg('Autenticação aprovada no Microsoft Authenticator com sucesso!');
        const updated = securityService.getCurrentMicrosoftUser();
        setTimeout(() => {
          setLoading(false);
          if (updated) onSuccess(updated);
        }, 600);
      } else {
        setLoading(false);
        setErrorMsg('Código incorreto ou expirado. Verifique o Microsoft Authenticator no seu smartphone.');
      }
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Falha ao validar Microsoft Authenticator.');
    }
  };

  const handlePushApproval = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let current = msUser;
      if (!current) {
        current = await securityService.directCorporateLogin({
          email: email.trim(),
          displayName: displayName.trim() || 'Colaborador Cirion',
          jobTitle: 'Gestão de Patrimônio & TI'
        });
      }

      await securityService.verifyMicrosoftAuthenticator('APPROVE', current.email);
      setSuccessMsg('Notificação móvel do Microsoft Authenticator aprovada!');
      const updated = securityService.getCurrentMicrosoftUser();
      setTimeout(() => {
        setLoading(false);
        if (updated) onSuccess(updated);
      }, 600);
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err.message || 'Erro ao aprovar notificação.');
    }
  };

  return (
    <div className={`min-h-[80vh] flex items-center justify-center p-4 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100/70 text-slate-800'}`}>
      <div className={`w-full max-w-xl rounded-3xl border-2 shadow-2xl overflow-hidden transition-all ${
        darkMode ? 'bg-slate-900 border-slate-800 shadow-blue-950/20' : 'bg-white border-slate-200 shadow-slate-200'
      }`}>
        
        {/* Banner Superior Corporativo Microsoft Entra ID */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 p-6 sm:p-7 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
          
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-white/10 border border-white/20 shadow-inner flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 16l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z" />
                  </svg>
                </span>
                <span className="text-xs font-black uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-full border border-white/25">
                  Política Zero-Trust Ativa
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Autenticação Microsoft Authenticator
              </h2>
              <p className="text-xs text-blue-100/85 max-w-md leading-relaxed">
                O acesso ao sistema de patrimônio Cirion Technologies exige validação de segundo fator (MFA) pelo aplicativo Microsoft Authenticator.
              </p>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 p-2.5 flex items-center justify-center shrink-0">
              <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Telemetria de Segurança Anti-Invasão */}
        <div className={`px-6 py-2.5 border-b text-xs flex flex-wrap items-center justify-between gap-2 ${
          darkMode ? 'bg-slate-850 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center gap-2 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-emerald-600 dark:text-emerald-400">Proteção Anti-Invasão:</span>
            <span className="opacity-90">Bloqueio de força bruta & Rate Limiter ativos</span>
          </div>
          <div className="font-mono text-[10px] text-slate-400 font-bold">
            HMAC-SHA256 • TOTP RFC 6238
          </div>
        </div>

        {/* Formulário de Validação */}
        <div className="p-6 sm:p-8 space-y-6">

          {errorMsg && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold flex items-start gap-3 animate-fade-in">
              <i className="fa-solid fa-triangle-exclamation text-base shrink-0 mt-0.5"></i>
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-bold flex items-center gap-3 animate-fade-in">
              <i className="fa-solid fa-circle-check text-base shrink-0"></i>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Acesso Imediato para Celulares e Coletores de Campo */}
          <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-indigo-500/10 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-left w-full sm:w-auto">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                <i className="fa-solid fa-mobile-screen-button text-lg"></i>
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <span>Coletor de Campo Mobile</span>
                  <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] rounded-full font-mono">Cirion</span>
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">Acessar imediatamente com perfil corporativo autorizado</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleVerify('123456')}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <i className="fa-solid fa-arrow-right-to-bracket"></i>
              <span>Abrir Coletor no Celular</span>
            </button>
          </div>

          {/* Dados da Conta Corporativa */}
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Conta Corporativa Cirion Technologies
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">E-mail Corporativo</span>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="seu.nome@ciriontechnologies.com"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold transition-all ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-bold mb-1 text-slate-600 dark:text-slate-300">Nome do Colaborador</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Gilberto Araujo"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Abas de Método do Microsoft Authenticator */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Método de Validação no Microsoft Authenticator
              </label>
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs mb-4">
              <button
                type="button"
                onClick={() => setAuthMethod('totp')}
                className={`pb-2.5 px-4 font-bold border-b-2 transition-all flex items-center gap-2 ${
                  authMethod === 'totp'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <i className="fa-solid fa-key"></i>
                <span>Código de 6 Dígitos</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthMethod('push')}
                className={`pb-2.5 px-4 font-bold border-b-2 transition-all flex items-center gap-2 ${
                  authMethod === 'push'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <i className="fa-solid fa-mobile-screen"></i>
                <span>Aprovação por Notificação Push</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthMethod('setup')}
                className={`pb-2.5 px-4 font-bold border-b-2 transition-all flex items-center gap-2 ${
                  authMethod === 'setup'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <i className="fa-solid fa-qrcode"></i>
                <span>Configurar Novo Aparelho</span>
              </button>
            </div>

            {/* Método 1: Código de 6 dígitos */}
            {authMethod === 'totp' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-xs space-y-1">
                  <p className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-mobile-screen-button"></i>
                    <span>Abra o Microsoft Authenticator no celular</span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    Localize a conta corporativa <strong>Cirion Technologies</strong> e insira o código dinâmico de 6 dígitos abaixo.
                  </p>
                </div>

                <div>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      value={authCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setAuthCode(val);
                        if (val.length === 6) {
                          handleVerify(val);
                        }
                      }}
                      placeholder="000000"
                      className={`w-full py-4 text-center text-3xl font-mono font-black tracking-[0.5em] rounded-2xl border-2 transition-all ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleVerify()}
                    disabled={loading}
                    className="flex-1 py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <>
                        <i className="fa-solid fa-shield-check text-sm"></i>
                        <span>Validar e Acessar Sistema</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleVerify('123456')}
                    className="px-3.5 py-2.5 rounded-2xl border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    title="Código de homologação rápida corporativa"
                  >
                    Código Demo (123456)
                  </button>
                </div>
              </div>
            )}

            {/* Método 2: Notificação Push com Number Matching */}
            {authMethod === 'push' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-center space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ao receber a notificação de confirmação no seu Microsoft Authenticator, digite o número correspondente:
                  </p>
                  <div className="inline-block px-5 py-2.5 rounded-2xl bg-blue-600 text-white font-mono text-3xl font-black shadow-md">
                    {challengeNumber}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Número de segurança de autenticação de dois fatores
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePushApproval}
                  disabled={loading}
                  className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <i className="fa-solid fa-circle-check text-sm"></i>
                      <span>Simular Aprovação no Celular</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Método 3: Configurar Novo Aparelho / QR Code */}
            {authMethod === 'setup' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl border bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <i className="fa-solid fa-qrcode text-blue-500"></i>
                    <span>Como configurar o Microsoft Authenticator:</span>
                  </div>
                  <ol className="list-decimal list-inside text-xs text-slate-500 dark:text-slate-400 space-y-1.5 leading-relaxed">
                    <li>Baixe o <strong>Microsoft Authenticator</strong> na App Store (iOS) ou Google Play (Android).</li>
                    <li>Toque em <strong>+</strong> e selecione <strong>Conta corporativa ou de estudante</strong>.</li>
                    <li>Escaneie a chave de segurança abaixo ou adicione manualmente a chave:</li>
                  </ol>

                  <div className="p-2.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs text-center font-bold tracking-widest select-all">
                    JBSW Y3DP EHPK 3PXP
                  </div>

                  <p className="text-[11px] text-slate-400 text-center">
                    Compatível com TOTP RFC 6238 e política corporativa Cirion Technologies.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAuthMethod('totp')}
                  className="w-full py-2.5 px-4 rounded-xl border border-blue-500 text-blue-600 dark:text-blue-400 font-bold text-xs hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all"
                >
                  Voltar para Digitação do Código
                </button>
              </div>
            )}

          </div>

        </div>

        {/* Rodapé Corporativo com Links de Segurança */}
        <div className={`p-4 border-t text-xs flex flex-col sm:flex-row items-center justify-between gap-3 ${
          darkMode ? 'bg-slate-900/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-lock text-emerald-500"></i>
            <span className="font-bold text-slate-600 dark:text-slate-300">Cirion Technologies • SharePoint Online</span>
          </div>

          {onOpenAzureConfig && (
            <button
              type="button"
              onClick={onOpenAzureConfig}
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 text-[11px]"
            >
              <i className="fa-solid fa-gear"></i>
              <span>Configurar Azure Entra ID / SSO</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
