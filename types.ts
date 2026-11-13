export interface Asset {
  id: string;
  DataAquisicao: string;
  TipoEquipamento: string;
  marca: string;
  modelo: string;
  serial: string;
  NumeroPatrimonio: string;
  EstadoEquipamento: string;
  observacao: string;
  createdAt: string;
  updatedAt?: string;
  uid?: string;
  situacao?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
  colaboradorEmail?: string;
  fotos?: string[];
  sharepointId?: string | number;
  syncedToSharepoint?: boolean;
  cloudSynced?: boolean;
  cloudSyncPending?: boolean;
  cloudSyncMessage?: string;
  mfaVerified?: boolean;
  cadastradoPor?: string;
}

export type AssetFormData = Omit<Asset, 'id' | 'createdAt'>;

export enum EquipmentType {
  NOTEBOOK = 'NOTEBOOK',
  SMARTPHONE = 'SMARTPHONE',
  PC = 'DESKTOP PC',
  TABLET = 'TABLET',
  MONITOR = 'MONITOR',
  OUTRO = 'OUTRO'
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'LOGIN' | 'IMPORT' | 'MIGRATE_SHAREPOINT' | 'SYNC_SHAREPOINT' | 'MFA_VERIFY' | 'SECURITY_UPDATE';
  userEmail: string;
  userName: string;
  userId: string;
  details: string;
  assetSerial?: string;
  assetPatrimonio?: string;
}

export type StorageMode = 'sharepoint' | 'cloud' | 'local';

export interface SharePointConfig {
  siteUrl: string;
  listName: string;
  viewUrl?: string;
  listUrl?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  connected?: boolean;
  lastSyncTimestamp?: string;
  totalSyncedItems?: number;
}

export interface MicrosoftUser {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'operator' | 'auditor';
  roles?: string[];
  mfaVerified: boolean;
  mfaMethod?: 'microsoft_authenticator' | 'entra_sso' | 'totp';
  mfaVerifiedAt?: string;
  tenant?: string;
  tenantId?: string;
  jobTitle?: string;
  sessionToken?: string;
  tokenExpiresAt?: number;
  lastLogin?: string;
}

export interface SecurityConfig {
  restrictAccessToGoogle: boolean;
  authProvider: 'microsoft';
  enforceMicrosoftAuthenticator: boolean;
  enforceCorporateMfa: boolean;
  allowedEmails: string[];
  allowedDomains: string[];
  autoLogoutMinutes: number;
  enableAuditLogs: boolean;
  watermarkEnabled: boolean;
  corporateWatermark?: boolean;
  requireMfaForSensitiveActions: boolean;
  antiBruteForceEnabled?: boolean;
}

