
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
