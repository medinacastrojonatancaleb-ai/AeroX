import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

export const geminiService = {
  async generateViralIdeas(topic: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Genera 5 ideas de contenido viral para redes sociales sobre: ${topic}. Incluye el "hook" (gancho) y por qué funcionaría.`,
    });
    return response.text;
  },

  async generateTikTokScript(idea: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Escribe un guión detallado para un TikTok de 60 segundos sobre: ${idea}. Incluye indicaciones de cámara y tono de voz dinámico.`,
    });
    return response.text;
  },

  async generateViralTitles(topic: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Genera 10 títulos "clickbait" pero honestos y virales para YouTube o Instagram sobre: ${topic}. Usa emojis.`,
    });
    return response.text;
  },

  async chatCreator(message: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Eres un experto estratega de contenido viral. Ayuda al creador con su duda: ${message}. Sé creativo, directo y usa un tono joven y energético.`,
    });
    return response.text;
  },

  async simplifyText(text: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Reescribe este texto para que sea mucho más dinámico y fácil de leer en redes sociales:\n\n${text}`,
    });
    return response.text;
  },

  async generateVideoStoryboard(topic: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Crea un storyboard de 4 escenas para un video corto viral sobre: ${topic}. 
      USA ESTRICTAMENTE este formato para cada escena:
      
      Escena 1: [Breve título]
      Descripción: [Descripción visual y narración detallada]
      
      Escena 2: [Breve título]
      Descripción: ...
      
      (Repite hasta la Escena 4). Sé muy descriptivo y cinematográfico.`,
    });
    return response.text;
  },

  async improveText(text: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Mejora y profesionaliza el siguiente texto para que sea más impactante y persuasivo, manteniendo un tono moderno:\n\n${text}`,
    });
    return response.text;
  },

  async summarizeText(text: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Resume este texto en los 3 puntos más importantes para un post rápido:\n\n${text}`,
    });
    return response.text;
  },

  async generateMusicConcept(mood: string, style: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Describe un concepto de música instrumental corta para un video de redes sociales. El mood es ${mood} y el estilo es ${style}. Describe los instrumentos, el ritmo y la estructura en 3 oraciones.`,
    });
    return response.text;
  },

  async generateAvatarPrompt(description: string, style: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Crea un prompt detallado para un generador de imágenes artístico para crear un avatar. Descripción: ${description}. Estilo: ${style}. Incluye detalles de iluminación y composición.`,
    });
    return response.text;
  }
};
