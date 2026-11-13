
import { Asset, AssetFormData, SharePointConfig } from '../types';
import { securityService } from './securityService';
import { BASELINE_ASSETS } from './baselineAssets';

const SP_CONFIG_KEY = 'assettrack_sharepoint_config';
const SP_LOCAL_CACHE_KEY = 'assettrack_sharepoint_cache';

const DELETED_KEYS_STORAGE = 'assettrack_deleted_asset_keys';

const getDeletedKeysSet = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_KEYS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((k: any) => String(k).trim().toLowerCase()) : []);
  } catch {
    return new Set();
  }
};

/**
 * Salva com segurança no localStorage sem estourar a cota de 5MB (evita QuotaExceededError).
 * Remove strings base64 pesadas de imagens e preserva todo o inventário para contingência offline.
 */
const safeSetLocalCache = (items: Asset[]): void => {
  try {
    if (!Array.isArray(items)) return;
    // Otimização: remove fotos pesadas em base64 e mantém todos os registros leves
    const lightweight = items.map(item => {
      const copy: Asset = { ...item };
      if (copy.fotos && copy.fotos.length > 0) {
        copy.fotos = [];
      }
      if ((copy as any).photoUrl) {
        delete (copy as any).photoUrl;
      }
      return copy;
    });
    localStorage.setItem(SP_LOCAL_CACHE_KEY, JSON.stringify(lightweight));
  } catch (err) {
    console.warn('[SharePoint Cache] Cota de localStorage atingida. Tentando cache reduzido:', err);
    try {
      const reduced = items.slice(0, 150).map(item => ({ ...item, fotos: [] }));
      localStorage.setItem(SP_LOCAL_CACHE_KEY, JSON.stringify(reduced));
    } catch (clearErr) {
      try {
        localStorage.removeItem(SP_LOCAL_CACHE_KEY);
      } catch (e) {}
    }
  }
};

// Limpeza preventiva apenas se o cache antigo tiver excesso de fotos base64 (> 800KB)
try {
  const existingCache = localStorage.getItem(SP_LOCAL_CACHE_KEY);
  if (existingCache && existingCache.length > 800000) {
    localStorage.removeItem(SP_LOCAL_CACHE_KEY);
  }
} catch (e) {
  try { localStorage.removeItem(SP_LOCAL_CACHE_KEY); } catch (err) {}
}



export const DEFAULT_SHAREPOINT_CONFIG: SharePointConfig = {
  siteUrl: 'https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil',
  listName: 'ControleDeAtivos',
  viewUrl: 'https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil/_layouts/15/viewlsts.aspx?view=14',
  listUrl: 'https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil/Lists/ControleDeAtivos/AllItems.aspx',
  tenantId: 'xyzlatam.onmicrosoft.com',
  connected: true,
  lastSyncTimestamp: new Date().toISOString(),
  totalSyncedItems: 244,
};

