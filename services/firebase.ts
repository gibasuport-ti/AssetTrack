import { initializeApp, getApp, getApps, FirebaseOptions, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';

// 1. Obter variáveis de ambiente seguras (Vite / Hosting / GitHub Pages Secrets)
const env = (import.meta as any).env || {};
const envFirebaseConfig: Partial<FirebaseOptions> & { firestoreDatabaseId?: string } = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || env.VITE_FIREBASE_DATABASE_ID,
};

// 2. Tentar carregar configuração personalizada salva localmente pelo usuário na interface
let customSavedConfig: any = null;
try {
  const rawSaved = typeof window !== 'undefined' ? localStorage.getItem('assettrack_custom_firebase_config') : null;
  if (rawSaved) {
    const parsed = JSON.parse(rawSaved);
    if (parsed && parsed.projectId && parsed.apiKey) {
      customSavedConfig = parsed;
    }
  }
} catch (e) {
  console.warn('Erro ao ler configuração personalizada do Firebase:', e);
}

// 3. Fallback para arquivo de runtime do ambiente de desenvolvimento se existir (via glob síncrono do Vite)
let appletRuntimeConfig: any = null;
try {
  const configs = (import.meta as any).glob('../firebase-applet-config.json', { eager: true });
  const key = Object.keys(configs)[0];
  if (key && configs[key]) {
    appletRuntimeConfig = (configs[key] as any).default || configs[key];
  }
} catch {
  // Ignorado silenciosamente em ambiente público sem o arquivo
}

// Determina se temos credenciais reais ativas
export const isFirebaseConfigured: boolean = Boolean(
  (envFirebaseConfig.apiKey && envFirebaseConfig.projectId) ||
  (customSavedConfig && customSavedConfig.apiKey && customSavedConfig.projectId) ||
  (appletRuntimeConfig && appletRuntimeConfig.apiKey && appletRuntimeConfig.projectId)
);

// Resolução da melhor configuração disponível com fallback seguro que não quebra a inicialização do SDK
const resolvedConfig: any = 
  (envFirebaseConfig.apiKey && envFirebaseConfig.projectId) 
    ? envFirebaseConfig 
    : (customSavedConfig || appletRuntimeConfig || {
        projectId: "asset-track-local",
        apiKey: "AIzaSyDummyKeyForLocalAndOfflineInitializationOnly00",
        authDomain: "asset-track-local.firebaseapp.com",
        firestoreDatabaseId: "(default)"
      });

// Inicializa o Firebase (garante apenas uma instância ativa no desenvolvimento/HMR)
let app: FirebaseApp;
try {
  const apps = getApps();
  app = apps.length === 0 ? initializeApp(resolvedConfig) : getApp();
} catch (err) {
  console.warn("Aviso ao inicializar Firebase App:", err);
  const apps = getApps();
  app = apps.length > 0 ? getApp() : initializeApp({
    projectId: "asset-track-fallback",
    apiKey: "AIzaSyDummyFallbackKey0000000000000000000",
    authDomain: "asset-track-fallback.firebaseapp.com"
  });
}

const databaseId = resolvedConfig.firestoreDatabaseId || undefined;

// Inicializa o Firestore com resiliência para redes instáveis, firewalls e modo offline
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalAutoDetectLongPolling: true,
  }, databaseId);
} catch {
  try {
    firestoreInstance = getFirestore(app, databaseId);
  } catch (e) {
    console.warn("Aviso ao obter Firestore:", e);
    firestoreInstance = getFirestore(app);
  }
}

export const db = firestoreInstance;

// Inicializa o Firebase Auth com segurança
let authInstance: Auth;
try {
  authInstance = getAuth(app);
} catch (e) {
  console.warn("Aviso ao obter Auth:", e);
  authInstance = getAuth(app);
}

export const auth = authInstance;

export default app;



