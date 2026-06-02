
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { assetService } from './services/assetService';
import { geminiService } from './services/geminiService';
import { Asset, AssetFormData, EquipmentType } from './types';
import BarcodeScanner from './components/BarcodeScanner';
import * as XLSX from 'xlsx';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signInAnonymously, GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';

// ... (ErrorBoundary remains the same)

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Erro no Firestore: ${parsed.error}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border-2 border-red-900/50 p-8 rounded-3xl shadow-2xl">
            <div className="bg-red-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
            </div>
            <h2 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Ops! Algo deu errado</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg active:scale-95"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const BRANDS = ['LENOVO', 'MOTOROLA', 'SAMSUNG', 'DELL', 'APPLE', 'HP'];
const MODELS = [
  'E14 G6', 'E14 G2', 'E14 G4', 'E480', 'E470', 'T470', 
  'T14 G1', 'T14 G2', 'T14 G5', 'X13 G5', 'X13 G1', 
  'MOTO G54', 'MOTO GS5', 'A12', 'A20', 'iPad Air'
];
const STATUS_OPTIONS = ['BOM', 'DANIFICADO'];

const getBrasiliaDateString = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
};

const App: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Estados para controle de campos customizados
  const [isCustomType, setIsCustomType] = useState(false);
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);

  // Controle do painel de segurança e conexão (Práticas de Segurança e GitHub Pages)
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [localGeminiKey, setLocalGeminiKey] = useState(() => localStorage.getItem('assettrack_gemini_api_key') || '');
  const [storageMode, setStorageMode] = useState<'cloud' | 'local'>(() => {
    const saved = localStorage.getItem('assettrack_storage_mode');
    if (saved === 'cloud' || saved === 'local') return saved;
    // No GitHub Pages ou qualquer host estático externo público (exceto nosso dev server ou local),
    // o padrão ideal é 'local' (IndexedDB) para funcionar offline, autônomo e sem depender da plataforma de origem.
    const isGitHubPages = window.location.hostname.includes('github.io');
    const isLocalOrRunner = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1') || window.location.hostname.includes('run.app');
    if (isGitHubPages || !isLocalOrRunner) {
      return 'local';
    }
    return 'cloud';
  });
  const [customFirebaseConfig, setCustomFirebaseConfig] = useState(() => localStorage.getItem('assettrack_custom_firebase_config') || '');
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSaveSecurity = () => {
    if (localGeminiKey) {
      localStorage.setItem('assettrack_gemini_api_key', localGeminiKey.trim());
    } else {
      localStorage.removeItem('assettrack_gemini_api_key');
    }
    localStorage.setItem('assettrack_storage_mode', storageMode);
    
    if (customFirebaseConfig) {
      try {
        JSON.parse(customFirebaseConfig);
        localStorage.setItem('assettrack_custom_firebase_config', customFirebaseConfig.trim());
      } catch (err) {
        alert('Configuração do Firebase inválida. Certifique-se de colar um objeto JSON válido do Firebase Config.');
        return;
      }
    } else {
      localStorage.removeItem('assettrack_custom_firebase_config');
    }
    
    setShowSecurityModal(false);
    window.location.reload();
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);

  const getInitialForm = (): AssetFormData => ({
    DataAquisicao: getBrasiliaDateString(),
    TipoEquipamento: EquipmentType.NOTEBOOK,
    marca: '',
    modelo: '',
    serial: '',
    NumeroPatrimonio: '',
    EstadoEquipamento: 'BOM',
    observacao: ''
  });

  const [formData, setFormData] = useState<AssetFormData>(getInitialForm());

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    if (storageMode === 'local') {
      setIsAuthReady(true);
      setUser(null);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (!currentUser) {
        setAuthError(null);
        // Tenta login anônimo por padrão
        signInAnonymously(auth).catch(err => {
          console.error("Erro ao entrar anonimamente:", err);
          setAuthError("Falha na autenticação automática. Tente entrar com Google.");
        });
      }
    });
    return () => unsubscribe();
  }, [storageMode]);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setAuthError(null);
    } catch (err) {
      console.error("Erro ao entrar com Google:", err);
      setAuthError("Erro ao entrar com Google. Verifique se popups estão permitidos.");
    }
  };

  const fetchAssets = useCallback(async () => {
    if (storageMode === 'cloud' && (!isAuthReady || !user)) return;
    setLoading(true);
    try {
      const data = await assetService.getAssets();
      setAssets(data);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthReady, user, storageMode]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filteredAssets = useMemo(() => {
    if (!searchTerm) return assets;
    const term = searchTerm.toLowerCase();
    return assets.filter(asset => 
      asset.modelo.toLowerCase().includes(term) ||
      asset.marca.toLowerCase().includes(term) ||
      asset.serial.toLowerCase().includes(term) ||
      asset.NumeroPatrimonio.toLowerCase().includes(term) ||
      asset.TipoEquipamento.toLowerCase().includes(term) ||
      asset.EstadoEquipamento.toLowerCase().includes(term) ||
      asset.observacao.toLowerCase().includes(term)
    );
  }, [assets, searchTerm]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length && filteredAssets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const isDuplicate = assets.some(a => 
      a.serial.trim().toLowerCase() === formData.serial.trim().toLowerCase() && 
      (!editingAsset || a.id !== editingAsset.id)
    );

    if (isDuplicate) {
      alert(`Atenção: O Número de Serial "${formData.serial}" já está cadastrado no sistema!`);
      serialInputRef.current?.focus();
      return;
    }

    setIsSaving(true);

    try {
      if (editingAsset) {
        await assetService.updateAsset(editingAsset.id, formData);
        setShowForm(false);
        setEditingAsset(null);
      } else {
        await assetService.addAsset(formData);
        
        setFormData(prev => ({
          ...prev,
          serial: '',
          NumeroPatrimonio: '',
          observacao: '' 
        }));
        
        setTimeout(() => {
          serialInputRef.current?.focus();
        }, 50);
      }
      
      fetchAssets();
      setIsCustomType(false);
      setIsCustomBrand(false);
      setIsCustomModel(false);
    } catch (err) {
      alert('Erro ao salvar as informações localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    const standardTypes = Object.values(EquipmentType) as string[];
    const customT = !!(asset.TipoEquipamento && !standardTypes.includes(asset.TipoEquipamento));
    const customB = !!(asset.marca && !BRANDS.includes(asset.marca.toUpperCase()));
    const customM = !!(asset.modelo && !MODELS.includes(asset.modelo.toUpperCase()));
    
    setIsCustomType(customT);
    setIsCustomBrand(customB);
    setIsCustomModel(customM);

    setFormData({
      DataAquisicao: asset.DataAquisicao,
      TipoEquipamento: asset.TipoEquipamento as EquipmentType,
      marca: asset.marca,
      modelo: asset.modelo,
      serial: asset.serial,
      NumeroPatrimonio: asset.NumeroPatrimonio,
      EstadoEquipamento: asset.EstadoEquipamento || 'BOM',
      observacao: asset.observacao || ''
    });
    setShowForm(true);
  };

  const confirmDelete = async (id: string) => {
    try {
      await assetService.deleteAsset(id);
      setAssets(current => current.filter(a => String(a.id) !== String(id)));
      setDeletingId(null);
      const nextSelected = new Set(selectedIds);
      nextSelected.delete(id);
      setSelectedIds(nextSelected);
    } catch (err) {
      alert('Erro ao tentar excluir o item localmente.');
    }
  };

  const handleAiAnalysis = async () => {
    const selectedAssets = assets.filter(a => selectedIds.has(a.id));
    if (selectedAssets.length === 0) {
      return alert('Por favor, selecione ao menos um item no inventário para consultar a ficha técnica.');
    }
    setAnalyzing(true);
    try {
      const result = await geminiService.analyzeInventory(selectedAssets);
      setAiAnalysis(result || null);
    } catch (err: any) {
      console.error('Erro na análise:', err);
      let errMsg = err?.message || 'Erro inesperado ao consultar a IA.';
      if (window.location.hostname.includes('github.io')) {
        errMsg += '\n\nDica: No GitHub Pages (ambiente estático), você deve inserir sua chave pessoal do Gemini (pelo ícone de Escudo Azul no topo) para que as requisições de IA funcionem diretamente do navegador.';
      }
      alert(errMsg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleScanResult = (code: string) => {
    if (!code) return;
    setFormData(prev => ({ ...prev, serial: code }));
    setShowScanner(false);
    setTimeout(() => serialInputRef.current?.focus(), 100);
  };

  const exportToExcel = () => {
    if (filteredAssets.length === 0) return alert('Sem dados para exportar.');
    const worksheet = XLSX.utils.json_to_sheet(filteredAssets.map(a => ({
      'Patrimônio': a.NumeroPatrimonio,
      'Equipamento': a.TipoEquipamento,
      'Marca': a.marca,
      'Modelo': a.modelo,
      'Serial': a.serial,
      'Estado': a.EstadoEquipamento,
      'Observação': a.observacao,
      'Data': a.DataAquisicao
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventário");
    XLSX.writeFile(workbook, `Inventario_${getBrasiliaDateString()}.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    reader.onload = async (ev) => {
      try {
        let dataToImport: any[] = [];
        if (isExcel) {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          dataToImport = json.map((row: any) => ({
            NumeroPatrimonio: String(row['Patrimônio'] || row['NumeroPatrimonio'] || ''),
            TipoEquipamento: String(row['Equipamento'] || row['TipoEquipamento'] || 'NOTEBOOK'),
            marca: String(row['Marca'] || row['marca'] || ''),
            modelo: String(row['Modelo'] || row['modelo'] || ''),
            serial: String(row['Serial'] || row['serial'] || ''),
            EstadoEquipamento: String(row['Estado'] || row['EstadoEquipamento'] || 'BOM'),
            observacao: String(row['Observação'] || row['observacao'] || ''),
            DataAquisicao: String(row['Data'] || row['DataAquisicao'] || getBrasiliaDateString()),
            id: row['id'] ? String(row['id']) : Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
            createdAt: row['createdAt'] ? String(row['createdAt']) : new Date().toISOString()
          }));
        } else {
          const content = ev.target?.result as string;
          dataToImport = JSON.parse(content);
        }
        const success = await assetService.importLocalData(JSON.stringify(dataToImport));
        if (success) {
          alert('Dados importados com sucesso!');
          await fetchAssets();
        } else {
          alert('O arquivo não contém dados válidos de inventário.');
        }
      } catch (err) {
        console.error('Erro na importação:', err);
        alert('Erro ao processar o arquivo.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'BOM':
        return darkMode ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-green-100 text-green-700 border-green-200';
      case 'DANIFICADO':
        return darkMode ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-red-100 text-red-700 border-red-200';
      default:
        return darkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const openNewForm = () => {
    setEditingAsset(null); 
    setFormData(getInitialForm()); 
    setIsCustomType(false);
    setIsCustomBrand(false);
    setIsCustomModel(false);
    setShowForm(true); 
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className={`border-b-2 sticky top-0 z-40 shadow-sm transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg">
              <i className="fa-solid fa-qrcode text-white"></i>
            </div>
            <h1 className="text-lg font-bold tracking-tight">AssetTrack QR</h1>
          </div>
          <div className="flex items-center gap-3">
            {authError && (
              <button 
                onClick={handleGoogleLogin} 
                className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded-md font-bold flex items-center gap-1 hover:bg-amber-500/20 transition-all"
                title={authError}
              >
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span className="hidden sm:inline">Erro Auth - Login Google</span>
              </button>
            )}
            
            {user?.isAnonymous && !authError && (
              <button 
                onClick={handleGoogleLogin}
                className={`text-[10px] hidden md:flex items-center gap-1 px-2 py-1 rounded-md border transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
              >
                <i className="fa-brands fa-google"></i> Login
              </button>
            )}

            {user && !user.isAnonymous && (
              <div className="flex items-center gap-2">
                {user.photoURL && <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-blue-500" />}
                <span className="text-[10px] font-bold hidden lg:inline max-w-[100px] truncate opacity-60">{user.displayName || user.email}</span>
              </div>
            )}

            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
              title="Alternar Tema"
            >
              <i className={`fa-solid ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
            </button>
            <button 
              onClick={() => setShowSecurityModal(true)}
              className={`h-10 rounded-xl px-3 flex items-center justify-center gap-2 border-2 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-blue-600 hover:bg-slate-200'}`}
              title="Configurações de Segurança e Conexão"
            >
              <i className="fa-solid fa-shield-halved"></i>
              <span className="text-xs font-bold hidden sm:inline">Configurações</span>
            </button>
            <button 
              onClick={openNewForm}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl flex items-center gap-2 font-bold shadow-md active:scale-95"
            >
              <i className="fa-solid fa-plus"></i>
              <span className="hidden sm:inline">Novo Item</span>
            </button>
          </div>
        </div>
      </header>

      {window.location.hostname.includes('github.io') && (
        <div className={`border-b-2 py-3 px-4 text-center text-xs font-bold flex flex-wrap items-center justify-center gap-2 transition-colors ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-amber-50 border-slate-200 text-amber-800'}`}>
          <i className="fa-solid fa-circle-info text-amber-500 text-sm"></i>
          <span>Você está rodando no GitHub Pages! O app foi configurado no modo <span className="underline">Local (auto-contido)</span> de forma independente do AI Studio.</span>
          <button onClick={() => setShowSecurityModal(true)} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg text-[10px] uppercase font-black tracking-wider transition-colors shadow-sm ml-1">Configurar Serviços</button>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={`p-5 rounded-2xl shadow-sm border-2 transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center justify-between gap-4`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${storageMode === 'cloud' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                <i className={`fa-solid ${storageMode === 'cloud' ? 'fa-cloud' : 'fa-box-archive'} text-xl`}></i>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Armazenamento</p>
                <p className={`text-sm font-black ${storageMode === 'cloud' ? 'text-green-500' : 'text-amber-500'}`}>
                  {storageMode === 'cloud' ? 'Cloud Sync (Ativo)' : 'Modo Estático Local'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSecurityModal(true)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border-2 font-bold transition-all shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-blue-600 hover:bg-slate-200'}`}
            >
              Configurar
            </button>
          </div>
          <div className={`p-5 rounded-2xl shadow-sm border-2 transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center gap-4`}>
            <div className="bg-green-500/10 p-3 rounded-xl text-green-500"><i className="fa-solid fa-database text-xl"></i></div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Frota Total</p>
              <p className="text-2xl font-black">{assets.length}</p>
            </div>
          </div>
          <div className={`p-5 rounded-2xl shadow-sm border-2 transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} flex items-center gap-4`}>
             <button 
                onClick={handleAiAnalysis} 
                disabled={analyzing} 
                className={`w-full flex items-center gap-4 text-left group transition-opacity ${selectedIds.size === 0 ? 'opacity-50 grayscale' : 'opacity-100'}`}
             >
                <div className={`p-3 rounded-xl transition-colors ${analyzing ? 'bg-slate-500/10 text-slate-500' : 'bg-purple-500/10 text-purple-500 group-hover:bg-purple-600 group-hover:text-white'}`}>
                  <i className={`fa-solid ${analyzing ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} text-xl`}></i>
                </div>
                <div>
                  <p className="text-sm font-black leading-tight">Ficha técnica do item selecionado</p>
                  <p className="text-[10px] font-bold opacity-60 uppercase">{selectedIds.size} selecionado(s)</p>
                </div>
             </button>
          </div>
        </div>

        {aiAnalysis && (
          <div className={`border-2 p-5 rounded-2xl animate-in fade-in duration-500 ${darkMode ? 'bg-blue-900/10 border-blue-800 text-blue-200' : 'bg-blue-50 border-blue-100 text-blue-900'}`}>
            <div className="flex justify-between items-start mb-3">
              <span className="font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2"><i className="fa-solid fa-robot"></i> Ficha Técnica (IA)</span>
              <button onClick={() => setAiAnalysis(null)} className="opacity-40 hover:opacity-100"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="prose prose-sm max-w-none prose-slate dark:prose-invert">
               <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
            </div>
          </div>
        )}

        <section className={`rounded-2xl shadow-sm border-2 overflow-hidden transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className={`p-4 sm:p-6 border-b-2 transition-colors ${darkMode ? 'bg-slate-800 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
            <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3 w-full lg:w-auto">
                <h3 className="font-black text-lg">Inventário</h3>
                <div className="relative w-full max-sm:max-w-none max-w-sm">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                  <input 
                    type="text" 
                    placeholder="Filtrar registros..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full border-2 rounded-xl py-2 pl-10 pr-4 text-sm outline-none transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'}`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportToExcel} className="p-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-bold flex items-center gap-2"><i className="fa-solid fa-file-excel"></i> Exportar</button>
                <button onClick={() => fileInputRef.current?.click()} className={`p-2.5 border-2 rounded-lg text-xs font-bold flex items-center gap-2 ${darkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-slate-200 hover:bg-slate-50'}`}><i className="fa-solid fa-file-import"></i> Importar</button>
                <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json,.xlsx,.xls" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className={`text-[11px] uppercase font-black border-b-2 transition-colors ${darkMode ? 'bg-slate-800/50 text-slate-500 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                <tr>
                  <th className="px-6 py-4 w-10">
                    <div className="flex items-center justify-center">
                      <input 
                        type="checkbox" 
                        title="Marque para mostrar ficha técnica de todos os itens"
                        checked={filteredAssets.length > 0 && selectedIds.size === filteredAssets.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  </th>
                  <th className="px-6 py-4">Equipamento</th>
                  <th className="px-6 py-4">Marca/Modelo</th>
                  <th className="px-6 py-4">Patrimônio</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Serial</th>
                  <th className="px-6 py-4 text-right">Gerenciar</th>
                </tr>
              </thead>
              <tbody className={`divide-y-2 transition-colors ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {loading ? (
                  <tr><td colSpan={7} className="py-20 text-center"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div></td></tr>
                ) : filteredAssets.map(asset => (
                  <tr key={asset.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'} ${selectedIds.has(asset.id) ? (darkMode ? 'bg-blue-900/10' : 'bg-blue-50') : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          title="Marque para mostrar ficha técnica do item"
                          checked={selectedIds.has(asset.id)}
                          onChange={() => toggleSelect(asset.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${darkMode ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>{asset.TipoEquipamento}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold">{asset.marca}</div>
                      <div className="text-[10px] opacity-60 font-medium">{asset.modelo}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono font-bold">{asset.NumeroPatrimonio}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase transition-colors ${getStatusBadgeClass(asset.EstadoEquipamento)}`}>
                        {asset.EstadoEquipamento}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-blue-500 font-bold">{asset.serial}</td>
                    <td className="px-6 py-4 text-right">
                      {deletingId === asset.id ? (
                        <div className="flex items-center justify-end gap-2 animate-in slide-in-from-right-2 duration-200">
                           <button onClick={() => confirmDelete(asset.id)} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm">Confirmar</button>
                           <button onClick={() => setDeletingId(null)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>Sair</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => handleEdit(asset)} className="p-2 text-slate-400 hover:text-blue-500 transition-colors" title="Editar"><i className="fa-solid fa-pencil"></i></button>
                          <button onClick={() => setDeletingId(asset.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Excluir"><i className="fa-solid fa-trash"></i></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {!loading && filteredAssets.length === 0 && (
            <div className="py-20 text-center opacity-30">
              <i className="fa-solid fa-box-open text-5xl mb-4"></i>
              <p className="font-bold">Nenhum dado encontrado no inventário local.</p>
            </div>
          )}
        </section>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border-2 transition-colors ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`px-6 py-4 border-b-2 flex justify-between items-center transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
              <h2 className="text-lg font-black">{editingAsset ? 'Editar Registro' : 'Novo Cadastro'}</h2>
              <button onClick={() => setShowForm(false)} className="opacity-50 hover:opacity-100 transition-opacity"><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form id="asset-form" onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className={`md:col-span-2 p-4 rounded-xl border-2 transition-all ${darkMode ? 'bg-blue-950/20 border-blue-900/50' : 'bg-blue-50 border-blue-200'}`}>
                  <label className="block text-[11px] font-black mb-1.5 uppercase tracking-wider text-blue-500">Tipo de Equipamento</label>
                  {!isCustomType ? (
                    <select 
                      value={formData.TipoEquipamento}
                      onChange={e => {
                        if (e.target.value === '__CUSTOM__') {
                          setIsCustomType(true);
                          setFormData({...formData, TipoEquipamento: '' as EquipmentType});
                        } else {
                          setFormData({...formData, TipoEquipamento: e.target.value as EquipmentType});
                        }
                      }}
                      className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                      required
                    >
                      {Object.values(EquipmentType).filter(t => t !== EquipmentType.OUTRO).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                      <option value="__CUSTOM__">OUTRO...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite o tipo de equipamento..."
                        value={formData.TipoEquipamento}
                        onChange={e => setFormData({...formData, TipoEquipamento: e.target.value as any})}
                        className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          setIsCustomType(false);
                          setFormData({...formData, TipoEquipamento: EquipmentType.NOTEBOOK});
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500"
                        title="Voltar para lista"
                      >
                        <i className="fa-solid fa-rotate-left"></i>
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Marca</label>
                  {!isCustomBrand ? (
                    <select 
                      value={formData.marca} 
                      onChange={e => {
                        if (e.target.value === '__CUSTOM__') {
                          setIsCustomBrand(true);
                          setFormData({...formData, marca: ''});
                        } else {
                          setFormData({...formData, marca: e.target.value});
                        }
                      }} 
                      className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                      required
                    >
                      <option value="" disabled>Selecione</option>
                      {BRANDS.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                      <option value="__CUSTOM__">OUTRA...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite a marca..."
                        value={formData.marca}
                        onChange={e => setFormData({...formData, marca: e.target.value})}
                        className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          setIsCustomBrand(false);
                          setFormData({...formData, marca: ''});
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500"
                        title="Voltar para lista"
                      >
                        <i className="fa-solid fa-rotate-left"></i>
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Modelo</label>
                  {!isCustomModel ? (
                    <select 
                      value={formData.modelo} 
                      onChange={e => {
                        if (e.target.value === '__CUSTOM__') {
                          setIsCustomModel(true);
                          setFormData({...formData, modelo: ''});
                        } else {
                          setFormData({...formData, modelo: e.target.value});
                        }
                      }} 
                      className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                      required
                    >
                      <option value="" disabled>Selecione</option>
                      {MODELS.map(model => <option key={model} value={model}>{model}</option>)}
                      <option value="__CUSTOM__">OUTRO...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite o modelo..."
                        value={formData.modelo}
                        onChange={e => setFormData({...formData, modelo: e.target.value})}
                        className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          setIsCustomModel(false);
                          setFormData({...formData, modelo: ''});
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500"
                        title="Voltar para lista"
                      >
                        <i className="fa-solid fa-rotate-left"></i>
                      </button>
                    </div>
                  )}
                </div>

                <div className={`md:col-span-2 p-4 rounded-xl border-2 transition-all ${darkMode ? 'bg-blue-950/20 border-blue-900/50' : 'bg-blue-50 border-blue-200'}`}>
                  <label className="block text-[11px] font-black mb-1.5 uppercase tracking-wider text-blue-500">SERIAL S/N:</label>
                  <div className="flex gap-2">
                    <input 
                      ref={serialInputRef}
                      type="text" 
                      placeholder="Serial do fabricante..." 
                      value={formData.serial} 
                      maxLength={30}
                      onChange={e => setFormData({...formData, serial: e.target.value})} 
                      className={`flex-1 min-w-0 border-2 rounded-xl px-4 py-2.5 outline-none font-mono font-bold text-blue-500 focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} 
                      required 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowScanner(true)} 
                      className="bg-slate-900 text-white px-3 sm:px-5 rounded-xl flex items-center gap-2 font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                    >
                      <i className="fa-solid fa-barcode"></i> 
                      <span className="hidden xs:inline">Scan</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Nº Patrimônio</label>
                  <input 
                    type="text" 
                    placeholder="Etiqueta interna..." 
                    value={formData.NumeroPatrimonio} 
                    onChange={e => setFormData({...formData, NumeroPatrimonio: e.target.value})} 
                    className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                    required 
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Estado do Equipto.</label>
                  <select 
                    value={formData.EstadoEquipamento} 
                    onChange={e => setFormData({...formData, EstadoEquipamento: e.target.value})} 
                    className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                    required
                  >
                    {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Observação / Defeitos</label>
                  <textarea 
                    placeholder="Descreva o defeito ou informações adicionais aqui..." 
                    value={formData.observacao} 
                    onChange={e => setFormData({...formData, observacao: e.target.value})} 
                    rows={3}
                    className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-sm focus:border-blue-500 transition-all resize-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Data de Aquisição</label>
                  <input 
                    type="date" 
                    value={formData.DataAquisicao} 
                    onChange={e => setFormData({...formData, DataAquisicao: e.target.value})} 
                    className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                    required 
                  />
                </div>
              </form>
            </div>

            <div className={`p-6 border-t-2 flex gap-3 transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
              <button 
                form="asset-form" 
                type="submit" 
                disabled={isSaving} 
                className={`flex-1 font-black py-4 rounded-xl shadow-xl active:scale-95 disabled:opacity-70 transition-all bg-blue-600 text-white hover:bg-blue-700`}
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2"><i className="fa-solid fa-spinner fa-spin"></i> Salvando...</span>
                ) : (
                  'Salvar Registro'
                )}
              </button>
              <button 
                onClick={() => {
                  setShowForm(false);
                  setIsCustomType(false);
                  setIsCustomBrand(false);
                  setIsCustomModel(false);
                }} 
                className={`px-6 py-4 border-2 font-black rounded-xl transition-all ${darkMode ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:bg-white'}`}
              >
                Sair do Cadastro
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && <BarcodeScanner onScan={handleScanResult} onClose={() => setShowScanner(false)} />}
      
      {showSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-250">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border-2 transition-colors ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className={`px-6 py-4 border-b-2 flex justify-between items-center transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
              <h2 className="text-md font-black flex items-center gap-2"><i className="fa-solid fa-shield-halved text-blue-500 text-lg"></i> Segurança e Conexão</h2>
              <button onClick={() => setShowSecurityModal(false)} className="opacity-50 hover:opacity-100 transition-opacity"><i className="fa-solid fa-xmark text-xl"></i></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Seção 1: Modo de Armazenamento */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Modo de Armazenamento</label>
                <p className="text-xs opacity-60">Escolha onde guardar os dados do inventário. O modo local é autônomo, não usa rede externa e roda sem falhas no GitHub Pages.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setStorageMode('cloud')}
                    className={`p-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all ${storageMode === 'cloud' ? 'border-green-500 bg-green-500/10 text-green-500' : (darkMode ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-50 text-slate-500')}`}
                  >
                    <i className="fa-solid fa-cloud text-lg"></i>
                    <span>Nuvem (Firebase)</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setStorageMode('local')}
                    className={`p-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center justify-center gap-2 transition-all ${storageMode === 'local' ? 'border-amber-500 bg-amber-500/10 text-amber-500' : (darkMode ? 'border-slate-700 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-50 text-slate-500')}`}
                  >
                    <i className="fa-solid fa-box-archive text-lg"></i>
                    <span>Local (IndexedDB)</span>
                  </button>
                </div>
              </div>

              {/* Seção 2: Chave Gemini */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Chave de API do Gemini (AI Studio)</label>
                <p className="text-xs opacity-60">
                  Insira sua chave pessoal do Gemini para rodar OCR estilo Google Lens do leitor de ativos e consultas de especificações de hardware. Em ambientes estáticos como o GitHub Pages, ela é obrigatória para usar as funções de Inteligência Artificial de forma independente.
                </p>
                <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${darkMode ? 'bg-purple-950/20 border-purple-900/50 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-800'}`}>
                  <span className="font-semibold"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> Obtenha uma chave grátis:</span>
                  <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1">
                    Google AI Studio <i className="fa-solid fa-up-right-from-square text-[10px]"></i>
                  </a>
                </div>
                <div className="relative">
                  <input 
                    type={showApiKey ? "text" : "password"}
                    placeholder="Cole sua GEMINI_API_KEY do Google AI Studio..."
                    value={localGeminiKey}
                    onChange={e => setLocalGeminiKey(e.target.value)}
                    className={`w-full border-2 rounded-xl pl-4 pr-10 py-2.5 outline-none font-mono text-xs focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500"
                    title={showApiKey ? "Ocultar Chave" : "Exibir Chave"}
                  >
                    <i className={`fa-solid ${showApiKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
                <div className={`p-3 rounded-lg border text-[10px] leading-relaxed transition-colors ${darkMode ? 'bg-blue-950/20 border-blue-900/50 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                  <i className="fa-solid fa-shield-halved mr-1"></i>
                  <strong>Garantia de Privacidade:</strong> Sua chave é armazenada unicamente na memória de cache do seu navegador (localStorage) e usada de forma direta pelo browser para falar com o Gemini oficial. Ela nunca é enviada a outros servidores de terceiros.
                </div>
              </div>

              {/* Seção 3: Credenciais Personalizadas Firebase */}
              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Firebase Configuração Personalizada (Opcional)</label>
                <p className="text-xs opacity-60">Se você fez um fork do código e deseja rodar sua própria nuvem dedicada no GitHub Pages, cole o objeto de configuração Web do Firebase (JSON):</p>
                <textarea 
                  placeholder='{ "apiKey": "AIzaSy...", "projectId": "...", "appId": "...", "firestoreDatabaseId": "..." }'
                  value={customFirebaseConfig}
                  onChange={e => setCustomFirebaseConfig(e.target.value)}
                  rows={4}
                  className={`w-full border-2 rounded-xl p-3 outline-none font-mono text-xs focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                />
              </div>
            </div>

            <div className={`p-4 border-t-2 flex gap-3 transition-colors ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
              <button 
                type="button"
                onClick={handleSaveSecurity}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-3.5 rounded-xl shadow-lg active:scale-95 transition-all"
              >
                Salvar Configurações
              </button>
              <button 
                type="button"
                onClick={() => setShowSecurityModal(false)}
                className={`px-4 py-3 border-2 text-xs font-black rounded-xl transition-all ${darkMode ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:bg-white'}`}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className={`p-8 text-center text-[10px] font-black uppercase tracking-[0.4em] mt-auto transition-colors border-t-2 ${darkMode ? 'text-slate-700 border-slate-900' : 'text-slate-300 border-slate-100'}`}>
        AssetTrack QR • {storageMode === 'cloud' ? 'Sincronização Nuvem Ativa' : 'Modo Estático Local'} • {new Date().getFullYear()}
      </footer>
    </div>
  );
};

const RootApp: React.FC = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default RootApp;
