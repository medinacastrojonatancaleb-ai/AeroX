/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Send,
  Bot,
  Brain,
  User as UserIcon,
  Settings,
  Maximize2,
  Clock,
  Layout,
  History,
  UserCircle,
  Zap,
  MoreVertical,
  ChevronRight,
  Plus,
  HelpCircle,
  Lightbulb,
  Upload,
  ArrowRight,
  Monitor,
  Menu,
  X,
  Paperclip,
  AtSign,
  Command,
  Trash2,
  LogOut,
  Moon,
  Sun,
  Palette
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { GoogleGenAI } from "@google/genai";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  deleteDoc,
  User,
  OperationType,
  handleFirestoreError
} from './firebase';

// --- TYPES ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  error?: string;
  timestamp: number;
}

interface ImageResult {
  id: string;
  url: string;
  prompt: string;
  settings: {
    format: string;
    quality: string;
    style: string;
    count: number;
  };
  timestamp: number;
}

type Tab = 'create' | 'history' | 'inspiration';

// --- HELPERS ---
async function compressImage(base64: string, maxSizeKB: number = 800): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Max dimension to ensure we stay under the 1MB limit easily
      const MAX_SIZE = 1024;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64); return; }
      
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.8;
      let result = canvas.toDataURL('image/jpeg', quality);
      
      // Base64 string length limit check (~800KB)
      while (result.length > maxSizeKB * 1024 && quality > 0.1) {
        quality -= 0.05;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      
      resolve(result);
    };
    img.onerror = () => resolve(base64);
  });
}

