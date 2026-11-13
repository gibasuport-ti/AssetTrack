import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  setDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { Asset, AssetFormData, StorageMode } from '../types';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { securityService } from './securityService';
import { sharepointService } from './sharepointService';
import { BASELINE_ASSETS } from './baselineAssets';

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

export const getStorageMode = (): StorageMode => {
  try {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('assettrack_storage_mode') as StorageMode) : null;
    return stored || 'sharepoint';
  } catch (e) {
    return 'sharepoint';
  }
};

export const setStorageMode = (mode: StorageMode): void => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('assettrack_storage_mode', mode);
    }
  } catch (e) {}
};

const sanitizeFormData = (data: AssetFormData): AssetFormData => {
  return {
    ...data,
    NumeroPatrimonio: securityService.sanitizeInput(data.NumeroPatrimonio || '').slice(0, 100),
    serial: securityService.sanitizeInput(data.serial || '').slice(0, 100),
    marca: securityService.sanitizeInput(data.marca || '').slice(0, 100),
    modelo: securityService.sanitizeInput(data.modelo || '').slice(0, 150),
    TipoEquipamento: securityService.sanitizeInput(data.TipoEquipamento || 'NOTEBOOK').slice(0, 100),
    EstadoEquipamento: securityService.sanitizeInput(data.EstadoEquipamento || 'BOM').slice(0, 100),
    DataAquisicao: securityService.sanitizeInput(data.DataAquisicao || '').slice(0, 50),
    observacao: securityService.sanitizeInput(data.observacao || '').slice(0, 2000),
    situacao: securityService.sanitizeInput(data.situacao || 'Estoque').slice(0, 100) as any,
    colaboradorId: securityService.sanitizeInput(data.colaboradorId || '').slice(0, 100),
    colaboradorNome: securityService.sanitizeInput(data.colaboradorNome || '').slice(0, 150),
    colaboradorEmail: securityService.sanitizeInput(data.colaboradorEmail || '').slice(0, 150),
    fotos: Array.isArray(data.fotos) ? data.fotos.slice(0, 6) : []
  };
};

const DELETED_KEYS_STORAGE = 'assettrack_deleted_asset_keys';
let hasSyncedFirestoreThisSession = false;

const getDeletedKeysSet = (): Set<string> => {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(DELETED_KEYS_STORAGE) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((k: any) => String(k).trim().toLowerCase()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

const markDeletedKey = (id: string, asset?: Partial<Asset> | null) => {
  try {
    if (typeof window === 'undefined') return;
    const keys = getDeletedKeysSet();
    if (id && id.trim()) keys.add(id.trim().toLowerCase());
    if (asset?.serial && asset.serial.trim()) keys.add(asset.serial.trim().toLowerCase());
    localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(Array.from(keys)));
  } catch {}
};

const unmarkDeletedKey = (asset?: Partial<Asset> | null) => {
  try {
    if (typeof window === 'undefined' || !asset) return;
    const keys = getDeletedKeysSet();
    if (asset.id) keys.delete(String(asset.id).trim().toLowerCase());
    if (asset.serial) keys.delete(String(asset.serial).trim().toLowerCase());
    localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(Array.from(keys)));
  } catch {}
};

const isAssetDeleted = (asset: Partial<Asset>, deletedKeys: Set<string>): boolean => {
  const idKey = String(asset.id || '').trim().toLowerCase();
  const serialKey = String(asset.serial || '').trim().toLowerCase();
  return (!!idKey && deletedKeys.has(idKey)) || (!!serialKey && deletedKeys.has(serialKey));
};

const getAssetIdentityKey = (asset: Partial<Asset>): string => {
  const serial = String(asset.serial || '').trim().toLowerCase();
  if (serial) return serial;
  return String(asset.id || '').trim().toLowerCase();
};

