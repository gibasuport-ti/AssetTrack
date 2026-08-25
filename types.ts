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
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'LOGIN' | 'IMPORT';
  userEmail: string;
  userName: string;
  userId: string;
  details: string;
  assetSerial?: string;
  assetPatrimonio?: string;
}

export interface SecurityConfig {
  restrictAccessToGoogle: boolean;
  allowedEmails: string[];
  allowedDomains: string[];
  autoLogoutMinutes: number;
  enableAuditLogs: boolean;
}
