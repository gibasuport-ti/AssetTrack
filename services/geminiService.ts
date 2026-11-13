import { GoogleGenAI, Type } from "@google/genai";
import { Asset } from "../types";

export interface DetectedText {
  text: string;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  type: 'serial' | 'patrimonio' | 'model' | 'brand' | 'code' | 'generic' | string;
}

export interface OCRResult {
  fullText: string;
  detectedTexts: DetectedText[];
  suggestedSerial?: string;
  suggestedPatrimonio?: string;
  suggestedMarca?: string;
  suggestedModelo?: string;
}

const getClientKey = (): string | null => {
  return localStorage.getItem("assettrack_gemini_api_key") || ((import.meta as any).env?.VITE_GEMINI_API_KEY || null);
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
      console.warn(`[Gemini Fallback Client] Modelo ${currentModel} falhou. Alternando para ${nextModel}...`);
      return await ai.models.generateContent({
        ...params,
        model: nextModel
      });
    }
    throw error;
  }
};

export const geminiService = {
  analyzeInventory: async (assets: Asset[]): Promise<string> => {
    // 1. Tenta acionar a API do servidor proxy primeiro se disponível
    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assets }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.result || "Nenhum dado retornado.";
      }
    } catch (apiError) {
      console.warn("API de backend não acessível. Tentando execução direta no navegador via chave local...", apiError);
    }

    // 2. Se falhar ou estiver off-grid, tenta inicializar localmente no navegador
    const apiKey = getClientKey();
    if (!apiKey) {
      throw new Error("Não foi possível conectar ao servidor proxy e nenhuma chave pessoal do Gemini foi configurada localmente. Configure sua chave Gemini nas Configurações de Segurança do aplicativo.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const uniqueItems = Array.from(new Set(assets.map(a => `${a.marca || ""} ${a.modelo || ""}`.trim()).filter(Boolean)));
      
      if (uniqueItems.length === 0) {
        return "Nenhum equipamento para analisar.";
      }

      const prompt = `Forneça a ficha técnica detalhada (especificações principais de hardware como CPU, RAM, Tela, etc.) para os seguintes modelos de equipamentos encontrados no inventário: ${uniqueItems.join(', ')}. 
Organize as informações por modelo de forma clara e profissional.`;

      const response = await callWithFallbackModel(ai, {
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction: "Você é um catálogo técnico de hardware. Sua única função é fornecer especificações técnicas (fichas técnicas) precisas de equipamentos eletrônicos. Retorne apenas os dados técnicos formatados em Markdown.",
          temperature: 0.2,
        },
      });

      return response.text || "Nenhum resultado retornado.";
    } catch (clientError: any) {
      console.error("Erro na chamada Gemini direta do cliente:", clientError);
      throw new Error(`Erro na API Gemini local: ${clientError.message || clientError}`);
    }
  },

  performOCR: async (base64Image: string, mimeType: string = "image/jpeg"): Promise<OCRResult> => {
    // 1. Tenta acionar a API do servidor proxy primeiro se disponível
    try {
      const response = await fetch("/api/gemini/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64Image, mimeType }),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (apiError) {
      console.warn("API de OCR no backend não disponível. Tentando OCR direto no navegador via chave local...", apiError);
    }

    // 2. Fallback direto no navegador usando chave local do usuário
    const apiKey = getClientKey();
    if (!apiKey) {
      throw new Error("Não foi possível conectar ao servidor para OCR e nenhuma chave pessoal do Gemini foi configurada localmente. Configure sua chave Gemini nas Configurações de Segurança do aplicativo.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      let pureBase64 = base64Image;
      if (base64Image.includes(";base64,")) {
        pureBase64 = base64Image.split(";base64,").pop() || base64Image;
      }

      const imagePart = {
        inlineData: {
          mimeType: mimeType,
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
      return JSON.parse(resultText) as OCRResult;
    } catch (clientError: any) {
      console.error("Erro no OCR direto da chave local Gemini:", clientError);
      throw new Error(`Erro na API Gemini local: ${clientError.message || clientError}`);
    }
  }
};

