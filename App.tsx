
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { assetService } from './services/assetService';
import { geminiService } from './services/geminiService';
import { securityService } from './services/securityService';
import { Asset, AssetFormData, EquipmentType, SecurityConfig } from './types';
import BarcodeScanner from './components/BarcodeScanner';
import { PhotoCaptureModal } from './components/PhotoCaptureModal';
import { PhotoViewerModal } from './components/PhotoViewerModal';
import { SecurityModal } from './components/SecurityModal';
import { AccessGate } from './components/AccessGate';
import { UserMenu } from './components/UserMenu';
import { compressImage } from './services/imageUtils';
import * as XLSX from 'xlsx';
import { auth, db } from './services/firebase';
import { onAuthStateChanged, signInAnonymously, User } from 'firebase/auth';

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

const getEquipmentIcon = (type: string) => {
  const t = String(type || '').toUpperCase();
  if (t.includes('NOTEBOOK') || t.includes('LAPTOP')) return 'fa-laptop';
  if (t.includes('SMARTPHONE') || t.includes('CELULAR') || t.includes('PHONE')) return 'fa-mobile-screen-button';
  if (t.includes('DESKTOP') || t.includes('PC') || t.includes('COMPUTADOR') || t.includes('DESKTOP PC')) return 'fa-desktop';
  if (t.includes('TABLET')) return 'fa-tablet-screen-button';
  if (t.includes('MONITOR') || t.includes('TELA')) return 'fa-display';
  return 'fa-box';
};

