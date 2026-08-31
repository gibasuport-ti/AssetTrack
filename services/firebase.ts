import { initializeApp, getApp, getApps, FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  Firestore
} from 'firebase/firestore';

// 1. Obter variáveis de ambiente seguras (Vite / Hosting / CI/CD)
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

// 2. Tentar carregar configuração local (se o usuário inseriu nas configurações da UI)
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
  // Ignorado silenciosamente quando executado em repositório público sem o arquivo local
}

// Resolução da melhor configuração disponível (Ambiente > Custom UI > Runtime Dev)
const resolvedConfig: any = 
  (envFirebaseConfig.apiKey && envFirebaseConfig.projectId) 
    ? envFirebaseConfig 
    : (customSavedConfig || appletRuntimeConfig || {
        projectId: "unconfigured-project",
        apiKey: "",
        authDomain: "",
        firestoreDatabaseId: "(default)"
      });

// Inicializa o Firebase (garante apenas uma instância ativa no desenvolvimento/HMR)
const apps = getApps();
const app = apps.length === 0 ? initializeApp(resolvedConfig) : getApp();

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
  // Se já estiver inicializado, obtém a instância existente
  firestoreInstance = getFirestore(app, databaseId);
}

export const db = firestoreInstance;

// Inicializa o Firebase Auth
export const auth = getAuth(app);

export default app;


