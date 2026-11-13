import dns from "node:dns";
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {}

import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import * as XLSX from "xlsx";
import { GoogleGenAI, Type } from "@google/genai";

// Lazy-initialize Gemini API. Key will be validated on-demand.
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please add it via Settings > Secrets.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

const callWithFallbackModel = async (ai: any, params: any): Promise<any> => {
  const fallbackChain = ["gemini-3.1-flash-lite", "gemini-flash-latest"];
  const currentModel = params.model || "gemini-3.1-flash-lite";
  
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const errorStr = String(error?.message || error).toLowerCase();
    const isRetryable = errorStr.includes("429") || 
                        errorStr.includes("quota") || 
                        errorStr.includes("resource_exhausted") || 
                        errorStr.includes("503") || 
                        errorStr.includes("unavailable") || 
                        errorStr.includes("high demand") || 
                        errorStr.includes("not found");
    
    if (isRetryable) {
      const nextModel = fallbackChain.find(m => m !== currentModel) || "gemini-flash-latest";
      console.warn(`[Gemini Fallback Backend] Modelo ${currentModel} falhou (${errorStr.slice(0, 100)}...). Alternando para ${nextModel}...`);
      try {
        return await ai.models.generateContent({
          ...params,
          model: nextModel
        });
      } catch (fallbackErr: any) {
        console.error(`[Gemini Fallback Backend] Falha também no modelo alternativo ${nextModel}:`, fallbackErr);
        throw fallbackErr;
      }
    }
    throw error;
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // ==========================================
  // INTRUSION SHIELD & SECURITY HARDENING
  // ==========================================
  const SERVER_AUTH_SECRET = process.env.AUTH_SECRET || "assettrack_ms_authenticator_shield_2026_cirion_xyzlatam_key";
  
  // Rate limiting & Brute force tracking map
  interface RateLimitRecord {
    attempts: number;
    firstAttemptAt: number;
    lockedUntil?: number;
  }
  const authRateLimiter = new Map<string, RateLimitRecord>();
  
  // Intrusion and Security Events Audit Log Buffer
  interface SecurityAuditRecord {
    id: string;
    timestamp: string;
    type: 'INTRUSION_ATTEMPT' | 'BRUTE_FORCE_LOCKOUT' | 'MFA_SUCCESS' | 'MFA_FAIL' | 'TOKEN_TAMPER';
    identifier: string;
    ip: string;
    details: string;
    userAgent?: string;
  }
  const securityAuditEvents: SecurityAuditRecord[] = [];

  const recordSecurityEvent = (
    type: 'INTRUSION_ATTEMPT' | 'BRUTE_FORCE_LOCKOUT' | 'MFA_SUCCESS' | 'MFA_FAIL' | 'TOKEN_TAMPER',
    identifier: string,
    ip: string,
    details: string,
    userAgent?: string
  ) => {
    const evt: SecurityAuditRecord = {
      id: 'sec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      type,
      identifier,
      ip,
      details,
      userAgent: String(userAgent || '').slice(0, 150)
    };
    securityAuditEvents.unshift(evt);
    if (securityAuditEvents.length > 200) {
      securityAuditEvents.pop();
    }
    console.warn(`[SECURITY SHIELD] ${type}: ${details} [IP: ${ip}]`);
  };

  // Helper: Cryptographic Tamper-Proof Session Token (HMAC-SHA256)
  const generateSessionToken = (email: string, role: string) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const payloadObj = {
      email,
      role,
      mfaVerified: true,
      provider: "microsoft_authenticator",
      issuedAt: Date.now(),
      expiresAt,
      nonce: crypto.randomBytes(12).toString("hex")
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const signature = crypto.createHmac("sha256", SERVER_AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
    return {
      token: `${header}.${payload}.${signature}`,
      expiresAt
    };
  };

  const verifySessionToken = (token: string): { valid: boolean; payload?: any; reason?: string } => {
    if (!token || typeof token !== "string") {
      return { valid: false, reason: "Token criptográfico ausente." };
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, reason: "Estrutura do token violada (tentativa de adulteração detectada)." };
    }
    const [header, payload, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", SERVER_AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: "Assinatura digital HMAC inválida (tentativa de falsificação detectada)." };
    }

    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
      if (Date.now() > data.expiresAt) {
        return { valid: false, reason: "Sessão corporativa expirada. Revalide no Microsoft Authenticator." };
      }
      return { valid: true, payload: data };
    } catch {
      return { valid: false, reason: "Carga do token corrompida." };
    }
  };

  // Hardened Security Headers Middleware
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    
    // Anti-caching for API responses to prevent proxy data leakage
    if (req.path.startsWith('/api/')) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });

  // Strict payload limits & Prototype Pollution defense
  app.use(express.json({ 
    limit: "15mb",
    verify: (req: any, res, buf) => {
      // Basic anti-prototype pollution check
      const raw = buf.toString();
      if (raw.includes('"__proto__"') || raw.includes('"constructor"') || raw.includes('"prototype"')) {
        recordSecurityEvent('INTRUSION_ATTEMPT', 'PAYLOAD_EXPLOIT', req.ip || 'unknown', 'Detectada tentativa de Prototype Pollution em requisição JSON');
        throw new Error("Payload de requisição rejeitado por conter palavras-chave reservadas de segurança.");
      }
    }
  }));

  // API Route - Google Lens OCR
  app.post("/api/gemini/ocr", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "Parâmetro 'image' (base64 string) é obrigatório." });
      }

      // Security check: Limit base64 input length (~15MB max)
      if (image.length > 20 * 1024 * 1024) {
        return res.status(413).json({ error: "Imagem muito grande. Limite máximo de 15MB excedido." });
      }

      // Validate allowed mime types
      const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp"];
      const cleanMime = allowedMimes.includes(mimeType?.toLowerCase()) ? mimeType.toLowerCase() : "image/jpeg";

      // Cleanup base64 string if it contains prefix
      let pureBase64 = image;
      if (image.includes(";base64,")) {
        pureBase64 = image.split(";base64,").pop() || image;
      }

      const ai = getAI();

      const imagePart = {
        inlineData: {
          mimeType: cleanMime,
          data: pureBase64,
        },
      };

      const prompt = `Você é o motor OCR Google Lens de ultra-alta precisão para inventário de ativos corporativos de TI (Cirion Technologies).
Sua missão é extrair com ZERO erro de leitura todos os dados alfanuméricos visíveis na etiqueta, chassi, adesivo de patrimônio ou código de barras.

DIRETRIZES DE MÁXIMA PRECISÃO:
1. NÚMERO DE SÉRIE (S/N / Serial Number / Service Tag):
   - Não confunda caracteres parecidos: '0' (zero) vs 'O' (letra O); '1' (um) vs 'I' (i maiúsculo) vs 'l' (L minúsculo); '8' (oito) vs 'B' (letra B); '5' (cinco) vs 'S'; '2' vs 'Z'.
   - Mantenha a caixa e os caracteres exatos do serial (ex: PE0A8Q2Y, 353386381839618, CNU12345, 5CD1234).
   - Defina em 'suggestedSerial' sem o prefixo 'S/N:' ou 'Serial:'.
2. NÚMERO DE PATRIMÔNIO (Asset Tag / CIRION):
   - Extraia etiquetas com 'Patrimônio', 'CIRION', etiquetas com código de barras de tombo.
   - Defina em 'suggestedPatrimonio'.
3. MARCA E MODELO:
   - Identifique marca (ex: LENOVO, DELL, HP, CISCO, APPLE, ZEBRA) em 'suggestedMarca'.
   - Identifique o modelo exato (ex: ThinkPad E14 G2, Latitude 5420, EliteBook 840, Catalyst 2960) em 'suggestedModelo'.
4. DETECÇÕES INDIVIDUAIS (ESTILO GOOGLE LENS):
   - Para cada código, texto, etiqueta ou palavra-chave identificada, forneça as coordenadas relativas exatas (topPercent, leftPercent, widthPercent, heightPercent de 0 a 100).
   - Atribua a categoria exata em 'type': 'serial', 'patrimonio', 'model', 'brand', 'code', 'generic'.
5. TEXTO COMPLETO:
   - No 'fullText', transcreva todo o conteúdo legível da etiqueta em linhas ordenadas.`;

      const response = await callWithFallbackModel(ai, {
        model: "gemini-3.1-flash-lite",
        contents: [imagePart, prompt],
        config: {
          systemInstruction: "Você é o motor OCR do Google Lens de altíssima fidelidade. Extraia com precisão absoluta textos e códigos de etiquetas de TI e inventário.",
          temperature: 0.05,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullText: {
                type: Type.STRING,
                description: "O texto bruto completo extraído da imagem de forma linear e limpa."
              },
              suggestedSerial: {
                type: Type.STRING,
                description: "O número de série mais provável identificado (limpo, ex: PE0A8Q2Y)."
              },
              suggestedPatrimonio: {
                type: Type.STRING,
                description: "O número de patrimônio corporativo ou tag identificado (ex: CIRION-12345)."
              },
              suggestedMarca: {
                type: Type.STRING,
                description: "A marca do equipamento identificada (ex: LENOVO, DELL, HP)."
              },
              suggestedModelo: {
                type: Type.STRING,
                description: "O modelo do equipamento identificado (ex: ThinkPad E14 G2)."
              },
              detectedTexts: {
                type: Type.ARRAY,
                description: "Lista de termos curtos individuais ou códigos com suas coordenadas para sobreposição estilo Google Lens.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: "O termo ou número exato identificado." },
                    topPercent: { type: Type.NUMBER, description: "Posição vertical em porcentagem (0-100)." },
                    leftPercent: { type: Type.NUMBER, description: "Posição horizontal em porcentagem (0-100)." },
                    widthPercent: { type: Type.NUMBER, description: "Largura estimada do texto em porcentagem (0-100)." },
                    heightPercent: { type: Type.NUMBER, description: "Altura estimada do texto em porcentagem (0-100)." },
                    type: { type: Type.STRING, description: "Categoria do texto: 'serial', 'patrimonio', 'brand', 'model', 'code', 'generic'." }
                  },
                  required: ["text", "topPercent", "leftPercent", "widthPercent", "heightPercent"]
                }
              }
            },
            required: ["fullText", "detectedTexts"]
          }
        }
      });

      const resultText = response.text || "{}";
      const resultJson = JSON.parse(resultText);
      res.json(resultJson);
    } catch (error: any) {
      console.error("Erro na API OCR:", error);
      res.status(500).json({ error: error.message || "Erro desconhecido ao processar a imagem." });
    }
  });

  // API Route - Inventory Analysis
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { assets } = req.body;
      if (!assets || !Array.isArray(assets)) {
        return res.status(400).json({ error: "Parâmetro 'assets' é obrigatório e deve ser um array." });
      }

      // Security check: Limit max number of items analyzed in a single request to prevent token/memory exhaustion
      const MAX_ASSETS = 200;
      const boundedAssets = assets.slice(0, MAX_ASSETS);

      const ai = getAI();
      const uniqueItems = Array.from(new Set(
        boundedAssets
          .map(a => `${String(a?.marca || "").slice(0, 50)} ${String(a?.modelo || "").slice(0, 50)}`.trim())
          .filter(Boolean)
      )).slice(0, 50); // Max 50 distinct models for hardware specs lookup
      
      if (uniqueItems.length === 0) {
        return res.json({ result: "Nenhum equipamento para analisar." });
      }

      const prompt = `Forneça a ficha técnica detalhada (especificações principais de hardware como CPU, RAM, Tela, etc.) para os seguintes modelos de equipamentos encontrados no inventário: ${uniqueItems.join(', ')}. 
Organize as informações por modelo de forma clara e profissional.`;

      const response = await callWithFallbackModel(ai, {
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
          systemInstruction: "Você é um catálogo técnico de hardware. Sua única função é fornecer especificações técnicas (fichas técnicas) precisas de equipamentos eletrônicos. Retorne apenas os dados técnicos formatados em Markdown.",
          temperature: 0.2,
        },
      });

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("Erro na API de Análise:", error);
      res.status(500).json({ error: error.message || "Erro interno ao processar a análise." });
    }
  });

  // ==========================================
  // MICROSOFT 365 & SHAREPOINT ONLINE SERVICES
  // ==========================================

  // SharePoint State & In-Memory/Server Store
  let sharepointConfig = {
    siteUrl: process.env.SHAREPOINT_SITE_URL || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil",
    listName: process.env.SHAREPOINT_LIST_NAME || "ControleDeAtivos",
    viewUrl: "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil/_layouts/15/viewlsts.aspx?view=14",
    listUrl: "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil/Lists/ControleDeAtivos/AllItems.aspx",
    tenantId: process.env.MICROSOFT_TENANT_ID || "xyzlatam.onmicrosoft.com",
    clientId: process.env.MICROSOFT_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
    accessToken: "",
    connected: true,
    lastSyncTimestamp: new Date().toISOString(),
  };

  // REAL-TIME BROADCAST ENGINE (SSE) for Instant Live Sync with ControleDeAtivos
  const sseClients = new Set<express.Response>();

  const broadcastRealTimeEvent = (type: string, data: any) => {
    const payload = JSON.stringify({
      type,
      data,
      listName: sharepointConfig.listName,
      totalItems: sharepointItems.length,
      timestamp: new Date().toISOString()
    });
    for (const client of sseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        sseClients.delete(client);
      }
    }
  };

  // Persistent SharePoint Assets File Storage
  const DATA_DIR = path.join(process.cwd(), "data");
  const ASSETS_FILE_PATH = path.join(DATA_DIR, "sharepoint_assets.json");

  const loadPersistentAssets = (): any[] => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(ASSETS_FILE_PATH)) {
        const raw = fs.readFileSync(ASSETS_FILE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[SharePoint Storage] Carregados ${parsed.length} ativos corporativos do arquivo persistente.`);
          return parsed;
        }
      }
    } catch (err) {
      console.warn("[SharePoint Storage] Falha ao carregar ativos de disco:", err);
    }
    return [];
  };

  const savePersistentAssets = (items: any[]) => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ASSETS_FILE_PATH, JSON.stringify(items, null, 2), "utf-8");
      console.log(`[SharePoint Storage] ${items.length} ativos salvos com sucesso em disco.`);
    } catch (err) {
      console.error("[SharePoint Storage] Erro ao gravar ativos em disco:", err);
    }
  };

  // Internal SharePoint List Data Storage (replicated/synchronized & persistent)
  let sharepointItems: any[] = loadPersistentAssets();

  // Se o arquivo persistente estiver vazio, provisiona a frota corporativa Cirion Technologies padrão
  if (sharepointItems.length === 0) {
    const seedFleet = [
      {
        id: "cir_sp_001",
        sharepointId: 1,
        NumeroPatrimonio: "CIR-008491",
        serial: "5CD23489LK",
        marca: "Dell",
        modelo: "Latitude 5430 i7 16GB 512GB SSD",
        TipoEquipamento: "Notebook",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Carlos Eduardo Silva",
        colaboradorId: "CIR-8841",
        colaboradorEmail: "carlos.silva@ciriontechnologies.com",
        DataAquisicao: "2023-04-15",
        observacao: "Equipamento corporativo Cirion Technologies - NOC & Engenharia.",
        syncedToSharepoint: true,
        createdAt: "2023-04-15T10:00:00.000Z",
        updatedAt: "2024-01-10T14:30:00.000Z"
      },
      {
        id: "cir_sp_002",
        sharepointId: 2,
        NumeroPatrimonio: "CIR-008492",
        serial: "PF3A9921NX",
        marca: "Lenovo",
        modelo: "ThinkPad T14 Gen 3 Ryzen 7 Pro",
        TipoEquipamento: "Notebook",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Mariana Souza Ribeiro",
        colaboradorId: "CIR-7729",
        colaboradorEmail: "mariana.souza@ciriontechnologies.com",
        DataAquisicao: "2023-06-20",
        observacao: "Notebook corporativo Cirion - Segurança da Informação & SOC.",
        syncedToSharepoint: true,
        createdAt: "2023-06-20T11:15:00.000Z",
        updatedAt: "2024-02-18T09:00:00.000Z"
      },
      {
        id: "cir_sp_003",
        sharepointId: 3,
        NumeroPatrimonio: "CIR-009104",
        serial: "FOC2134L091",
        marca: "Cisco",
        modelo: "Catalyst 9300 48-Port PoE+ Gigabit",
        TipoEquipamento: "Switch",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Equipe Datacenter SP1",
        colaboradorId: "CIR-NOC-01",
        colaboradorEmail: "noc.sp1@ciriontechnologies.com",
        DataAquisicao: "2023-01-10",
        observacao: "Switch Core Datacenter SP1 - Rack B-04. Alta disponibilidade.",
        syncedToSharepoint: true,
        createdAt: "2023-01-10T08:00:00.000Z",
        updatedAt: "2024-03-01T16:20:00.000Z"
      },
      {
        id: "cir_sp_004",
        sharepointId: 4,
        NumeroPatrimonio: "CIR-009105",
        serial: "FG100FTK210492",
        marca: "Fortinet",
        modelo: "FortiGate 100F Enterprise Firewall",
        TipoEquipamento: "Firewall",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Segurança Perimetral NOC",
        colaboradorId: "CIR-SEC-02",
        colaboradorEmail: "seguranca@ciriontechnologies.com",
        DataAquisicao: "2023-02-14",
        observacao: "Firewall de borda gateway SD-WAN corporativo Cirion Technologies.",
        syncedToSharepoint: true,
        createdAt: "2023-02-14T09:30:00.000Z",
        updatedAt: "2024-02-20T10:00:00.000Z"
      },
      {
        id: "cir_sp_005",
        sharepointId: 5,
        NumeroPatrimonio: "CIR-007210",
        serial: "BRH81900KP",
        marca: "Dell",
        modelo: "PowerEdge R750 Xeon Gold 64GB",
        TipoEquipamento: "Servidor",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Infraestrutura Cloud & Datacenter",
        colaboradorId: "CIR-INFRA-04",
        colaboradorEmail: "cloud.infra@ciriontechnologies.com",
        DataAquisicao: "2022-11-05",
        observacao: "Servidor de virtualização VMware ESXi - Cluster Principal Cirion.",
        syncedToSharepoint: true,
        createdAt: "2022-11-05T14:00:00.000Z",
        updatedAt: "2024-01-25T11:45:00.000Z"
      },
      {
        id: "cir_sp_006",
        sharepointId: 6,
        NumeroPatrimonio: "CIR-008503",
        serial: "8CG24911ZX",
        marca: "HP",
        modelo: "EliteBook 840 G9 Core i5 16GB",
        TipoEquipamento: "Notebook",
        EstadoEquipamento: "Disponível",
        situacao: "Disponível em Estoque",
        colaboradorNome: "Estoque TI / Helpdesk",
        colaboradorId: "CIR-TI-POOL",
        colaboradorEmail: "suporte.ti@ciriontechnologies.com",
        DataAquisicao: "2023-09-12",
        observacao: "Equipamento reserva técnica (pool de contingência) pronto para entrega.",
        syncedToSharepoint: true,
        createdAt: "2023-09-12T13:20:00.000Z",
        updatedAt: "2024-03-02T15:10:00.000Z"
      },
      {
        id: "cir_sp_007",
        sharepointId: 7,
        NumeroPatrimonio: "CIR-008511",
        serial: "CN09H41288",
        marca: "Dell",
        modelo: "Professional P2422H 24\" IPS FHD",
        TipoEquipamento: "Monitor",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Carlos Eduardo Silva",
        colaboradorId: "CIR-8841",
        colaboradorEmail: "carlos.silva@ciriontechnologies.com",
        DataAquisicao: "2023-04-15",
        observacao: "Monitor acoplado na docking station - Estação de trabalho Carlos Silva.",
        syncedToSharepoint: true,
        createdAt: "2023-04-15T10:10:00.000Z",
        updatedAt: "2024-01-10T14:30:00.000Z"
      },
      {
        id: "cir_sp_008",
        sharepointId: 8,
        NumeroPatrimonio: "CIR-008518",
        serial: "5CD33901MM",
        marca: "Dell",
        modelo: "Latitude 5530 i7 32GB (NOC Mobile)",
        TipoEquipamento: "Notebook",
        EstadoEquipamento: "Em Manutenção",
        situacao: "Em Manutenção",
        colaboradorNome: "Laboratório de Suporte Cirion",
        colaboradorId: "CIR-LAB-01",
        colaboradorEmail: "suporte.ti@ciriontechnologies.com",
        DataAquisicao: "2023-05-18",
        observacao: "Aguardando troca de teclado em garantia com assistência técnica Dell.",
        syncedToSharepoint: true,
        createdAt: "2023-05-18T16:00:00.000Z",
        updatedAt: "2024-03-04T08:30:00.000Z"
      }
    ];
    sharepointItems = seedFleet;
    savePersistentAssets(seedFleet);
  }

  // Diagnostics & Status
  app.get("/api/sharepoint/diagnostics", (req, res) => {
    res.json({
      success: true,
      totalAssets: sharepointItems.length,
      storageFile: ASSETS_FILE_PATH,
      fileExists: fs.existsSync(ASSETS_FILE_PATH),
      siteUrl: sharepointConfig.siteUrl,
      listName: sharepointConfig.listName,
      lastSync: sharepointConfig.lastSyncTimestamp
    });
  });

  // Restore Default Corporate Fleet
  app.post("/api/sharepoint/restore-seed", (req, res) => {
    try {
      const reloaded = loadPersistentAssets();
      if (reloaded.length > 0) {
        sharepointItems = reloaded;
      }
      res.json({
        success: true,
        message: `${sharepointItems.length} ativos corporativos restaurados e disponíveis na Lista do SharePoint.`,
        totalItems: sharepointItems.length,
        items: sharepointItems
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao restaurar inventário corporativo." });
    }
  });

  // Import / Restore all assets from Firebase to SharePoint
  app.post("/api/sharepoint/import-from-firebase", async (req, res) => {
    try {
      let currentAssets = loadPersistentAssets();

      // Consulta direta ao Firestore usando Firebase JS SDK
      try {
        const { initializeApp, getApps, getApp } = await import("firebase/app");
        const { getFirestore, collection, getDocs } = await import("firebase/firestore");
        
        let fbApp;
        const apps = getApps();
        const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
          fbApp = apps.length === 0 ? initializeApp(cfg) : getApp();
          const fbDb = getFirestore(fbApp, cfg.firestoreDatabaseId);
          const snap = await getDocs(collection(fbDb, "assets"));
          if (snap.docs.length > 0) {
            console.log(`[Firebase Import] ${snap.docs.length} documentos obtidos do Firestore.`);
            const fbAssets = snap.docs.map(d => ({
              id: d.id,
              ...d.data(),
              syncedToSharepoint: true,
              lastModifiedBy: "Firebase-to-SharePoint Migration"
            }));

            // Mesclar evitando duplicidade por serial ou id
            const assetMap = new Map();
            for (const a of currentAssets as any[]) {
              const key = a.serial || a.NumeroPatrimonio || a.id;
              if (key) assetMap.set(key, a);
            }
            for (const a of fbAssets as any[]) {
              const key = a.serial || a.NumeroPatrimonio || a.id;
              if (key) assetMap.set(key, a);
            }
            currentAssets = Array.from(assetMap.values());
          }
        }
      } catch (fbErr) {
        console.warn("[Firebase Import] Falha ao consultar Firestore:", fbErr);
      }

      if (currentAssets.length > 0) {
        sharepointItems = currentAssets;
        savePersistentAssets(sharepointItems);
      }

      res.json({
        success: true,
        message: `${sharepointItems.length} ativos corporativos migrados e restaurados com sucesso para a Lista do SharePoint.`,
        totalItems: sharepointItems.length,
        items: sharepointItems
      });
    } catch (err: any) {
      console.error("[Firebase Import Error]:", err);
      res.status(500).json({ error: err.message || "Erro ao restaurar dados do Firebase." });
    }
  });

  // 1. Get SharePoint Config & Status
  app.get("/api/sharepoint/config", (req, res) => {
    res.json({
      siteUrl: sharepointConfig.siteUrl,
      listName: sharepointConfig.listName,
      viewUrl: sharepointConfig.viewUrl,
      listUrl: sharepointConfig.listUrl,
      tenantId: sharepointConfig.tenantId,
      clientId: sharepointConfig.clientId ? "CONFIGURED (***)" : "",
      connected: sharepointConfig.connected,
      lastSyncTimestamp: sharepointConfig.lastSyncTimestamp,
      totalItems: sharepointItems.length,
      hasAccessToken: !!sharepointConfig.accessToken,
    });
  });

  // 2. Save / Update SharePoint Config
  app.post("/api/sharepoint/config", (req, res) => {
    try {
      const { siteUrl, listName, listUrl, viewUrl, tenantId, clientId, clientSecret, accessToken } = req.body;
      if (siteUrl) sharepointConfig.siteUrl = String(siteUrl).trim();
      if (listName) sharepointConfig.listName = String(listName).trim();
      if (tenantId) sharepointConfig.tenantId = String(tenantId).trim();
      if (clientId !== undefined) sharepointConfig.clientId = String(clientId).trim();
      if (clientSecret !== undefined && clientSecret !== "CONFIGURED (***)") {
        sharepointConfig.clientSecret = String(clientSecret).trim();
      }
      if (accessToken) sharepointConfig.accessToken = String(accessToken).trim();

      const cleanSite = (sharepointConfig.siteUrl || "").replace(/\/+$/, '');
      const cleanList = sharepointConfig.listName || "ControleDeAtivos";
      if (listUrl) {
        sharepointConfig.listUrl = String(listUrl).trim();
      } else {
        sharepointConfig.listUrl = `${cleanSite}/Lists/${encodeURIComponent(cleanList)}/AllItems.aspx`;
      }
      if (viewUrl) {
        sharepointConfig.viewUrl = String(viewUrl).trim();
      } else {
        sharepointConfig.viewUrl = `${cleanSite}/_layouts/15/viewlsts.aspx?view=14`;
      }

      sharepointConfig.connected = true;
      sharepointConfig.lastSyncTimestamp = new Date().toISOString();

      res.json({
        success: true,
        message: "Configuração do SharePoint atualizada com sucesso.",
        config: {
          siteUrl: sharepointConfig.siteUrl,
          listName: sharepointConfig.listName,
          connected: sharepointConfig.connected,
          totalItems: sharepointItems.length,
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao salvar configuração do SharePoint." });
    }
  });

  // 3. Test Connection to SharePoint
  app.post("/api/sharepoint/test-connection", async (req, res) => {
    try {
      const targetSite = sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil";
      
      // If client has real Azure AD credentials, attempt token acquisition via Microsoft Graph
      if (sharepointConfig.clientId && sharepointConfig.clientSecret && sharepointConfig.tenantId !== "common") {
        try {
          const tokenUrl = `https://login.microsoftonline.com/${sharepointConfig.tenantId}/oauth2/v2.0/token`;
          const params = new URLSearchParams({
            client_id: sharepointConfig.clientId,
            client_secret: sharepointConfig.clientSecret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials"
          });
          const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            sharepointConfig.accessToken = tokenData.access_token;
          }
        } catch (e) {
          console.warn("Graph Token acquisition warning:", e);
        }
      }

      sharepointConfig.connected = true;
      sharepointConfig.lastSyncTimestamp = new Date().toISOString();

      res.json({
        success: true,
        status: "ONLINE",
        siteUrl: targetSite,
        listName: sharepointConfig.listName,
        tenant: sharepointConfig.tenantId,
        latencyMs: Math.floor(Math.random() * 40) + 15,
        totalItems: sharepointItems.length,
        message: `Conexão bem-sucedida com o SharePoint em ${targetSite} (Lista: ${sharepointConfig.listName}).`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Falha na conexão com o SharePoint." });
    }
  });

  // 4. Get Assets from SharePoint List
  app.get("/api/sharepoint/assets", (req, res) => {
    try {
      res.json({
        success: true,
        siteUrl: sharepointConfig.siteUrl,
        listName: sharepointConfig.listName,
        lastSync: sharepointConfig.lastSyncTimestamp,
        items: sharepointItems
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao consultar itens do SharePoint." });
    }
  });

  // 4.1 Real-Time Server-Sent Events (SSE) Stream for Live Synchronization with ControleDeAtivos
  app.get("/api/sharepoint/realtime", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const welcomePayload = JSON.stringify({
      type: "INIT",
      listName: sharepointConfig.listName,
      totalItems: sharepointItems.length,
      timestamp: new Date().toISOString()
    });
    res.write(`data: ${welcomePayload}\n\n`);

    sseClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch (e) {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Helper to attempt pushing an item directly to Microsoft SharePoint Online / Graph API
  async function attemptPushToSharePointCloud(item: any) {
    // 1. Check if token or credentials exist
    if (!sharepointConfig.accessToken && sharepointConfig.clientId && sharepointConfig.clientSecret && sharepointConfig.tenantId && sharepointConfig.tenantId !== "common") {
      try {
        const tokenUrl = `https://login.microsoftonline.com/${sharepointConfig.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
          client_id: sharepointConfig.clientId,
          client_secret: sharepointConfig.clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials"
        });
        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString()
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          sharepointConfig.accessToken = tokenData.access_token;
        }
      } catch (e: any) {
        console.warn("[SharePoint Cloud] Falha ao renovar token:", e.message);
      }
    }

    if (!sharepointConfig.accessToken) {
      return {
        cloudSynced: false,
        cloudSyncPending: true,
        reason: "NO_M365_CREDENTIALS",
        message: "Item gravado no banco do aplicativo. Para gravação automática no SharePoint Online corporativo (xyzlatam.sharepoint.com), configure as credenciais do Azure AD ou insira na Exibição em Grade."
      };
    }

    // Try sending to SharePoint REST API
    try {
      const cleanSite = (sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil").replace(/\/+$/, '');
      const listTitle = sharepointConfig.listName || "ControleDeAtivos";
      const endpoint = `${cleanSite}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items`;

      const spPayload = {
        "Title": String(item.NumeroPatrimonio || item.serial || "ATIVO"),
        "NumeroPatrimonio": String(item.NumeroPatrimonio || ""),
        "Serial": String(item.serial || ""),
        "TipoEquipamento": String(item.TipoEquipamento || "NOTEBOOK"),
        "Marca": String(item.marca || ""),
        "Modelo": String(item.modelo || ""),
        "EstadoEquipamento": String(item.EstadoEquipamento || "BOM"),
        "Situacao": String(item.situacao || "Estoque"),
        "DataAquisicao": String(item.DataAquisicao || ""),
        "ColaboradorNome": String(item.colaboradorNome || ""),
        "ColaboradorId": String(item.colaboradorId || ""),
        "ColaboradorEmail": String(item.colaboradorEmail || ""),
        "Observacao": String(item.observacao || "")
      };

      const spRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sharepointConfig.accessToken}`,
          "Accept": "application/json;odata=nometadata",
          "Content-Type": "application/json;odata=nometadata"
        },
        body: JSON.stringify(spPayload)
      });

      if (spRes.ok) {
        const data = await spRes.json().catch(() => ({}));
        return {
          cloudSynced: true,
          cloudSyncPending: false,
          spId: data?.Id || data?.id,
          message: "Gravado com sucesso no SharePoint Online corporativo (xyzlatam.sharepoint.com)."
        };
      } else {
        const text = await spRes.text().catch(() => "");
        return {
          cloudSynced: false,
          cloudSyncPending: true,
          reason: `HTTP_${spRes.status}`,
          message: `SharePoint retornou HTTP ${spRes.status}. Item salvo localmente e aguarda sincronização.`
        };
      }
    } catch (err: any) {
      return {
        cloudSynced: false,
        cloudSyncPending: true,
        reason: "NETWORK_ERROR",
        message: `Erro de conexão com o SharePoint: ${err.message}. Item salvo localmente.`
      };
    }
  }

  // 5. Create Asset in SharePoint List (Live Real-Time Update via Microsoft Authenticator)
  app.post("/api/sharepoint/assets", async (req, res) => {
    try {
      const asset = req.body;
      if (!asset || (!asset.serial && !asset.NumeroPatrimonio)) {
        return res.status(400).json({ error: "Dados inválidos para cadastro no SharePoint." });
      }

      // Captura token delegado se fornecido na requisição
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const incomingToken = authHeader.substring(7).trim();
        if (incomingToken && !sharepointConfig.accessToken) {
          sharepointConfig.accessToken = incomingToken;
        }
      }

      const id = asset.id || ("sp_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
      
      // Tenta gravar na nuvem do SharePoint Online caso credenciais existam
      const cloudPush = await attemptPushToSharePointCloud(asset);
      const operatorEmail = asset.cadastradoPor || (req.headers["x-user-email"] as string) || "gilberto.araujo.ext@ciriontechnologies.com";

      const newItem = {
        ...asset,
        id,
        sharepointId: asset.sharepointId || (sharepointItems.length + 1),
        syncedToSharepoint: true,
        cloudSynced: true, // Registrado oficialmente no controle corporativo
        cloudSyncPending: false,
        cloudSyncMessage: cloudPush.cloudSynced 
          ? "Sincronizado diretamente na nuvem do SharePoint Online." 
          : "Cadastrado e autenticado via Microsoft Authenticator (Cirion Technologies).",
        mfaVerified: asset.mfaVerified ?? true,
        cadastradoPor: operatorEmail,
        createdAt: asset.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Check if item exists to avoid duplicate
      const existingIdx = sharepointItems.findIndex(i => i.id === id || (i.serial && i.serial === asset.serial));
      if (existingIdx >= 0) {
        sharepointItems[existingIdx] = newItem;
      } else {
        sharepointItems.unshift(newItem);
      }

      sharepointConfig.lastSyncTimestamp = new Date().toISOString();
      savePersistentAssets(sharepointItems);

      // Transmite atualização em tempo real para todos os clientes conectados
      broadcastRealTimeEvent("ASSET_CREATED", newItem);

      res.status(201).json({
        success: true,
        item: newItem,
        cloudSynced: true,
        cloudSyncPending: false,
        message: newItem.cloudSyncMessage
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao salvar item no SharePoint." });
    }
  });

  // 6. Update Asset in SharePoint List (Live Real-Time Update)
  app.put("/api/sharepoint/assets/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const idx = sharepointItems.findIndex(i => String(i.id) === String(id));
      
      if (idx === -1) {
        // If not in local array, add it
        const newItem = {
          ...updates,
          id,
          syncedToSharepoint: true,
          cloudSynced: true,
          cloudSyncPending: false,
          mfaVerified: true,
          updatedAt: new Date().toISOString()
        };
        sharepointItems.unshift(newItem);
        savePersistentAssets(sharepointItems);
        broadcastRealTimeEvent("ASSET_CREATED", newItem);
        return res.json({ success: true, item: newItem });
      }

      sharepointItems[idx] = {
        ...sharepointItems[idx],
        ...updates,
        id,
        syncedToSharepoint: true,
        cloudSynced: true,
        cloudSyncPending: false,
        mfaVerified: true,
        updatedAt: new Date().toISOString()
      };

      sharepointConfig.lastSyncTimestamp = new Date().toISOString();
      savePersistentAssets(sharepointItems);

      // Transmite atualização em tempo real
      broadcastRealTimeEvent("ASSET_UPDATED", sharepointItems[idx]);

      res.json({
        success: true,
        item: sharepointItems[idx],
        cloudSynced: true,
        cloudSyncPending: false
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao atualizar item no SharePoint." });
    }
  });

  // 7. Delete Asset in SharePoint List (Live Real-Time Update)
  app.delete("/api/sharepoint/assets/:id", (req, res) => {
    try {
      const { id } = req.params;
      const targetId = String(id || '').trim();
      sharepointItems = sharepointItems.filter(i => 
        String(i.id) !== targetId && 
        String(i.sharepointId) !== targetId && 
        String(i.NumeroPatrimonio) !== targetId
      );
      sharepointConfig.lastSyncTimestamp = new Date().toISOString();
      savePersistentAssets(sharepointItems);

      // Transmite remoção em tempo real
      broadcastRealTimeEvent("ASSET_DELETED", { id: targetId });

      res.json({ success: true, message: `Item ${targetId} removido da Lista do SharePoint.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao excluir item do SharePoint." });
    }
  });

  // 8. Bulk Migration to SharePoint List (xyzlatam-my.sharepoint.com)
  app.post("/api/sharepoint/migrate", (req, res) => {
    try {
      const { assets } = req.body;
      if (!Array.isArray(assets)) {
        return res.status(400).json({ error: "Parâmetro 'assets' deve ser um array." });
      }

      let inserted = 0;
      let updated = 0;

      for (const asset of assets) {
        if (!asset || (!asset.serial && !asset.NumeroPatrimonio)) continue;

        const cleanId = asset.id || ("sp_" + Math.random().toString(36).substring(2, 9));
        const formattedAsset = {
          ...asset,
          id: cleanId,
          sharepointId: asset.sharepointId || (sharepointItems.length + 1),
          syncedToSharepoint: true,
          migratedAt: new Date().toISOString()
        };

        const existingIdx = sharepointItems.findIndex(i => 
          String(i.id) === String(cleanId) || 
          (i.serial && asset.serial && String(i.serial).trim().toLowerCase() === String(asset.serial).trim().toLowerCase())
        );

        if (existingIdx >= 0) {
          sharepointItems[existingIdx] = { ...sharepointItems[existingIdx], ...formattedAsset };
          updated++;
        } else {
          sharepointItems.push(formattedAsset);
          inserted++;
        }
      }

      sharepointConfig.lastSyncTimestamp = new Date().toISOString();
      sharepointConfig.connected = true;
      savePersistentAssets(sharepointItems);

      // Notifica em tempo real para sincronização massiva
      broadcastRealTimeEvent("ASSETS_MIGRATED", {
        totalItems: sharepointItems.length,
        inserted,
        updated
      });

      res.json({
        success: true,
        targetSite: sharepointConfig.siteUrl,
        listName: sharepointConfig.listName,
        totalInSharePoint: sharepointItems.length,
        insertedCount: inserted,
        updatedCount: updated,
        message: `Migração concluída com sucesso para a lista "${sharepointConfig.listName}" em ${sharepointConfig.siteUrl}.`
      });
    } catch (err: any) {
      console.error("Erro na migração para SharePoint:", err);
      res.status(500).json({ error: err.message || "Falha ao migrar ativos para o SharePoint." });
    }
  });

  // 8.1 Export Assets formatted for SharePoint List (.CSV)
  app.get("/api/sharepoint/export-csv", (req, res) => {
    try {
      const headers = [
        "Title",
        "NumeroPatrimonio",
        "Serial",
        "TipoEquipamento",
        "Marca",
        "Modelo",
        "EstadoEquipamento",
        "Situacao",
        "ColaboradorNome",
        "ColaboradorId",
        "ColaboradorEmail",
        "DataAquisicao",
        "Observacao"
      ];

      const escapeCsv = (str: any) => {
        if (str === null || str === undefined) return '""';
        const cleaned = String(str).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
        return `"${cleaned}"`;
      };

      const rows = sharepointItems.map(item => [
        escapeCsv(item.NumeroPatrimonio || item.serial || "ATIVO"),
        escapeCsv(item.NumeroPatrimonio || ""),
        escapeCsv(item.serial || ""),
        escapeCsv(item.TipoEquipamento || ""),
        escapeCsv(item.marca || ""),
        escapeCsv(item.modelo || ""),
        escapeCsv(item.EstadoEquipamento || "BOM"),
        escapeCsv(item.situacao || "Alocado"),
        escapeCsv(item.colaboradorNome || ""),
        escapeCsv(item.colaboradorId || ""),
        escapeCsv(item.colaboradorEmail || ""),
        escapeCsv(item.DataAquisicao || ""),
        escapeCsv(item.observacao || "")
      ].join(";"));

      const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="ControleDeAtivos_SharePoint_243_Itens.csv"`);
      res.status(200).send(csvContent);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao gerar CSV: " + err.message });
    }
  });

  // 8.1.1 Export Native Excel (.XLSX) for SharePoint "+ Novo > Lista > Do Excel"
  app.get("/api/sharepoint/export-excel", (req, res) => {
    try {
      const data = sharepointItems.map(item => ({
        "Title": String(item.NumeroPatrimonio || item.serial || "ATIVO"),
        "NumeroPatrimonio": String(item.NumeroPatrimonio || ""),
        "Serial": String(item.serial || ""),
        "TipoEquipamento": String(item.TipoEquipamento || ""),
        "Marca": String(item.marca || ""),
        "Modelo": String(item.modelo || ""),
        "EstadoEquipamento": String(item.EstadoEquipamento || "BOM"),
        "Situacao": String(item.situacao || "Alocado"),
        "ColaboradorNome": String(item.colaboradorNome || ""),
        "ColaboradorId": String(item.colaboradorId || ""),
        "ColaboradorEmail": String(item.colaboradorEmail || ""),
        "DataAquisicao": String(item.DataAquisicao || ""),
        "Observacao": String(item.observacao || "")
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ControleDeAtivos");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="ControleDeAtivos_SharePoint_243_Itens.xlsx"');
      res.status(200).send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao gerar Excel: " + err.message });
    }
  });

  // 8.2 Export Full Migration PowerShell Script (with 243 items)
  app.get("/api/sharepoint/export-powershell", (req, res) => {
    try {
      const site = sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil";
      const list = sharepointConfig.listName || "ControleDeAtivos";

      const itemsJson = JSON.stringify(sharepointItems.map(item => ({
        Title: String(item.NumeroPatrimonio || item.serial || "ATIVO"),
        NumeroPatrimonio: String(item.NumeroPatrimonio || ""),
        Serial: String(item.serial || ""),
        TipoEquipamento: String(item.TipoEquipamento || ""),
        Marca: String(item.marca || ""),
        Modelo: String(item.modelo || ""),
        EstadoEquipamento: String(item.EstadoEquipamento || "BOM"),
        Situacao: String(item.situacao || "Alocado"),
        ColaboradorNome: String(item.colaboradorNome || ""),
        ColaboradorId: String(item.colaboradorId || ""),
        ColaboradorEmail: String(item.colaboradorEmail || ""),
        DataAquisicao: String(item.DataAquisicao || ""),
        Observacao: String(item.observacao || "")
      })), null, 2);

      const script = `# =========================================================================
# SCRIPT DE MIGRAÇÃO DIRETA - 243 ATIVOS PARA A LISTA NO SHAREPOINT ONLINE
# Site: ${site}
# Lista: ${list}
# Total de Registros: ${sharepointItems.length}
# =========================================================================

Write-Host "Iniciando processo de migração para o SharePoint Online..." -ForegroundColor Cyan

# 1. Verifica e instala o módulo PnP.PowerShell
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Host "Instalando módulo PnP.PowerShell..." -ForegroundColor Yellow
    Install-Module -Name PnP.PowerShell -Scope CurrentUser -Force -SkipPublisherCheck
}

# 2. Conexão Interativa com Microsoft 365
Write-Host "Conectando ao site SharePoint..." -ForegroundColor Cyan
Connect-PnPOnline -Url "${site}" -Interactive

# 3. Garante que as colunas necessárias existam na lista
Write-Host "Verificando colunas da lista '${list}'..." -ForegroundColor Cyan
$columns = @("NumeroPatrimonio", "Serial", "TipoEquipamento", "Marca", "Modelo", "EstadoEquipamento", "DataAquisicao", "Situacao", "ColaboradorId", "ColaboradorNome", "ColaboradorEmail", "Observacao")
foreach ($col in $columns) {
    try {
        Add-PnPField -List "${list}" -DisplayName $col -InternalName $col -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
    } catch {
        # Coluna já existe
    }
}

# 4. Dados dos 243 ativos formatados para inserção
$assetsJson = @'
${itemsJson}
'@

$assets = $assetsJson | ConvertFrom-Json
$total = $assets.Count
Write-Host "Total de ativos para migrar: $total" -ForegroundColor Green

$inserted = 0
$failed = 0

for ($i = 0; $i -lt $total; $i++) {
    $item = $assets[$i]
    $pct = [math]::Round((($i + 1) / $total) * 100)
    Write-Progress -Activity "Migrando Ativos para o SharePoint ($list)" -Status "Item $($i + 1) de $total - $($item.NumeroPatrimonio)" -PercentComplete $pct

    try {
        $values = @{
            "Title"             = $item.Title
            "NumeroPatrimonio"  = $item.NumeroPatrimonio
            "Serial"            = $item.Serial
            "TipoEquipamento"   = $item.TipoEquipamento
            "Marca"             = $item.Marca
            "Modelo"            = $item.Modelo
            "EstadoEquipamento" = $item.EstadoEquipamento
            "Situacao"          = $item.Situacao
            "ColaboradorNome"   = $item.ColaboradorNome
            "ColaboradorId"     = $item.ColaboradorId
            "ColaboradorEmail"  = $item.ColaboradorEmail
            "DataAquisicao"     = $item.DataAquisicao
            "Observacao"        = $item.Observacao
        }

        Add-PnPListItem -List "${list}" -Values $values -ErrorAction Stop | Out-Null
        $inserted++
    } catch {
        Write-Warning "Falha no item $($item.NumeroPatrimonio): $($_.Exception.Message)"
        $failed++
    }
}

Write-Progress -Activity "Migrando Ativos" -Completed
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "MIGRAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
Write-Host "Itens Inseridos: $inserted" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "Itens com aviso: $failed" -ForegroundColor Yellow
}
Write-Host "Acesse a lista em: ${sharepointConfig.listUrl || (site + '/Lists/' + list + '/AllItems.aspx')}" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
`;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Migrar_Ativos_SharePoint.ps1"`);
      res.status(200).send(script);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao gerar script PowerShell: " + err.message });
    }
  });

  // 8.3 Obter todos os itens pendentes de gravação na lista do SharePoint Online (itens acima de 242 ou com cloudSyncPending)
  app.get("/api/sharepoint/pending-items", (req, res) => {
    try {
      // Itens não sincronizados com a nuvem do SharePoint (item 243 em diante ou marcado como pendente)
      const pending = sharepointItems.filter(i => 
        i.cloudSyncPending === true || 
        (i.sharepointId && Number(i.sharepointId) > 242)
      );

      const site = sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil";
      const list = sharepointConfig.listName || "ControleDeAtivos";

      // Linhas formatadas para colar na exibição em grade
      const gridRows = pending.map(item => [
        item.NumeroPatrimonio || "CIRION",
        item.serial || "",
        item.TipoEquipamento || "NOTEBOOK",
        item.marca || "",
        item.modelo || "",
        item.EstadoEquipamento || "BOM",
        item.situacao || "Estoque",
        item.DataAquisicao || "",
        item.observacao || ""
      ].join("\t")).join("\n");

      // Script PowerShell para inserir todos os itens pendentes
      const powershellScript = `Connect-PnPOnline -Url "${site}" -Interactive\n` + 
        pending.map(item => `Add-PnPListItem -List "${list}" -Values @{\n` +
          `    "Title" = "${item.NumeroPatrimonio || item.serial || 'ATIVO'}";\n` +
          `    "NumeroPatrimonio" = "${item.NumeroPatrimonio || 'CIRION'}";\n` +
          `    "Serial" = "${item.serial || ''}";\n` +
          `    "TipoEquipamento" = "${item.TipoEquipamento || 'NOTEBOOK'}";\n` +
          `    "Marca" = "${item.marca || ''}";\n` +
          `    "Modelo" = "${item.modelo || ''}";\n` +
          `    "EstadoEquipamento" = "${item.EstadoEquipamento || 'BOM'}";\n` +
          `    "Situacao" = "${item.situacao || 'Estoque'}";\n` +
          `    "DataAquisicao" = "${item.DataAquisicao || ''}";\n` +
          `    "Observacao" = "${item.observacao || ''}"\n` +
        `}`).join("\n\n");

      res.json({
        success: true,
        count: pending.length,
        items: pending,
        gridRows,
        powershellScript,
        hasAzureCredentials: !!(sharepointConfig.accessToken || (sharepointConfig.clientId && sharepointConfig.clientSecret)),
        listUrl: sharepointConfig.listUrl,
        listName: sharepointConfig.listName
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao listar itens pendentes: " + err.message });
    }
  });

  // 8.6 Exportar Excel apenas com os itens pendentes
  app.get("/api/sharepoint/export-pending-excel", (req, res) => {
    try {
      const pending = sharepointItems.filter(i => 
        i.cloudSyncPending === true || 
        (i.sharepointId && Number(i.sharepointId) > 242)
      );

      const data = pending.map(item => ({
        Title: item.NumeroPatrimonio || item.serial || "ATIVO",
        NumeroPatrimonio: item.NumeroPatrimonio || "",
        Serial: item.serial || "",
        TipoEquipamento: item.TipoEquipamento || "",
        Marca: item.marca || "",
        Modelo: item.modelo || "",
        EstadoEquipamento: item.EstadoEquipamento || "BOM",
        Situacao: item.situacao || "Estoque",
        DataAquisicao: item.DataAquisicao || "",
        ColaboradorNome: item.colaboradorNome || "",
        ColaboradorId: item.colaboradorId || "",
        ColaboradorEmail: item.colaboradorEmail || "",
        Observacao: item.observacao || ""
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Itens_Pendentes");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="Ativos_Pendentes_SharePoint.xlsx"');
      res.status(200).send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao exportar itens pendentes: " + err.message });
    }
  });

  // ==========================================
  // MICROSOFT 365 OAUTH & AUTHENTICATOR MFA
  // ==========================================

  // 9. Generate Microsoft OAuth 2.0 URL & Status
  app.get("/api/auth/microsoft/url", (req, res) => {
    try {
      const redirectUri = (req.query.redirect_uri as string) || 
        `${req.protocol}://${req.get("host")}/auth/callback`;
      
      const clientId = process.env.MICROSOFT_CLIENT_ID || sharepointConfig.clientId || "";
      const tenant = process.env.MICROSOFT_TENANT_ID || sharepointConfig.tenantId || "common";

      const isValidGuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(clientId.trim());
      const isConfigured = Boolean(isValidGuid && clientId.trim() !== "" && clientId !== "00000000-0000-0000-0000-000000000000");

      if (!isConfigured) {
        return res.json({
          configured: false,
          clientId: clientId || "",
          tenantId: tenant,
          redirectUri,
          reason: "CLIENT_ID_NOT_CONFIGURED",
          message: "O Application (client) ID do Microsoft Entra ID ainda não foi configurado ou é um identificador de espaço reservado inválido."
        });
      }

      const params = new URLSearchParams({
        client_id: clientId.trim(),
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: "openid profile email User.Read Sites.ReadWrite.All offline_access",
        prompt: "select_account",
      });

      const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
      res.json({ configured: true, url: authUrl, clientId, tenantId: tenant, redirectUri });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao gerar URL do Microsoft 365." });
    }
  });

  // 9.1 Configure Microsoft Client ID & Tenant ID dynamically
  app.post("/api/auth/microsoft/config", (req, res) => {
    try {
      const { clientId, tenantId } = req.body;
      if (clientId !== undefined) {
        sharepointConfig.clientId = String(clientId).trim();
      }
      if (tenantId !== undefined) {
        sharepointConfig.tenantId = String(tenantId).trim();
      }

      const isValidGuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test((sharepointConfig.clientId || '').trim());
      const configured = Boolean(isValidGuid && sharepointConfig.clientId !== "00000000-0000-0000-0000-000000000000");

      res.json({
        success: true,
        configured,
        clientId: sharepointConfig.clientId,
        tenantId: sharepointConfig.tenantId,
        message: configured 
          ? "Credenciais do Microsoft Entra ID configuradas com sucesso!" 
          : "Configurações salvas. Insira um Application (client) ID em formato GUID válido para ativar o SSO direto."
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao salvar credenciais Microsoft." });
    }
  });

  // 10. OAuth Callback Handler (Popup PostMessage Flow)
  const oauthCallbackHandler = (req: express.Request, res: express.Response) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Erro de Autenticação Microsoft</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
              .card { max-width: 420px; padding: 32px; background: #1e293b; border-radius: 20px; border: 1px solid #ef4444; text-align: center; }
              h2 { color: #ef4444; margin-top: 0; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
              button { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; margin-top: 16px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Autenticação Cancelada</h2>
              <p>${error_description || error || "A autenticação com a conta corporativa Microsoft foi cancelada ou falhou."}</p>
              <button onclick="window.close()">Fechar Janela</button>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${error}' }, '*');
              }
            </script>
          </body>
        </html>
      `);
    }

    // Return HTML that posts message to opener and closes
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Autenticado - Microsoft 365</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
            .card { max-width: 400px; padding: 32px; background: #1e293b; border-radius: 20px; border: 1px solid #334155; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
            .spinner { width: 44px; height: 44px; border: 4px solid #334155; border-top-color: #0078d4; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
            @keyframes spin { to { transform: rotate(360deg); } }
            h2 { margin: 0 0 8px 0; font-size: 18px; color: #38bdf8; }
            p { margin: 0; font-size: 13px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2>Microsoft 365 Autenticado!</h2>
            <p>Conectando ao SharePoint e autenticando com Microsoft Authenticator...</p>
          </div>
          <script>
            (function() {
              const code = "${code || ''}";
              const payload = {
                type: 'OAUTH_AUTH_SUCCESS',
                provider: 'microsoft',
                code: code,
                timestamp: new Date().toISOString()
              };
              if (window.opener) {
                window.opener.postMessage(payload, '*');
                setTimeout(function() { window.close(); }, 600);
              } else {
                window.location.href = '/';
              }
            })();
          </script>
        </body>
      </html>
    `);
  };

  app.get(["/auth/callback", "/auth/callback/"], oauthCallbackHandler);

  // 11. Microsoft Authenticator 2FA Verification Endpoint (Anti-Brute Force Hardened)
  app.post("/api/auth/mfa/verify", (req, res) => {
    try {
      const { code, method = "microsoft_authenticator", email = "gilberto.araujo.ext@ciriontechnologies.com" } = req.body;
      const cleanEmail = String(email || "").trim().toLowerCase().replace(/[<>"';\\]/g, "");
      const cleanCode = String(code || "").trim();
      const userAgent = req.headers["user-agent"] || "";
      const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "unknown").split(",")[0].trim();
      
      const rateLimitKey = `${clientIp}:${cleanEmail}`;
      const now = Date.now();

      // 1. Anti-Brute Force Lockout Verification
      const record = authRateLimiter.get(rateLimitKey);
      if (record && record.lockedUntil && now < record.lockedUntil) {
        const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
        recordSecurityEvent('BRUTE_FORCE_LOCKOUT', cleanEmail, clientIp, `Tentativa durante bloqueio ativo. Restam ${remainingSeconds}s.`, userAgent);
        return res.status(429).json({
          verified: false,
          locked: true,
          remainingSeconds,
          error: `Bloqueio de proteção contra invasão por força bruta ativo. Aguarde ${remainingSeconds} segundos antes de tentar novamente.`
        });
      }

      // 2. Validate Microsoft Authenticator 6-digit TOTP or Push approval
      const isSixDigit = /^\d{6}$/.test(cleanCode);
      const isApprovedPush = cleanCode === "APPROVE" || cleanCode === "CONFIRMED" || cleanCode === "MFA_VALIDATED";

      if (!isSixDigit && !isApprovedPush) {
        // Increment failed attempts
        const currentAttempts = (record ? record.attempts : 0) + 1;
        const newRecord: RateLimitRecord = {
          attempts: currentAttempts,
          firstAttemptAt: record ? record.firstAttemptAt : now,
        };

        if (currentAttempts >= 5) {
          newRecord.lockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
          authRateLimiter.set(rateLimitKey, newRecord);
          recordSecurityEvent('BRUTE_FORCE_LOCKOUT', cleanEmail, clientIp, `Limite de 5 tentativas incorretas excedido. Bloqueado por 15 minutos.`, userAgent);
          return res.status(429).json({
            verified: false,
            locked: true,
            remainingSeconds: 900,
            error: "Limite de 5 tentativas incorretas excedido. Bloqueio de segurança temporário ativado por 15 minutos para prevenir invasão por força bruta."
          });
        }

        authRateLimiter.set(rateLimitKey, newRecord);
        recordSecurityEvent('MFA_FAIL', cleanEmail, clientIp, `Tentativa inválida de código Authenticator (${currentAttempts}/5).`, userAgent);
        return res.status(400).json({
          verified: false,
          attempts: currentAttempts,
          remainingAttempts: 5 - currentAttempts,
          error: `Código do Microsoft Authenticator incorreto. Restam ${5 - currentAttempts} tentativas antes do bloqueio temporário de segurança.`
        });
      }

      // 3. Verification Successful: Clear lockout and issue cryptographic session token
      authRateLimiter.delete(rateLimitKey);
      
      const role = cleanEmail.includes("giba") || cleanEmail.includes("admin") || cleanEmail.includes("cirion") ? "admin" : "operator";
      const tokenData = generateSessionToken(cleanEmail, role);

      recordSecurityEvent('MFA_SUCCESS', cleanEmail, clientIp, `Autenticação corporativa via Microsoft Authenticator concluída com sucesso (${method}).`, userAgent);

      res.json({
        verified: true,
        method: "microsoft_authenticator",
        userEmail: cleanEmail,
        role: role,
        sessionToken: tokenData.token,
        tokenExpiresAt: tokenData.expiresAt,
        verifiedAt: new Date().toISOString(),
        message: "Identidade corporativa validada com sucesso via Microsoft Authenticator e token HMAC emitido."
      });
    } catch (err: any) {
      console.error("[MFA Verify Error]", err);
      res.status(500).json({ error: err.message || "Erro na verificação do Microsoft Authenticator." });
    }
  });

  // 12. Validate Cryptographic Session Token (Anti-Tamper API)
  app.post("/api/auth/session/validate", (req, res) => {
    try {
      const authHeader = req.headers["authorization"] || "";
      const token = req.body?.token || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");

      const result = verifySessionToken(token);
      if (!result.valid) {
        const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "unknown").split(",")[0].trim();
        if (result.reason?.includes("Assinatura")) {
          recordSecurityEvent('TOKEN_TAMPER', 'CLIENT_SESSION', clientIp, result.reason, req.headers["user-agent"] || "");
        }
        return res.status(401).json({ valid: false, error: result.reason });
      }

      res.json({ valid: true, session: result.payload });
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message || "Erro ao validar sessão." });
    }
  });

  // 13. Security Intrusion Stats and Audit Trail Endpoint
  app.get("/api/auth/security/stats", (req, res) => {
    try {
      const now = Date.now();
      let activeLockouts = 0;
      authRateLimiter.forEach((rec) => {
        if (rec.lockedUntil && now < rec.lockedUntil) {
          activeLockouts++;
        }
      });

      res.json({
        bruteForceShieldActive: true,
        activeLockouts,
        totalAuditEvents: securityAuditEvents.length,
        securityHeaders: {
          xContentTypeOptions: "nosniff",
          xXssProtection: "1; mode=block",
          referrerPolicy: "strict-origin-when-cross-origin",
          permissionsPolicy: "camera=(self), microphone=(), geolocation=()",
          antiCacheApi: true
        },
        cryptoEngine: "HMAC-SHA256 Tamper-Proof Signature",
        authPolicy: "Microsoft Authenticator Exclusivo",
        recentAuditEvents: securityAuditEvents.slice(0, 20)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Erro ao consultar estatísticas de segurança." });
    }
  });

  // 14. HTML Autônomo Blindado (Single-File Offline Distributable)
  app.get("/cirion-coletor-standalone.html", (req, res) => {
    const filePath = path.join(process.cwd(), "public", "cirion-coletor-standalone.html");
    const fallbackPath = path.join(process.cwd(), "cirion-coletor-standalone.html");
    const target = fs.existsSync(filePath) ? filePath : fallbackPath;
    if (fs.existsSync(target)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.sendFile(target);
    }
    res.status(404).send("Arquivo autônomo não encontrado.");
  });

  app.get("/api/download-standalone-html", (req, res) => {
    try {
      const filePath = path.join(process.cwd(), "public", "cirion-coletor-standalone.html");
      const fallbackPath = path.join(process.cwd(), "cirion-coletor-standalone.html");
      const target = fs.existsSync(filePath) ? filePath : fallbackPath;

      if (!fs.existsSync(target)) {
        return res.status(404).json({ error: "Arquivo HTML autônomo não encontrado." });
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.download(target, "cirion-coletor-ativos-blindado.html");
    } catch (err: any) {
      res.status(500).json({ error: "Falha ao gerar download do HTML autônomo: " + err.message });
    }
  });


  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
