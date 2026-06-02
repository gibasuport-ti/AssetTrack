import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-initialize Gemini API. Key will be validated on-demand.
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please add it via Settings > Secrets.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
};

const callWithFallbackModel = async (ai: any, params: any): Promise<any> => {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const errorStr = String(error?.message || error).toLowerCase();
    const is503OrUnavailable = errorStr.includes("503") || errorStr.includes("unavailable") || errorStr.includes("high demand") || errorStr.includes("spikes in demand");
    
    if (is503OrUnavailable && params.model !== "gemini-flash-latest") {
      console.warn(`[Gemini Fallback Backend] Modelo ${params.model} indisponível/congestionado (503). Tentando fallback com gemini-flash-latest...`);
      return await ai.models.generateContent({
        ...params,
        model: "gemini-flash-latest"
      });
    }
    throw error;
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit to handle base64 images
  app.use(express.json({ limit: "15mb" }));

  // API Route - Google Lens OCR
  app.post("/api/gemini/ocr", async (req, res) => {
    try {
      const { image, mimeType = "image/jpeg" } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Parâmetro 'image' (base64) é obrigatório." });
      }

      // Cleanup base64 string if it contains prefix
      let pureBase64 = image;
      if (image.includes(";base64,")) {
        pureBase64 = image.split(";base64,").pop();
      }

      const ai = getAI();

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

      const response = await callWithFallbackModel(ai, {
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

      const ai = getAI();
      const uniqueItems = Array.from(new Set(assets.map(a => `${a.marca || ""} ${a.modelo || ""}`.trim()).filter(Boolean)));
      
      if (uniqueItems.length === 0) {
        return res.json({ result: "Nenhum equipamento para analisar." });
      }

      const prompt = `Forneça a ficha técnica detalhada (especificações principais de hardware como CPU, RAM, Tela, etc.) para os seguintes modelos de equipamentos encontrados no inventário: ${uniqueItems.join(', ')}. 
Organize as informações por modelo de forma clara e profissional.`;

      const response = await callWithFallbackModel(ai, {
        model: 'gemini-3.5-flash',
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

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
