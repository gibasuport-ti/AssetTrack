
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Asset, AssetFormData } from '../types';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

const STORE_NAME = 'assets';
const OLD_STORAGE_KEY = 'asset_track_local_db';
const DB_NAME = 'AssetTrackDB';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface AssetDB extends DBSchema {
  assets: {
    key: string;
    value: Asset;
    indexes: { 'by-date': string };
  };
}

let dbPromise: Promise<IDBPDatabase<AssetDB>>;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<AssetDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-date', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
};

const getStorageMode = (): 'cloud' | 'local' => {
  return (localStorage.getItem('assettrack_storage_mode') as 'cloud' | 'local') || 'cloud';
};

export const assetService = {
  /**
   * Busca todos os ativos salvos no Firestore/IndexedDB dependendo da configuração.
   */
  getAssets: async (): Promise<Asset[]> => {
    const isCloud = getStorageMode() === 'cloud';
    const path = 'assets';

    if (isCloud) {
      try {
        // 1. Tenta buscar da nuvem
        const q = query(collection(db, path), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const cloudAssets = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Asset));

        // Manter banco de backup local atualizado de forma resiliente
        try {
          const localDB = await getDB();
          const tx = localDB.transaction(STORE_NAME, 'readwrite');
          await tx.store.clear();
          for (const asset of cloudAssets) {
            await tx.store.put(asset);
          }
          await tx.done;
        } catch (localSyncErr) {
          console.warn("Erro ao sincronizar backup local:", localSyncErr);
        }

        // 2. Se a nuvem estiver vazia, tenta carregar dados locais antigos
        if (cloudAssets.length === 0) {
          // Tenta obter dados do localStorage antigo
          let legacyAssets: Asset[] = [];
          try {
            const rawLocal = localStorage.getItem(OLD_STORAGE_KEY);
            if (rawLocal) {
              legacyAssets = JSON.parse(rawLocal);
            }
          } catch (e) {
            console.error('Erro ao ler localStorage antigo para migração:', e);
          }

          // Tenta obter dados do IndexedDB antigo
          let indexedAssets: Asset[] = [];
          try {
            const localDB = await getDB();
            indexedAssets = await localDB.getAll(STORE_NAME);
          } catch (e) {
            console.error('Erro ao ler IndexedDB para migração:', e);
          }

          // Combina e remove duplicados usando o id do ativo
          const mergedMap = new Map<string, Asset>();
          legacyAssets.forEach(a => {
            if (a && a.id) mergedMap.set(a.id, a);
          });
          indexedAssets.forEach(a => {
            if (a && a.id) mergedMap.set(a.id, a);
          });

          const totalLocalAssets = Array.from(mergedMap.values());

          // Se houver dados locais, vamos migrá-los automaticamente para a nuvem
          if (totalLocalAssets.length > 0) {
            console.log(`Dados locais encontrados (${totalLocalAssets.length}). Iniciando migração automática para o Firestore...`);
            await assetService.migrateLocalToCloud(totalLocalAssets);
            
            // Re-busca da nuvem após migração para retornar o conteúdo fresco
            const freshSnapshot = await getDocs(q);
            return freshSnapshot.docs.map(doc => ({
              ...doc.data(),
              id: doc.id,
            } as Asset));
          }
        }

        return cloudAssets;
      } catch (err) {
        console.warn("Falha ao obter dados da nuvem. Carregando backup local offline...", err);
      }
    }

    // Retorna os dados locais do IndexedDB (fallback absoluto)
    try {
      const localDB = await getDB();
      const localAssets = await localDB.getAll(STORE_NAME);
      // Ordenação decrescente baseada no campo createdAt
      return localAssets.sort((a: Asset, b: Asset) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Adiciona um novo ativo ao Firestore/IndexedDB
   */
  addAsset: async (formData: AssetFormData): Promise<Asset> => {
    const isCloud = getStorageMode() === 'cloud';
    const path = 'assets';
    
    const id = Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    const newAssetData: Asset = {
      ...formData,
      id,
      createdAt: new Date().toISOString(),
      uid: auth.currentUser?.uid || 'anonymous'
    };

    if (isCloud) {
      try {
        const docRef = await addDoc(collection(db, path), {
          ...formData,
          createdAt: newAssetData.createdAt,
          uid: newAssetData.uid
        });
        const savedAsset = { ...newAssetData, id: docRef.id };
        
        // Salva backup local
        try {
          const localDB = await getDB();
          await localDB.put(STORE_NAME, savedAsset);
        } catch (localErr) {
          console.warn("Erro ao salvar cópia de segurança local:", localErr);
        }
        
        return savedAsset;
      } catch (err) {
        console.warn("Falha ao salvar na nuvem. Gravando no IndexedDB...", err);
      }
    }

    // Gravação puramente local no IndexedDB
    try {
      const localDB = await getDB();
      await localDB.put(STORE_NAME, newAssetData);
      return newAssetData;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
      throw err;
    }
  },

  /**
   * Atualiza um ativo existente no Firestore/IndexedDB
   */
  updateAsset: async (id: string, formData: AssetFormData): Promise<Asset> => {
    const isCloud = getStorageMode() === 'cloud';
    const path = `assets/${id}`;
    
    const updatedAsset: Asset = {
      ...formData,
      id,
      createdAt: (formData as any).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uid: auth.currentUser?.uid || 'anonymous'
    };

    if (isCloud) {
      try {
        const assetRef = doc(db, 'assets', id);
        await updateDoc(assetRef, {
          ...formData,
          updatedAt: updatedAsset.updatedAt
        });
        
        // Sincroniza local
        try {
          const localDB = await getDB();
          await localDB.put(STORE_NAME, updatedAsset);
        } catch (localErr) {
          console.warn("Erro ao sincronizar atualização no backup local:", localErr);
        }
        
        return updatedAsset;
      } catch (err) {
        console.warn("Falha ao atualizar na nuvem. Atualizando localmente no IndexedDB...", err);
      }
    }

    // Gravação puramente local
    try {
      const localDB = await getDB();
      await localDB.put(STORE_NAME, {
        ...updatedAsset,
        createdAt: updatedAsset.createdAt || new Date().toISOString()
      });
      return updatedAsset;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
      throw err;
    }
  },

  /**
   * Remove um ativo do Firestore/IndexedDB e de todas as mídias locais
   */
  deleteAsset: async (id: string): Promise<void> => {
    const isCloud = getStorageMode() === 'cloud';
    const path = `assets/${id}`;

    // 1. Sempre limpa do IndexedDB local
    try {
      const localDB = await getDB();
      await localDB.delete(STORE_NAME, id);
    } catch (localErr) {
      console.warn("Erro ao remover do backup local IndexedDB:", localErr);
    }

    // 2. Sempre limpa do localStorage antigo se existir
    try {
      const rawLocal = localStorage.getItem(OLD_STORAGE_KEY);
      if (rawLocal) {
        const parsed = JSON.parse(rawLocal);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((a: any) => String(a.id) !== String(id));
          localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(filtered));
        }
      }
    } catch (lsErr) {
      console.warn("Erro ao limpar do localStorage:", lsErr);
    }

    // 3. Se estiver em nuvem, remove do Firestore
    if (isCloud) {
      try {
        await deleteDoc(doc(db, 'assets', id));
        return;
      } catch (err) {
        console.warn("Falha ao remover item da nuvem:", err);
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      }
    }
  },

  /**
   * Migra dados locais do localStorage e IndexedDB para o Firestore
   */
  migrateLocalToCloud: async (providedAssets?: Asset[]): Promise<number> => {
    try {
      let localAssets: Asset[] = [];

      if (providedAssets) {
        localAssets = providedAssets;
      } else {
        // Tenta obter tudo do localStorage antigo
        let legacyAssets: Asset[] = [];
        try {
          const rawLocal = localStorage.getItem(OLD_STORAGE_KEY);
          if (rawLocal) {
            legacyAssets = JSON.parse(rawLocal);
          }
        } catch (e) {
          console.error(e);
        }

        // Tenta obter tudo do IndexedDB antigo
        let indexedAssets: Asset[] = [];
        try {
          const localDB = await getDB();
          indexedAssets = await localDB.getAll(STORE_NAME);
        } catch (e) {
          console.error(e);
        }

        // Combina e remove duplicados usando o id
        const mergedMap = new Map<string, Asset>();
        legacyAssets.forEach(a => {
          if (a && a.id) mergedMap.set(a.id, a);
        });
        indexedAssets.forEach(a => {
          if (a && a.id) mergedMap.set(a.id, a);
        });
        localAssets = Array.from(mergedMap.values());
      }
      
      if (localAssets.length === 0) return 0;
      
      let migratedCount = 0;
      for (const asset of localAssets) {
        try {
          // Usa id original para setDoc, evitando duplicações
          const assetId = asset.id || Math.random().toString(36).substr(2, 9);
          await setDoc(doc(db, 'assets', assetId), {
            ...asset,
            id: assetId,
            uid: asset.uid || auth.currentUser?.uid || 'anonymous'
          });
          migratedCount++;
        } catch (err) {
          console.error(`Erro ao migrar ativo ${asset.id}:`, err);
        }
      }
      
      // Limpa as bases locais após migração sucedida para não duplicar no futuro
      if (migratedCount > 0) {
        try {
          localStorage.removeItem(OLD_STORAGE_KEY);
          const localDB = await getDB();
          const tx = localDB.transaction(STORE_NAME, 'readwrite');
          await tx.store.clear();
          await tx.done;
        } catch (e) {
          console.error('Erro ao limpar base local pós-migração:', e);
        }
      }
      
      return migratedCount;
    } catch (err) {
      console.error('Erro na migração:', err);
      return 0;
    }
  },

  /**
   * Importa dados de um arquivo JSON para o Firestore
   */
  importLocalData: async (jsonData: string): Promise<boolean> => {
    const path = 'assets';
    try {
      if (!jsonData || jsonData.trim() === '') return false;
      const data = JSON.parse(jsonData);
      
      if (Array.isArray(data)) {
        const promises = data
          .filter(a => a && typeof a === 'object' && (a.serial || a.NumeroPatrimonio))
          .map(asset => {
             const itemToSave = {
               ...asset,
               createdAt: asset.createdAt || new Date().toISOString(),
               uid: auth.currentUser?.uid || 'anonymous'
             };
             return addDoc(collection(db, path), itemToSave);
          });

        await Promise.all(promises);
        return true;
      }
      return false;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
      return false;
    }
  }
};
