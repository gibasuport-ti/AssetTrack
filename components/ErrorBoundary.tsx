import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Erro capturado pelo ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    try {
      localStorage.removeItem('assettrack_custom_firebase_config');
      localStorage.setItem('assettrack_storage_mode', 'local');
    } catch (e) {
      console.error(e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 text-2xl shadow-inner">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Ocorreu uma instabilidade na inicialização
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-medium leading-relaxed">
                O aplicativo encontrou um erro inesperado ao carregar. Não se preocupe, seus dados locais estão protegidos.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-left overflow-auto max-h-40">
                <p className="font-mono text-xs text-red-400 font-bold mb-1">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <pre className="font-mono text-[10px] text-slate-500 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-rotate-right"></i>
                <span>Recarregar Página</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-database"></i>
                <span>Iniciar no Modo Local (Offline Seguro)</span>
              </button>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500">
              AssetTrack QR • Sistema de Gestão de Patrimônio
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
