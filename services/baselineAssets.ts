import rawAssets from '../data/sharepoint_assets.json';
import { Asset } from '../types';

const normalizeAssets = (items: any[]): Asset[] => {
  if (!Array.isArray(items)) return [];
  return items
    .filter((a) => a && typeof a === 'object' && (a.serial || a.id || a.NumeroPatrimonio))
    .map((asset) => ({
      ...asset,
      id: asset.id || ('ast_' + String(asset.serial || '').replace(/[^a-zA-Z0-9_\-]/g, '_')),
      TipoEquipamento: String(asset.TipoEquipamento || 'NOTEBOOK').toUpperCase(),
      marca: asset.marca || 'CIRION',
      modelo: asset.modelo || '',
      serial: asset.serial || '',
      NumeroPatrimonio: asset.NumeroPatrimonio || 'CIRION',
      EstadoEquipamento: String(asset.EstadoEquipamento || 'BOM').toUpperCase(),
      situacao: asset.situacao || 'Estoque',
      colaboradorId: asset.colaboradorId || '',
      colaboradorNome: asset.colaboradorNome || '',
      colaboradorEmail: asset.colaboradorEmail || '',
      DataAquisicao: asset.DataAquisicao || '',
      observacao: asset.observacao || '',
      fotos: Array.isArray(asset.fotos) ? asset.fotos : [],
      createdAt: asset.createdAt || new Date().toISOString(),
      updatedAt: asset.updatedAt || new Date().toISOString(),
    })) as Asset[];
};

export const BASELINE_ASSETS: Asset[] = normalizeAssets(rawAssets as any[]);