const App: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [editingIdPasswordCheck, setEditingIdPasswordCheck] = useState<string | null>(null);
  const [editPasswordInput, setEditPasswordInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Estados para controle de campos customizados
  const [isCustomType, setIsCustomType] = useState(false);
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [isCustomStatus, setIsCustomStatus] = useState(false);
  const [isCustomSituacao, setIsCustomSituacao] = useState(false);

  // Itens customizados persistidos localmente
  const [storedCustomTypes, setStoredCustomTypes] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('assettrack_custom_types');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [storedCustomBrands, setStoredCustomBrands] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('assettrack_custom_brands');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [storedCustomModels, setStoredCustomModels] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('assettrack_custom_models');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [storedCustomStatuses, setStoredCustomStatuses] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('assettrack_custom_statuses');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [storedCustomSituacoes, setStoredCustomSituacoes] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('assettrack_custom_situacoes');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  // Funções utilitárias para salvar e registrar novos valores em lote ou individuais
  const saveCustomType = (type: string) => {
    const trimmed = type.trim();
    const standard = (Object.values(EquipmentType) as string[]).filter(t => t !== EquipmentType.OUTRO);
    if (trimmed && !standard.some(s => s.toLowerCase() === trimmed.toLowerCase()) && !storedCustomTypes.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...storedCustomTypes, trimmed];
      setStoredCustomTypes(updated);
      try { localStorage.setItem('assettrack_custom_types', JSON.stringify(updated)); } catch (e) {}
    }
  };

  const saveCustomBrand = (brand: string) => {
    const trimmed = brand.trim();
    if (trimmed && !BRANDS.some(b => b.toLowerCase() === trimmed.toLowerCase()) && !storedCustomBrands.some(b => b.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...storedCustomBrands, trimmed];
      setStoredCustomBrands(updated);
      try { localStorage.setItem('assettrack_custom_brands', JSON.stringify(updated)); } catch (e) {}
    }
  };

  const saveCustomModel = (model: string) => {
    const trimmed = model.trim();
    if (trimmed && !MODELS.some(m => m.toLowerCase() === trimmed.toLowerCase()) && !storedCustomModels.some(m => m.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...storedCustomModels, trimmed];
      setStoredCustomModels(updated);
      try { localStorage.setItem('assettrack_custom_models', JSON.stringify(updated)); } catch (e) {}
    }
  };

  const saveCustomStatus = (status: string) => {
    const trimmed = status.trim();
    if (trimmed && !STATUS_OPTIONS.some(s => s.toLowerCase() === trimmed.toLowerCase()) && !storedCustomStatuses.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...storedCustomStatuses, trimmed];
      setStoredCustomStatuses(updated);
      try { localStorage.setItem('assettrack_custom_statuses', JSON.stringify(updated)); } catch (e) {}
    }
  };

  const saveCustomSituacao = (situacao: string) => {
    const trimmed = situacao.trim();
    const defaults = ['Estoque', 'Colaborador'];
    if (trimmed && !defaults.some(d => d.toLowerCase() === trimmed.toLowerCase()) && !storedCustomSituacoes.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...storedCustomSituacoes, trimmed];
      setStoredCustomSituacoes(updated);
      try { localStorage.setItem('assettrack_custom_situacoes', JSON.stringify(updated)); } catch (e) {}
    }
  };

  // Listas dinâmicas e unificadas para cada combobox (Padrão + Registros no BD + Customizados)
  const availableEquipmentTypes = useMemo(() => {
    const typeSet = new Set<string>();
    (Object.values(EquipmentType) as string[]).filter(t => t !== EquipmentType.OUTRO).forEach(t => typeSet.add(t));
    assets.forEach(asset => {
      if (asset.TipoEquipamento && asset.TipoEquipamento.trim()) {
        typeSet.add(asset.TipoEquipamento.trim());
      }
    });
    storedCustomTypes.forEach(t => {
      if (t && t.trim()) typeSet.add(t.trim());
    });
    return Array.from(typeSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [assets, storedCustomTypes]);

  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();
    BRANDS.forEach(b => { if (b && b.trim()) brandSet.add(b.trim()); });
    assets.forEach(asset => {
      if (asset.marca && asset.marca.trim()) {
        brandSet.add(asset.marca.trim());
      }
    });
    storedCustomBrands.forEach(b => {
      if (b && b.trim()) brandSet.add(b.trim());
    });
    return Array.from(brandSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [assets, storedCustomBrands]);

  const availableModels = useMemo(() => {
    const modelSet = new Set<string>();
    MODELS.forEach(m => { if (m && m.trim()) modelSet.add(m.trim()); });
    assets.forEach(asset => {
      if (asset.modelo && asset.modelo.trim()) {
        modelSet.add(asset.modelo.trim());
      }
    });
    storedCustomModels.forEach(m => {
      if (m && m.trim()) modelSet.add(m.trim());
    });
    return Array.from(modelSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [assets, storedCustomModels]);

  const availableStatuses = useMemo(() => {
    const statusSet = new Set<string>();
    STATUS_OPTIONS.forEach(s => { if (s && s.trim()) statusSet.add(s.trim()); });
    assets.forEach(asset => {
      if (asset.EstadoEquipamento && asset.EstadoEquipamento.trim()) {
        statusSet.add(asset.EstadoEquipamento.trim());
      }
    });
    storedCustomStatuses.forEach(s => {
      if (s && s.trim()) statusSet.add(s.trim());
    });
    return Array.from(statusSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [assets, storedCustomStatuses]);

  const availableSituacoes = useMemo(() => {
    const situacaoSet = new Set<string>();
    ['Estoque', 'Colaborador'].forEach(s => situacaoSet.add(s));
    assets.forEach(asset => {
      if (asset.situacao && asset.situacao.trim()) {
        situacaoSet.add(asset.situacao.trim());
      }
    });
    storedCustomSituacoes.forEach(s => {
      if (s && s.trim()) situacaoSet.add(s.trim());
    });
    return Array.from(situacaoSet);
  }, [assets, storedCustomSituacoes]);

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
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(() => securityService.getSecurityConfig());

  const authCheck = useMemo(() => {
    return securityService.isUserAuthorized(user, securityConfig);
  }, [user, securityConfig]);

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
  const photoUploadInputRef = useRef<HTMLInputElement>(null);
  const directCameraInputRef = useRef<HTMLInputElement>(null);

  // Estados para Fotos e Evidências Fotográficas
  const [showPhotoCaptureModal, setShowPhotoCaptureModal] = useState(false);
  const [viewingPhotoAsset, setViewingPhotoAsset] = useState<Asset | null>(null);
  const [viewingSinglePhoto, setViewingSinglePhoto] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  const getInitialForm = (): AssetFormData => ({
    DataAquisicao: getBrasiliaDateString(),
    TipoEquipamento: EquipmentType.NOTEBOOK,
    marca: '',
    modelo: '',
    serial: '',
    NumeroPatrimonio: 'CIRION',
    EstadoEquipamento: 'BOM',
    observacao: '',
    situacao: 'Estoque',
    colaboradorId: '',
    colaboradorNome: '',
    colaboradorEmail: '',
    fotos: []
  });

  const [formData, setFormData] = useState<AssetFormData>(getInitialForm());

  const handlePhotoCaptured = (base64: string) => {
    setFormData(prev => ({
      ...prev,
      fotos: [...(prev.fotos || []), base64]
    }));
  };

  const handleRemovePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      fotos: (prev.fotos || []).filter((_, i) => i !== index)
    }));
  };

  const handleFormPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingPhoto(true);
    try {
      const compressedList: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          const comp = await compressImage(files[i], 1000, 1000, 0.78);
          compressedList.push(comp);
        }
      }
      setFormData(prev => ({
        ...prev,
        fotos: [...(prev.fotos || []), ...compressedList].slice(0, 6)
      }));
    } catch (err) {
      console.error('Erro ao processar imagens:', err);
      alert('Erro ao processar as fotos selecionadas.');
    } finally {
      setIsProcessingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Verifica se há resultado de redirecionamento do Google OAuth na inicialização
  useEffect(() => {
    securityService.checkRedirectResult().then((redirectUser) => {
      if (redirectUser) {
        setUser(redirectUser);
        setAuthError(null);
        setSecurityConfig(securityService.getSecurityConfig());
      }
    }).catch(err => console.error("Erro ao verificar retorno de redirect:", err));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser && !currentUser.isAnonymous) {
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, [storageMode]);

  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      const loggedUser = await securityService.loginWithGoogle();
      setUser(loggedUser);
      setAuthError(null);
      setSecurityConfig(securityService.getSecurityConfig());
    } catch (err: any) {
      console.error("Erro ao entrar com Google:", err);
      setAuthError(err?.message || "Erro ao autenticar com Google. Verifique popups ou permissão de domínio no Firebase.");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await securityService.logout();
      setUser(null);
      setAuthError(null);
    } catch (err) {
      console.error("Erro ao sair da conta:", err);
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
    let result = assets;
    if (typeFilter) {
      result = result.filter(asset => asset.TipoEquipamento === typeFilter);
    }
    if (!searchTerm) return result;
    const term = searchTerm.toLowerCase();
    return result.filter(asset => 
      asset.modelo.toLowerCase().includes(term) ||
      asset.marca.toLowerCase().includes(term) ||
      asset.serial.toLowerCase().includes(term) ||
      asset.NumeroPatrimonio.toLowerCase().includes(term) ||
      asset.TipoEquipamento.toLowerCase().includes(term) ||
      asset.EstadoEquipamento.toLowerCase().includes(term) ||
      asset.observacao.toLowerCase().includes(term) ||
      (asset.situacao && asset.situacao.toLowerCase().includes(term)) ||
      (asset.colaboradorNome && asset.colaboradorNome.toLowerCase().includes(term)) ||
      (asset.colaboradorId && asset.colaboradorId.toLowerCase().includes(term)) ||
      (asset.colaboradorEmail && asset.colaboradorEmail.toLowerCase().includes(term))
    );
  }, [assets, searchTerm, typeFilter]);

  // Conta a quantidade de ativos baseada nos filtros aplicados (inclusive busca)
  const selectedTypeCount = filteredAssets.length;

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

    // Persiste novos valores customizados para garantir inclusão automática e imediata em todos os comboboxes
    if (formData.TipoEquipamento) saveCustomType(formData.TipoEquipamento);
    if (formData.marca) saveCustomBrand(formData.marca);
    if (formData.modelo) saveCustomModel(formData.modelo);
    if (formData.EstadoEquipamento) saveCustomStatus(formData.EstadoEquipamento);
    if (formData.situacao) saveCustomSituacao(formData.situacao);

    try {
      if (editingAsset) {
        await assetService.updateAsset(editingAsset.id, formData);
        setShowForm(false);
        setEditingAsset(null);
        setIsCustomType(false);
        setIsCustomBrand(false);
        setIsCustomModel(false);
        setIsCustomStatus(false);
        setIsCustomSituacao(false);
      } else {
        await assetService.addAsset(formData);
        
        setIsCustomType(false);
        setIsCustomBrand(false);
        setIsCustomModel(false);
        setIsCustomStatus(false);
        setIsCustomSituacao(false);
        setFormData(prev => ({
          ...prev,
          serial: '',
          NumeroPatrimonio: 'CIRION',
          observacao: '',
          colaboradorId: '',
          colaboradorNome: '',
          colaboradorEmail: '',
          fotos: []
        }));
        
        setTimeout(() => {
          serialInputRef.current?.focus();
        }, 50);
      }
      
      fetchAssets();
    } catch (err) {
      alert('Erro ao salvar as informações localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    const customT = !!(asset.TipoEquipamento && !availableEquipmentTypes.some(t => t.toLowerCase() === (asset.TipoEquipamento || '').toLowerCase()));
    const customB = !!(asset.marca && !availableBrands.some(b => b.toLowerCase() === (asset.marca || '').toLowerCase()));
    const customM = !!(asset.modelo && !availableModels.some(m => m.toLowerCase() === (asset.modelo || '').toLowerCase()));
    const customS = !!(asset.EstadoEquipamento && !availableStatuses.some(s => s.toLowerCase() === (asset.EstadoEquipamento || '').toLowerCase()));
    const customSit = !!(asset.situacao && !availableSituacoes.some(s => s.toLowerCase() === (asset.situacao || '').toLowerCase()));
    
    setIsCustomType(customT);
    setIsCustomBrand(customB);
    setIsCustomModel(customM);
    setIsCustomStatus(customS);
    setIsCustomSituacao(customSit);

    setFormData({
      DataAquisicao: asset.DataAquisicao,
      TipoEquipamento: asset.TipoEquipamento as EquipmentType,
      marca: asset.marca,
      modelo: asset.modelo,
      serial: asset.serial,
      NumeroPatrimonio: asset.NumeroPatrimonio,
      EstadoEquipamento: asset.EstadoEquipamento || 'BOM',
      observacao: asset.observacao || '',
      situacao: asset.situacao || 'Estoque',
      colaboradorId: asset.colaboradorId || '',
      colaboradorNome: asset.colaboradorNome || '',
      colaboradorEmail: asset.colaboradorEmail || '',
      fotos: asset.fotos || []
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
    } catch (err: any) {
      console.error('Erro ao excluir item:', err);
      alert('Erro ao tentar excluir o item. Verifique sua conexão ou permissão.');
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

  // Proteção contra Injeção de Fórmulas em Planilhas (CSV / Excel Formula Injection / DDE Injection)
  const sanitizeSpreadsheetCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (/^[=+\-@\t\r]/.test(str)) {
      return `'${str}`;
    }
    return str;
  };

  const getExportData = () => {
    return filteredAssets.map(a => ({
      'Patrimônio': sanitizeSpreadsheetCell(a.NumeroPatrimonio),
      'Equipamento': sanitizeSpreadsheetCell(a.TipoEquipamento),
      'Marca': sanitizeSpreadsheetCell(a.marca),
      'Modelo': sanitizeSpreadsheetCell(a.modelo),
      'Serial': sanitizeSpreadsheetCell(a.serial),
      'Estado': sanitizeSpreadsheetCell(a.EstadoEquipamento),
      'Fotos Anexadas': a.fotos && a.fotos.length > 0 ? `${a.fotos.length} foto(s)` : 'Nenhuma',
      'Situação': sanitizeSpreadsheetCell(a.situacao || 'Estoque'),
      'ID Colaborador': sanitizeSpreadsheetCell(a.colaboradorId || ''),
      'Nome Colaborador': sanitizeSpreadsheetCell(a.colaboradorNome || ''),
      'E-mail Colaborador': sanitizeSpreadsheetCell(a.colaboradorEmail || ''),
      'Observação': sanitizeSpreadsheetCell(a.observacao),
      'Data': sanitizeSpreadsheetCell(a.DataAquisicao)
    }));
  };

  const exportToExcel = () => {
    if (filteredAssets.length === 0) return alert('Sem dados para exportar.');
    try {
      const data = getExportData();
      const worksheet = XLSX.utils.json_to_sheet(data);

      // Ajusta largura automática das colunas para visualização perfeita no Excel
      const colWidths = [
        { wch: 16 }, // Patrimônio
        { wch: 18 }, // Equipamento
        { wch: 16 }, // Marca
        { wch: 22 }, // Modelo
        { wch: 20 }, // Serial
        { wch: 14 }, // Estado
        { wch: 16 }, // Fotos Anexadas
        { wch: 16 }, // Situação
        { wch: 16 }, // ID Colaborador
        { wch: 26 }, // Nome Colaborador
        { wch: 28 }, // E-mail Colaborador
        { wch: 35 }, // Observação
        { wch: 14 }, // Data
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inventário");

      // Gera buffer binário XLSX e dispara download seguro via Blob
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      const now = new Date();
      const timeStamp = `${getBrasiliaDateString()}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}m${String(now.getSeconds()).padStart(2, '0')}s`;
      const fileName = `Inventario_${timeStamp}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1500);

      securityService.logAction({
        action: 'EXPORT',
        userEmail: user?.email || 'Anônimo / Local',
        userName: user?.displayName || 'Usuário',
        userId: user?.uid || 'anonymous',
        details: `Exportada planilha Excel com ${filteredAssets.length} registro(s) (${fileName})`
      });
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      alert('Erro ao gerar a planilha Excel. Tente novamente.');
    }
  };

  const exportToCSV = () => {
    if (filteredAssets.length === 0) return alert('Sem dados para exportar.');
    try {
      const data = getExportData();
      const worksheet = XLSX.utils.json_to_sheet(data);
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);

      // Adiciona BOM UTF-8 (\uFEFF) para acentos abrirem perfeitos no Excel
      const blob = new Blob(['\uFEFF' + csvOutput], { type: 'text/csv;charset=utf-8;' });
      const now = new Date();
      const timeStamp = `${getBrasiliaDateString()}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}m${String(now.getSeconds()).padStart(2, '0')}s`;
      const fileName = `Inventario_${timeStamp}.csv`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1500);

      securityService.logAction({
        action: 'EXPORT',
        userEmail: user?.email || 'Anônimo / Local',
        userName: user?.displayName || 'Usuário',
        userId: user?.uid || 'anonymous',
        details: `Exportado arquivo CSV com ${filteredAssets.length} registro(s) (${fileName})`
      });
    } catch (err) {
      console.error('Erro ao exportar CSV:', err);
      alert('Erro ao gerar o arquivo CSV.');
    }
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
          dataToImport = json.slice(0, 2000).map((row: any) => ({
            NumeroPatrimonio: String(row['Patrimônio'] || row['NumeroPatrimonio'] || '').trim().slice(0, 100),
            TipoEquipamento: String(row['Equipamento'] || row['TipoEquipamento'] || 'NOTEBOOK').trim().slice(0, 100),
            marca: String(row['Marca'] || row['marca'] || '').trim().slice(0, 100),
            modelo: String(row['Modelo'] || row['modelo'] || '').trim().slice(0, 150),
            serial: String(row['Serial'] || row['serial'] || '').trim().slice(0, 100),
            EstadoEquipamento: String(row['Estado'] || row['EstadoEquipamento'] || 'BOM').trim().slice(0, 100),
            situacao: String(row['Situação'] || row['situacao'] || 'Estoque').trim().slice(0, 100) as any,
            colaboradorId: String(row['ID Colaborador'] || row['colaboradorId'] || '').trim().slice(0, 100),
            colaboradorNome: String(row['Nome Colaborador'] || row['colaboradorNome'] || '').trim().slice(0, 150),
            colaboradorEmail: String(row['E-mail Colaborador'] || row['colaboradorEmail'] || '').trim().slice(0, 150),
            observacao: String(row['Observação'] || row['observacao'] || '').trim().slice(0, 2000),
            fotos: Array.isArray(row.fotos) ? row.fotos.slice(0, 6) : [],
            DataAquisicao: String(row['Data'] || row['DataAquisicao'] || getBrasiliaDateString()).trim().slice(0, 50),
            id: (row['id'] ? String(row['id']) : Math.random().toString(36).substring(2, 11) + Date.now().toString(36)).slice(0, 128),
            createdAt: row['createdAt'] ? String(row['createdAt']).slice(0, 50) : new Date().toISOString()
          }));
        } else {
          const content = ev.target?.result as string;
          const raw = JSON.parse(content);
          if (Array.isArray(raw)) {
            dataToImport = raw.slice(0, 2000).map((row: any) => ({
              NumeroPatrimonio: String(row.NumeroPatrimonio || '').trim().slice(0, 100),
              TipoEquipamento: String(row.TipoEquipamento || 'NOTEBOOK').trim().slice(0, 100),
              marca: String(row.marca || '').trim().slice(0, 100),
              modelo: String(row.modelo || '').trim().slice(0, 150),
              serial: String(row.serial || '').trim().slice(0, 100),
              EstadoEquipamento: String(row.EstadoEquipamento || 'BOM').trim().slice(0, 100),
              situacao: String(row.situacao || 'Estoque').trim().slice(0, 100) as any,
              colaboradorId: String(row.colaboradorId || '').trim().slice(0, 100),
              colaboradorNome: String(row.colaboradorNome || '').trim().slice(0, 150),
              colaboradorEmail: String(row.colaboradorEmail || '').trim().slice(0, 150),
              observacao: String(row.observacao || '').trim().slice(0, 2000),
              fotos: Array.isArray(row.fotos) ? row.fotos.slice(0, 6) : [],
              DataAquisicao: String(row.DataAquisicao || getBrasiliaDateString()).trim().slice(0, 50),
              id: (row.id ? String(row.id) : Math.random().toString(36).substring(2, 11) + Date.now().toString(36)).slice(0, 128),
              createdAt: row.createdAt ? String(row.createdAt).slice(0, 50) : new Date().toISOString()
            }));
          }
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
    setIsCustomStatus(false);
    setIsCustomSituacao(false);
    setShowForm(true); 
  };

  if (isAuthReady && !authCheck.authorized) {
    return (
      <AccessGate
        darkMode={darkMode}
        user={user}
        reason={authCheck.reason}
        onLogin={handleGoogleLogin}
        onLogout={handleGoogleLogout}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className={`border-b-2 sticky top-0 z-40 shadow-sm transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg flex items-center justify-center text-white">
              <i className="fa-solid fa-qrcode text-base"></i>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-tight">AssetTrack QR</h1>
              <p className="text-[10px] text-slate-400 font-bold hidden sm:block">Controle de Patrimônio & Segurança</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Badge / Menu de Usuário Google ou Botão de Login */}
            {user && !user.isAnonymous ? (
              <UserMenu
                user={user}
                darkMode={darkMode}
                onLogout={handleGoogleLogout}
                onSwitchAccount={handleGoogleLogin}
                onOpenSecurity={() => setShowSecurityModal(true)}
              />
            ) : (
              <button 
                type="button"
                id="header-google-login-btn"
                onClick={handleGoogleLogin}
                className={`text-xs font-black px-3 py-2 rounded-xl border-2 transition-all flex items-center gap-2 shadow-sm ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                }`}
                title="Entrar com Conta Google oficial"
              >
                <i className="fa-brands fa-google text-red-500 text-sm"></i>
                <span className="hidden sm:inline">Entrar com Google</span>
              </button>
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
              <span className="text-xs font-bold hidden sm:inline">Segurança</span>
            </button>

            <button 
              onClick={openNewForm}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2 h-10 rounded-xl flex items-center gap-2 font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all"
            >
              <i className="fa-solid fa-plus"></i>
              <span className="hidden sm:inline">Novo Item</span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner de Diagnóstico de Autenticação / Erro de Login */}
      {authError && (
        <div className="bg-amber-500/10 border-b-2 border-amber-500/20 text-amber-500 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <i className="fa-solid fa-triangle-exclamation text-base shrink-0"></i>
              <div>
                <span className="font-black">Aviso de Autenticação: </span>
                <span className="font-medium opacity-90">{authError}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.hostname);
                  alert(`Domínio "${window.location.hostname}" copiado! Adicione-o em Firebase Console > Authentication > Settings > Authorized domains`);
                }}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-black px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] transition-colors"
                title="Copiar domínio atual para autorizar no Firebase"
              >
                <i className="fa-solid fa-copy"></i>
                <span>Copiar Domínio ({window.location.hostname})</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="opacity-70 hover:opacity-100 p-1"
                title="Dispensar aviso"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
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
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                <h3 className="font-black text-lg whitespace-nowrap">Inventário</h3>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  <div className="relative w-full sm:w-64">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                    <input 
                      type="text" 
                      placeholder="Filtrar registros..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`w-full border-2 rounded-xl py-2 pl-10 pr-4 text-xs font-bold outline-none transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'}`}
                    />
                  </div>
                  <div className="relative w-full sm:w-56">
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className={`w-full border-2 rounded-xl py-2 px-3 text-xs font-bold outline-none transition-all cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'}`}
                    >
                      <option value="">TODOS OS TIPOS ({assets.length})</option>
                      {availableEquipmentTypes.map(type => {
                        const count = assets.filter(a => (a.TipoEquipamento || '').trim().toUpperCase() === type.trim().toUpperCase()).length;
                        return (
                          <option key={type} value={type}>
                            {type} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-2 border-2 rounded-xl text-xs font-black transition-all justify-center whitespace-nowrap self-stretch sm:self-auto ${
                    darkMode 
                      ? 'bg-blue-950/40 border-blue-900 text-blue-400' 
                      : 'bg-blue-50 border-blue-100 text-blue-700'
                  }`} title="Quantidade de equipamentos deste tipo">
                    <i className="fa-solid fa-calculator text-[10px]"></i>
                    <span>
                      {selectedTypeCount} {selectedTypeCount === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={exportToExcel} 
                  className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm transition-all active:scale-95"
                  title="Exportar planilha Excel formatada (.xlsx)"
                >
                  <i className="fa-solid fa-file-excel text-sm"></i>
                  <span>Excel (.xlsx)</span>
                </button>
                <button 
                  onClick={exportToCSV} 
                  className={`p-2.5 border-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                  title="Exportar dados em formato CSV universal (.csv)"
                >
                  <i className="fa-solid fa-file-csv text-sm text-blue-500"></i>
                  <span>CSV</span>
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className={`p-2.5 border-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                  title="Importar planilha ou backup"
                >
                  <i className="fa-solid fa-file-import text-sm text-amber-500"></i>
                  <span>Importar</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json,.xlsx,.xls" />
              </div>
            </div>
          </div>

          {/* Visualização em Lista / Tabela para Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className={`text-[11px] uppercase font-black border-b-2 transition-colors ${darkMode ? 'bg-slate-800/50 text-slate-500 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                <tr>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5 w-10">
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
                  <th className="px-3 sm:px-4 md:px-6 py-3.5">Tipo de Equipamento</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5">Marca/Modelo</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5">Patrimônio</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5">Estado</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5">Situação / Responsável</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5">Serial</th>
                  <th className="px-3 sm:px-4 md:px-6 py-3.5 text-right">Gerenciar</th>
                </tr>
              </thead>
              <tbody className={`divide-y-2 transition-colors ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {loading ? (
                  <tr><td colSpan={8} className="py-20 text-center"><div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div></td></tr>
                ) : filteredAssets.map(asset => (
                  <tr key={asset.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'} ${selectedIds.has(asset.id) ? (darkMode ? 'bg-blue-900/10' : 'bg-blue-50') : ''}`}>
                    <td className="px-3 sm:px-4 md:px-6 py-3">
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
                    <td className="px-3 sm:px-4 md:px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`p-1 w-6 h-6 flex items-center justify-center rounded-lg text-xs font-black ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                          <i className={`fa-solid ${getEquipmentIcon(asset.TipoEquipamento)}`}></i>
                        </span>
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${darkMode ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                          {asset.TipoEquipamento}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-3">
                      <div className="text-sm font-bold">{asset.marca}</div>
                      <div className="text-[10px] opacity-60 font-medium">{asset.modelo}</div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-3 text-sm font-mono font-bold">{asset.NumeroPatrimonio}</td>
                    <td className="px-3 sm:px-4 md:px-6 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase transition-colors ${getStatusBadgeClass(asset.EstadoEquipamento)}`}>
                          {asset.EstadoEquipamento}
                        </span>
                        {asset.fotos && asset.fotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setViewingPhotoAsset(asset)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer shadow-sm whitespace-nowrap"
                            title="Clique para visualizar fotos do equipamento"
                          >
                            <i className="fa-solid fa-camera text-[9px]"></i>
                            <span>{asset.fotos.length} foto{asset.fotos.length > 1 ? 's' : ''}</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-3">
                      {asset.situacao === 'Colaborador' ? (
                        <div className="text-xs space-y-1">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase transition-all inline-flex items-center gap-1 ${darkMode ? 'bg-blue-950/40 text-blue-400 border-blue-900' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                            <i className="fa-solid fa-user text-[8px]"></i> Colaborador
                          </span>
                          <div className="font-extrabold text-slate-900 dark:text-white text-xs mt-0.5 max-w-[150px] truncate" title={asset.colaboradorNome}>
                            {asset.colaboradorNome}
                          </div>
                          {asset.colaboradorId && (
                            <div className="text-[10px] text-slate-700 dark:text-slate-300 font-black">
                              ID: {asset.colaboradorId}
                            </div>
                          )}
                          {asset.colaboradorEmail && (
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 font-mono font-bold truncate max-w-[140px]" title={asset.colaboradorEmail}>
                              {asset.colaboradorEmail}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase transition-all inline-flex items-center gap-1 ${darkMode ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            <i className="fa-solid fa-box text-[8px]"></i> Estoque
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 md:px-6 py-3 text-sm font-mono text-blue-500 font-bold">{asset.serial}</td>
                    <td className="px-3 sm:px-4 md:px-6 py-3 text-right">
                      {deletingId === asset.id ? (
                        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 animate-in slide-in-from-right-2 duration-200">
                          <input 
                            type="password" 
                            placeholder="Senha (excluiritem)" 
                            value={deletePassword} 
                            onChange={(e) => setDeletePassword(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (deletePassword.trim().toLowerCase() === 'excluiritem') {
                                  confirmDelete(asset.id);
                                  setDeletePassword('');
                                } else {
                                  alert('Senha incorreta! Digite: excluiritem');
                                }
                              }
                            }}
                            className={`px-2 py-1 text-xs border rounded-lg outline-none w-36 md:w-40 text-center font-bold transition-all shrink-0 ${
                              darkMode 
                                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-red-500' 
                                : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-red-500'
                            }`}
                          />
                          <button 
                            type="button"
                            onClick={() => {
                              if (deletePassword.trim().toLowerCase() === 'excluiritem') {
                                confirmDelete(asset.id);
                                setDeletePassword('');
                              } else {
                                alert('Senha incorreta! Digite: excluiritem');
                              }
                            }} 
                            className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm cursor-pointer whitespace-nowrap shrink-0 hover:bg-red-700 transition-colors"
                          >
                            Excluir
                          </button>
                          <button 
                            onClick={() => {
                              setDeletingId(null);
                              setDeletePassword('');
                            }} 
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border-2 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                              darkMode 
                                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white' 
                                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Sair
                          </button>
                        </div>
                      ) : editingIdPasswordCheck === asset.id ? (
                        <div className="flex flex-col sm:flex-row items-center justify-end gap-2 animate-in slide-in-from-right-2 duration-200">
                          <input 
                            type="password" 
                            placeholder="Senha para editar" 
                            value={editPasswordInput} 
                            onChange={(e) => setEditPasswordInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editPasswordInput === 'editaritem') {
                                  handleEdit(asset);
                                  setEditingIdPasswordCheck(null);
                                  setEditPasswordInput('');
                                } else {
                                  alert('Senha incorreta!');
                                }
                              }
                            }}
                            className={`px-2 py-1 text-xs border rounded-lg outline-none w-32 md:w-36 text-center font-bold transition-all shrink-0 ${
                              darkMode 
                                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' 
                                : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500'
                            }`}
                          />
                          <button 
                            onClick={() => {
                              if (editPasswordInput === 'editaritem') {
                                handleEdit(asset);
                                setEditingIdPasswordCheck(null);
                                setEditPasswordInput('');
                              } else {
                                alert('Senha incorreta!');
                              }
                            }} 
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm cursor-pointer whitespace-nowrap shrink-0 hover:bg-blue-700 transition-colors"
                          >
                            Editar
                          </button>
                          <button 
                            onClick={() => {
                              setEditingIdPasswordCheck(null);
                              setEditPasswordInput('');
                            }} 
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border-2 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                              darkMode 
                                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white' 
                                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            Sair
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => {
                            setEditingIdPasswordCheck(asset.id);
                            setEditPasswordInput('');
                            setDeletingId(null);
                          }} className="p-2 text-slate-400 hover:text-blue-500 transition-colors cursor-pointer" title="Editar"><i className="fa-solid fa-pencil"></i></button>
                          <button onClick={() => {
                            setDeletingId(asset.id);
                            setDeletePassword('');
                            setEditingIdPasswordCheck(null);
                          }} className="p-2 text-slate-400 hover:text-red-500 transition-colors cursor-pointer" title="Excluir"><i className="fa-solid fa-trash"></i></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Visualização em Cards Otimizada para Celular (Mobile View) */}
          <div className="block md:hidden p-3 space-y-3">
            {loading ? (
              <div className="py-16 text-center">
                <div className="animate-spin h-7 w-7 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-xs text-slate-400 mt-2 font-bold">Carregando inventário...</p>
              </div>
            ) : filteredAssets.map(asset => (
              <div 
                key={asset.id} 
                className={`p-3.5 rounded-2xl border-2 transition-all ${
                  selectedIds.has(asset.id) 
                    ? (darkMode ? 'bg-blue-950/20 border-blue-600/60 shadow-md' : 'bg-blue-50/80 border-blue-300 shadow-md')
                    : (darkMode ? 'bg-slate-800/40 border-slate-700/70 hover:border-slate-600' : 'bg-slate-50/70 border-slate-200 hover:border-slate-300')
                }`}
              >
                {/* Header do Card */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-700/40 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      title="Marque para ficha técnica"
                      checked={selectedIds.has(asset.id)}
                      onChange={() => toggleSelect(asset.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <span className={`p-1.5 rounded-lg text-xs font-black shrink-0 ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                      <i className={`fa-solid ${getEquipmentIcon(asset.TipoEquipamento)}`}></i>
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${darkMode ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'}`}>
                      {asset.TipoEquipamento}
                    </span>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStatusBadgeClass(asset.EstadoEquipamento)}`}>
                    {asset.EstadoEquipamento}
                  </span>
                </div>

                {/* Dados Principais do Ativo */}
                <div className="pt-2.5 pb-2 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {asset.marca} <span className="font-semibold opacity-80">{asset.modelo}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="bg-slate-200/50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-xl border border-slate-300/50 dark:border-slate-700/50">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Patrimônio</span>
                      <span className="font-mono font-black text-slate-800 dark:text-slate-100">{asset.NumeroPatrimonio}</span>
                    </div>
                    <div className="bg-slate-200/50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-xl border border-slate-300/50 dark:border-slate-700/50">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Serial S/N</span>
                      <span className="font-mono font-bold text-blue-500 truncate block">{asset.serial}</span>
                    </div>
                  </div>

                  {/* Situação / Destinação */}
                  <div className="pt-1">
                    {asset.situacao === 'Colaborador' ? (
                      <div className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${darkMode ? 'bg-blue-950/30 text-blue-300 border-blue-900/50' : 'bg-blue-50 text-blue-800 border-blue-100'}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <i className="fa-solid fa-user text-blue-500 text-xs shrink-0"></i>
                          <span className="font-bold truncate">{asset.colaboradorNome || 'Colaborador'}</span>
                        </div>
                        {asset.colaboradorId && (
                          <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">
                            ID: {asset.colaboradorId}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 ${darkMode ? 'bg-emerald-950/30 text-emerald-300 border-emerald-900/50' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                        <i className="fa-solid fa-box text-emerald-500 text-xs shrink-0"></i>
                        <span className="font-bold">Em Estoque</span>
                      </div>
                    )}
                  </div>

                  {/* Registro Fotográfico no Card Mobile */}
                  <div className="pt-1.5">
                    {asset.fotos && asset.fotos.length > 0 ? (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30">
                        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
                          {asset.fotos.slice(0, 3).map((f, i) => (
                            <img 
                              key={i} 
                              src={f} 
                              alt="" 
                              onClick={() => setViewingPhotoAsset(asset)}
                              className="w-8 h-8 rounded-lg object-cover border border-amber-500/40 cursor-pointer shrink-0" 
                            />
                          ))}
                          {asset.fotos.length > 3 && (
                            <span className="text-[10px] font-bold text-amber-500 px-1">+{asset.fotos.length - 3}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setViewingPhotoAsset(asset)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 shrink-0 shadow-sm"
                        >
                          <i className="fa-solid fa-camera"></i>
                          <span>{asset.fotos.length} Foto{asset.fotos.length > 1 ? 's' : ''}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700/70 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1.5 pl-1">
                          <i className="fa-solid fa-camera text-slate-400"></i>
                          Sem fotos anexadas
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingIdPasswordCheck(asset.id);
                            setEditPasswordInput('');
                          }}
                          className="px-2 py-1 rounded-md text-[9px] font-bold uppercase text-blue-500 hover:bg-blue-500/10 transition-colors"
                        >
                          + Anexar Foto
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações Mobile */}
                <div className="pt-2 border-t border-slate-700/40 dark:border-slate-700/60">
                  {deletingId === asset.id ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-2">
                        <input 
                          type="password" 
                          placeholder="Senha (excluiritem)" 
                          value={deletePassword} 
                          onChange={(e) => setDeletePassword(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (deletePassword.trim().toLowerCase() === 'excluiritem') {
                                confirmDelete(asset.id);
                                setDeletePassword('');
                              } else {
                                alert('Senha incorreta! Digite: excluiritem');
                              }
                            }
                          }}
                          className={`flex-1 px-2.5 py-1.5 text-xs border rounded-xl outline-none text-center font-bold transition-all ${
                            darkMode 
                              ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-red-500' 
                              : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-red-500'
                          }`}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            if (deletePassword.trim().toLowerCase() === 'excluiritem') {
                              confirmDelete(asset.id);
                              setDeletePassword('');
                            } else {
                              alert('Senha incorreta! Digite: excluiritem');
                            }
                          }} 
                          className="bg-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase shadow-sm active:scale-95"
                        >
                          Confirmar
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setDeletingId(null);
                            setDeletePassword('');
                          }} 
                          className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border transition-colors ${
                            darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          X
                        </button>
                      </div>
                    </div>
                  ) : editingIdPasswordCheck === asset.id ? (
                    <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-2">
                        <input 
                          type="password" 
                          placeholder="Senha: editaritem" 
                          value={editPasswordInput} 
                          onChange={(e) => setEditPasswordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editPasswordInput === 'editaritem') {
                                handleEdit(asset);
                                setEditingIdPasswordCheck(null);
                                setEditPasswordInput('');
                              } else {
                                alert('Senha incorreta! Digite: editaritem');
                              }
                            }
                          }}
                          className={`flex-1 px-2.5 py-1.5 text-xs border rounded-xl outline-none text-center font-bold transition-all ${
                            darkMode 
                              ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' 
                              : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500'
                          }`}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            if (editPasswordInput === 'editaritem') {
                              handleEdit(asset);
                              setEditingIdPasswordCheck(null);
                              setEditPasswordInput('');
                            } else {
                              alert('Senha incorreta! Digite: editaritem');
                            }
                          }} 
                          className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase shadow-sm active:scale-95"
                        >
                          Editar
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setEditingIdPasswordCheck(null);
                            setEditPasswordInput('');
                          }} 
                          className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border transition-colors ${
                            darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          X
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          setEditingIdPasswordCheck(asset.id);
                          setEditPasswordInput('');
                          setDeletingId(null);
                        }} 
                        className="px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold flex items-center gap-1.5 active:scale-95"
                      >
                        <i className="fa-solid fa-pencil text-[10px]"></i>
                        <span>Editar</span>
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setDeletingId(asset.id);
                          setDeletePassword('');
                          setEditingIdPasswordCheck(null);
                        }} 
                        className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-bold flex items-center gap-1.5 active:scale-95"
                      >
                        <i className="fa-solid fa-trash text-[10px]"></i>
                        <span>Excluir</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-blue-500">Tipo de Equipamento</label>
                    {!isCustomType && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomType(true);
                          setFormData({...formData, TipoEquipamento: '' as EquipmentType});
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        + Novo Tipo
                      </button>
                    )}
                  </div>
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
                      <option value="" disabled>Selecione o tipo de equipamento</option>
                      {availableEquipmentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                      <option value="__CUSTOM__">+ OUTRO (Digitar novo tipo)...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite o novo tipo (ex: SERVIDOR, SWITCH, IMPRESSORA)..."
                        value={formData.TipoEquipamento}
                        onChange={e => setFormData({...formData, TipoEquipamento: e.target.value as any})}
                        className={`w-full border-2 rounded-xl pl-4 pr-16 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {formData.TipoEquipamento.trim() && (
                          <button 
                            type="button"
                            onClick={() => {
                              saveCustomType(formData.TipoEquipamento);
                              setIsCustomType(false);
                            }}
                            className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Confirmar e incluir na lista"
                          >
                            <i className="fa-solid fa-check font-black text-sm"></i>
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={() => {
                            setIsCustomType(false);
                            setFormData({...formData, TipoEquipamento: EquipmentType.NOTEBOOK});
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-500/10 rounded-lg transition-colors"
                          title="Voltar para lista de tipos"
                        >
                          <i className="fa-solid fa-rotate-left text-sm"></i>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider">Marca</label>
                    {!isCustomBrand && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomBrand(true);
                          setFormData({...formData, marca: ''});
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        + Nova Marca
                      </button>
                    )}
                  </div>
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
                      <option value="" disabled>Selecione a marca</option>
                      {availableBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                      <option value="__CUSTOM__">+ OUTRA (Digitar nova marca)...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite a nova marca (ex: ASUS, CISCO, ACER)..."
                        value={formData.marca}
                        onChange={e => setFormData({...formData, marca: e.target.value})}
                        className={`w-full border-2 rounded-xl pl-4 pr-16 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {formData.marca.trim() && (
                          <button 
                            type="button"
                            onClick={() => {
                              saveCustomBrand(formData.marca);
                              setIsCustomBrand(false);
                            }}
                            className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Confirmar e incluir na lista"
                          >
                            <i className="fa-solid fa-check font-black text-sm"></i>
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={() => {
                            setIsCustomBrand(false);
                            setFormData({...formData, marca: ''});
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-500/10 rounded-lg transition-colors"
                          title="Voltar para lista de marcas"
                        >
                          <i className="fa-solid fa-rotate-left text-sm"></i>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider">Modelo</label>
                    {!isCustomModel && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomModel(true);
                          setFormData({...formData, modelo: ''});
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        + Novo Modelo
                      </button>
                    )}
                  </div>
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
                      <option value="" disabled>Selecione o modelo</option>
                      {availableModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                      <option value="__CUSTOM__">+ OUTRO (Digitar novo modelo)...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite o novo modelo (ex: ThinkPad P14s)..."
                        value={formData.modelo}
                        onChange={e => setFormData({...formData, modelo: e.target.value})}
                        className={`w-full border-2 rounded-xl pl-4 pr-16 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {formData.modelo.trim() && (
                          <button 
                            type="button"
                            onClick={() => {
                              saveCustomModel(formData.modelo);
                              setIsCustomModel(false);
                            }}
                            className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Confirmar e incluir na lista"
                          >
                            <i className="fa-solid fa-check font-black text-sm"></i>
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={() => {
                            setIsCustomModel(false);
                            setFormData({...formData, modelo: ''});
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-500/10 rounded-lg transition-colors"
                          title="Voltar para lista de modelos"
                        >
                          <i className="fa-solid fa-rotate-left text-sm"></i>
                        </button>
                      </div>
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider">Estado do Equipto.</label>
                    {!isCustomStatus && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomStatus(true);
                          setFormData({...formData, EstadoEquipamento: ''});
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        + Novo Estado
                      </button>
                    )}
                  </div>
                  {!isCustomStatus ? (
                    <select 
                      value={formData.EstadoEquipamento} 
                      onChange={e => {
                        if (e.target.value === '__CUSTOM__') {
                          setIsCustomStatus(true);
                          setFormData({...formData, EstadoEquipamento: ''});
                        } else {
                          setFormData({...formData, EstadoEquipamento: e.target.value});
                        }
                      }} 
                      className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                      required
                    >
                      <option value="" disabled>Selecione o estado</option>
                      {availableStatuses.map(status => <option key={status} value={status}>{status}</option>)}
                      <option value="__CUSTOM__">+ OUTRO (Digitar novo estado)...</option>
                    </select>
                  ) : (
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Digite o novo estado (ex: EM MANUTENÇÃO, SUCATA)..."
                        value={formData.EstadoEquipamento}
                        onChange={e => setFormData({...formData, EstadoEquipamento: e.target.value})}
                        className={`w-full border-2 rounded-xl pl-4 pr-16 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        required
                        autoFocus
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {formData.EstadoEquipamento.trim() && (
                          <button 
                            type="button"
                            onClick={() => {
                              saveCustomStatus(formData.EstadoEquipamento);
                              setIsCustomStatus(false);
                            }}
                            className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Confirmar e incluir na lista"
                          >
                            <i className="fa-solid fa-check font-black text-sm"></i>
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={() => {
                            setIsCustomStatus(false);
                            setFormData({...formData, EstadoEquipamento: 'BOM'});
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-500/10 rounded-lg transition-colors"
                          title="Voltar para lista de estados"
                        >
                          <i className="fa-solid fa-rotate-left text-sm"></i>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-xl border-2 transition-all bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800">
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-blue-500 flex items-center gap-1">
                        <i className="fa-solid fa-location-dot text-blue-500"></i> Localização / Destinação
                      </label>
                      {!isCustomSituacao && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomSituacao(true);
                            setFormData({...formData, situacao: ''});
                          }}
                          className="text-[10px] font-bold text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          + Nova Destinação
                        </button>
                      )}
                    </div>
                    {!isCustomSituacao ? (
                      <select 
                        value={formData.situacao || 'Estoque'} 
                        onChange={e => {
                          if (e.target.value === '__CUSTOM__') {
                            setIsCustomSituacao(true);
                            setFormData({...formData, situacao: ''});
                          } else {
                            setFormData({...formData, situacao: e.target.value});
                          }
                        }} 
                        className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                      >
                        <option value="" disabled>Selecione a destinação</option>
                        {availableSituacoes.map(sit => (
                          <option key={sit} value={sit}>
                            {sit === 'Estoque' ? '📦 Em Estoque' : sit === 'Colaborador' ? '👤 Com Colaborador' : `📌 ${sit}`}
                          </option>
                        ))}
                        <option value="__CUSTOM__">+ OUTRA (Digitar nova destinação)...</option>
                      </select>
                    ) : (
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="Digite a nova destinação (ex: LAB DE TESTES, TI MANUTENÇÃO)..."
                          value={formData.situacao || ''}
                          onChange={e => setFormData({...formData, situacao: e.target.value})}
                          className={`w-full border-2 rounded-xl pl-4 pr-16 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                          required
                          autoFocus
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {formData.situacao && formData.situacao.trim() && (
                            <button 
                              type="button"
                              onClick={() => {
                                saveCustomSituacao(formData.situacao || '');
                                setIsCustomSituacao(false);
                              }}
                              className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Confirmar e incluir na lista"
                            >
                              <i className="fa-solid fa-check font-black text-sm"></i>
                            </button>
                          )}
                          <button 
                            type="button"
                            onClick={() => {
                              setIsCustomSituacao(false);
                              setFormData({...formData, situacao: 'Estoque'});
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-500/10 rounded-lg transition-colors"
                            title="Voltar para lista de destinações"
                          >
                            <i className="fa-solid fa-rotate-left text-sm"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {formData.situacao === 'Colaborador' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">ID do Colaborador</label>
                        <input 
                          type="text" 
                          placeholder="Ex: 50403..." 
                          value={formData.colaboradorId || ''} 
                          onChange={e => setFormData({...formData, colaboradorId: e.target.value})} 
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">Nome Completo</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Nome do Funcionário..." 
                          value={formData.colaboradorNome || ''} 
                          onChange={e => setFormData({...formData, colaboradorNome: e.target.value})} 
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                          required
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">E-mail Corporativo</label>
                        <input 
                          type="email" 
                          placeholder="email@empresa.com" 
                          value={formData.colaboradorEmail || ''} 
                          onChange={e => setFormData({...formData, colaboradorEmail: e.target.value})} 
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-bold text-sm focus:border-blue-500 transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                          required
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Seção de Registro Fotográfico de Equipamentos Danificados / Avarias / Laudo */}
                <div className={`md:col-span-2 p-3 sm:p-4 rounded-2xl border-2 transition-all ${
                  formData.EstadoEquipamento === 'DANIFICADO'
                    ? (darkMode ? 'bg-red-950/25 border-red-800/60' : 'bg-red-50 border-red-200')
                    : (darkMode ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200')
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black transition-colors shrink-0 ${
                        formData.EstadoEquipamento === 'DANIFICADO' 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        <i className="fa-solid fa-camera"></i>
                      </div>
                      <div>
                        <label className={`block text-[11px] font-black uppercase tracking-wider ${
                          formData.EstadoEquipamento === 'DANIFICADO' ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'
                        }`}>
                          Registro Fotográfico {formData.EstadoEquipamento === 'DANIFICADO' ? 'de Avarias / Defeito' : 'do Ativo'}
                        </label>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-tight">
                          {formData.EstadoEquipamento === 'DANIFICADO' 
                            ? '⚠️ Equipamento Danificado: Tire fotos para comprovação e laudo técnico do patrimônio.' 
                            : 'Anexe fotos para comprovar o estado ou etiquetas do equipamento.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowPhotoCaptureModal(true)}
                        className={`flex-1 sm:flex-initial px-3.5 py-2.5 sm:py-2 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 shadow-md transition-all border-b-2 ${
                          formData.EstadoEquipamento === 'DANIFICADO'
                            ? 'bg-red-500 hover:bg-red-400 border-red-700 text-white'
                            : 'bg-amber-500 hover:bg-amber-400 border-amber-600'
                        }`}
                        title="Tirar foto com a câmera"
                      >
                        <i className="fa-solid fa-camera"></i>
                        <span>Tirar Foto</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => directCameraInputRef.current?.click()}
                        className={`px-3 py-2.5 sm:py-2 border-2 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                          darkMode 
                            ? 'border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700' 
                            : 'border-slate-300 bg-white text-amber-600 hover:bg-slate-100'
                        }`}
                        title="Abrir câmera nativa do smartphone"
                      >
                        <i className="fa-solid fa-mobile-screen"></i>
                        <span>Celular</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => photoUploadInputRef.current?.click()}
                        disabled={isProcessingPhoto}
                        className={`px-3 py-2.5 sm:py-2 border-2 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                          darkMode 
                            ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' 
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                        title="Carregar fotos da galeria ou disco"
                      >
                        <i className="fa-solid fa-folder-open text-xs"></i>
                        <span>Galeria</span>
                      </button>

                      <input
                        ref={photoUploadInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFormPhotoUpload}
                        className="hidden"
                      />

                      <input
                        ref={directCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFormPhotoUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Lista de Fotos Anexadas */}
                  {formData.fotos && formData.fotos.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mt-3">
                      {formData.fotos.map((foto, idx) => (
                        <div 
                          key={idx} 
                          className="relative group rounded-xl overflow-hidden border-2 border-slate-700/60 aspect-square bg-slate-950 shadow-sm"
                        >
                          <img src={foto} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                            <button
                              type="button"
                              onClick={() => setViewingSinglePhoto(foto)}
                              className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90"
                              title="Ampliar foto"
                            >
                              <i className="fa-solid fa-magnifying-glass-plus text-xs"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(idx)}
                              className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90"
                              title="Remover foto"
                            >
                              <i className="fa-solid fa-trash text-xs"></i>
                            </button>
                          </div>
                          <span className="absolute bottom-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                            Foto {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div 
                      onClick={() => setShowPhotoCaptureModal(true)}
                      className={`p-4 rounded-xl border-2 border-dashed text-center text-xs font-medium transition-all cursor-pointer hover:opacity-90 active:scale-[0.99] ${
                        formData.EstadoEquipamento === 'DANIFICADO'
                          ? (darkMode ? 'border-red-900/40 text-red-400 bg-red-950/20' : 'border-red-200 text-red-700 bg-white/60')
                          : (darkMode ? 'border-slate-700 text-slate-400 bg-slate-900/20 hover:border-amber-500/50' : 'border-slate-300 text-slate-500 bg-white/60 hover:border-amber-500/50')
                      }`}
                    >
                      <i className="fa-solid fa-camera-retro text-2xl mb-1.5 block opacity-70 text-amber-500"></i>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {formData.EstadoEquipamento === 'DANIFICADO' 
                          ? '⚠️ Nenhuma foto anexada. Toque aqui para tirar foto da avaria para o laudo.' 
                          : 'Nenhuma foto anexada a este cadastro. Toque para tirar ou escolher foto.'}
                      </p>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Compatível com câmera do celular e fotos salvas na galeria
                      </span>
                    </div>
                  )}
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
      
      {showPhotoCaptureModal && (
        <PhotoCaptureModal
          onPhotoCaptured={handlePhotoCaptured}
          onClose={() => setShowPhotoCaptureModal(false)}
          title={formData.EstadoEquipamento === 'DANIFICADO' ? "Foto de Avaria / Dano do Equipamento" : "Foto do Equipamento"}
          subtitle={formData.EstadoEquipamento === 'DANIFICADO' ? "Enquadre a parte avariada ou danificada do patrimônio para laudo técnico" : "Enquadre o equipamento ou etiqueta para registro no inventário"}
        />
      )}

      {viewingPhotoAsset && (
        <PhotoViewerModal
          asset={viewingPhotoAsset}
          onClose={() => setViewingPhotoAsset(null)}
        />
      )}

      {viewingSinglePhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in"
          onClick={() => setViewingSinglePhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img 
              src={viewingSinglePhoto} 
              alt="Visualização da foto" 
              className="max-h-[80vh] max-w-full rounded-2xl object-contain border border-slate-700 shadow-2xl" 
            />
            <div className="mt-4 flex items-center gap-3">
              <a
                href={viewingSinglePhoto}
                download="foto_equipamento.jpg"
                onClick={(e) => e.stopPropagation()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg"
              >
                <i className="fa-solid fa-download"></i> Baixar Imagem
              </a>
              <button
                type="button"
                onClick={() => setViewingSinglePhoto(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2"
              >
                <i className="fa-solid fa-xmark"></i> Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      
      <SecurityModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        darkMode={darkMode}
        user={user}
        storageMode={storageMode}
        setStorageMode={setStorageMode}
        localGeminiKey={localGeminiKey}
        setLocalGeminiKey={setLocalGeminiKey}
        customFirebaseConfig={customFirebaseConfig}
        setCustomFirebaseConfig={setCustomFirebaseConfig}
        onSaveSecurity={handleSaveSecurity}
        onGoogleLogin={handleGoogleLogin}
        onGoogleLogout={handleGoogleLogout}
        onSecurityConfigChange={setSecurityConfig}
      />

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