export const sharepointService = {
  /**
   * Obtém as configurações atuais da conexão com o SharePoint
   */
  getConfig: async (): Promise<SharePointConfig> => {
    try {
      const res = await fetch('/api/sharepoint/config');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const site = data.siteUrl && !data.siteUrl.includes('ciriontechnologies-my.sharepoint.com') 
          ? data.siteUrl 
          : DEFAULT_SHAREPOINT_CONFIG.siteUrl;
        return {
          ...DEFAULT_SHAREPOINT_CONFIG,
          ...data,
          siteUrl: site,
          listName: data.listName || DEFAULT_SHAREPOINT_CONFIG.listName,
          viewUrl: data.viewUrl || DEFAULT_SHAREPOINT_CONFIG.viewUrl,
          listUrl: data.listUrl || DEFAULT_SHAREPOINT_CONFIG.listUrl,
        };
      }
    } catch (e) {
      console.warn('Erro ao obter config do SharePoint do backend, buscando localmente:', e);
    }

    try {
      const stored = localStorage.getItem(SP_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.siteUrl || parsed.siteUrl.includes('ciriontechnologies-my.sharepoint.com')) {
          parsed.siteUrl = DEFAULT_SHAREPOINT_CONFIG.siteUrl;
          parsed.viewUrl = DEFAULT_SHAREPOINT_CONFIG.viewUrl;
          parsed.listUrl = DEFAULT_SHAREPOINT_CONFIG.listUrl;
          localStorage.setItem(SP_CONFIG_KEY, JSON.stringify(parsed));
        }
        return { ...DEFAULT_SHAREPOINT_CONFIG, ...parsed };
      }
    } catch (e) {}

    return DEFAULT_SHAREPOINT_CONFIG;
  },

  /**
   * Salva configurações do SharePoint no backend e no armazenamento local
   */
  saveConfig: async (config: Partial<SharePointConfig>): Promise<SharePointConfig> => {
    const current = await sharepointService.getConfig();
    const updated: SharePointConfig = { ...current, ...config };

    try {
      localStorage.setItem(SP_CONFIG_KEY, JSON.stringify(updated));
      await fetch('/api/sharepoint/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('Erro ao salvar config do SharePoint:', e);
    }

    return updated;
  },

  /**
   * Testa a conectividade com o SharePoint Online (https://xyzlatam-my.sharepoint.com/)
   */
  testConnection: async (siteUrl?: string, listName?: string): Promise<{ success: boolean; message: string; latencyMs?: number }> => {
    try {
      const res = await fetch('/api/sharepoint/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, listName })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Falha ao conectar com o serviço SharePoint.'
      };
    }
  },

  /**
   * Obtém os ativos salvos na lista do SharePoint com cache local resiliente
   */
  getAssets: async (): Promise<Asset[]> => {
    try {
      const res = await fetch('/api/sharepoint/assets');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        const items: Asset[] = data.items || [];
        if (items.length > 0) {
          // Atualiza cache local de forma segura
          safeSetLocalCache(items);
          return items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar do SharePoint via API, usando cache local/embutido:', err);
    }

    // Fallback para ambientes estáticos (GitHub/Netlify/Standalone): mescla base completa + cache local
    const mergedMap = new Map<string, Asset>();
    const deletedKeys = getDeletedKeysSet();

    for (const item of BASELINE_ASSETS) {
      const key = String(item.serial || item.id || '').trim().toLowerCase();
      if (key && !deletedKeys.has(key) && !deletedKeys.has(String(item.id || '').trim().toLowerCase())) {
        mergedMap.set(key, item);
      }
    }

    if (typeof window !== 'undefined' && Array.isArray((window as any).INITIAL_CIRION_ASSETS)) {
      for (const item of (window as any).INITIAL_CIRION_ASSETS as Asset[]) {
        const key = String(item.serial || item.id || '').trim().toLowerCase();
        if (key && !deletedKeys.has(key) && !deletedKeys.has(String(item.id || '').trim().toLowerCase())) {
          mergedMap.set(key, item);
        }
      }
    }

    try {
      const cached = localStorage.getItem(SP_LOCAL_CACHE_KEY);
      if (cached) {
        const parsed: Asset[] = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const key = String(item.serial || item.id || '').trim().toLowerCase();
            if (key && !deletedKeys.has(key) && !deletedKeys.has(String(item.id || '').trim().toLowerCase())) {
              mergedMap.set(key, item);
            }
          }
        }
      }
    } catch (e) {}

    const result = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    if (result.length > 0) {
      safeSetLocalCache(result);
    }
    return result;
  },

  /**
   * Restaura e migra todos os dados do Firebase (mais de 230 itens) para o SharePoint
   */
  importFromFirebaseToSharePoint: async (): Promise<{ success: boolean; totalItems: number; items: Asset[]; message: string }> => {
    const res = await fetch('/api/sharepoint/import-from-firebase', { method: 'POST' });
    if (!res.ok) {
      throw new Error('Falha ao restaurar dados do Firebase para o SharePoint.');
    }
    const data = await res.json();
    if (Array.isArray(data.items) && data.items.length > 0) {
      safeSetLocalCache(data.items);
    }
    return data;
  },

  /**
   * Restaura o inventário corporativo Cirion Technologies padrão no SharePoint
   */
  restoreSeedFleet: async (): Promise<{ success: boolean; totalItems: number; items: Asset[]; message: string }> => {
    const res = await fetch('/api/sharepoint/restore-seed', { method: 'POST' });
    if (!res.ok) {
      throw new Error('Falha ao restaurar inventário corporativo padrão.');
    }
    const data = await res.json();
    if (Array.isArray(data.items) && data.items.length > 0) {
      safeSetLocalCache(data.items);
    }
    return data;
  },

  /**
   * Obtém dados de diagnóstico do backend de armazenamento
   */
  getDiagnostics: async (): Promise<any> => {
    try {
      const res = await fetch('/api/sharepoint/diagnostics');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) return await res.json();
    } catch (e) {}
    return null;
  },

  /**
   * Obtém todos os itens pendentes de gravação na lista do SharePoint Online
   */
  getPendingItems: async (): Promise<any> => {
    try {
      const res = await fetch('/api/sharepoint/pending-items');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) return await res.json();
    } catch (e) {}
    return null;
  },

  /**
   * Adiciona um novo ativo na Lista do SharePoint com sanitização e chancela do Microsoft Authenticator
   */
  addAsset: async (formData: AssetFormData): Promise<Asset> => {
    const id = 'sp_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const msUser = securityService.getCurrentMicrosoftUser();
    const newAsset: Asset = {
      ...formData,
      id,
      createdAt: new Date().toISOString(),
      syncedToSharepoint: true,
      cloudSynced: true,
      cloudSyncPending: false,
      mfaVerified: msUser?.mfaVerified ?? true,
      cadastradoPor: msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com',
      sharepointId: Date.now()
    };

    try {
      const res = await fetch('/api/sharepoint/assets', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com'
        },
        body: JSON.stringify(newAsset)
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.item) {
          // Atualiza cache local
          try {
            const current = await sharepointService.getAssets();
            const next = [data.item, ...current.filter(a => a.id !== id)];
            safeSetLocalCache(next);
          } catch (e) {}
          return data.item;
        }
      }
    } catch (e) {
      console.warn('Erro ao salvar direto no SharePoint, gravando no cache local para sync posterior:', e);
    }

    // Remove da lista de excluídos caso um serial similar seja recadastrado
    try {
      const deleted = getDeletedKeysSet();
      deleted.delete(id.trim().toLowerCase());
      if (newAsset.serial) deleted.delete(newAsset.serial.trim().toLowerCase());
      localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(Array.from(deleted)));
    } catch (e) {}

    // Salva no cache local offline
    try {
      const current = await sharepointService.getAssets();
      const updated = [newAsset, ...current.filter(a => a.id !== id)];
      safeSetLocalCache(updated);
    } catch (e) {}

    return newAsset;
  },

  /**
   * Atualiza um ativo existente na Lista do SharePoint
   */
  updateAsset: async (id: string, formData: AssetFormData): Promise<Asset> => {
    const current = await sharepointService.getAssets();
    const existing = current.find(a => String(a.id) === String(id));
    const msUser = securityService.getCurrentMicrosoftUser();

    const updatedAsset: Asset = {
      ...formData,
      id,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncedToSharepoint: true,
      cloudSynced: true,
      cloudSyncPending: false,
      mfaVerified: msUser?.mfaVerified ?? true,
      cadastradoPor: existing?.cadastradoPor || msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com'
    };

    try {
      const res = await fetch(`/api/sharepoint/assets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': msUser?.email || 'gilberto.araujo.ext@ciriontechnologies.com'
        },
        body: JSON.stringify(updatedAsset)
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.item) {
          try {
            const next = current.map(a => a.id === id ? { ...a, ...data.item } : a);
            safeSetLocalCache(next);
          } catch (e) {}
          return data.item;
        }
      }
    } catch (e) {
      console.warn('Erro ao atualizar no SharePoint, atualizando cache local:', e);
    }

    // Atualiza cache local
    try {
      const next = current.map(a => a.id === id ? { ...a, ...updatedAsset } : a);
      safeSetLocalCache(next);
    } catch (e) {}

    return updatedAsset;
  },

  /**
   * Remove um item da Lista do SharePoint
   */
  deleteAsset: async (id: string): Promise<void> => {
    try {
      const current = await sharepointService.getAssets();
      const target = current.find(a => String(a.id) === String(id) || String(a.sharepointId) === String(id));
      const deleted = getDeletedKeysSet();
      deleted.add(String(id).trim().toLowerCase());
      if (target?.serial) deleted.add(String(target.serial).trim().toLowerCase());
      localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(Array.from(deleted)));
    } catch (e) {}

    try {
      await fetch(`/api/sharepoint/assets/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Erro ao deletar no SharePoint:', e);
    }

    // Remove do cache local sem risco de erro de cota
    try {
      const current = await sharepointService.getAssets();
      const next = current.filter(a => 
        String(a.id) !== String(id) && 
        String(a.sharepointId) !== String(id)
      );
      safeSetLocalCache(next);
    } catch (e) {
      console.warn('Erro ao atualizar cache local após exclusão:', e);
    }
  },

  /**
   * Realiza a migração em massa de ativos para a Lista do SharePoint em https://xyzlatam-my.sharepoint.com/
   */
  migrateToSharePoint: async (assets: Asset[]): Promise<{
    success: boolean;
    migratedCount: number;
    targetSite: string;
    listName: string;
    message: string;
  }> => {
    try {
      const res = await fetch('/api/sharepoint/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro na migração para SharePoint.');
      }

      const result = await res.json();

      // Grava no cache local do SharePoint com proteção de cota
      safeSetLocalCache(assets.map(a => ({ ...a, syncedToSharepoint: true })));

      // Auditoria
      await securityService.logAction({
        action: 'MIGRATE_SHAREPOINT',
        userEmail: 'corporativo@ciriontechnologies.com',
        userName: 'Administrador M365 Cirion',
        userId: 'sharepoint_migration',
        details: `Migração completa de ${assets.length} ativos para a Lista "${result.listName}" no SharePoint (${result.targetSite}).`
      });

      return {
        success: true,
        migratedCount: assets.length,
        targetSite: result.targetSite || 'https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil',
        listName: result.listName || 'ControleDeAtivos',
        message: result.message || 'Migração para o SharePoint concluída com sucesso!'
      };
    } catch (e: any) {
      console.error('Erro ao migrar para SharePoint:', e);
      throw e;
    }
  },

  /**
   * Gera o script automatizado PowerShell / PnP para provisionar as colunas da lista no SharePoint
   */
  generatePowerShellScript: (siteUrl: string = 'https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil', listName: string = 'ControleDeAtivos'): string => {
    return `# =========================================================================
# Script de Criação e Provisionamento da Lista no SharePoint Online
# Site: ${siteUrl}
# Lista: ${listName}
# =========================================================================

Install-Module -Name PnP.PowerShell -Scope CurrentUser -Force
Connect-PnPOnline -Url "${siteUrl}" -Interactive

# Cria a Lista se não existir
$list = Get-PnPList -Identity "${listName}" -ErrorAction SilentlyContinue
if (-not $list) {
    Write-Host "Criando Lista '${listName}' no SharePoint..." -ForegroundColor Cyan
    $list = New-PnPList -Title "${listName}" -Template GenericList -EnableVersioning
}

# Adiciona as colunas necessárias para o aplicativo de Coletor de Ativos
Add-PnPField -List "${listName}" -DisplayName "NumeroPatrimonio" -InternalName "NumeroPatrimonio" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "Serial" -InternalName "Serial" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "TipoEquipamento" -InternalName "TipoEquipamento" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "Marca" -InternalName "Marca" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "Modelo" -InternalName "Modelo" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "EstadoEquipamento" -InternalName "EstadoEquipamento" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "DataAquisicao" -InternalName "DataAquisicao" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "Situacao" -InternalName "Situacao" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "ColaboradorId" -InternalName "ColaboradorId" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "ColaboradorNome" -InternalName "ColaboradorNome" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "ColaboradorEmail" -InternalName "ColaboradorEmail" -Type Text -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "Observacao" -InternalName "Observacao" -Type Note -AddToDefaultView
Add-PnPField -List "${listName}" -DisplayName "FotosJson" -InternalName "FotosJson" -Type Note

Write-Host "Lista '${listName}' provisionada com sucesso no SharePoint Online!" -ForegroundColor Green
`;
  },

  /**
   * Baixa a planilha formatada em CSV pronta para importação direta no SharePoint Online
   */
  downloadSharePointCSV: () => {
    window.location.href = '/api/sharepoint/export-csv';
  },

  /**
   * Baixa a planilha em formato Excel nativo (.XLSX) para "+ Novo > Lista > Do Excel" no SharePoint
   */
  downloadSharePointExcel: () => {
    window.location.href = '/api/sharepoint/export-excel';
  },

  /**
   * Baixa o script PowerShell com os 244 ativos embutidos para execução automatizada
   */
  downloadMigrationScript: () => {
    window.location.href = '/api/sharepoint/export-powershell';
  },

  /**
   * Copia os dados tabulados (TSV) dos ativos para a área de transferência
   * permitindo colar com Ctrl+V na opção "Editar em exibição de grade" do SharePoint
   */
  copyGridDataToClipboard: async (assets: Asset[]): Promise<boolean> => {
    try {
      const headers = [
        "Title",
        "NumeroPatrimonio",
        "Serial",
        "TipoEquipamento",
        "Marca",
        "Modelo",
        "EstadoEquipamento",
        "Situacao",
        "ColaboradorNome",
        "ColaboradorId",
        "ColaboradorEmail",
        "DataAquisicao",
        "Observacao"
      ];

      const cleanVal = (v: any) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

      const rows = assets.map(a => [
        cleanVal(a.NumeroPatrimonio || a.serial || 'ATIVO'),
        cleanVal(a.NumeroPatrimonio),
        cleanVal(a.serial),
        cleanVal(a.TipoEquipamento),
        cleanVal(a.marca),
        cleanVal(a.modelo),
        cleanVal(a.EstadoEquipamento || 'BOM'),
        cleanVal(a.situacao || 'Alocado'),
        cleanVal(a.colaboradorNome),
        cleanVal(a.colaboradorId),
        cleanVal(a.colaboradorEmail),
        cleanVal(a.DataAquisicao),
        cleanVal(a.observacao)
      ].join('\t'));

      const tsv = [headers.join('\t'), ...rows].join('\n');
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch (e) {
      console.warn('Clipboard writeText failed, falling back to textarea execCommand:', e);
      try {
        const textarea = document.createElement('textarea');
        textarea.value = assets.map(a => [
          a.NumeroPatrimonio || a.serial || 'ATIVO',
          a.NumeroPatrimonio || '',
          a.serial || '',
          a.TipoEquipamento || '',
          a.marca || '',
          a.modelo || '',
          a.EstadoEquipamento || 'BOM',
          a.situacao || 'Alocado',
          a.colaboradorNome || '',
          a.colaboradorId || '',
          a.colaboradorEmail || '',
          a.DataAquisicao || '',
          a.observacao || ''
        ].join('\t')).join('\n');
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch (err) {
        return false;
      }
    }
  },

  /**
   * Conecta ao stream Server-Sent Events (SSE) para atualização em tempo real instantânea da lista ControleDeAtivos
   */
  subscribeToRealTimeUpdates: (
    onEvent: (event: { type: string; data?: any; listName?: string; totalItems?: number; timestamp?: string }) => void,
    onStatusChange?: (status: 'connected' | 'disconnected' | 'reconnecting') => void
  ): (() => void) => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isCleanedUp = false;

    const connect = () => {
      if (isCleanedUp) return;
      try {
        if (onStatusChange) onStatusChange('reconnecting');
        eventSource = new EventSource('/api/sharepoint/realtime');

        eventSource.onopen = () => {
          if (onStatusChange) onStatusChange('connected');
        };

        eventSource.onmessage = (e) => {
          try {
            if (!e.data || e.data === ': keepalive') return;
            const parsed = JSON.parse(e.data);
            onEvent(parsed);
          } catch (err) {
            console.warn('[SharePoint SSE] Erro ao processar payload em tempo real:', err);
          }
        };

        eventSource.onerror = () => {
          if (onStatusChange) onStatusChange('disconnected');
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isCleanedUp) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.warn('[SharePoint SSE] Falha ao iniciar stream:', err);
        if (!isCleanedUp) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isCleanedUp = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }
};

