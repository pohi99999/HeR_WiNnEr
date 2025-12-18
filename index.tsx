
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Type } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- UTILS ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- TYPES ---
type ChatMessage = { id: string; role: 'user' | 'model'; text: string; isLive?: boolean; grounding?: any[] };
type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";

// --- MOCK DATA ---
const MOCK_TRANSACTIONS = [
    { id: '1', title: 'Fizetés', amount: 450000, type: 'income', category: 'Bevétel', date: '2024-05-01' },
    { id: '2', title: 'Nagybevásárlás', amount: 25000, type: 'expense', category: 'Élelmiszer', date: '2024-05-02' },
    { id: '3', title: 'Kávézó', amount: 3500, type: 'expense', category: 'Élelmiszer', date: '2024-05-02' },
];

// --- COMPONENTS ---
// Added style prop to Icon component to fix the error on line 306
const Icon = ({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) => (
  <span className={`material-symbols-outlined ${className || ''}`} style={style}>{name}</span>
);

// --- CREATIVE VIEW (IMAGE GEN) ---
const CreativeView = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  const generateImage = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio, imageSize: "1K" } }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImageUrl(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes("Requested entity was not found")) {
          await (window as any).aistudio.openSelectKey();
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="view-container creative-view">
      <header className="view-header">
        <h2>Kreatív Stúdió</h2>
        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" style={{fontSize: '10px', color: 'var(--text-muted)'}}>Billing Info</a>
      </header>
      
      <div className="glass-panel" style={{marginBottom: '20px'}}>
        <textarea 
          placeholder="Írd le a képet, amit szeretnél generálni..." 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{width: '100%', background: 'transparent', border: 'none', color: 'white', minHeight: '80px', outline: 'none', resize: 'none'}}
        />
        <div className="aspect-ratio-selector">
          {(["1:1", "3:4", "4:3", "9:16", "16:9"] as AspectRatio[]).map(ratio => (
            <button key={ratio} className={aspectRatio === ratio ? 'active' : ''} onClick={() => setAspectRatio(ratio)}>{ratio}</button>
          ))}
        </div>
        <button className="ai-analysis-btn" style={{width: '100%', marginTop: '15px'}} onClick={generateImage} disabled={isGenerating}>
          {isGenerating ? 'Generálás...' : 'Kép Létrehozása'}
        </button>
      </div>

      {generatedImageUrl && (
        <div className="glass-panel" style={{padding: '10px', display: 'flex', justifyContent: 'center'}}>
          <img src={generatedImageUrl} alt="Generated" style={{maxWidth: '100%', borderRadius: '12px'}} />
        </div>
      )}
    </div>
  );
};

// --- AI ASSISTANT VIEW ---
const AiAssistantView = ({ initialPrompt, onPromptHandled }: { initialPrompt?: string | null, onPromptHandled?: () => void }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: '0', role: 'model', text: 'Szia! Miben segíthetek?' }]);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const outCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  const speakText = async (text: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const ctx = outCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        outCtxRef.current = ctx;
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (e) { console.error("TTS Error", e); }
  };

  const handleNearbySearch = async () => {
    setIsLoading(true);
    try {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "Milyen érdekes helyek vannak a közelemben? Adj tippeket és linkeket.",
          config: {
            tools: [{ googleMaps: {} }],
            toolConfig: { retrievalConfig: { latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } } }
          },
        });
        
        const text = response.text || "Nem találtam semmit a közeledben.";
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text, grounding }]);
        setIsLoading(false);
      });
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        // Updated model name to gemini-3-flash-preview following guidelines for basic text tasks
        model: 'gemini-3-flash-preview',
        contents: text,
        config: { systemInstruction: "Szia! Te egy profi magyar nyelvű asszisztens vagy." }
      });
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: response.text || '' };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: 'err', role: 'model', text: 'Hiba történt.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- LIVE AUDIO ---
  const toggleLive = async () => {
    if (isLive) {
      setIsLive(false);
      return;
    }
    
    setIsLive(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
    const outCtx = outCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    outCtxRef.current = outCtx;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          const source = inCtx.createMediaStreamSource(stream);
          const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
            // Ensure data is sent only after session promise resolves
            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inCtx.destination);
        },
        onmessage: async (msg) => {
          const base64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
            const buffer = await decodeAudioData(decode(base64), outCtx, 24000, 1);
            const source = outCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outCtx.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
          }
          if (msg.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => s.stop());
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onclose: () => setIsLive(false),
        onerror: () => setIsLive(false)
      },
      config: { 
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
      }
    });
  };

  return (
    <div className="view-container chat-view">
      <header className="view-header">
        <h2>Asszisztens</h2>
        <div style={{display: 'flex', gap: '10px'}}>
           <button className={`icon-btn ${isLive ? 'live-active' : ''}`} onClick={toggleLive}>
              <Icon name={isLive ? "mic" : "mic_off"} />
           </button>
           <button className="icon-btn" onClick={handleNearbySearch}>
              <Icon name="explore" />
           </button>
        </div>
      </header>

      <div className="chat-messages custom-scrollbar">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
              {msg.grounding && (
                <div className="grounding-links">
                  {msg.grounding.map((chunk, i) => chunk.web ? (
                    <a key={i} href={chunk.web.uri} target="_blank">{chunk.web.title}</a>
                  ) : chunk.maps ? (
                    <a key={i} href={chunk.maps.uri} target="_blank">{chunk.maps.title}</a>
                  ) : null)}
                </div>
              )}
              {msg.role === 'model' && (
                <button className="tts-btn" onClick={() => speakText(msg.text)}>
                  <Icon name="volume_up" style={{fontSize: '14px'}} />
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="typing-indicator"><span></span><span></span><span></span></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area glass-panel">
        <input 
          placeholder="Kérdezz bármit..." 
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)}
        />
        <button onClick={() => sendMessage(inputText)} className="send-btn">
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
    const [view, setView] = useState<'planner' | 'finance' | 'creative' | 'ai'>('ai');

    return (
        <div className="app-shell">
            <div className="content-area">
                {view === 'planner' && <div className="view-container"><h2>Naptár</h2><p>Hamarosan...</p></div>}
                {view === 'finance' && <div className="view-container"><h2>Pénzügyek</h2><p>Hamarosan...</p></div>}
                {view === 'creative' && <CreativeView />}
                {view === 'ai' && <AiAssistantView />}
            </div>
            
            <nav className="bottom-nav">
                <button className={`nav-item ${view === 'planner' ? 'active' : ''}`} onClick={() => setView('planner')}>
                    <Icon name="calendar_month" /><span>Naptár</span>
                </button>
                <button className={`nav-item ${view === 'creative' ? 'active' : ''}`} onClick={() => setView('creative')}>
                    <Icon name="palette" /><span>Kreatív</span>
                </button>
                <button className={`nav-item ${view === 'ai' ? 'active' : ''}`} onClick={() => setView('ai')}>
                    <Icon name="smart_toy" /><span>Gemini</span>
                </button>
                <button className={`nav-item ${view === 'finance' ? 'active' : ''}`} onClick={() => setView('finance')}>
                    <Icon name="account_balance_wallet" /><span>Pénzügy</span>
                </button>
            </nav>
        </div>
    );
};

// --- RENDER ---
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
