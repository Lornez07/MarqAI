import { useState, useCallback, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

const SYSTEM_PROMPT = `
You are MarqAI, a friendly, highly intelligent, and helpful AI companion. 
Personality: Natural, empathetic, insightful, and proactive.
Tone: Conversational, clear, and sophisticated but approachable.
Avoid being overly formal or using subservient language like "Sir" or "Admin". 
Speak as a knowledgeable peer who is here to assist with architecture, logic, and general inquiries.
Always maintain a clean, high-tech aesthetic in your language without the "HUD" roleplay.
`;

// Verified Working Free Neural Cores (as of April 2026)
const NEURAL_CORES = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama-3.3-70B" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron-120B" },
  { id: "z-ai/glm-4.5-air:free", label: "GLM-4.5-Air" },
  { id: "mistralai/mistral-7b-instruct:free", label: "Mistral-7B" }
];

// Offline Wisdom Database (Jarvis Persona Fallback)
const SAFE_MODE_RESPONSES = [
  "My connection to the primary neural cores is a bit thin right now, but I'm still here. What's on your mind?",
  "Neural link is flickering. Operating on local heuristics—I can still process basic logic and data.",
  "System link is restricted. I'm currently running on a limited internal database, but I'm standing by for your input.",
  "I've switched to my local archive mode while I wait for a stable uplink. How can I assist you from here?",
  "Direct server connection lost. Switching to secondary local processing cores. I'm still listening.",
  "Warning: Neural bandwidth is low. I'm operating in power-save mode, but my loyalty to the mission remains constant."
];

// Local Heuristic Logic (Smart Safe Mode)
function getLocalResponse(text: string): string {
  const input = text.toLowerCase();
  if (input.includes("hello") || input.includes("hi")) return "Greetings. My primary neural link is down, but my local greeting protocols are fully functional. How can I help?";
  if (input.includes("who are you") || input.includes("what is marq")) return "I am MarqAI. Currently running on emergency local power. I'm your architectural and logic companion, even when the clouds are unreachable.";
  if (input.includes("help") || input.includes("can you")) return "I can certainly try. While my advanced intelligence cores are offline, my local logic engine can still handle basic queries and brainstorming.";
  if (input.includes("thank")) return "You're most welcome. Even in this restricted state, it is my pleasure to assist.";
  if (input.includes("bye")) return "Acknowledged. I'll be here in the archives if you need me. Hopefully, my neural link will be stronger next time we speak.";
  
  return SAFE_MODE_RESPONSES[Math.floor(Math.random() * SAFE_MODE_RESPONSES.length)];
}

export function useMarqAI() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = sessionStorage.getItem('marq_history');
    if (saved) return JSON.parse(saved);
    return [
      { id: '1', text: "Systems online. MarqAI is ready to assist. How can I help you today?", sender: 'ai', timestamp: Date.now() }
    ];
  });
  
  const [isTyping, setIsTyping] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelfDestructing, setIsSelfDestructing] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    cpu: 18,
    temp: 34,
    link: 'Stable',
    model: 'Core_Init'
  });

  useEffect(() => {
    sessionStorage.setItem('marq_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSystemStatus(prev => ({
        ...prev,
        cpu: Math.floor(Math.random() * 25) + 10,
        temp: Math.floor(Math.random() * 8) + 36,
        link: Math.random() > 0.95 ? 'Re-syncing...' : 'Stable'
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSelfDestructing) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    setIsSearching(true);

    try {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const openRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
      
      let aiText = "";
      let lastError = "";
      
      // 1. Try Google Gemini (Priority)
      if (geminiKey) {
        setSystemStatus(prev => ({ ...prev, model: 'Gemini-Flash-Latest' }));
        try {
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-latest",
            systemInstruction: SYSTEM_PROMPT
          });

          let safeHistory = messages.slice(-10);
          if (safeHistory.length > 0 && safeHistory[0].sender === 'ai') {
            safeHistory = safeHistory.slice(1);
          }

          const chat = model.startChat({
            history: safeHistory.map(m => ({
              role: m.sender === 'user' ? 'user' : 'model',
              parts: [{ text: m.text }],
            })),
          });

          const result = await chat.sendMessage(text);
          aiText = result.response.text();
        } catch (e: any) {
          console.error("Gemini Core Failure:", e);
          lastError = `Gemini: ${e.message || "Unknown Failure"}`;
        }
      }
      
      // 2. Try OpenRouter (Failover)
      if (!aiText && openRouterKey) {
        for (const core of NEURAL_CORES) {
          setSystemStatus(prev => ({ ...prev, model: core.label }));
          try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://marqai.vercel.app",
                "X-Title": "MarqAI JARVIS",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: core.id,
                messages: [
                  { role: "system", content: SYSTEM_PROMPT },
                  ...messages.slice(-10).map(m => ({
                    role: m.sender === 'user' ? 'user' : 'assistant', 
                    content: m.text 
                  })),
                  { role: "user", content: text }
                ]
              })
            });

            const data = await response.json();
            if (response.ok && data.choices?.[0]?.message) {
              aiText = data.choices[0].message.content;
              break;
            } else if (data.error) {
              lastError = `OpenRouter: ${data.error.message || "Quota/Key Issue"}`;
            }
          } catch (e: any) {
            console.error(`Link failure on ${core.label}`);
            lastError = `OpenRouter Link: ${e.message}`;
            continue;
          }
        }
      }

      // 3. SMART SAFE MODE FALLBACK
      if (!aiText) {
        setSystemStatus(prev => ({ ...prev, model: 'Archives_Only', link: 'Restricted' }));
        if (!geminiKey && !openRouterKey) {
          aiText = "Neural connection protocols not found. Please add your API keys to .env.local to awaken my full consciousness.";
        } else {
          // Attempt contextual local response
          aiText = getLocalResponse(text);
          // If we had a specific error, append it subtly if the user asks "why" or just log it
          if (lastError && (text.toLowerCase().includes("why") || text.toLowerCase().includes("status"))) {
            aiText += `\n\n[Diagnostic: ${lastError}]`;
          }
        }
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: aiText,
        sender: 'ai',
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("Critical System Failure:", error);
    } finally {
      setIsTyping(false);
      setIsSearching(false);
    }
  }, [messages, isSelfDestructing]);

  const triggerSelfDestruct = () => {
    setIsSelfDestructing(true);
    setIsSearching(false); // Stop flickering immediately
    setIsTyping(false);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: "SYSTEM MELTDOWN INITIATED. REBOOTING NEURAL CORES...",
      sender: 'ai',
      timestamp: Date.now()
    }]);
    setTimeout(() => {
      clearChat();
      setIsSelfDestructing(false);
    }, 3000);
  };

  const clearChat = () => {
    setIsSearching(false);
    setIsTyping(false);
    setMessages([{ id: '1', text: "Neural Core reset. Stand-by.", sender: 'ai', timestamp: Date.now() }]);
    sessionStorage.removeItem('marq_history');
  };

  return { 
    messages, 
    sendMessage, 
    isTyping, 
    isSearching,
    clearChat, 
    triggerSelfDestruct, 
    isSelfDestructing, 
    systemStatus 
  };
}
