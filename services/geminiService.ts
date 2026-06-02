import { GoogleGenAI, Type } from "@google/genai";
import { Asset } from "../types";

export interface DetectedText {
  text: string;
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  heightPercent: number;
  type: string;
}

export interface OCRResult {
  fullText: string;
  detectedTexts: DetectedText[];
}

const getClientKey = (): string | null => {
  return localStorage.getItem("assettrack_gemini_api_key") || ((import.meta as any).env?.VITE_GEMINI_API_KEY || null);
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

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
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

      const prompt = `Você é o Google Lens de alta precisão. Analise a imagem fornecida e extraia TODAS as informações de texto legíveis ou códigos de barras/QRs que você consiga identificar.
Além disso, para criar uma experiência interativa exatamente como o Google Lens, identifique termos, palavras-chave, etiquetas, números de patrimônio, números de série ou frases curtas de grande relevância e estime as coordenadas retangulares relativas (em porcentagem de 0 a 100) onde cada texto se encontra na imagem.
O 'topPercent' representa o início vertical (0=topo, 100=base), 'leftPercent' representa o início horizontal (0=esquerda, 100=direita).
O formato do JSON de retorno deve seguir rigorosamente o esquema determinado.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [imagePart, prompt],
        config: {
          systemInstruction: "Você é o motor OCR do Google Lens. Analise imagens e extraia texto legível estruturado com coordenadas visuais (0-100%). Identifique códigos importantes, nomes e termos técnicos.",
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              fullText: {
                type: Type.STRING,
                description: "O texto bruto completo extraído da imagem de forma linear e limpa."
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
                    type: { type: Type.STRING, description: "Categoria do texto: 'code', 'serial', 'brand', 'model', 'generic'." }
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

