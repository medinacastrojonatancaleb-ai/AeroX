import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  let genAI: GoogleGenerativeAI | null = null;
  const getAI = () => {
    if (!genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY no configurada. Por favor, añádela en los ajustes de AI Studio.");
      }
      genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
  };

  app.post("/api/analyze-intent", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAI();
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const result = await model.generateContent(`Eres un asistente creativo experto en generación de imágenes artísticas. 
          Petición del usuario: "${prompt}"

          Analiza la petición y responde en formato JSON:
          {
            "intent": "GENERATE" | "CONVERSE" | "UNSUPPORTED",
            "explanation": "Breve motivo del intent para logs",
            "message": "Tu respuesta conversacional si el intent es CONVERSE o UNSUPPORTED",
            "optimizedPrompt": "El prompt optimizado en INGLÉS para la IA de imagen si el intent es GENERATE (incluye estilos como high quality, cinema style, 8k, digital art, etc)"
          }

          Reglas:
          - Si pide un video, audio o archivo: UNSUPPORTED. Explica amablemente que solo haces imágenes.
          - Si solo saluda, hace preguntas o charla informal: CONVERSE. Responde con pasión artística.
          - Si pide crear o cambiar una imagen: GENERATE. El prompt debe ser en INGLÉS.
          - Devuelve SOLO el JSON, sin bloques de código.`);
      
      const response = await result.response;
      const text = response.text().replace(/```json|```/g, "").trim();
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Intent Analysis Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, aspectRatio, style } = req.body;
      const ai = getAI();
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: `${prompt}, ${style} style, high quality, professional photography` }] }],
        generationConfig: {
          // @ts-ignore
          imageConfig: {
            aspectRatio: aspectRatio || "1:1",
          }
        }
      });

      const response = await result.response;
      const candidate = response.candidates?.[0];
      if (!candidate) throw new Error("No candidates returned from AI");

      if (candidate.finishReason === 'SAFETY') {
        return res.status(403).json({ error: "Imagen bloqueada por filtros de seguridad de la IA." });
      }

      const part = candidate.content?.parts?.find(p => p.inlineData);
      if (!part?.inlineData?.data) {
        throw new Error("No image data returned from Gemini");
      }

      res.json({ 
        url: `data:image/png;base64,${part.inlineData.data}`,
        prompt: prompt
      });
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/optimize-prompt", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAI();
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const result = await model.generateContent(`Eres un experto en ingeniería de prompts para IA de imagen (Stable Diffusion/DALL-E). 
        Optimiza este prompt para que sea hiper-detallado, artístico y profesional. 
        Devuelve SOLO el nuevo prompt en inglés.
        Idea: "${prompt}"`);
      
      const response = await result.response;
      res.json({ optimized: response.text().trim() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Vite in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://0.0.0.0:${PORT}/api/health`);
  });
}

startServer().catch(err => {
  console.error("Critical: Server failed to start:", err);
});
