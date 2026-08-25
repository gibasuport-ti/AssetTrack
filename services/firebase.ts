import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import defaultFirebaseConfig from '../firebase-applet-config.json';

// Obter a configuração a ser utilizada (personalizada do local ou a padrão)
let firebaseConfig = defaultFirebaseConfig;
const savedConfig = localStorage.getItem('assettrack_custom_firebase_config');

if (savedConfig) {
  try {
    const parsed = JSON.parse(savedConfig);
    if (parsed && parsed.projectId && parsed.apiKey) {
      firebaseConfig = parsed;
    }
  } catch (e) {
    console.error('Erro ao analisar configuração personalizada do Firebase:', e);
  }
}

// Inicializa o Firebase (garante apenas uma instância ativa no desenvolvimento/HMR)
const apps = getApps();
const app = apps.length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inicializa o Firestore com resiliência para redes instáveis, firewalls e modo offline
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalAutoDetectLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  // Se já estiver inicializado, obtém a instância
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreInstance;

// Inicializa o Auth
export const auth = getAuth(app);

export default app;

