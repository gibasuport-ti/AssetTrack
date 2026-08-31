import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut, 
  User 
} from 'firebase/auth';
import { auth, db } from './firebase';
import { AuditLog, SecurityConfig } from '../types';

const AUDIT_STORAGE_KEY = 'assettrack_audit_logs';
const SECURITY_CONFIG_KEY = 'assettrack_security_config';

// Configurações Padrão de Segurança
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  restrictAccessToGoogle: true, // Acesso restrito obrigatório por padrão
  allowedEmails: ['gibasuporte@gmail.com'],
  allowedDomains: [],
  autoLogoutMinutes: 0, // 0 = desativado
  enableAuditLogs: true,
};

export const securityService = {
  // Sanitização de entradas contra injeção e XSS
  sanitizeInput: (input: string): string => {
    if (!input) return '';
    return String(input)
      .replace(/[<>]/g, '') // remove tags básicas
      .trim();
  },

  // Obter configurações de segurança
  getSecurityConfig: (): SecurityConfig => {
    try {
      const stored = localStorage.getItem(SECURITY_CONFIG_KEY);
      if (stored) {
        return { ...DEFAULT_SECURITY_CONFIG, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações de segurança:', e);
    }
    return DEFAULT_SECURITY_CONFIG;
  },

  // Salvar configurações de segurança
  saveSecurityConfig: async (config: SecurityConfig): Promise<void> => {
    try {
      localStorage.setItem(SECURITY_CONFIG_KEY, JSON.stringify(config));
      // Tenta salvar na nuvem se autenticado
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        const configDoc = doc(db, 'security_settings', 'global');
        await setDoc(configDoc, {
          ...config,
          updatedAt: new Date().toISOString(),
          updatedBy: auth.currentUser.email || auth.currentUser.uid
        }, { merge: true });
      }
    } catch (err) {
      console.error('Erro ao salvar configurações de segurança:', err);
    }
  },

  // Autenticação com Google com fallback e diagnóstico detalhado
  loginWithGoogle: async (): Promise<User> => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      const result = await signInWithPopup(auth, provider);
      
      // Registra auditoria de login
      await securityService.logAction({
        action: 'LOGIN',
        userEmail: result.user.email || 'Anônimo',
        userName: result.user.displayName || 'Usuário Google',
        userId: result.user.uid,
        details: 'Login bem-sucedido via Google OAuth 2.0 (Popup)'
      });

      return result.user;
    } catch (err: any) {
      console.warn('Tentativa inicial de login com popup falhou:', err);

      // Tratamento específico para GitHub Pages / domínios não autorizados
      if (err?.code === 'auth/unauthorized-domain') {
        const hostname = window.location.hostname;
        const msg = `O domínio "${hostname}" não está autorizado no Firebase Authentication. Para ativar o login no GitHub Pages, adicione "${hostname}" na lista de Domínios Autorizados no Firebase Console (Authentication > Settings > Authorized domains).`;
        console.error(msg);
        throw new Error(msg);
      }

      // Se o popup foi bloqueado pelo navegador, tenta via redirecionamento
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        try {
          console.log('Tentando login via redirecionamento (signInWithRedirect)...');
          await signInWithRedirect(auth, provider);
          // O redirecionamento recarrega a página
          throw new Error('Redirecionando para o login do Google...');
        } catch (redirectErr: any) {
          if (redirectErr?.code === 'auth/unauthorized-domain') {
            const hostname = window.location.hostname;
            throw new Error(`O domínio "${hostname}" não está autorizado no Firebase. Adicione-o em Firebase Console > Authentication > Settings > Authorized domains.`);
          }
          throw redirectErr;
        }
      }

      throw err;
    }
  },

  // Processa o resultado do redirecionamento se houver
  checkRedirectResult: async (): Promise<User | null> => {
    try {
      const result = await getRedirectResult(auth);
      if (result && result.user) {
        await securityService.logAction({
          action: 'LOGIN',
          userEmail: result.user.email || 'Anônimo',
          userName: result.user.displayName || 'Usuário Google',
          userId: result.user.uid,
          details: 'Login bem-sucedido via Google OAuth 2.0 (Redirect)'
        });
        return result.user;
      }
    } catch (err: any) {
      console.error('Erro ao processar resultado do redirecionamento do Google:', err);
    }
    return null;
  },

  // Logout seguro
  logout: async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (currentUser && !currentUser.isAnonymous) {
      await securityService.logAction({
        action: 'LOGIN',
        userEmail: currentUser.email || 'Usuário',
        userName: currentUser.displayName || 'Usuário',
        userId: currentUser.uid,
        details: 'Encerramento de sessão (Logout) realizado pelo usuário'
      });
    }
    await firebaseSignOut(auth);
  },

  // Verificar se usuário tem acesso permitido
  isUserAuthorized: (user: User | null, config: SecurityConfig): { authorized: boolean; reason?: string } => {
    // Se a restrição não estiver ativa, permite acesso
    if (!config.restrictAccessToGoogle) {
      return { authorized: true };
    }

    // Se a restrição estiver ativa, requer login com Google
    if (!user || user.isAnonymous) {
      return { 
        authorized: false, 
        reason: 'Acesso restrito: É necessário fazer login com sua Conta Google corporativa/autorizada.' 
      };
    }

    const email = (user.email || '').toLowerCase().trim();
    if (!email) {
      return { 
        authorized: false, 
        reason: 'E-mail do Google não identificado.' 
      };
    }

    // Admin supremo sempre autorizado
    if (email === 'gibasuporte@gmail.com') {
      return { authorized: true };
    }

    // Checagem de lista de e-mails permitidos
    const allowedEmails = (config.allowedEmails || []).map(e => e.toLowerCase().trim());
    if (allowedEmails.length > 0 && allowedEmails.includes(email)) {
      return { authorized: true };
    }

    // Checagem de domínios permitidos (ex: @empresa.com.br)
    const allowedDomains = (config.allowedDomains || []).map(d => d.toLowerCase().trim().replace(/^@/, ''));
    if (allowedDomains.length > 0) {
      const userDomain = email.split('@')[1];
      if (userDomain && allowedDomains.includes(userDomain)) {
        return { authorized: true };
      }
    }

    // Se há restrições de e-mail/domínio configuradas e o usuário não se encaixou
    if (allowedEmails.length > 0 || allowedDomains.length > 0) {
      return { 
        authorized: false, 
        reason: `O e-mail (${email}) não está na lista de usuários ou domínios autorizados. Contate o administrador gibasuporte@gmail.com.` 
      };
    }

    return { authorized: true };
  },

  // Registrar Trilha de Auditoria (Audit Log)
  logAction: async (log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> => {
    try {
      const fullLog: AuditLog = {
        id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
        timestamp: new Date().toISOString(),
        ...log
      };

      // Salva localmente em cache
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      const logs: AuditLog[] = stored ? JSON.parse(stored) : [];
      logs.unshift(fullLog);
      // Mantém últimos 100 logs locais
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, 100)));

      // Tenta gravar no Firestore se autenticado
      if (auth.currentUser) {
        const auditCol = collection(db, 'audit_logs');
        await addDoc(auditCol, fullLog);
      }
    } catch (e) {
      console.warn('Não foi possível gravar log de auditoria:', e);
    }
  },

  // Obter trilha de auditoria
  getAuditLogs: async (): Promise<AuditLog[]> => {
    // Tenta obter do Firestore se possível
    try {
      if (auth.currentUser) {
        const auditCol = collection(db, 'audit_logs');
        const q = query(auditCol, orderBy('timestamp', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));
        }
      }
    } catch (e) {
      console.warn('Buscando logs locais de auditoria:', e);
    }

    // Fallback para logs locais
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }
};
