
import { Asset, AssetFormData } from '../types';

const STORAGE_KEY = 'asset_track_local_db';

export const sharepointService = {
  getAssets: async (): Promise<Asset[]> => {
    try {
      const localData = localStorage.getItem(STORAGE_KEY);
      const assets: Asset[] = localData ? JSON.parse(localData) : [];
      // Ordenar por data de criação decrescente (mais recentes primeiro)
      return assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.error('Erro ao ler dados locais:', err);
      return [];
    }
  },

  addAsset: async (formData: AssetFormData): Promise<Asset> => {
    const assets = await sharepointService.getAssets();
    const newAsset: Asset = {
      ...formData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    };
    
    const updated = [newAsset, ...assets];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newAsset;
  },

  updateAsset: async (id: string, formData: AssetFormData): Promise<Asset> => {
    const assets = await sharepointService.getAssets();
    const updated = assets.map(a => 
      a.id === id ? { ...a, ...formData } : a
    );
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    const updatedAsset = updated.find(a => a.id === id)!;
    return updatedAsset;
  },

  deleteAsset: async (id: string): Promise<void> => {
    const assets = await sharepointService.getAssets();
    const filtered = assets.filter(a => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  importLocalData: (jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (Array.isArray(data)) {
        localStorage.setItem(STORAGE_KEY, jsonData);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Erro na importação:', e);
      return false;
    }
  },

  clearAllData: () => {
    localStorage.removeItem(STORAGE_KEY);
  }
};