const sanitizeDocId = (rawId?: string): string => {
  const cleaned = String(rawId || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned || ('sp_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
};

const toFirestorePayload = (asset: Partial<Asset>, uid: string) => {
  const nowIso = new Date().toISOString();
  const safeFotos = Array.isArray(asset.fotos)
    ? asset.fotos.filter((f): f is string => typeof f === 'string' && f.length > 0 && f.length < 150000).slice(0, 6)
    : [];

  return {
    NumeroPatrimonio: (securityService.sanitizeInput(asset.NumeroPatrimonio || '') || 'CIRION').slice(0, 100),
    serial: (securityService.sanitizeInput(asset.serial || '') || sanitizeDocId(asset.id)).slice(0, 100),
    marca: (securityService.sanitizeInput(asset.marca || '') || 'CIRION').slice(0, 100),
    modelo: (securityService.sanitizeInput(asset.modelo || '') || 'EQUIPAMENTO').slice(0, 150),
    TipoEquipamento: (securityService.sanitizeInput(asset.TipoEquipamento || '') || 'NOTEBOOK').slice(0, 100),
    EstadoEquipamento: (securityService.sanitizeInput(asset.EstadoEquipamento || '') || 'BOM').slice(0, 100),
    DataAquisicao: (securityService.sanitizeInput(asset.DataAquisicao || '') || nowIso.split('T')[0]).slice(0, 50),
    situacao: (securityService.sanitizeInput(asset.situacao || '') || 'Estoque').slice(0, 100),
    colaboradorId: securityService.sanitizeInput(asset.colaboradorId || '').slice(0, 100),
    colaboradorNome: securityService.sanitizeInput(asset.colaboradorNome || '').slice(0, 150),
    colaboradorEmail: securityService.sanitizeInput(asset.colaboradorEmail || '').slice(0, 150),
    observacao: securityService.sanitizeInput(asset.observacao || '').slice(0, 2000),
    fotos: safeFotos,
    createdAt: String(asset.createdAt || nowIso).slice(0, 50),
    updatedAt: String(asset.updatedAt || nowIso).slice(0, 50),
    uid: String(uid || asset.uid || 'system').slice(0, 128),
  };
};

const getEmbeddedBaselineAssets = (deletedKeys: Set<string>): Asset[] => {
  const combined: Asset[] = [...BASELINE_ASSETS];
  if (typeof window !== 'undefined' && Array.isArray((window as any).INITIAL_CIRION_ASSETS)) {
    combined.push(...((window as any).INITIAL_CIRION_ASSETS as Asset[]));
  }
  return combined.filter(a => a && !isAssetDeleted(a, deletedKeys));
};

const mergeAssetLists = (primary: Asset[], secondary: Asset[], deletedKeys: Set<string>): Asset[] => {
  const byId = new Map<string, Asset>();
  const bySerial = new Set<string>();

  const addEntry = (item: Asset, isPrimary: boolean) => {
    if (!item || isAssetDeleted(item, deletedKeys)) return;
    const idKey = String(item.id || '').trim().toLowerCase();
    const serialKey = String(item.serial || '').trim().toLowerCase();

    if (!isPrimary) {
      if ((idKey && byId.has(idKey)) || (serialKey && bySerial.has(serialKey))) {
        return;
      }
    }

    const storageKey = idKey || serialKey || ('idx_' + byId.size);
    const existing = byId.get(storageKey);
    if (existing) {
      // Preserva fotos do IndexedDB caso o item primário tenha vindo sem fotos do localStorage
      if ((!existing.fotos || existing.fotos.length === 0) && item.fotos && item.fotos.length > 0) {
        byId.set(storageKey, { ...existing, fotos: item.fotos });
      }
      return;
    }

    byId.set(storageKey, item);
    if (serialKey) bySerial.add(serialKey);
  };

  primary.forEach(item => addEntry(item, true));
  secondary.forEach(item => addEntry(item, false));

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
};

export const assetService = {
  /**
   * Sincroniza automaticamente quaisquer ativos ausentes da base completa (244+ itens)
   * para o Firebase Firestore quando houver sessão autenticada.
   */
  syncLocalBaseToFirestore: async (baselineOverride?: Asset[]): Promise<{ synced: number; totalCloud: number }> => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      return { synced: 0, totalCloud: 0 };
    }

    const deletedKeys = getDeletedKeysSet();
    let existingSnap;
    try {
      existingSnap = await getDocs(collection(db, 'assets'));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'assets');
      return { synced: 0, totalCloud: 0 };
    }

    const existingIds = new Set<string>();
    const existingSerials = new Set<string>();
    existingSnap.docs.forEach(docSnap => {
      existingIds.add(docSnap.id.trim().toLowerCase());
      const data = docSnap.data() as Partial<Asset>;
      if (data?.serial) {
        existingSerials.add(String(data.serial).trim().toLowerCase());
      }
    });

    const candidatesMap = new Map<string, Asset>();
    const collect = (items: Asset[]) => {
      for (const item of items) {
        if (!item || isAssetDeleted(item, deletedKeys)) continue;
        const key = getAssetIdentityKey(item);
        if (key && !candidatesMap.has(key)) {
          candidatesMap.set(key, item);
        }
      }
    };

    if (Array.isArray(baselineOverride) && baselineOverride.length > 0) {
      collect(baselineOverride);
    } else {
      try {
        const res = await fetch('/api/sharepoint/assets');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data?.items)) collect(data.items);
        }
      } catch {}
    }

    collect(getEmbeddedBaselineAssets(deletedKeys));

    try {
      const localDB = await getDB();
      const localAssets = await localDB.getAll(STORE_NAME);
      collect(localAssets);
    } catch {}

    const missing = Array.from(candidatesMap.values()).filter(item => {
      const idKey = String(item.id || '').trim().toLowerCase();
      const serialKey = String(item.serial || '').trim().toLowerCase();
      return !(idKey && existingIds.has(idKey)) && !(serialKey && existingSerials.has(serialKey));
    });

    if (missing.length > 0) {
      const uid = auth.currentUser.uid;
      const chunkSize = 10;
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (item) => {
            const targetId = sanitizeDocId(item.id || item.serial);
            const payload = toFirestorePayload(item, uid);
            try {
              await setDoc(doc(db, 'assets', targetId), payload);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `assets/${targetId}`);
            }
          })
        );
      }
    }

    hasSyncedFirestoreThisSession = true;
    return { synced: missing.length, totalCloud: existingSnap.size + missing.length };
  },

  /**
   * Busca todos os ativos salvos no SharePoint / Firestore / IndexedDB dependendo da configuração.
   * Totalmente resiliente com proteção contra perda de dados e consolidação completa (244+ ativos).
   */
  getAssets: async (): Promise<Asset[]> => {
    const mode = getStorageMode();
    const deletedKeys = getDeletedKeysSet();

    // 1. MODO SHAREPOINT (Prioritário para Microsoft 365 / Base Completa)
    if (mode === 'sharepoint') {
      try {
        let spAssets = await sharepointService.getAssets();
        
        // Se SharePoint tiver menos de 50 ativos, tenta restaurar inventário do servidor
        if (!spAssets || spAssets.length < 50) {
          try {
            const fbResult = await sharepointService.importFromFirebaseToSharePoint();
            if (fbResult && fbResult.items && fbResult.items.length > (spAssets ? spAssets.length : 0)) {
              spAssets = fbResult.items;
            }
          } catch (fbErr) {
            console.warn('[SharePoint Service] Tentativa de importação do Firebase:', fbErr);
          }
        }

        let localAssets: Asset[] = [];
        try {
          const localDB = await getDB();
          localAssets = await localDB.getAll(STORE_NAME);
        } catch {}

        const baseline = getEmbeddedBaselineAssets(deletedKeys);
        const merged = mergeAssetLists(spAssets || [], [...localAssets, ...baseline], deletedKeys);

        if (merged.length > 0) {
          try {
            const localDB = await getDB();
            const tx = localDB.transaction(STORE_NAME, 'readwrite');
            for (const asset of merged) {
              await tx.store.put(asset);
            }
            await tx.done;
          } catch (e) {}

          if (auth.currentUser && !auth.currentUser.isAnonymous && !hasSyncedFirestoreThisSession) {
            void assetService.syncLocalBaseToFirestore(merged).catch(() => {});
          }
          return merged;
        }
      } catch (spErr) {
        console.warn('Falha ao obter dados da Lista do SharePoint. Usando backup local...', spErr);
      }
    }

    // 2. MODO FIRESTORE / CLOUD
    const path = 'assets';
    if (mode === 'cloud') {
      try {
        const q = query(collection(db, path), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const cloudAssets = querySnapshot.docs.map(docSnap => ({
          ...docSnap.data(),
          id: docSnap.id,
        } as Asset));

        let localAssets: Asset[] = [];
        try {
          const localDB = await getDB();
          localAssets = await localDB.getAll(STORE_NAME);
        } catch {}

        const baseline = getEmbeddedBaselineAssets(deletedKeys);
        const mergedCloud = mergeAssetLists(cloudAssets, [...baseline, ...localAssets], deletedKeys);

        if (mergedCloud.length > 0) {
          try {
            const localDB = await getDB();
            const tx = localDB.transaction(STORE_NAME, 'readwrite');
            for (const asset of mergedCloud) {
              await tx.store.put(asset);
            }
            await tx.done;
          } catch (localSyncErr) {}

          if (
            auth.currentUser &&
            !auth.currentUser.isAnonymous &&
            (!hasSyncedFirestoreThisSession || mergedCloud.length > cloudAssets.length)
          ) {
            void assetService.syncLocalBaseToFirestore(mergedCloud).catch(() => {});
          }
          return mergedCloud;
        }
      } catch (err) {
        console.warn("Falha ao obter dados da nuvem. Carregando dados resilientes...", err);
      }
      
      // Fallback da Nuvem para o SharePoint/Embutido se Firestore falhar
      try {
        const spFallback = await sharepointService.getAssets();
        if (spFallback.length > 0) return spFallback;
      } catch (e) {}
    }

    // 3. Retorna os dados locais do IndexedDB mesclados com a base embutida (fallback universal)
    try {
      const localDB = await getDB();
      const localAssets = await localDB.getAll(STORE_NAME);
      const baseline = getEmbeddedBaselineAssets(deletedKeys);
      const mergedFallback = mergeAssetLists(localAssets, baseline, deletedKeys);

      if (mergedFallback.length > localAssets.length) {
        try {
          const tx = localDB.transaction(STORE_NAME, 'readwrite');
          for (const asset of mergedFallback) {
            await tx.store.put(asset);
          }
          await tx.done;
        } catch {}
      }

      return mergedFallback;
    } catch (err) {
      console.error('Erro ao ler do IndexedDB:', err);
      return getEmbeddedBaselineAssets(deletedKeys);
    }
  },

  /**
   * Adiciona um novo ativo com sanitização, espelhamento em nuvem e auditoria
   */
  addAsset: async (rawFormData: AssetFormData): Promise<Asset> => {
    const mode = getStorageMode();
    const formData = sanitizeFormData(rawFormData);
    const msUser = securityService.getCurrentMicrosoftUser();
    const currentUserEmail = msUser?.email || auth.currentUser?.email || 'corporativo@xyzlatam.com';
    const currentUserName = msUser?.displayName || auth.currentUser?.displayName || 'Usuário Corporativo';

    // MODO SHAREPOINT
    if (mode === 'sharepoint') {
      const savedAsset = await sharepointService.addAsset(formData);
      unmarkDeletedKey(savedAsset);

      try {
        const localDB = await getDB();
        await localDB.put(STORE_NAME, savedAsset);
      } catch (e) {}

      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        const docId = sanitizeDocId(savedAsset.id);
        const payload = toFirestorePayload(savedAsset, auth.currentUser.uid);
        void setDoc(doc(db, 'assets', docId), payload).catch(err => {
          try { handleFirestoreError(err, OperationType.WRITE, `assets/${docId}`); } catch {}
        });
      }

      await securityService.logAction({
        action: 'CREATE',
        userEmail: currentUserEmail,
        userName: currentUserName,
        userId: msUser?.id || auth.currentUser?.uid || 'sp_user',
        details: `Cadastrado na Lista do SharePoint: ${savedAsset.marca} ${savedAsset.modelo} (Patrimônio: ${savedAsset.NumeroPatrimonio})`,
        assetSerial: savedAsset.serial,
        assetPatrimonio: savedAsset.NumeroPatrimonio
      });

      return savedAsset;
    }

    // MODO FIRESTORE / CLOUD
    const path = 'assets';
    const id = 'ast_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const newAssetData: Asset = {
      ...formData,
      id,
      createdAt: new Date().toISOString(),
      uid: auth.currentUser?.uid || 'anonymous'
    };

    unmarkDeletedKey(newAssetData);
    let savedAsset: Asset = newAssetData;

    if (mode === 'cloud') {
      try {
        const payload = toFirestorePayload(newAssetData, auth.currentUser?.uid || 'anonymous');
        await setDoc(doc(db, path, id), payload);
        savedAsset = { ...newAssetData, id };
        
        try {
          const localDB = await getDB();
          await localDB.put(STORE_NAME, savedAsset);
        } catch (localErr) {}
      } catch (err) {
        if (auth.currentUser) {
          try { handleFirestoreError(err, OperationType.CREATE, `${path}/${id}`); } catch {}
        } else {
          console.warn("Falha ao salvar na nuvem. Gravando no IndexedDB...", err);
        }
      }
    }

    if (mode === 'local' || savedAsset.id === id) {
      const localDB = await getDB();
      await localDB.put(STORE_NAME, savedAsset);
    }

    // Trilha de Auditoria
    await securityService.logAction({
      action: 'CREATE',
      userEmail: currentUserEmail,
      userName: currentUserName,
      userId: msUser?.id || auth.currentUser?.uid || 'anonymous',
      details: `Cadastrado ativo: ${savedAsset.marca} ${savedAsset.modelo} (Patrimônio: ${savedAsset.NumeroPatrimonio})`,
      assetSerial: savedAsset.serial,
      assetPatrimonio: savedAsset.NumeroPatrimonio
    });

    return savedAsset;
  },

  /**
   * Atualiza um ativo existente
   */
  updateAsset: async (id: string, rawFormData: AssetFormData): Promise<Asset> => {
    const mode = getStorageMode();
    const formData = sanitizeFormData(rawFormData);
    const msUser = securityService.getCurrentMicrosoftUser();
    const currentUserEmail = msUser?.email || auth.currentUser?.email || 'corporativo@xyzlatam.com';
    const currentUserName = msUser?.displayName || auth.currentUser?.displayName || 'Usuário Corporativo';

    // MODO SHAREPOINT
    if (mode === 'sharepoint') {
      const updated = await sharepointService.updateAsset(id, formData);

      try {
        const localDB = await getDB();
        await localDB.put(STORE_NAME, updated);
      } catch (e) {}

      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        const docId = sanitizeDocId(id);
        const payload = toFirestorePayload(updated, auth.currentUser.uid);
        void setDoc(doc(db, 'assets', docId), payload, { merge: true }).catch(err => {
          try { handleFirestoreError(err, OperationType.UPDATE, `assets/${docId}`); } catch {}
        });
      }

      await securityService.logAction({
        action: 'UPDATE',
        userEmail: currentUserEmail,
        userName: currentUserName,
        userId: msUser?.id || auth.currentUser?.uid || 'sp_user',
        details: `Atualizado no SharePoint: ${updated.marca} ${updated.modelo} (Patrimônio: ${updated.NumeroPatrimonio})`,
        assetSerial: updated.serial,
        assetPatrimonio: updated.NumeroPatrimonio
      });

      return updated;
    }

    // MODO FIRESTORE / LOCAL
    const docId = sanitizeDocId(id);
    const updatedAsset: Asset = {
      ...formData,
      id,
      createdAt: (rawFormData as any).createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uid: auth.currentUser?.uid || 'anonymous'
    };

    if (mode === 'cloud') {
      try {
        const assetRef = doc(db, 'assets', docId);
        const payload = toFirestorePayload(updatedAsset, auth.currentUser?.uid || 'anonymous');
        await setDoc(assetRef, payload, { merge: true });
      } catch (err) {
        if (auth.currentUser) {
          try { handleFirestoreError(err, OperationType.UPDATE, `assets/${docId}`); } catch {}
        } else {
          console.warn("Falha ao atualizar na nuvem. Atualizando no IndexedDB...", err);
        }
      }
    }

    const localDB = await getDB();
    await localDB.put(STORE_NAME, {
      ...updatedAsset,
      createdAt: updatedAsset.createdAt || new Date().toISOString()
    });

    await securityService.logAction({
      action: 'UPDATE',
      userEmail: currentUserEmail,
      userName: currentUserName,
      userId: msUser?.id || auth.currentUser?.uid || 'anonymous',
      details: `Atualizado ativo: ${updatedAsset.marca} ${updatedAsset.modelo} (Patrimônio: ${updatedAsset.NumeroPatrimonio})`,
      assetSerial: updatedAsset.serial,
      assetPatrimonio: updatedAsset.NumeroPatrimonio
    });

    return updatedAsset;
  },

  /**
   * Remove um ativo com autorização e auditoria
   */
  deleteAsset: async (id: string): Promise<void> => {
    const mode = getStorageMode();
    const msUser = securityService.getCurrentMicrosoftUser();
    const currentUserEmail = msUser?.email || auth.currentUser?.email || 'corporativo@xyzlatam.com';
    const currentUserName = msUser?.displayName || auth.currentUser?.displayName || 'Usuário Corporativo';

    let existingLocal: Asset | undefined;
    try {
      const localDB = await getDB();
      existingLocal = await localDB.get(STORE_NAME, id);
    } catch {}

    markDeletedKey(id, existingLocal);

    if (mode === 'sharepoint') {
      await sharepointService.deleteAsset(id);
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        const docId = sanitizeDocId(id);
        void deleteDoc(doc(db, 'assets', docId)).catch(err => {
          try { handleFirestoreError(err, OperationType.DELETE, `assets/${docId}`); } catch {}
        });
      }
    } else if (mode === 'cloud') {
      try {
        await sharepointService.deleteAsset(id);
      } catch {}
      try {
        await deleteDoc(doc(db, 'assets', sanitizeDocId(id)));
      } catch (err) {
        if (auth.currentUser) {
          try { handleFirestoreError(err, OperationType.DELETE, `assets/${id}`); } catch {}
        }
      }
    } else {
      try {
        await sharepointService.deleteAsset(id);
      } catch {}
    }

    // Remove do IndexedDB
    try {
      const localDB = await getDB();
      await localDB.delete(STORE_NAME, id);
    } catch (e) {}

    // Trilha de Auditoria
    await securityService.logAction({
      action: 'DELETE',
      userEmail: currentUserEmail,
      userName: currentUserName,
      userId: msUser?.id || auth.currentUser?.uid || 'anonymous',
      details: `Excluído ativo ID: ${id} (${mode === 'sharepoint' ? 'Lista do SharePoint' : 'Base de Dados'})`
    });
  },

  /**
   * Migração Direta para a Lista do SharePoint em https://xyzlatam-my.sharepoint.com/
   * Coleta dados de todas as fontes (IndexedDB, LocalStorage Legado, Caches e Firestore).
   */
  migrateAllToSharePoint: async (): Promise<{ success: boolean; migratedCount: number; message: string; assets: Asset[] }> => {
    const recoveredMap = new Map<string, Asset>();

    // 1. IndexedDB (AssetTrackDB)
    try {
      const localDB = await getDB();
      const allLocal = await localDB.getAll(STORE_NAME);
      allLocal.forEach(a => {
        if (a && (a.serial || a.NumeroPatrimonio || a.id)) {
          const key = (a.serial || a.NumeroPatrimonio || a.id).trim().toLowerCase();
          recoveredMap.set(key, a);
        }
      });
    } catch (e) {}

    // 2. LocalStorage Cache SharePoint
    try {
      const spCache = localStorage.getItem('assettrack_sharepoint_cache');
      if (spCache) {
        const parsed = JSON.parse(spCache);
        if (Array.isArray(parsed)) {
          parsed.forEach(a => {
            if (a && (a.serial || a.NumeroPatrimonio || a.id)) {
              const key = (a.serial || a.NumeroPatrimonio || a.id).trim().toLowerCase();
              if (!recoveredMap.has(key)) recoveredMap.set(key, a);
            }
          });
        }
      }
    } catch (e) {}

    // 3. LocalStorage Legado (asset_track_local_db)
    try {
      const legacy = localStorage.getItem('asset_track_local_db');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          parsed.forEach(a => {
            if (a && (a.serial || a.NumeroPatrimonio || a.id)) {
              const key = (a.serial || a.NumeroPatrimonio || a.id).trim().toLowerCase();
              if (!recoveredMap.has(key)) recoveredMap.set(key, a);
            }
          });
        }
      }
    } catch (e) {}

    // 4. Firestore (se acessível)
    try {
      const q = query(collection(db, 'assets'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      snap.docs.forEach(docSnap => {
        const a = { ...docSnap.data(), id: docSnap.id } as Asset;
        if (a && (a.serial || a.NumeroPatrimonio || a.id)) {
          const key = (a.serial || a.NumeroPatrimonio || a.id).trim().toLowerCase();
          if (!recoveredMap.has(key)) recoveredMap.set(key, a);
        }
      });
    } catch (e) {}

    let combined = Array.from(recoveredMap.values());

    // Se nenhuma fonte tinha dados ainda, provisiona a frota padrão corporativa Cirion
    if (combined.length === 0) {
      const seedResult = await sharepointService.restoreSeedFleet();
      combined = seedResult.items || [];
    }

    const result = await sharepointService.migrateToSharePoint(combined);
    
    // Atualiza IndexedDB com os dados migrados
    try {
      const localDB = await getDB();
      const tx = localDB.transaction(STORE_NAME, 'readwrite');
      for (const asset of combined) {
        await tx.store.put(asset);
      }
      await tx.done;
    } catch (e) {}

    // Ativa o SharePoint como o modo padrão ativo
    setStorageMode('sharepoint');

    return {
      success: true,
      migratedCount: combined.length,
      message: result.message || `Migração de ${combined.length} ativos para o SharePoint concluída com sucesso!`,
      assets: combined
    };
  },

  /**
   * Força a restauração imediata do inventário corporativo padrão Cirion Technologies
   */
  restoreCorporateInventory: async (): Promise<{ success: boolean; count: number; assets: Asset[] }> => {
    const seedResult = await sharepointService.restoreSeedFleet();
    const assets = seedResult.items || [];

    try {
      const localDB = await getDB();
      const tx = localDB.transaction(STORE_NAME, 'readwrite');
      for (const asset of assets) {
        await tx.store.put(asset);
      }
      await tx.done;
    } catch (e) {}

    setStorageMode('sharepoint');

    return {
      success: true,
      count: assets.length,
      assets
    };
  },

  /**
   * Importa dados de arquivo JSON
   */
  importLocalData: async (jsonData: string): Promise<boolean> => {
    const mode = getStorageMode();
    try {
      if (!jsonData || jsonData.trim() === '') return false;
      const data = JSON.parse(jsonData);
      
      if (Array.isArray(data)) {
        const validAssets = data.filter(a => a && typeof a === 'object' && (a.serial || a.NumeroPatrimonio));
        
        if (mode === 'sharepoint') {
          await sharepointService.migrateToSharePoint(validAssets);
          return true;
        }

        const promises = validAssets.map(asset => {
          const cleanItem = sanitizeFormData(asset);
          return addDoc(collection(db, 'assets'), {
            ...cleanItem,
            createdAt: asset.createdAt || new Date().toISOString(),
            uid: auth.currentUser?.uid || 'anonymous'
          });
        });

        await Promise.all(promises);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  /**
   * Restaura o inventário do Firebase (230+ itens) e consolida no SharePoint Online
   */
  restoreFirebaseToSharePoint: async (): Promise<{ success: boolean; totalItems: number; items: Asset[]; message: string }> => {
    const res = await sharepointService.importFromFirebaseToSharePoint();
    if (res && res.items && res.items.length > 0) {
      try {
        const localDB = await getDB();
        const tx = localDB.transaction(STORE_NAME, 'readwrite');
        for (const asset of res.items) {
          await tx.store.put(asset);
        }
        await tx.done;
      } catch (e) {}
    }
    return res;
  }
};

