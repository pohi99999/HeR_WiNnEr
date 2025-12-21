
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
type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
type Note = { id: string; title: string; content: string; date: string; tag: string };

// --- MOCK DATA ---
const MOCK_TRANSACTIONS = [
    { id: '1', title: 'Bevétel: Projekt X', amount: 850000, type: 'income', category: 'Munka', date: '2024-05-15' },
    { id: '2', title: 'Étterem: Fine Dining', amount: -42000, type: 'expense', category: 'Életstílus', date: '2024-05-14' },
    { id: '3', title: 'Apple előfizetés', amount: -3500, type: 'expense', category: 'Tech', date: '2024-05-14' },
    { id: '4', title: 'Benzin kártya', amount: -18000, type: 'expense', category: 'Utazás', date: '2024-05-13' },
];

const MOCK_EVENTS = [
    { id: '1', time: '09:00', title: 'Befektetői Meeting', type: 'high' },
    { id: '2', time: '11:30', title: 'Product Review', type: 'med' },
    { id: '3', time: '14:00', title: 'Gym session', type: 'low' },
];

// --- COMPONENTS ---
const Icon = ({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) => (
  <span className={`material-symbols-outlined ${className || ''}`} style={style}>{name}</span>
);

// --- FINANCE VIEW ---
const FinanceView = () => {
  const totalBalance = MOCK_TRANSACTIONS.reduce((acc, t) => acc + t.amount, 0);
  const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="view-container">
      <header className="view-header">
        <h2>Pénzügyek</h2>
        <button className="icon-btn"><Icon name="add" /></button>
      </header>
      
      <div className="glass-panel balance-card" style={{ marginBottom: '24px', textAlign: 'center', background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Összesített Egyenleg</span>
        <h1 style={{ margin: '10px 0', fontSize: '32px' }}>{formatCurrency(totalBalance)}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', fontSize: '12px' }}>
            <span style={{ color: 'var(--success)' }}>↑ 12% hó/hó</span>
            <span style={{ color: 'var(--text-muted)' }}>Május</span>
        </div>
      </div>

      <div className="section-title">Legutóbbi tranzakciók</div>
      <div className="transaction-list">
        {MOCK_TRANSACTIONS.map(t => (
          <div key={t.id} className="transaction-item glass-panel" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div className="card-icon" style={{ background: t.amount > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: t.amount > 0 ? 'var(--success)' : '#ef4444' }}>
              <Icon name={t.amount > 0 ? "trending_up" : "trending_down"} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600' }}>{t.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.category} • {t.date}</div>
            </div>
            <div style={{ fontWeight: '700', color: t.amount > 0 ? 'var(--success)' : 'white' }}>
              {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- PLANNER VIEW ---
const PlannerView = () => {
  const [selectedDay, setSelectedDay] = useState(15);
  const days = Array.from({ length: 7 }, (_, i) => 12 + i);

  return (
    <div className="view-container">
      <header className="view-header">
        <h2>Naptár</h2>
        <Icon name="calendar_month" />
      </header>

      <div className="days-scroller hide-scrollbar" style={{ marginBottom: '30px' }}>
        {days.map(d => (
          <div key={d} className={`day-chip ${selectedDay === d ? 'active' : ''}`} onClick={() => setSelectedDay(d)}>
            <span className="day-name">{d === 15 ? 'Ma' : 'Sze'}</span>
            <span className="num">{d}</span>
          </div>
        ))}
      </div>

      <div className="section-title">Mai program</div>
      <div className="timeline">
        {MOCK_EVENTS.map(ev => (
          <div key={ev.id} className="event-card glass-panel" style={{ marginBottom: '15px', display: 'flex', gap: '15px', borderLeft: `4px solid var(--${ev.type === 'high' ? 'danger' : ev.type === 'med' ? 'primary' : 'success'})` }}>
            <div style={{ fontWeight: '700', color: 'var(--text-muted)', minWidth: '50px' }}>{ev.time}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600' }}>{ev.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Zoom • San Francisco (GMT-8)</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- NOTES VIEW ---
const NotesView = () => {
    const [notes, setNotes] = useState<Note[]>([
        { id: '1', title: 'Befektetői ötletek', content: 'Hangsúlyozni kell a Gemini Live API integrációt.', date: 'Ma', tag: 'Üzlet' },
        { id: '2', title: 'Bevásárlólista', content: 'Tej, Kenyér, Kávé, Protein.', date: 'Tegnap', tag: 'Személyes' },
    ]);

    const summarizeNote = async (id: string) => {
        const note = notes.find(n => n.id === id);
        if (!note) return;
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Foglald össze röviden ezt a jegyzetet: ${note.content}`
        });
        
        alert("AI Összefoglaló: " + response.text);
    };

    return (
        <div className="view-container">
            <header className="view-header">
                <h2>Jegyzetek</h2>
                <button className="icon-btn"><Icon name="edit_note" /></button>
            </header>
            
            <div className="notes-grid">
                {notes.map(n => (
                    <div key={n.id} className="glass-panel note-card" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span className="tag">{n.tag}</span>
                            <button onClick={() => summarizeNote(n.id)} className="ai-tiny-btn">
                                <Icon name="auto_awesome" style={{ fontSize: '14px' }} />
                            </button>
                        </div>
                        <h4 style={{ margin: '0 0 8px 0' }}>{n.title}</h4>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{n.content}</p>
                        <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--text-muted)' }}>{n.date}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

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
      alert("Hiba történt. Ellenőrizze az API kulcsot!");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="view-container creative-view">
      <header className="view-header">
        <h2>Kreatív Stúdió</h2>
        <Icon name="palette" />
      </header>
      
      <div className="glass-panel" style={{marginBottom: '20px'}}>
        <textarea 
          placeholder="Pl: Egy neon cyberpunk város esőben, 4k..." 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{width: '100%', background: 'transparent', border: 'none', color: 'white', minHeight: '80px', outline: 'none', resize: 'none', fontSize: '15px'}}
        />
        <div className="aspect-ratio-selector">
          {(["1:1", "3:4", "4:3", "9:16", "16:9"] as AspectRatio[]).map(ratio => (
            <button key={ratio} className={aspectRatio === ratio ? 'active' : ''} onClick={() => setAspectRatio(ratio)}>{ratio}</button>
          ))}
        </div>
        <button className="ai-analysis-btn" style={{width: '100%', marginTop: '15px'}} onClick={generateImage} disabled={isGenerating}>
          {isGenerating ? 'Generálás...' : 'AI Kép Létrehozása'}
        </button>
      </div>

      {generatedImageUrl && (
        <div className="glass-panel fade-in" style={{padding: '10px', display: 'flex', justifyContent: 'center'}}>
          <img src={generatedImageUrl} alt="Generated" style={{maxWidth: '100%', borderRadius: '12px'}} />
        </div>
      )}
    </div>
  );
};

// --- AI ASSISTANT VIEW ---
const AiAssistantView = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: '0', role: 'model', text: 'Szia! HeR vagyok. Miben segíthetek ma?' }]);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const ctx = outCtxRef.current || new AudioContext({sampleRate: 24000});
        outCtxRef.current = ctx;
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (e) { console.error(e); }
  };

  const handleNearbySearch = async () => {
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Milyen exkluzív helyek vannak itt a közelben?",
        config: { tools: [{ googleMaps: {} }], toolConfig: { retrievalConfig: { latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } } } }
      });
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: response.text || '', grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks }]);
      setIsLoading(false);
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text }]);
    setInputText('');
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: text });
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: response.text || '' }]);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  return (
    <div className="view-container chat-view">
      <header className="view-header">
        <h2>Intelligens Chat</h2>
        <div style={{display: 'flex', gap: '8px'}}>
           <button className={`icon-btn ${isLive ? 'live-active' : ''}`}><Icon name="mic" /></button>
           <button className="icon-btn" onClick={handleNearbySearch}><Icon name="location_on" /></button>
        </div>
      </header>

      <div className="chat-messages custom-scrollbar">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
              {msg.grounding && (
                <div className="grounding-links">
                  {msg.grounding.map((chunk, i) => <a key={i} href={chunk.web?.uri || chunk.maps?.uri} target="_blank">{chunk.web?.title || chunk.maps?.title}</a>)}
                </div>
              )}
              {msg.role === 'model' && <button className="tts-btn" onClick={() => speakText(msg.text)}><Icon name="volume_up" /></button>}
            </div>
          </div>
        ))}
        {isLoading && <div className="typing-indicator"><span></span><span></span><span></span></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area glass-panel">
        <input placeholder="Kérdezz bármit..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)} />
        <button onClick={() => sendMessage(inputText)} className="send-btn"><Icon name="send" /></button>
      </div>
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
    const [view, setView] = useState<'planner' | 'finance' | 'creative' | 'notes' | 'ai'>('ai');

    const renderView = () => {
        switch(view) {
            case 'planner': return <PlannerView />;
            case 'finance': return <FinanceView />;
            case 'creative': return <CreativeView />;
            case 'notes': return <NotesView />;
            case 'ai': return <AiAssistantView />;
            default: return <AiAssistantView />;
        }
    }

    return (
        <div className="app-shell">
            <div className="content-area">
                {renderView()}
            </div>
            
            <nav className="bottom-nav">
                <button className={`nav-item ${view === 'planner' ? 'active' : ''}`} onClick={() => setView('planner')}>
                    <Icon name="calendar_today" /><span>Naptár</span>
                </button>
                <button className={`nav-item ${view === 'finance' ? 'active' : ''}`} onClick={() => setView('finance')}>
                    <Icon name="wallet" /><span>Pénz</span>
                </button>
                <button className={`nav-item ${view === 'ai' ? 'active' : ''}`} onClick={() => setView('ai')}>
                    <div className="ai-nav-glow"><Icon name="smart_toy" /></div>
                </button>
                <button className={`nav-item ${view === 'notes' ? 'active' : ''}`} onClick={() => setView('notes')}>
                    <Icon name="description" /><span>Jegyzet</span>
                </button>
                <button className={`nav-item ${view === 'creative' ? 'active' : ''}`} onClick={() => setView('creative')}>
                    <Icon name="auto_awesome" /><span>Alkotás</span>
                </button>
            </nav>
        </div>
    );
};

const root = document.getElementById('root');
if (root) { createRoot(root).render(<App />); }