// 2. Improved ID generation helper
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export default function App() {
  // Auth & Profile
  const [user, setUser] = useState<User | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // App Logic State
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hola, ¿qué imagen quieres crear?', timestamp: Date.now() }
  ]);
  const [history, setHistory] = useState<ImageResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ImageResult[] | null>(null);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  
  // Settings
  const [format, setFormat] = useState('9:16');
  const [quality, setQuality] = useState('Alta');
  const [style, setStyle] = useState('Cinemático');
  const [count, setCount] = useState(1);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply Theme
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        saveUserToFirestore(u);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync History from Firestore
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const q = query(collection(db, 'users', user.uid, 'history'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImageResult));
      setHistory(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/history`));

    return () => unsubscribe();
  }, [user]);

  const saveUserToFirestore = async (u: User) => {
    try {
      const userDoc = doc(db, 'users', u.uid);
      const snap = await getDoc(userDoc);
      if (!snap.exists()) {
        await setDoc(userDoc, {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          theme: 'dark',
          defaultFormat: '9:16',
          defaultQuality: 'Alta',
          defaultStyle: 'Cinemático',
          updatedAt: new Date().toISOString()
        });
      } else {
        const data = snap.data();
        if (data.theme) setTheme(data.theme);
        if (data.defaultFormat) setFormat(data.defaultFormat);
        if (data.defaultQuality) setQuality(data.defaultQuality);
        if (data.defaultStyle) setStyle(data.defaultStyle);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error("Login failed", e);
      if (e.code === 'auth/popup-blocked') {
        alert("El navegador bloqueó la ventana de inicio de sesión. Por favor, permite las ventanas emergentes.");
      } else if (e.code === 'auth/cancelled-popup-request') {
        // Safe to ignore, user closed or another request started
      } else {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          error: "Error al iniciar sesión. Inténtalo de nuevo.",
          timestamp: Date.now()
        }]);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setHistory([]);
      setSelectedResult(null);
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Handle ESC for Modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedImageUrl(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Handle Image Generation
  const generateImage = async (promptText: string, isEditing = false) => {
    if (!promptText.trim() || isGenerating) return;

    setIsGenerating(true);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
    let finalPrompt = promptText;

    try {
      // Improved Intent Guard: Smart classifier + conversational response
      try {
        const conversationManager = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: 'user', parts: [{ text: `Eres un asistente creativo experto en generación de imágenes artísticas. 
          Petición del usuario: "${promptText}"

          Analiza la petición y responde en formato JSON:
          {
            "intent": "GENERATE" | "CONVERSE" | "UNSUPPORTED",
            "message": "Tu respuesta conversacional si el intent es CONVERSE o UNSUPPORTED",
            "optimizedPrompt": "El prompt optimizado en INGLÉS para la IA de imagen si el intent es GENERATE"
          }

          Reglas:
          - Si pide un video, audio o archivo complejo: UNSUPPORTED. Explica que solo haces imágenes pero sé amable.
          - Si solo saluda, hace una pregunta o charla: CONVERSE. Responde con naturalidad y pasión artística.
          - Si pide crear o cambiar una imagen: GENERATE. No des explicaciones, solo pon el prompt en optimizedPrompt.
          
          Devuelve solo el JSON válido.` }] }]
        });
        
        try {
          const rawText = conversationManager.text?.trim() || "{}";
          // Basic cleanup in case the model adds markdown code blocks
          const jsonText = rawText.startsWith('```') ? rawText.replace(/^```json\n|```$/g, '') : rawText;
          const analysis = JSON.parse(jsonText);

          if (analysis.intent === 'CONVERSE' || analysis.intent === 'UNSUPPORTED') {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: 'assistant',
              content: analysis.message || (analysis.intent === 'UNSUPPORTED' 
                ? "Por ahora solo puedo crear imágenes estáticas de gran calidad. ¿Te gustaría que visualice esa idea en una ilustración?" 
                : "¡Hola! Soy tu asistente creativo. ¿Qué tienes en mente para hoy?"),
              timestamp: Date.now()
            }]);
            setIsGenerating(false);
            return;
          }
          
          if (analysis.intent === 'GENERATE' && analysis.optimizedPrompt) {
            finalPrompt = analysis.optimizedPrompt;
          }
        } catch (parseError) {
          console.warn("Fallo el parseo del análisis, usando prompt directo:", parseError);
        }
      } catch (e) {
        console.warn("Fallo en intent guard, procediendo con precaución:", e);
      }

      // If we reach here, we are generating an image (either via analysis or fallback)
      
      // Generate images sequentially to avoid rate limits and handle partial failures better
      const generatedImages: ImageResult[] = [];
      const errors: string[] = [];

      for (let i = 0; i < count; i++) {
        try {
          console.log(`Generando imagen ${i + 1} de ${count}...`);
          const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ parts: [{ text: `${finalPrompt}, ${style} style, high quality, professional photography` }] }],
            config: {
              imageConfig: {
                aspectRatio: format as any,
              }
            }
          });

          const candidate = result.candidates?.[0];
          if (!candidate) throw new Error("El servicio de IA no devolvió candidatos.");

          if (candidate.finishReason === 'SAFETY') {
            errors.push("Imagen bloqueada por filtros de seguridad de la IA.");
            continue;
          }

          const part = candidate.content?.parts?.find(p => p.inlineData);
          if (!part?.inlineData?.data) {
            console.error("Respuesta sin datos binarios:", candidate);
            errors.push("El modelo no devolvió datos de imagen.");
            continue;
          }

          generatedImages.push({
            id: generateId(),
            url: `data:image/png;base64,${part.inlineData.data}`,
            prompt: finalPrompt,
            settings: { format, quality, style, count },
            timestamp: Date.now()
          });
          
          // Small delay to prevent hitting rapid-fire limits
          if (count > 1 && i < count - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (e: any) {
          console.error(`Error en imagen ${i + 1}:`, e);
          errors.push(e.message || "Error en la conexión con la IA.");
        }
      }

      if (generatedImages.length === 0) {
        throw new Error(errors.length > 0 ? errors[0] : "No se pudo generar ninguna de las imágenes solicitadas.");
      }

      // Save to Firestore if logged in
      if (user) {
        for (const res of generatedImages) {
          try {
            const serialized = JSON.stringify(res);
            const sizeInBytes = new Blob([serialized]).size;
            
            // If image is too large, compress it for cloud storage
            // This ensures history always has a preview
            if (sizeInBytes >= 900000) {
              console.log(`Comprimiendo imagen ${res.id} para la nube...`);
              const compressedUrl = await compressImage(res.url);
              const compressedRes = { ...res, url: compressedUrl };
              await setDoc(doc(db, 'users', user.uid, 'history', res.id), compressedRes);
            } else {
              await setDoc(doc(db, 'users', user.uid, 'history', res.id), res);
            }
          } catch (e: any) {
            console.error("Error al guardar en historial:", e);
            if (e.message?.includes('exceeds the maximum allowed size') || e.code === 'permission-denied') {
               const lowResUrl = await compressImage(res.url, 200); // Super compression as fall-back
               const promptOnlyRes = { ...res, url: lowResUrl };
               await setDoc(doc(db, 'users', user.uid, 'history', res.id), promptOnlyRes).catch(() => {});
            }
          }
        }
      }
      
      setSelectedResult(generatedImages);
      
      const successCount = generatedImages.length;
      const failCount = errors.length;

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: failCount > 0 
          ? `He generado ${successCount} imágenes, pero ${failCount} han fallado por límites de la IA. ¿Quieres intentar algo más?`
          : isEditing 
            ? `He aplicado tus cambios. He generado ${successCount} ${successCount > 1 ? 'imágenes' : 'imagen'}. ¿Qué te parecen?` 
            : `Aquí tienes. He generado ${successCount} ${successCount > 1 ? 'vistas' : 'vista'} de tu visión.`,
        timestamp: Date.now()
      }]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        error: error.message || "Error al conectar con el servidor de IA.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const optimizePrompt = async () => {
    if (!chatInput.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `Optimiza este prompt para un modelo de IA de imagen. Hazlo visualmente descriptivo, profesional y cinematográfico. Devuelve solo el prompt optimizado en inglés. Idea: "${chatInput}"` }] }]
      });
      setChatInput(response.text || chatInput);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `aerox-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  const handleSendAction = () => {
    if (!chatInput.trim()) return;
    const isEditing = selectedResult !== null;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    generateImage(chatInput, isEditing);
    setChatInput('');
  };

  return (
    <div className={cn(
      "flex h-screen bg-[#050505] text-white selection:bg-white selection:text-black font-sans overflow-hidden transition-colors duration-500",
      theme === 'light' && "bg-[#fafafa] text-black selection:bg-black selection:text-white"
    )}>
      
      {/* CONFIG MODAL */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setIsConfigOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={cn(
                "w-full max-w-lg bg-[#0c0c0c] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl",
                theme === 'light' && "bg-white border-black/5"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                   <h2 className="text-2xl font-bold flex items-center gap-3">
                      <Settings className="text-zinc-500" />
                      Ajustes
                   </h2>
                   <button onClick={() => setIsConfigOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-all">
                      <X size={24} />
                   </button>
                </div>

                <div className="space-y-6">
                  {/* Cuenta */}
                  <section className="space-y-4">
                    <h3 className={cn("text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500", theme === 'light' && "text-zinc-400")}>Cuenta</h3>
                    {!user ? (
                      <button 
                        onClick={handleLogin} 
                        disabled={isLoggingIn}
                        className="w-full flex items-center justify-center gap-3 p-4 bg-white text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isLoggingIn ? (
                          <Loader2 size={20} className="animate-spin" />
                        ) : (
                          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pwa_google_signin_light.png" className="w-5 h-5" alt="Google" />
                        )}
                        {isLoggingIn ? "Iniciando sesión..." : "Iniciar sesión con Google"}
                      </button>
                    ) : (
                      <div className={cn("flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5", theme === 'light' && "bg-black/5 border-black/5")}>
                        <img src={user.photoURL || ''} className="w-12 h-12 rounded-full border border-white/10" alt="Avatar" />
                        <div className="flex-1 min-w-0">
                           <p className="font-bold truncate">{user.displayName}</p>
                           <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                        </div>
                        <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all" title="Cerrar sesión">
                           <LogOut size={20} />
                        </button>
                      </div>
                    )}
                  </section>

                  {/* Apariencia */}
                  <section className="space-y-4">
                    <h3 className={cn("text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500", theme === 'light' && "text-zinc-400")}>Apariencia</h3>
                    <div className={cn("flex p-1 bg-[#050505] rounded-2xl border border-white/5", theme === 'light' && "bg-zinc-100 border-black/5")}>
                       <button 
                        onClick={() => setTheme('dark')}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all",
                          theme === 'dark' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                        )}
                       >
                          <Moon size={16} /> Oscuro
                       </button>
                       <button 
                        onClick={() => setTheme('light')}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all",
                          theme === 'light' ? "bg-white text-black shadow-xl" : "text-zinc-500 hover:text-zinc-300"
                        )}
                       >
                          <Sun size={16} /> Claro
                       </button>
                    </div>
                  </section>

                  {/* Información */}
                  <section className="pt-4 border-t border-white/5">
                     <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest font-bold">AeroX SaaS Preview • v1.2.0</p>
                  </section>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EXPAND MODAL */}
      <AnimatePresence>
        {expandedImageUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4"
            onClick={() => setExpandedImageUrl(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              className="relative max-w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={expandedImageUrl} alt="Expanded" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain ring-1 ring-white/10" />
              <div className="absolute top-4 right-4 flex gap-2">
                 <button onClick={() => handleDownload(expandedImageUrl)} className="p-3 bg-white/10 hover:bg-white text-white hover:text-black rounded-full transition-all group backdrop-blur-md">
                    <Download size={20} />
                 </button>
                 <button onClick={() => setExpandedImageUrl(null)} className="p-3 bg-white/10 hover:bg-white text-white hover:text-black rounded-full transition-all backdrop-blur-md">
                    <X size={20} />
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. SIDEBAR IZQUIERDA */}
      <aside className={cn(
        "flex flex-col border-r border-white/5 bg-[#080808]/50 backdrop-blur-3xl transition-all duration-500 z-50",
        theme === 'light' && "bg-white/80 border-black/5",
        sidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 bg-white rounded-lg flex items-center justify-center text-black font-black text-xl shadow-lg shadow-white/10 shrink-0 transition-all",
              theme === 'light' && "bg-black text-white shadow-black/10"
            )}>A</div>
            {sidebarOpen && <span className="font-bold tracking-tight text-lg">AeroX</span>}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto no-scrollbar">
          <SidebarItem active={activeTab === 'create'} onClick={() => { setActiveTab('create'); setSelectedResult(null); }} icon={<Brain size={20} />} label="Crear" collapsed={!sidebarOpen} dark={theme === 'dark'} />
          <SidebarItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={20} />} label="Historial" collapsed={!sidebarOpen} dark={theme === 'dark'} />
          <SidebarItem active={activeTab === 'inspiration'} onClick={() => setActiveTab('inspiration')} icon={<Lightbulb size={20} />} label="Inspiración" collapsed={!sidebarOpen} dark={theme === 'dark'} />
          
          <div className={cn("pt-4 mt-4 border-t border-white/5", theme === 'light' && "border-black/5")}>
             <button onClick={() => { setActiveTab('create'); setSelectedResult(null); setMessages([{ id: Date.now().toString(), role: 'assistant', content: 'Hola, ¿qué imagen quieres crear?', timestamp: Date.now() }]); }} className={cn(
               "w-full flex items-center gap-3 p-3.5 rounded-xl transition-all shadow-xl active:scale-95 font-bold",
               theme === 'dark' ? "bg-white text-black hover:scale-[1.02]" : "bg-black text-white hover:scale-[1.02]",
               !sidebarOpen && "justify-center"
             )}>
                <Plus size={20} />
                {sidebarOpen && <span>Nuevo Prompt</span>}
             </button>
          </div>
        </nav>

        <div className={cn("p-4 border-t border-white/5 space-y-1", theme === 'light' && "border-black/5")}>
          <SidebarItem icon={<Settings size={20} />} label="Ajustes" onClick={() => setIsConfigOpen(true)} collapsed={!sidebarOpen} dark={theme === 'dark'} />
          <SidebarItem icon={<HelpCircle size={20} />} label="Ayuda" collapsed={!sidebarOpen} dark={theme === 'dark'} />
          
          {user && sidebarOpen && (
             <div className="flex items-center gap-3 p-3 mt-4 rounded-xl bg-white/5 border border-white/5">
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" alt="User" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{user.displayName}</p>
                </div>
             </div>
          )}

          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center gap-3 p-3 text-zinc-500 hover:text-white transition-colors mt-2"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            {sidebarOpen && <span className="text-sm">Colapsar</span>}
          </button>
        </div>
      </aside>

      {/* 2. ÁREA CENTRAL */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-white/[0.04] to-transparent pointer-events-none" />
        <div className="flex-1 overflow-y-auto no-scrollbar p-8 relative flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              {activeTab === 'create' ? (
                <motion.div 
                  key="create"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full h-full flex flex-col items-center justify-center"
                >
                  {!selectedResult ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "group cursor-pointer relative w-full max-w-2xl aspect-[16/10] bg-[#0c0c0c] border-2 border-dashed border-white/5 rounded-[40px] flex flex-col items-center justify-center gap-6 transition-all hover:bg-[#0e0e0e] overflow-hidden",
                        theme === 'light' && "bg-zinc-50 border-black/5 hover:bg-zinc-100"
                      )}
                    >
                      <div className="absolute inset-0 bg-white/[0.01] opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className={cn("w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-zinc-500 group-hover:text-white group-hover:scale-110 transition-all", theme === 'light' && "bg-black/5 group-hover:text-black")}>
                        <Upload size={32} />
                      </div>
                      <div className="text-center space-y-2">
                         <h3 className="text-xl font-bold">Describe lo que quieres crear</h3>
                         <p className="text-zinc-500 text-sm">o arrastra una imagen para editarla con IA</p>
                      </div>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          const imgRes: ImageResult = { id: 'temp', url, prompt: 'Uploaded image', settings: { format: '1:1', quality: 'Alta', style: 'Cinemático', count: 1 }, timestamp: Date.now() };
                          setSelectedResult([imgRes]);
                        }
                      }} />
                    </div>
                  ) : (
                    <div className={cn(
                      "w-full h-full grid gap-6 p-4 place-items-center auto-rows-min",
                      selectedResult.length === 1 ? "grid-cols-1" : 
                      selectedResult.length === 2 ? "grid-cols-1 md:grid-cols-2" : 
                      "grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
                    )}>
                        {selectedResult.map((img) => (
                          <motion.div 
                            key={img.id}
                            layoutId={img.id}
                            className="relative group w-full h-full flex items-center justify-center"
                          >
                            <div className={cn(
                              "relative rounded-3xl md:rounded-[40px] overflow-hidden shadow-2xl border border-white/5 ring-1 ring-white/5 transition-transform duration-500 hover:scale-[1.01]",
                              theme === 'light' && "border-black/5 ring-black/5 shadow-black/5"
                            )}>
                                <img src={img.url} alt="Result" className="w-[90%] md:w-auto h-auto max-h-[70vh] object-contain mx-auto" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                                   <CanvasActionButton onClick={async () => {
                                      if (user) {
                                        await deleteDoc(doc(db, 'users', user.uid, 'history', img.id));
                                      }
                                      setSelectedResult(selectedResult.filter(r => r.id !== img.id).length === 0 ? null : selectedResult.filter(r => r.id !== img.id));
                                   }} icon={<Trash2 size={18} />} className="text-red-400 hover:bg-red-500 hover:text-white" />
                                   <CanvasActionButton onClick={() => handleDownload(img.url)} icon={<Download size={18} />} />
                                   <CanvasActionButton onClick={() => setExpandedImageUrl(img.url)} icon={<Maximize2 size={18} />} />
                                </div>
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  )}
                </motion.div>
              ) : activeTab === 'history' ? (
                <motion.div 
                  key="history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full h-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8 p-8 overflow-y-auto no-scrollbar"
                >
                  {history.map((img) => (
                    <HistoryCard key={img.id} image={img} theme={theme} onClick={() => { setSelectedResult([img]); setActiveTab('create'); }} />
                  ))}
                  {history.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center text-zinc-600 gap-4 opacity-50 h-full text-center">
                        <div className={cn("w-16 h-16 rounded-full bg-white/5 flex items-center justify-center", theme === 'light' && "bg-black/5")}>
                          <History size={32} />
                        </div>
                        <div className="space-y-1">
                          <span className="block font-bold uppercase tracking-widest text-[10px]">No hay creaciones recientes</span>
                          <p className="text-xs max-w-xs opacity-60">Tus imágenes generadas aparecerán aquí automáticamente.</p>
                        </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="inspiration" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                   <Lightbulb size={48} className="opacity-20" />
                   <p className="font-medium">Galería global en camino...</p>
                </motion.div>
              )}
            </AnimatePresence>
        </div>

        {/* 4. PANEL INFERIOR */}
        <div className={cn(
          "p-6 pb-10 bg-gradient-to-t from-[#050505] to-transparent",
          theme === 'light' && "from-[#fafafa]"
        )}>
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
               <ControlCard label="Formato" options={['1:1', '16:9', '9:16']} value={format} onChange={setFormat} theme={theme} />
               <ControlCard label="Calidad" options={['Normal', 'Alta', 'UHD']} value={quality} onChange={setQuality} theme={theme} />
               <ControlCard label="Estilo" options={['Realista', 'Anime', 'Cine', 'Dibujo']} value={style} onChange={setStyle} theme={theme} />
               <ControlCard label="Cantidad" options={[1, 2, 4]} value={count} onChange={setCount} theme={theme} />
            </div>
            <div className="flex items-center justify-center gap-3">
                <div className={cn("h-[1px] flex-1 bg-white/[0.03]", theme === 'light' && "bg-black/[0.03]")}></div>
                <span className={cn("text-[8px] font-black uppercase tracking-[0.6em] text-zinc-800", theme === 'light' && "text-zinc-300")}>AeroX AI Cloud Infrastructure</span>
                <div className={cn("h-[1px] flex-1 bg-white/[0.03]", theme === 'light' && "bg-black/[0.03]")}></div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. PANEL DERECHO */}
      <aside className={cn(
        "w-96 flex flex-col border-l border-white/5 bg-[#080808]/80 backdrop-blur-3xl p-6 gap-6 relative transition-all duration-500",
        theme === 'light' && "bg-white/90 border-black/5"
      )}>
        <header className="flex items-center justify-between">
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
              <h2 className="font-bold text-xs tracking-tight">Estado: Online</h2>
           </div>
           <button onClick={() => setIsConfigOpen(true)} className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
             <Settings size={18} />
           </button>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
           <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex flex-col gap-1.5 max-w-[90%]",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className={cn(
                    "px-4 py-3 rounded-[20px] text-[13px] leading-relaxed",
                    msg.role === 'user' 
                      ? (theme === 'dark' ? "bg-white text-black font-semibold shadow-lg shadow-white/5" : "bg-black text-white font-semibold shadow-lg shadow-black/5")
                      : (theme === 'dark' ? "bg-white/[0.03] text-zinc-300 border border-white/5" : "bg-black/[0.03] text-zinc-800 border border-black/5")
                  )}>
                    {msg.content}
                  </div>
                  {msg.error && (
                    <div className="px-3 py-2 bg-red-400/10 border border-red-400/20 text-red-400 text-[10px] rounded-xl font-medium animate-shake">
                      {msg.error}
                    </div>
                  )}
                  <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest pl-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </motion.div>
              ))}
              {isGenerating && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 text-zinc-500">
                   <Loader2 size={14} className={cn("animate-spin", theme === 'dark' ? "text-white" : "text-black")} />
                   <span className="text-[9px] font-black uppercase tracking-[0.3em] animate-pulse">Generando Imagen...</span>
                </motion.div>
              )}
           </AnimatePresence>
           <div ref={chatEndRef} />
        </div>

        <div className="space-y-4">
           {selectedResult && (
             <div className={cn(
               "p-3 rounded-2xl border flex items-center gap-3 group animate-in slide-in-from-bottom-2",
               theme === 'dark' ? "bg-white/[0.03] border-white/5" : "bg-black/[0.03] border-black/5"
             )}>
                <img src={selectedResult[0].url} className="w-10 h-10 rounded-lg object-cover ring-1 ring-white/10" />
                <div className="flex-1 min-w-0">
                   <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Smart Editor Activado</p>
                   <p className="text-[11px] text-zinc-400 truncate opacity-80">Escribe cambios para ajustar...</p>
                </div>
                <button onClick={() => setSelectedResult(null)} className="text-zinc-500 hover:text-white p-1 hover:bg-white/5 rounded-lg transition-all"><X size={16} /></button>
             </div>
           )}

           <div className="relative group">
              <div className="absolute inset-0 bg-white/5 blur-2xl group-focus-within:bg-white/10 transition-all opacity-0 group-focus-within:opacity-100" />
              <div className={cn(
                "relative bg-[#0c0c0c] border border-white/5 rounded-[24px] p-2.5 shadow-2xl focus-within:border-white/20 transition-all",
                theme === 'light' && "bg-white border-black/10 focus-within:border-black/20"
              )}>
                <textarea 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendAction();
                    }
                  }}
                  placeholder={selectedResult ? "Ej: hazlo de noche, cambia fondo..." : "Escribe tu visión creativa..."}
                  className={cn(
                    "w-full bg-transparent p-3 text-[13px] outline-none min-h-[90px] resize-none placeholder:text-zinc-700 leading-relaxed",
                    theme === 'light' && "text-black"
                  )}
                />
                <div className="flex items-center justify-between gap-2 mt-2 px-1">
                  <div className="flex items-center gap-1">
                     <ChatToolBtn icon={<Paperclip size={14} />} />
                     <ChatToolBtn icon={<AtSign size={14} />} />
                     <ChatToolBtn icon={<Command size={14} />} onClick={() => fileInputRef.current?.click()} />
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                      onClick={optimizePrompt}
                      disabled={!chatInput || isGenerating}
                      className={cn(
                        "p-2.5 rounded-xl transition-all disabled:opacity-20 hover:scale-105 active:scale-95",
                        theme === 'dark' ? "bg-white/5 text-zinc-400 hover:text-white" : "bg-black/5 text-zinc-500 hover:text-black"
                      )}
                      title="Optimizar prompt con IA"
                     >
                        <Sparkles size={16} />
                     </button>
                     <button 
                      onClick={handleSendAction}
                      disabled={!chatInput || isGenerating}
                      className={cn(
                        "p-2.5 rounded-xl hover:scale-110 active:scale-90 transition-all shadow-xl disabled:opacity-20",
                        theme === 'dark' ? "bg-white text-black shadow-white/5" : "bg-black text-white shadow-black/5"
                      )}
                     >
                        <ArrowRight size={18} />
                     </button>
                  </div>
                </div>
              </div>
           </div>
        </div>
      </aside>

      <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/5 blur-[180px] pointer-events-none transition-opacity" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/5 blur-[150px] pointer-events-none transition-opacity" />
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, collapsed, dark = true }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void; collapsed?: boolean; dark?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3.5 rounded-xl transition-all group",
        active 
          ? (dark ? "bg-white text-black font-bold shadow-lg shadow-white/5" : "bg-black text-white font-bold shadow-lg shadow-black/5")
          : (dark ? "text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.04]" : "text-zinc-500 hover:text-black hover:bg-black/[0.04]"),
        collapsed && "justify-center"
      )}
    >
      <div className={cn("shrink-0 transition-transform group-hover:scale-110", active ? (dark ? "text-black" : "text-white") : "text-zinc-500 group-hover:text-zinc-100")}>
        {icon}
      </div>
      {!collapsed && <span className="text-sm tracking-tight">{label}</span>}
      {active && !collapsed && <div className={cn("ml-auto w-1 h-1 rounded-full", dark ? "bg-black" : "bg-white")} />}
    </button>
  );
}

function ControlCard({ label, options, value, onChange, theme = 'dark' }: { label: string; options: any[]; value: any; onChange: (v: any) => void; theme?: 'dark' | 'light' }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className={cn("text-[9px] font-black uppercase tracking-[0.5em] text-zinc-700 pl-2", theme === 'light' && "text-zinc-400")}>{label}</span>
      <div className={cn("flex bg-[#0c0c0c] border border-white/5 p-1 rounded-2xl w-full shadow-inner relative overflow-hidden", theme === 'light' && "bg-zinc-100 border-black/5 shadow-white")}>
        {options.map((opt) => (
          <button 
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "flex-1 py-3 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all truncate px-1",
              value === opt 
                ? (theme === 'dark' ? "bg-white text-black shadow-2xl scale-[1.02] z-10" : "bg-black text-white shadow-2xl scale-[1.02] z-10")
                : "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.02]"
            )}
            title={opt.toString()}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryCard({ image, onClick, theme = 'dark' }: { image: ImageResult; onClick: () => void; theme?: 'dark' | 'light' }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -6, scale: 1.02 }}
      onClick={onClick}
      className={cn(
        "group cursor-pointer relative aspect-square rounded-[32px] overflow-hidden border shadow-2xl ring-1 transition-all duration-300",
        theme === 'dark' ? "bg-[#0c0c0c] border-white/5 ring-white/5" : "bg-white border-black/5 ring-black/5 shadow-black/5"
      )}
    >
      <img src={image.url} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6 backdrop-blur-[2px]">
         <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/70">{image.settings.style}</span>
            <span className="px-2 py-0.5 bg-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/70">{image.settings.format}</span>
         </div>
         <p className="text-[12px] text-zinc-100 line-clamp-2 leading-relaxed font-medium">{image.prompt}</p>
      </div>
    </motion.div>
  );
}

function CanvasActionButton({ icon, className, onClick }: { icon: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        "w-12 h-12 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center text-zinc-300 hover:text-black hover:bg-white hover:scale-110 transition-all active:scale-90",
        className
      )}
    >
      {icon}
    </button>
  );
}

function ChatToolBtn({ icon, onClick }: { icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.05] transition-all active:scale-95">
      {icon}
    </button>
  );
}


