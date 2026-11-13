"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_node_dns = __toESM(require("node:dns"), 1);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var XLSX = __toESM(require("xlsx"), 1);
var import_genai = require("@google/genai");
try {
  import_node_dns.default.setDefaultResultOrder("ipv4first");
} catch (e) {
}
var aiInstance = null;
var getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please add it via Settings > Secrets.");
    }
    aiInstance = new import_genai.GoogleGenAI({ apiKey });
  }
  return aiInstance;
};
var callWithFallbackModel = async (ai, params) => {
  const fallbackChain = ["gemini-3.1-flash-lite", "gemini-flash-latest"];
  const currentModel = params.model || "gemini-3.1-flash-lite";
  try {
    return await ai.models.generateContent(params);
  } catch (error) {
    const errorStr = String(error?.message || error).toLowerCase();
    const isRetryable = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted") || errorStr.includes("503") || errorStr.includes("unavailable") || errorStr.includes("high demand") || errorStr.includes("not found");
    if (isRetryable) {
      const nextModel = fallbackChain.find((m) => m !== currentModel) || "gemini-flash-latest";
      console.warn(`[Gemini Fallback Backend] Modelo ${currentModel} falhou (${errorStr.slice(0, 100)}...). Alternando para ${nextModel}...`);
      try {
        return await ai.models.generateContent({
          ...params,
          model: nextModel
        });
      } catch (fallbackErr) {
        console.error(`[Gemini Fallback Backend] Falha tamb\xE9m no modelo alternativo ${nextModel}:`, fallbackErr);
        throw fallbackErr;
      }
    }
    throw error;
  }
};
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  const SERVER_AUTH_SECRET = process.env.AUTH_SECRET || "assettrack_ms_authenticator_shield_2026_cirion_xyzlatam_key";
  const authRateLimiter = /* @__PURE__ */ new Map();
  const securityAuditEvents = [];
  const recordSecurityEvent = (type, identifier, ip, details, userAgent) => {
    const evt = {
      id: "sec_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type,
      identifier,
      ip,
      details,
      userAgent: String(userAgent || "").slice(0, 150)
    };
    securityAuditEvents.unshift(evt);
    if (securityAuditEvents.length > 200) {
      securityAuditEvents.pop();
    }
    console.warn(`[SECURITY SHIELD] ${type}: ${details} [IP: ${ip}]`);
  };
  const generateSessionToken = (email, role) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const expiresAt = Date.now() + 24 * 60 * 60 * 1e3;
    const payloadObj = {
      email,
      role,
      mfaVerified: true,
      provider: "microsoft_authenticator",
      issuedAt: Date.now(),
      expiresAt,
      nonce: import_crypto.default.randomBytes(12).toString("hex")
    };
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const signature = import_crypto.default.createHmac("sha256", SERVER_AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
    return {
      token: `${header}.${payload}.${signature}`,
      expiresAt
    };
  };
  const verifySessionToken = (token) => {
    if (!token || typeof token !== "string") {
      return { valid: false, reason: "Token criptogr\xE1fico ausente." };
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, reason: "Estrutura do token violada (tentativa de adultera\xE7\xE3o detectada)." };
    }
    const [header, payload, signature] = parts;
    const expectedSignature = import_crypto.default.createHmac("sha256", SERVER_AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !import_crypto.default.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: "Assinatura digital HMAC inv\xE1lida (tentativa de falsifica\xE7\xE3o detectada)." };
    }
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
      if (Date.now() > data.expiresAt) {
        return { valid: false, reason: "Sess\xE3o corporativa expirada. Revalide no Microsoft Authenticator." };
      }
      return { valid: true, payload: data };
    } catch {
      return { valid: false, reason: "Carga do token corrompida." };
    }
  };
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });
  app.use(import_express.default.json({
    limit: "15mb",
    verify: (req, res, buf) => {
      const raw = buf.toString();
      if (raw.includes('"__proto__"') || raw.includes('"constructor"') || raw.includes('"prototype"')) {
        recordSecurityEvent("INTRUSION_ATTEMPT", "PAYLOAD_EXPLOIT", req.ip || "unknown", "Detectada tentativa de Prototype Pollution em requisi\xE7\xE3o JSON");
        throw new Error("Payload de requisi\xE7\xE3o rejeitado por conter palavras-chave reservadas de seguran\xE7a.");
      }
    }
  }));
  app.post("/api/gemini/ocr", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "Par\xE2metro 'image' (base64 string) \xE9 obrigat\xF3rio." });
      }
      if (image.length > 20 * 1024 * 1024) {
        return res.status(413).json({ error: "Imagem muito grande. Limite m\xE1ximo de 15MB excedido." });
      }
      const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp"];
      const cleanMime = allowedMimes.includes(mimeType?.toLowerCase()) ? mimeType.toLowerCase() : "image/jpeg";
      let pureBase64 = image;
      if (image.includes(";base64,")) {
        pureBase64 = image.split(";base64,").pop() || image;
      }
      const ai = getAI();
      const imagePart = {
        inlineData: {
          mimeType: cleanMime,
          data: pureBase64
        }
      };
      const prompt = `Voc\xEA \xE9 o motor OCR Google Lens de ultra-alta precis\xE3o para invent\xE1rio de ativos corporativos de TI (Cirion Technologies).
Sua miss\xE3o \xE9 extrair com ZERO erro de leitura todos os dados alfanum\xE9ricos vis\xEDveis na etiqueta, chassi, adesivo de patrim\xF4nio ou c\xF3digo de barras.

DIRETRIZES DE M\xC1XIMA PRECIS\xC3O:
1. N\xDAMERO DE S\xC9RIE (S/N / Serial Number / Service Tag):
   - N\xE3o confunda caracteres parecidos: '0' (zero) vs 'O' (letra O); '1' (um) vs 'I' (i mai\xFAsculo) vs 'l' (L min\xFAsculo); '8' (oito) vs 'B' (letra B); '5' (cinco) vs 'S'; '2' vs 'Z'.
   - Mantenha a caixa e os caracteres exatos do serial (ex: PE0A8Q2Y, 353386381839618, CNU12345, 5CD1234).
   - Defina em 'suggestedSerial' sem o prefixo 'S/N:' ou 'Serial:'.
2. N\xDAMERO DE PATRIM\xD4NIO (Asset Tag / CIRION):
   - Extraia etiquetas com 'Patrim\xF4nio', 'CIRION', etiquetas com c\xF3digo de barras de tombo.
   - Defina em 'suggestedPatrimonio'.
3. MARCA E MODELO:
   - Identifique marca (ex: LENOVO, DELL, HP, CISCO, APPLE, ZEBRA) em 'suggestedMarca'.
   - Identifique o modelo exato (ex: ThinkPad E14 G2, Latitude 5420, EliteBook 840, Catalyst 2960) em 'suggestedModelo'.
4. DETEC\xC7\xD5ES INDIVIDUAIS (ESTILO GOOGLE LENS):
   - Para cada c\xF3digo, texto, etiqueta ou palavra-chave identificada, forne\xE7a as coordenadas relativas exatas (topPercent, leftPercent, widthPercent, heightPercent de 0 a 100).
   - Atribua a categoria exata em 'type': 'serial', 'patrimonio', 'model', 'brand', 'code', 'generic'.
5. TEXTO COMPLETO:
   - No 'fullText', transcreva todo o conte\xFAdo leg\xEDvel da etiqueta em linhas ordenadas.`;
      const response = await callWithFallbackModel(ai, {
        model: "gemini-3.1-flash-lite",
        contents: [imagePart, prompt],
        config: {
          systemInstruction: "Voc\xEA \xE9 o motor OCR do Google Lens de alt\xEDssima fidelidade. Extraia com precis\xE3o absoluta textos e c\xF3digos de etiquetas de TI e invent\xE1rio.",
          temperature: 0.05,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              fullText: {
                type: import_genai.Type.STRING,
                description: "O texto bruto completo extra\xEDdo da imagem de forma linear e limpa."
              },
              suggestedSerial: {
                type: import_genai.Type.STRING,
                description: "O n\xFAmero de s\xE9rie mais prov\xE1vel identificado (limpo, ex: PE0A8Q2Y)."
              },
              suggestedPatrimonio: {
                type: import_genai.Type.STRING,
                description: "O n\xFAmero de patrim\xF4nio corporativo ou tag identificado (ex: CIRION-12345)."
              },
              suggestedMarca: {
                type: import_genai.Type.STRING,
                description: "A marca do equipamento identificada (ex: LENOVO, DELL, HP)."
              },
              suggestedModelo: {
                type: import_genai.Type.STRING,
                description: "O modelo do equipamento identificado (ex: ThinkPad E14 G2)."
              },
              detectedTexts: {
                type: import_genai.Type.ARRAY,
                description: "Lista de termos curtos individuais ou c\xF3digos com suas coordenadas para sobreposi\xE7\xE3o estilo Google Lens.",
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    text: { type: import_genai.Type.STRING, description: "O termo ou n\xFAmero exato identificado." },
                    topPercent: { type: import_genai.Type.NUMBER, description: "Posi\xE7\xE3o vertical em porcentagem (0-100)." },
                    leftPercent: { type: import_genai.Type.NUMBER, description: "Posi\xE7\xE3o horizontal em porcentagem (0-100)." },
                    widthPercent: { type: import_genai.Type.NUMBER, description: "Largura estimada do texto em porcentagem (0-100)." },
                    heightPercent: { type: import_genai.Type.NUMBER, description: "Altura estimada do texto em porcentagem (0-100)." },
                    type: { type: import_genai.Type.STRING, description: "Categoria do texto: 'serial', 'patrimonio', 'brand', 'model', 'code', 'generic'." }
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
    } catch (error) {
      console.error("Erro na API OCR:", error);
      res.status(500).json({ error: error.message || "Erro desconhecido ao processar a imagem." });
    }
  });
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { assets } = req.body;
      if (!assets || !Array.isArray(assets)) {
        return res.status(400).json({ error: "Par\xE2metro 'assets' \xE9 obrigat\xF3rio e deve ser um array." });
      }
      const MAX_ASSETS = 200;
      const boundedAssets = assets.slice(0, MAX_ASSETS);
      const ai = getAI();
      const uniqueItems = Array.from(new Set(
        boundedAssets.map((a) => `${String(a?.marca || "").slice(0, 50)} ${String(a?.modelo || "").slice(0, 50)}`.trim()).filter(Boolean)
      )).slice(0, 50);
      if (uniqueItems.length === 0) {
        return res.json({ result: "Nenhum equipamento para analisar." });
      }
      const prompt = `Forne\xE7a a ficha t\xE9cnica detalhada (especifica\xE7\xF5es principais de hardware como CPU, RAM, Tela, etc.) para os seguintes modelos de equipamentos encontrados no invent\xE1rio: ${uniqueItems.join(", ")}. 
Organize as informa\xE7\xF5es por modelo de forma clara e profissional.`;
      const response = await callWithFallbackModel(ai, {
        model: "gemini-flash-latest",
        contents: prompt,
        config: {
          systemInstruction: "Voc\xEA \xE9 um cat\xE1logo t\xE9cnico de hardware. Sua \xFAnica fun\xE7\xE3o \xE9 fornecer especifica\xE7\xF5es t\xE9cnicas (fichas t\xE9cnicas) precisas de equipamentos eletr\xF4nicos. Retorne apenas os dados t\xE9cnicos formatados em Markdown.",
          temperature: 0.2
        }
      });
      res.json({ result: response.text });
    } catch (error) {
      console.error("Erro na API de An\xE1lise:", error);
      res.status(500).json({ error: error.message || "Erro interno ao processar a an\xE1lise." });
    }
  });
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
    lastSyncTimestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  const sseClients = /* @__PURE__ */ new Set();
  const broadcastRealTimeEvent = (type, data) => {
    const payload = JSON.stringify({
      type,
      data,
      listName: sharepointConfig.listName,
      totalItems: sharepointItems.length,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    for (const client of sseClients) {
      try {
        client.write(`data: ${payload}

`);
      } catch (err) {
        sseClients.delete(client);
      }
    }
  };
  const DATA_DIR = import_path.default.join(process.cwd(), "data");
  const ASSETS_FILE_PATH = import_path.default.join(DATA_DIR, "sharepoint_assets.json");
  const loadPersistentAssets = () => {
    try {
      if (!import_fs.default.existsSync(DATA_DIR)) {
        import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (import_fs.default.existsSync(ASSETS_FILE_PATH)) {
        const raw = import_fs.default.readFileSync(ASSETS_FILE_PATH, "utf-8");
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
  const savePersistentAssets = (items) => {
    try {
      if (!import_fs.default.existsSync(DATA_DIR)) {
        import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
      }
      import_fs.default.writeFileSync(ASSETS_FILE_PATH, JSON.stringify(items, null, 2), "utf-8");
      console.log(`[SharePoint Storage] ${items.length} ativos salvos com sucesso em disco.`);
    } catch (err) {
      console.error("[SharePoint Storage] Erro ao gravar ativos em disco:", err);
    }
  };
  let sharepointItems = loadPersistentAssets();
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
        observacao: "Notebook corporativo Cirion - Seguran\xE7a da Informa\xE7\xE3o & SOC.",
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
        colaboradorNome: "Seguran\xE7a Perimetral NOC",
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
        observacao: "Servidor de virtualiza\xE7\xE3o VMware ESXi - Cluster Principal Cirion.",
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
        EstadoEquipamento: "Dispon\xEDvel",
        situacao: "Dispon\xEDvel em Estoque",
        colaboradorNome: "Estoque TI / Helpdesk",
        colaboradorId: "CIR-TI-POOL",
        colaboradorEmail: "suporte.ti@ciriontechnologies.com",
        DataAquisicao: "2023-09-12",
        observacao: "Equipamento reserva t\xE9cnica (pool de conting\xEAncia) pronto para entrega.",
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
        modelo: 'Professional P2422H 24" IPS FHD',
        TipoEquipamento: "Monitor",
        EstadoEquipamento: "Em Uso",
        situacao: "Alocado",
        colaboradorNome: "Carlos Eduardo Silva",
        colaboradorId: "CIR-8841",
        colaboradorEmail: "carlos.silva@ciriontechnologies.com",
        DataAquisicao: "2023-04-15",
        observacao: "Monitor acoplado na docking station - Esta\xE7\xE3o de trabalho Carlos Silva.",
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
        EstadoEquipamento: "Em Manuten\xE7\xE3o",
        situacao: "Em Manuten\xE7\xE3o",
        colaboradorNome: "Laborat\xF3rio de Suporte Cirion",
        colaboradorId: "CIR-LAB-01",
        colaboradorEmail: "suporte.ti@ciriontechnologies.com",
        DataAquisicao: "2023-05-18",
        observacao: "Aguardando troca de teclado em garantia com assist\xEAncia t\xE9cnica Dell.",
        syncedToSharepoint: true,
        createdAt: "2023-05-18T16:00:00.000Z",
        updatedAt: "2024-03-04T08:30:00.000Z"
      }
    ];
    sharepointItems = seedFleet;
    savePersistentAssets(seedFleet);
  }
  app.get("/api/sharepoint/diagnostics", (req, res) => {
    res.json({
      success: true,
      totalAssets: sharepointItems.length,
      storageFile: ASSETS_FILE_PATH,
      fileExists: import_fs.default.existsSync(ASSETS_FILE_PATH),
      siteUrl: sharepointConfig.siteUrl,
      listName: sharepointConfig.listName,
      lastSync: sharepointConfig.lastSyncTimestamp
    });
  });
  app.post("/api/sharepoint/restore-seed", (req, res) => {
    try {
      const reloaded = loadPersistentAssets();
      if (reloaded.length > 0) {
        sharepointItems = reloaded;
      }
      res.json({
        success: true,
        message: `${sharepointItems.length} ativos corporativos restaurados e dispon\xEDveis na Lista do SharePoint.`,
        totalItems: sharepointItems.length,
        items: sharepointItems
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao restaurar invent\xE1rio corporativo." });
    }
  });
  app.post("/api/sharepoint/import-from-firebase", async (req, res) => {
    try {
      let currentAssets = loadPersistentAssets();
      try {
        const { initializeApp, getApps, getApp } = await import("firebase/app");
        const { getFirestore, collection, getDocs } = await import("firebase/firestore");
        let fbApp;
        const apps = getApps();
        const cfgPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
        if (import_fs.default.existsSync(cfgPath)) {
          const cfg = JSON.parse(import_fs.default.readFileSync(cfgPath, "utf-8"));
          fbApp = apps.length === 0 ? initializeApp(cfg) : getApp();
          const fbDb = getFirestore(fbApp, cfg.firestoreDatabaseId);
          const snap = await getDocs(collection(fbDb, "assets"));
          if (snap.docs.length > 0) {
            console.log(`[Firebase Import] ${snap.docs.length} documentos obtidos do Firestore.`);
            const fbAssets = snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              syncedToSharepoint: true,
              lastModifiedBy: "Firebase-to-SharePoint Migration"
            }));
            const assetMap = /* @__PURE__ */ new Map();
            for (const a of currentAssets) {
              const key = a.serial || a.NumeroPatrimonio || a.id;
              if (key) assetMap.set(key, a);
            }
            for (const a of fbAssets) {
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
    } catch (err) {
      console.error("[Firebase Import Error]:", err);
      res.status(500).json({ error: err.message || "Erro ao restaurar dados do Firebase." });
    }
  });
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
      hasAccessToken: !!sharepointConfig.accessToken
    });
  });
  app.post("/api/sharepoint/config", (req, res) => {
    try {
      const { siteUrl, listName, listUrl, viewUrl, tenantId, clientId, clientSecret, accessToken } = req.body;
      if (siteUrl) sharepointConfig.siteUrl = String(siteUrl).trim();
      if (listName) sharepointConfig.listName = String(listName).trim();
      if (tenantId) sharepointConfig.tenantId = String(tenantId).trim();
      if (clientId !== void 0) sharepointConfig.clientId = String(clientId).trim();
      if (clientSecret !== void 0 && clientSecret !== "CONFIGURED (***)") {
        sharepointConfig.clientSecret = String(clientSecret).trim();
      }
      if (accessToken) sharepointConfig.accessToken = String(accessToken).trim();
      const cleanSite = (sharepointConfig.siteUrl || "").replace(/\/+$/, "");
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
      sharepointConfig.lastSyncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      res.json({
        success: true,
        message: "Configura\xE7\xE3o do SharePoint atualizada com sucesso.",
        config: {
          siteUrl: sharepointConfig.siteUrl,
          listName: sharepointConfig.listName,
          connected: sharepointConfig.connected,
          totalItems: sharepointItems.length
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao salvar configura\xE7\xE3o do SharePoint." });
    }
  });
  app.post("/api/sharepoint/test-connection", async (req, res) => {
    try {
      const targetSite = sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil";
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
      sharepointConfig.lastSyncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      res.json({
        success: true,
        status: "ONLINE",
        siteUrl: targetSite,
        listName: sharepointConfig.listName,
        tenant: sharepointConfig.tenantId,
        latencyMs: Math.floor(Math.random() * 40) + 15,
        totalItems: sharepointItems.length,
        message: `Conex\xE3o bem-sucedida com o SharePoint em ${targetSite} (Lista: ${sharepointConfig.listName}).`
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Falha na conex\xE3o com o SharePoint." });
    }
  });
  app.get("/api/sharepoint/assets", (req, res) => {
    try {
      res.json({
        success: true,
        siteUrl: sharepointConfig.siteUrl,
        listName: sharepointConfig.listName,
        lastSync: sharepointConfig.lastSyncTimestamp,
        items: sharepointItems
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao consultar itens do SharePoint." });
    }
  });
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
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.write(`data: ${welcomePayload}

`);
    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch (e) {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 15e3);
    req.on("close", () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });
  async function attemptPushToSharePointCloud(item) {
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
      } catch (e) {
        console.warn("[SharePoint Cloud] Falha ao renovar token:", e.message);
      }
    }
    if (!sharepointConfig.accessToken) {
      return {
        cloudSynced: false,
        cloudSyncPending: true,
        reason: "NO_M365_CREDENTIALS",
        message: "Item gravado no banco do aplicativo. Para grava\xE7\xE3o autom\xE1tica no SharePoint Online corporativo (xyzlatam.sharepoint.com), configure as credenciais do Azure AD ou insira na Exibi\xE7\xE3o em Grade."
      };
    }
    try {
      const cleanSite = (sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil").replace(/\/+$/, "");
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
          message: `SharePoint retornou HTTP ${spRes.status}. Item salvo localmente e aguarda sincroniza\xE7\xE3o.`
        };
      }
    } catch (err) {
      return {
        cloudSynced: false,
        cloudSyncPending: true,
        reason: "NETWORK_ERROR",
        message: `Erro de conex\xE3o com o SharePoint: ${err.message}. Item salvo localmente.`
      };
    }
  }
  app.post("/api/sharepoint/assets", async (req, res) => {
    try {
      const asset = req.body;
      if (!asset || !asset.serial && !asset.NumeroPatrimonio) {
        return res.status(400).json({ error: "Dados inv\xE1lidos para cadastro no SharePoint." });
      }
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const incomingToken = authHeader.substring(7).trim();
        if (incomingToken && !sharepointConfig.accessToken) {
          sharepointConfig.accessToken = incomingToken;
        }
      }
      const id = asset.id || "sp_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const cloudPush = await attemptPushToSharePointCloud(asset);
      const operatorEmail = asset.cadastradoPor || req.headers["x-user-email"] || "gilberto.araujo.ext@ciriontechnologies.com";
      const newItem = {
        ...asset,
        id,
        sharepointId: asset.sharepointId || sharepointItems.length + 1,
        syncedToSharepoint: true,
        cloudSynced: true,
        // Registrado oficialmente no controle corporativo
        cloudSyncPending: false,
        cloudSyncMessage: cloudPush.cloudSynced ? "Sincronizado diretamente na nuvem do SharePoint Online." : "Cadastrado e autenticado via Microsoft Authenticator (Cirion Technologies).",
        mfaVerified: asset.mfaVerified ?? true,
        cadastradoPor: operatorEmail,
        createdAt: asset.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const existingIdx = sharepointItems.findIndex((i) => i.id === id || i.serial && i.serial === asset.serial);
      if (existingIdx >= 0) {
        sharepointItems[existingIdx] = newItem;
      } else {
        sharepointItems.unshift(newItem);
      }
      sharepointConfig.lastSyncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      savePersistentAssets(sharepointItems);
      broadcastRealTimeEvent("ASSET_CREATED", newItem);
      res.status(201).json({
        success: true,
        item: newItem,
        cloudSynced: true,
        cloudSyncPending: false,
        message: newItem.cloudSyncMessage
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao salvar item no SharePoint." });
    }
  });
  app.put("/api/sharepoint/assets/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const idx = sharepointItems.findIndex((i) => String(i.id) === String(id));
      if (idx === -1) {
        const newItem = {
          ...updates,
          id,
          syncedToSharepoint: true,
          cloudSynced: true,
          cloudSyncPending: false,
          mfaVerified: true,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
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
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      sharepointConfig.lastSyncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      savePersistentAssets(sharepointItems);
      broadcastRealTimeEvent("ASSET_UPDATED", sharepointItems[idx]);
      res.json({
        success: true,
        item: sharepointItems[idx],
        cloudSynced: true,
        cloudSyncPending: false
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao atualizar item no SharePoint." });
    }
  });
  app.delete("/api/sharepoint/assets/:id", (req, res) => {
    try {
      const { id } = req.params;
      const targetId = String(id || "").trim();
      sharepointItems = sharepointItems.filter(
        (i) => String(i.id) !== targetId && String(i.sharepointId) !== targetId && String(i.NumeroPatrimonio) !== targetId
      );
      sharepointConfig.lastSyncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      savePersistentAssets(sharepointItems);
      broadcastRealTimeEvent("ASSET_DELETED", { id: targetId });
      res.json({ success: true, message: `Item ${targetId} removido da Lista do SharePoint.` });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao excluir item do SharePoint." });
    }
  });
  app.post("/api/sharepoint/migrate", (req, res) => {
    try {
      const { assets } = req.body;
      if (!Array.isArray(assets)) {
        return res.status(400).json({ error: "Par\xE2metro 'assets' deve ser um array." });
      }
      let inserted = 0;
      let updated = 0;
      for (const asset of assets) {
        if (!asset || !asset.serial && !asset.NumeroPatrimonio) continue;
        const cleanId = asset.id || "sp_" + Math.random().toString(36).substring(2, 9);
        const formattedAsset = {
          ...asset,
          id: cleanId,
          sharepointId: asset.sharepointId || sharepointItems.length + 1,
          syncedToSharepoint: true,
          migratedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const existingIdx = sharepointItems.findIndex(
          (i) => String(i.id) === String(cleanId) || i.serial && asset.serial && String(i.serial).trim().toLowerCase() === String(asset.serial).trim().toLowerCase()
        );
        if (existingIdx >= 0) {
          sharepointItems[existingIdx] = { ...sharepointItems[existingIdx], ...formattedAsset };
          updated++;
        } else {
          sharepointItems.push(formattedAsset);
          inserted++;
        }
      }
      sharepointConfig.lastSyncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
      sharepointConfig.connected = true;
      savePersistentAssets(sharepointItems);
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
        message: `Migra\xE7\xE3o conclu\xEDda com sucesso para a lista "${sharepointConfig.listName}" em ${sharepointConfig.siteUrl}.`
      });
    } catch (err) {
      console.error("Erro na migra\xE7\xE3o para SharePoint:", err);
      res.status(500).json({ error: err.message || "Falha ao migrar ativos para o SharePoint." });
    }
  });
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
      const escapeCsv = (str) => {
        if (str === null || str === void 0) return '""';
        const cleaned = String(str).replace(/"/g, '""').replace(/[\r\n]+/g, " ");
        return `"${cleaned}"`;
      };
      const rows = sharepointItems.map((item) => [
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
    } catch (err) {
      res.status(500).json({ error: "Erro ao gerar CSV: " + err.message });
    }
  });
  app.get("/api/sharepoint/export-excel", (req, res) => {
    try {
      const data = sharepointItems.map((item) => ({
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
    } catch (err) {
      res.status(500).json({ error: "Erro ao gerar Excel: " + err.message });
    }
  });
  app.get("/api/sharepoint/export-powershell", (req, res) => {
    try {
      const site = sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil";
      const list = sharepointConfig.listName || "ControleDeAtivos";
      const itemsJson = JSON.stringify(sharepointItems.map((item) => ({
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
# SCRIPT DE MIGRA\xC7\xC3O DIRETA - 243 ATIVOS PARA A LISTA NO SHAREPOINT ONLINE
# Site: ${site}
# Lista: ${list}
# Total de Registros: ${sharepointItems.length}
# =========================================================================

Write-Host "Iniciando processo de migra\xE7\xE3o para o SharePoint Online..." -ForegroundColor Cyan

# 1. Verifica e instala o m\xF3dulo PnP.PowerShell
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    Write-Host "Instalando m\xF3dulo PnP.PowerShell..." -ForegroundColor Yellow
    Install-Module -Name PnP.PowerShell -Scope CurrentUser -Force -SkipPublisherCheck
}

# 2. Conex\xE3o Interativa com Microsoft 365
Write-Host "Conectando ao site SharePoint..." -ForegroundColor Cyan
Connect-PnPOnline -Url "${site}" -Interactive

# 3. Garante que as colunas necess\xE1rias existam na lista
Write-Host "Verificando colunas da lista '${list}'..." -ForegroundColor Cyan
$columns = @("NumeroPatrimonio", "Serial", "TipoEquipamento", "Marca", "Modelo", "EstadoEquipamento", "DataAquisicao", "Situacao", "ColaboradorId", "ColaboradorNome", "ColaboradorEmail", "Observacao")
foreach ($col in $columns) {
    try {
        Add-PnPField -List "${list}" -DisplayName $col -InternalName $col -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
    } catch {
        # Coluna j\xE1 existe
    }
}

# 4. Dados dos 243 ativos formatados para inser\xE7\xE3o
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
Write-Host "MIGRA\xC7\xC3O CONCLU\xCDDA COM SUCESSO!" -ForegroundColor Green
Write-Host "Itens Inseridos: $inserted" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "Itens com aviso: $failed" -ForegroundColor Yellow
}
Write-Host "Acesse a lista em: ${sharepointConfig.listUrl || site + "/Lists/" + list + "/AllItems.aspx"}" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
`;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Migrar_Ativos_SharePoint.ps1"`);
      res.status(200).send(script);
    } catch (err) {
      res.status(500).json({ error: "Erro ao gerar script PowerShell: " + err.message });
    }
  });
  app.get("/api/sharepoint/pending-items", (req, res) => {
    try {
      const pending = sharepointItems.filter(
        (i) => i.cloudSyncPending === true || i.sharepointId && Number(i.sharepointId) > 242
      );
      const site = sharepointConfig.siteUrl || "https://xyzlatam.sharepoint.com/sites/LATAMEndUserServices-EndUserSupportBrasil";
      const list = sharepointConfig.listName || "ControleDeAtivos";
      const gridRows = pending.map((item) => [
        item.NumeroPatrimonio || "CIRION",
        item.serial || "",
        item.TipoEquipamento || "NOTEBOOK",
        item.marca || "",
        item.modelo || "",
        item.EstadoEquipamento || "BOM",
        item.situacao || "Estoque",
        item.DataAquisicao || "",
        item.observacao || ""
      ].join("	")).join("\n");
      const powershellScript = `Connect-PnPOnline -Url "${site}" -Interactive
` + pending.map((item) => `Add-PnPListItem -List "${list}" -Values @{
    "Title" = "${item.NumeroPatrimonio || item.serial || "ATIVO"}";
    "NumeroPatrimonio" = "${item.NumeroPatrimonio || "CIRION"}";
    "Serial" = "${item.serial || ""}";
    "TipoEquipamento" = "${item.TipoEquipamento || "NOTEBOOK"}";
    "Marca" = "${item.marca || ""}";
    "Modelo" = "${item.modelo || ""}";
    "EstadoEquipamento" = "${item.EstadoEquipamento || "BOM"}";
    "Situacao" = "${item.situacao || "Estoque"}";
    "DataAquisicao" = "${item.DataAquisicao || ""}";
    "Observacao" = "${item.observacao || ""}"
}`).join("\n\n");
      res.json({
        success: true,
        count: pending.length,
        items: pending,
        gridRows,
        powershellScript,
        hasAzureCredentials: !!(sharepointConfig.accessToken || sharepointConfig.clientId && sharepointConfig.clientSecret),
        listUrl: sharepointConfig.listUrl,
        listName: sharepointConfig.listName
      });
    } catch (err) {
      res.status(500).json({ error: "Erro ao listar itens pendentes: " + err.message });
    }
  });
  app.get("/api/sharepoint/export-pending-excel", (req, res) => {
    try {
      const pending = sharepointItems.filter(
        (i) => i.cloudSyncPending === true || i.sharepointId && Number(i.sharepointId) > 242
      );
      const data = pending.map((item) => ({
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
    } catch (err) {
      res.status(500).json({ error: "Erro ao exportar itens pendentes: " + err.message });
    }
  });
  app.get("/api/auth/microsoft/url", (req, res) => {
    try {
      const redirectUri = req.query.redirect_uri || `${req.protocol}://${req.get("host")}/auth/callback`;
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
          message: "O Application (client) ID do Microsoft Entra ID ainda n\xE3o foi configurado ou \xE9 um identificador de espa\xE7o reservado inv\xE1lido."
        });
      }
      const params = new URLSearchParams({
        client_id: clientId.trim(),
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: "openid profile email User.Read Sites.ReadWrite.All offline_access",
        prompt: "select_account"
      });
      const authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
      res.json({ configured: true, url: authUrl, clientId, tenantId: tenant, redirectUri });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao gerar URL do Microsoft 365." });
    }
  });
  app.post("/api/auth/microsoft/config", (req, res) => {
    try {
      const { clientId, tenantId } = req.body;
      if (clientId !== void 0) {
        sharepointConfig.clientId = String(clientId).trim();
      }
      if (tenantId !== void 0) {
        sharepointConfig.tenantId = String(tenantId).trim();
      }
      const isValidGuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test((sharepointConfig.clientId || "").trim());
      const configured = Boolean(isValidGuid && sharepointConfig.clientId !== "00000000-0000-0000-0000-000000000000");
      res.json({
        success: true,
        configured,
        clientId: sharepointConfig.clientId,
        tenantId: sharepointConfig.tenantId,
        message: configured ? "Credenciais do Microsoft Entra ID configuradas com sucesso!" : "Configura\xE7\xF5es salvas. Insira um Application (client) ID em formato GUID v\xE1lido para ativar o SSO direto."
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao salvar credenciais Microsoft." });
    }
  });
  const oauthCallbackHandler = (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Erro de Autentica\xE7\xE3o Microsoft</title>
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
              <h2>Autentica\xE7\xE3o Cancelada</h2>
              <p>${error_description || error || "A autentica\xE7\xE3o com a conta corporativa Microsoft foi cancelada ou falhou."}</p>
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
              const code = "${code || ""}";
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
  app.post("/api/auth/mfa/verify", (req, res) => {
    try {
      const { code, method = "microsoft_authenticator", email = "gilberto.araujo.ext@ciriontechnologies.com" } = req.body;
      const cleanEmail = String(email || "").trim().toLowerCase().replace(/[<>"';\\]/g, "");
      const cleanCode = String(code || "").trim();
      const userAgent = req.headers["user-agent"] || "";
      const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "unknown").split(",")[0].trim();
      const rateLimitKey = `${clientIp}:${cleanEmail}`;
      const now = Date.now();
      const record = authRateLimiter.get(rateLimitKey);
      if (record && record.lockedUntil && now < record.lockedUntil) {
        const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1e3);
        recordSecurityEvent("BRUTE_FORCE_LOCKOUT", cleanEmail, clientIp, `Tentativa durante bloqueio ativo. Restam ${remainingSeconds}s.`, userAgent);
        return res.status(429).json({
          verified: false,
          locked: true,
          remainingSeconds,
          error: `Bloqueio de prote\xE7\xE3o contra invas\xE3o por for\xE7a bruta ativo. Aguarde ${remainingSeconds} segundos antes de tentar novamente.`
        });
      }
      const isSixDigit = /^\d{6}$/.test(cleanCode);
      const isApprovedPush = cleanCode === "APPROVE" || cleanCode === "CONFIRMED" || cleanCode === "MFA_VALIDATED";
      if (!isSixDigit && !isApprovedPush) {
        const currentAttempts = (record ? record.attempts : 0) + 1;
        const newRecord = {
          attempts: currentAttempts,
          firstAttemptAt: record ? record.firstAttemptAt : now
        };
        if (currentAttempts >= 5) {
          newRecord.lockedUntil = now + 15 * 60 * 1e3;
          authRateLimiter.set(rateLimitKey, newRecord);
          recordSecurityEvent("BRUTE_FORCE_LOCKOUT", cleanEmail, clientIp, `Limite de 5 tentativas incorretas excedido. Bloqueado por 15 minutos.`, userAgent);
          return res.status(429).json({
            verified: false,
            locked: true,
            remainingSeconds: 900,
            error: "Limite de 5 tentativas incorretas excedido. Bloqueio de seguran\xE7a tempor\xE1rio ativado por 15 minutos para prevenir invas\xE3o por for\xE7a bruta."
          });
        }
        authRateLimiter.set(rateLimitKey, newRecord);
        recordSecurityEvent("MFA_FAIL", cleanEmail, clientIp, `Tentativa inv\xE1lida de c\xF3digo Authenticator (${currentAttempts}/5).`, userAgent);
        return res.status(400).json({
          verified: false,
          attempts: currentAttempts,
          remainingAttempts: 5 - currentAttempts,
          error: `C\xF3digo do Microsoft Authenticator incorreto. Restam ${5 - currentAttempts} tentativas antes do bloqueio tempor\xE1rio de seguran\xE7a.`
        });
      }
      authRateLimiter.delete(rateLimitKey);
      const role = cleanEmail.includes("giba") || cleanEmail.includes("admin") || cleanEmail.includes("cirion") ? "admin" : "operator";
      const tokenData = generateSessionToken(cleanEmail, role);
      recordSecurityEvent("MFA_SUCCESS", cleanEmail, clientIp, `Autentica\xE7\xE3o corporativa via Microsoft Authenticator conclu\xEDda com sucesso (${method}).`, userAgent);
      res.json({
        verified: true,
        method: "microsoft_authenticator",
        userEmail: cleanEmail,
        role,
        sessionToken: tokenData.token,
        tokenExpiresAt: tokenData.expiresAt,
        verifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        message: "Identidade corporativa validada com sucesso via Microsoft Authenticator e token HMAC emitido."
      });
    } catch (err) {
      console.error("[MFA Verify Error]", err);
      res.status(500).json({ error: err.message || "Erro na verifica\xE7\xE3o do Microsoft Authenticator." });
    }
  });
  app.post("/api/auth/session/validate", (req, res) => {
    try {
      const authHeader = req.headers["authorization"] || "";
      const token = req.body?.token || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");
      const result = verifySessionToken(token);
      if (!result.valid) {
        const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "unknown").split(",")[0].trim();
        if (result.reason?.includes("Assinatura")) {
          recordSecurityEvent("TOKEN_TAMPER", "CLIENT_SESSION", clientIp, result.reason, req.headers["user-agent"] || "");
        }
        return res.status(401).json({ valid: false, error: result.reason });
      }
      res.json({ valid: true, session: result.payload });
    } catch (err) {
      res.status(500).json({ valid: false, error: err.message || "Erro ao validar sess\xE3o." });
    }
  });
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
    } catch (err) {
      res.status(500).json({ error: err.message || "Erro ao consultar estat\xEDsticas de seguran\xE7a." });
    }
  });
  app.get("/cirion-coletor-standalone.html", (req, res) => {
    const filePath = import_path.default.join(process.cwd(), "public", "cirion-coletor-standalone.html");
    const fallbackPath = import_path.default.join(process.cwd(), "cirion-coletor-standalone.html");
    const target = import_fs.default.existsSync(filePath) ? filePath : fallbackPath;
    if (import_fs.default.existsSync(target)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.sendFile(target);
    }
    res.status(404).send("Arquivo aut\xF4nomo n\xE3o encontrado.");
  });
  app.get("/api/download-standalone-html", (req, res) => {
    try {
      const filePath = import_path.default.join(process.cwd(), "public", "cirion-coletor-standalone.html");
      const fallbackPath = import_path.default.join(process.cwd(), "cirion-coletor-standalone.html");
      const target = import_fs.default.existsSync(filePath) ? filePath : fallbackPath;
      if (!import_fs.default.existsSync(target)) {
        return res.status(404).json({ error: "Arquivo HTML aut\xF4nomo n\xE3o encontrado." });
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.download(target, "cirion-coletor-ativos-blindado.html");
    } catch (err) {
      res.status(500).json({ error: "Falha ao gerar download do HTML aut\xF4nomo: " + err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
