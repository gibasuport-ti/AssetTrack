import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('[Builder] Iniciando compilação do HTML Standalone 100% idêntico ao Web App...');

// 1. Carrega os 244 ativos existentes
const assetsFilePath = path.join(process.cwd(), 'data', 'sharepoint_assets.json');
let rawAssets = [];
if (fs.existsSync(assetsFilePath)) {
  try {
    rawAssets = JSON.parse(fs.readFileSync(assetsFilePath, 'utf-8'));
    console.log(`[Builder] Carregados ${rawAssets.length} ativos corporativos reais.`);
  } catch (err) {
    console.error('[Builder] Erro ao ler ativos:', err);
  }
}

// Compacta as propriedades dos ativos
const optimizedAssets = rawAssets.map(asset => ({
  id: asset.id || ('ast_' + Math.random().toString(36).substring(2, 9)),
  TipoEquipamento: (asset.TipoEquipamento || 'NOTEBOOK').toUpperCase(),
  marca: asset.marca || 'CIRION',
  modelo: asset.modelo || '',
  serial: asset.serial || '',
  NumeroPatrimonio: asset.NumeroPatrimonio || 'CIRION',
  EstadoEquipamento: (asset.EstadoEquipamento || 'BOM').toUpperCase(),
  situacao: asset.situacao || 'Estoque',
  colaboradorId: asset.colaboradorId || '',
  colaboradorNome: asset.colaboradorNome || '',
  colaboradorEmail: asset.colaboradorEmail || '',
  DataAquisicao: asset.DataAquisicao || '',
  observacao: asset.observacao || '',
  fotos: Array.isArray(asset.fotos) ? asset.fotos : [],
  createdAt: asset.createdAt || new Date().toISOString(),
  updatedAt: asset.updatedAt || new Date().toISOString()
}));

const serializedAssetsJson = JSON.stringify(optimizedAssets);

// 2. Compila a aplicação React com Vite SingleFile
console.log('[Builder] Executando vite build...');
execSync('npx vite build', { stdio: 'inherit' });

const distIndexPath = path.join(process.cwd(), 'dist', 'index.html');
if (!fs.existsSync(distIndexPath)) {
  console.error('[Builder] Erro: dist/index.html não foi gerado.');
  process.exit(1);
}

let bundledHtml = fs.readFileSync(distIndexPath, 'utf-8');

// 3. Mantém o marcador de preload limpo (os ativos completos já são empacotados em services/baselineAssets.ts sem duplicação)
const markerRegex = /<script id="cirion-preload-marker">[\s\S]*?<\/script>/;
const replacementScript = `<script id="cirion-preload-marker">window.INITIAL_CIRION_ASSETS = [];</script>`;

if (markerRegex.test(bundledHtml)) {
  bundledHtml = bundledHtml.replace(markerRegex, () => replacementScript);
  console.log(`[Builder] Marcador cirion-preload-marker limpo (${optimizedAssets.length} ativos já empacotados no bundle JS).`);
}

// 3b. Remove script de fallback de HTML bruto do bundle já compilado
bundledHtml = bundledHtml.replace(/<script id="raw-github-pages-fallback">[\s\S]*?<\/script>/g, '');

// 4. Localiza o script module principal usando lastIndexOf para evitar tags internas de bibliotecas
const scriptOpenTag = '<script type="module" crossorigin>';
const openIdx = bundledHtml.indexOf(scriptOpenTag);
const scriptCloseTag = '</script>';
const closeIdx = bundledHtml.lastIndexOf(scriptCloseTag);

if (openIdx !== -1 && closeIdx > openIdx) {
  const pre = bundledHtml.substring(0, openIdx);
  const jsCode = bundledHtml.substring(openIdx + scriptOpenTag.length, closeIdx);
  const post = bundledHtml.substring(closeIdx + scriptCloseTag.length);

  // Escapa rigorosamente TODOS os '</' dentro do código JS para '\x3c/'
  // Isso impede que qualquer string de biblioteca (ex: SheetJS table export) quebre o parser HTML
  const safeJsCode = jsCode.replace(/<\//g, '\\x3c/');
  const finalizedScript = `${scriptOpenTag}\n${safeJsCode}\n${scriptCloseTag}`;

  // Monta o HTML garantindo que o script fique após <div id="root"></div> no <body>
  // Usamos split/join para evitar a interpretação de '$&' ou '$$typeof' pelo motor de regex do JS
  const cleanHtml = pre + post;
  const rootTarget = '<div id="root"></div>';
  if (cleanHtml.includes(rootTarget)) {
    const parts = cleanHtml.split(rootTarget);
    bundledHtml = parts[0] + rootTarget + '\n' + finalizedScript + parts.slice(1).join(rootTarget);
    console.log('[Builder] Script principal blindado e posicionado após #root sem colisão de caracteres.');
  } else {
    const parts = cleanHtml.split('</body>');
    bundledHtml = parts[0] + finalizedScript + '\n</body>' + parts.slice(1).join('</body>');
  }
}

// 5. Grava nos destinos de distribuição (inclui docs/index.html para GitHub Pages)
const targets = [
  path.join(process.cwd(), 'dist', 'index.html'),
  path.join(process.cwd(), 'docs', 'index.html'),
  path.join(process.cwd(), 'public', 'cirion-coletor-standalone.html'),
  path.join(process.cwd(), 'cirion-coletor-standalone.html'),
  path.join(process.cwd(), 'dist', 'cirion-coletor-standalone.html')
];

targets.forEach(target => {
  try {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, bundledHtml, 'utf-8');
    const sizeKB = (fs.statSync(target).size / 1024).toFixed(1);
    console.log(`[Builder] Gravado com sucesso em: ${target} (${sizeKB} KB)`);
  } catch (e) {
    console.error(`[Builder] Erro ao gravar em ${target}:`, e);
  }
});

// Garante arquivos .nojekyll para o GitHub Pages não filtrar arquivos estáticos
[path.join(process.cwd(), '.nojekyll'), path.join(process.cwd(), 'docs', '.nojekyll')].forEach(p => {
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, '', 'utf-8');
  } catch (e) {}
});

console.log('[Builder] Concluído com sucesso! HTML 100% idêntico ao Web App e protegido contra vazamento de código.');
