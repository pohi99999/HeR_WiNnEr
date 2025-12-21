
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, Type, FunctionDeclaration, LiveServerMessage } from "@google/genai";
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
type ChatMessage = { id: string; role: 'user' | 'model'; text: string; grounding?: any[] };
type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
type FinancialRecord = { id: string; name: string; amount: number; date: string; comment: string; category: string };
type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

// --- COMPONENTS ---
const Icon = ({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) => (
  <span className={`material-symbols-outlined ${className || ''}`} style={style}>{name}</span>
);

const BrandHeader = () => (
    <div className="brand-header">
        <span className="brand-text">HeR WiNnEr</span>
        <div className="brand-dot"></div>
    </div>
);

// --- MODAL EDITOR ---
const EditRecordModal = ({ record, onSave, onDelete, onClose }: { 
    record: FinancialRecord, 
    onSave: (r: FinancialRecord) => void, 
    onDelete: (id: string) => void,
    onClose: () => void 
}) => {
    const [formData, setFormData] = useState<FinancialRecord>({ ...record });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: name === 'amount' ? parseFloat(value) || 0 : value 
        }));
    };

    return (
        <div className="modal-overlay fade-in" onClick={onClose}>
            <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <h3>Szerkesztés</h3>
                    <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
                </header>
                
                <div className="modal-body">
                    <div className="input-group">
                        <label>Megnevezés</label>
                        <input name="name" value={formData.name} onChange={handleChange} placeholder="Pl. Élelmiszer" />
                    </div>
                    
                    <div className="input-group">
                        <label>Összeg (HUF)</label>
                        <input name="amount" type="number" value={formData.amount} onChange={handleChange} placeholder="Pl. -5000" />
                    </div>

                    <div className="input-group">
                        <label>Dátum</label>
                        <input name="date" type="date" value={formData.date} onChange={handleChange} />
                    </div>

                    <div className="input-group">
                        <label>Kategória</label>
                        <select name="category" value={formData.category} onChange={handleChange}>
                            <option value="Étel">Étel</option>
                            <option value="Utazás">Utazás</option>
                            <option value="Tech">Tech</option>
                            <option value="Lakhatás">Lakhatás</option>
                            <option value="Szórakozás">Szórakozás</option>
                            <option value="Munka">Munka</option>
                            <option value="Egyéb">Egyéb</option>
                        </select>
                    </div>

                    <div className="input-group">
                        <label>Megjegyzés</label>
                        <textarea name="comment" value={formData.comment} onChange={handleChange} placeholder="További részletek..." />
                    </div>
                </div>

                <footer className="modal-footer">
                    <button className="delete-btn" onClick={() => { onDelete(record.id); onClose(); }}>
                        <Icon name="delete" /> Törlés
                    </button>
                    <button className="save-btn" onClick={() => { onSave(formData); onClose(); }}>
                        Mentés
                    </button>
                </footer>
            </div>
        </div>
    );
};

// --- DASHBOARD VIEW ---
const DashboardView = ({ records }: { records: FinancialRecord[] }) => {
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);

    const income = records.filter(r => r.amount > 0).reduce((acc, r) => acc + r.amount, 0);
    const expenses = Math.abs(records.filter(r => r.amount < 0).reduce((acc, r) => acc + r.amount, 0));
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    const healthScore = Math.max(0, Math.min(100, Math.round(savingsRate + 50)));

    const requestAiAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Íme a pénzügyi adataim (Név, Összeg, Kategória): ${records.map(r => `${r.name}: ${r.amount} Ft (${r.category})`).join(', ')}. 
            Kérlek elemezd a pénzügyi helyzetemet profi tanácsadóként. Emeld ki a legnagyobb kiadásokat és adj 3 konkrét tippet a spórolásra. Tömör légy.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: prompt
            });
            setAnalysis(response.text || 'Nem sikerült elemezni.');
        } catch (e) {
            setAnalysis('Hiba történt az elemzés során.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="view-container">
            <header className="view-header">
                <h2>Vezérlőpult</h2>
                <Icon name="dashboard" />
            </header>

            <div className="glass-panel health-card" style={{ marginBottom: '20px', textAlign: 'center', padding: '20px' }}>
                <div className="health-score-container">
                    <svg viewBox="0 0 36 36" className="circular-chart">
                        <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="circle" strokeDasharray={`${healthScore}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <text x="18" y="20.35" className="percentage">{healthScore}%</text>
                    </svg>
                </div>
                <h3 style={{ margin: '10px 0 5px 0' }}>Pénzügyi Egészség</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>A megtakarítási rátád: {savingsRate.toFixed(1)}%</p>
            </div>

            <div className="summary-grid">
                <div className="summary-card glass-panel">
                    <span className="label">Havi Bevétel</span>
                    <span className="value success-text">{formatCurrency(income)}</span>
                </div>
                <div className="summary-card glass-panel">
                    <span className="label">Havi Kiadás</span>
                    <span className="value danger-text">{formatCurrency(expenses)}</span>
                </div>
            </div>

            <div className="ai-insights-section glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span className="section-title">AI Pénzügyi Elemzés</span>
                    <button className="icon-btn" onClick={requestAiAnalysis} disabled={isAnalyzing}>
                        <Icon name="auto_awesome" style={{ color: isAnalyzing ? 'var(--text-muted)' : 'var(--secondary)' }} />
                    </button>
                </div>
                {isAnalyzing ? (
                    <div className="typing-indicator"><span></span><span></span><span></span></div>
                ) : analysis ? (
                    <div className="analysis-text fade-in">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                    </div>
                ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                        Kattints az ikonra egy átfogó elemzésért!
                    </p>
                )}
            </div>
        </div>
    );
};

// --- LEDGER / NOTES VIEW ---
const NotesView = ({ records, onAddRecord, onUpdateRecord, onDeleteRecord }: { 
    records: FinancialRecord[], 
    onAddRecord: (r: FinancialRecord) => void,
    onUpdateRecord: (r: FinancialRecord) => void,
    onDeleteRecord: (id: string) => void
}) => {
    const [search, setSearch] = useState('');
    const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);
    const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyRecords = records.filter(r => r.date.startsWith(currentMonth));
    
    const filteredRecords = records.filter(r => 
        r.name.toLowerCase().includes(search.toLowerCase()) || 
        r.category.toLowerCase().includes(search.toLowerCase())
    );

    const income = monthlyRecords.filter(r => r.amount > 0).reduce((acc, r) => acc + r.amount, 0);
    const expenses = Math.abs(monthlyRecords.filter(r => r.amount < 0).reduce((acc, r) => acc + r.amount, 0));
    const balance = income - expenses;

    const categories = Array.from(new Set(records.filter(r => r.amount < 0).map(r => r.category)));
    const categoryData = categories.map(cat => {
        const total = Math.abs(records.filter(r => r.category === cat && r.amount < 0).reduce((acc, r) => acc + r.amount, 0));
        return { name: cat, total };
    }).sort((a, b) => b.total - a.total);

    const maxCatTotal = categoryData.length > 0 ? categoryData[0].total : 1;

    return (
        <div className="view-container">
            <header className="view-header">
                <h2>Pénzügyi Napló</h2>
                <div className={`mini-balance ${balance >= 0 ? 'pos' : 'neg'}`}>{formatCurrency(balance)}</div>
            </header>

            <div className="search-bar glass-panel" style={{ marginBottom: '15px', padding: '8px 15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon name="search" style={{ fontSize: '18px', color: 'var(--text-muted)' }} />
                <input 
                    type="text" 
                    placeholder="Keresés..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '14px' }}
                />
            </div>

            {/* Category Chart */}
            {categoryData.length > 0 && !search && (
                <div className="chart-section glass-panel">
                    <span className="section-title">Kiadások kategória szerint</span>
                    <div className="bar-chart">
                        {categoryData.slice(0, 4).map(cat => (
                            <div key={cat.name} className="chart-item">
                                <div className="chart-labels">
                                    <span>{cat.name}</span>
                                    <span className="val">{formatCurrency(cat.total)}</span>
                                </div>
                                <div className="bar-bg">
                                    <div className="bar-fill" style={{ width: `${(cat.total / maxCatTotal) * 100}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="ledger-container glass-panel" style={{ marginTop: '20px' }}>
                <div className="ledger-header">
                    <div className="col-date">Dátum</div>
                    <div className="col-name">Tétel</div>
                    <div className="col-amt">Összeg</div>
                </div>
                <div className="ledger-body custom-scrollbar">
                    {filteredRecords.length === 0 ? (
                        <div className="empty-state">Nincs találat.</div>
                    ) : (
                        filteredRecords.sort((a,b) => b.date.localeCompare(a.date)).map(r => (
                            <div key={r.id} className="ledger-row" onClick={() => setEditingRecord(r)}>
                                <div className="col-date">{r.date.split('-').slice(1).join('.')}</div>
                                <div className="col-name">
                                    <div className="r-title">{r.name}</div>
                                    <div className="r-comment">{r.category} • {r.comment}</div>
                                </div>
                                <div className={`col-amt ${r.amount >= 0 ? 'success-text' : 'danger-text'}`}>
                                    {r.amount > 0 ? '+' : ''}{formatCurrency(r.amount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {editingRecord && (
                <EditRecordModal 
                    record={editingRecord} 
                    onSave={onUpdateRecord} 
                    onDelete={onDeleteRecord} 
                    onClose={() => setEditingRecord(null)} 
                />
            )}

            <div className="ledger-actions" style={{ marginTop: '20px' }}>
                <button className="ai-analysis-btn w-full" onClick={() => onAddRecord({
                    id: Date.now().toString(),
                    name: 'Új tétel',
                    amount: 0,
                    date: new Date().toISOString().split('T')[0],
                    comment: '',
                    category: 'Egyéb'
                })}>
                    <Icon name="add" style={{ marginRight: '8px' }} /> Új tétel rögzítése
                </button>
            </div>
        </div>
    );
};

// --- AI ASSISTANT VIEW (WITH LIVE AUDIO) ---
const AiAssistantView = ({ onAddRecord }: { onAddRecord: (r: FinancialRecord) => void }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: '0', role: 'model', text: 'Szia! HeR vagyok. Miben segíthetek a pénzügyeidben?' }]);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Zephyr');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const outCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const addRecordTool: FunctionDeclaration = {
    name: 'add_financial_record',
    parameters: {
      type: Type.OBJECT,
      description: 'Hozzáad egy új pénzügyi bejegyzést a naplóhoz.',
      properties: {
        name: { type: Type.STRING, description: 'A tétel neve (pl. Ebéd, Fizetés)' },
        amount: { type: Type.NUMBER, description: 'Az összeg. Pozitív ha bevétel, negatív ha kiadás.' },
        category: { type: Type.STRING, description: 'Kategória (pl. Étel, Utazás, Szórakozás, Tech, Egyéb)' },
        comment: { type: Type.STRING, description: 'Rövid megjegyzés' },
      },
      required: ['name', 'amount']
    }
  };

  const toggleLive = async () => {
    if (isLive) {
      setIsLive(false);
      return;
    }
    
    setIsLive(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const inCtx = new AudioContext({sampleRate: 16000});
    const outCtx = outCtxRef.current || new AudioContext({sampleRate: 24000});
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
            sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inCtx.destination);
        },
        onmessage: async (msg: LiveServerMessage) => {
          if (msg.toolCall) {
            for (const fc of msg.toolCall.functionCalls) {
              if (fc.name === 'add_financial_record') {
                const args = fc.args as any;
                onAddRecord({
                    id: Date.now().toString(),
                    name: args.name,
                    amount: args.amount,
                    date: new Date().toISOString().split('T')[0],
                    comment: args.comment || 'Hangalapú rögzítés',
                    category: args.category || 'Egyéb'
                });
                sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Sikeresen rögzítve!" } }
                }));
              }
            }
          }

          const base64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
            const buffer = await decodeAudioData(decode(base64), outCtx, 24000, 1);
            const source = outCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outCtx.destination);
            source.playbackRate.value = voiceSpeed;
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += (buffer.duration / voiceSpeed);
            sourcesRef.current.add(source);
          }
        },
        onclose: () => setIsLive(false),
        onerror: () => setIsLive(false)
      },
      config: { 
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
        },
        systemInstruction: 'Te vagy a HeR WiNnEr pénzügyi asszisztens. Ha a felhasználó említ egy kiadást vagy bevételt, használd az add_financial_record eszközt. Légy barátságos és tömör.',
        tools: [{ functionDeclarations: [addRecordTool] }]
      }
    });
  };

  const speakText = async (text: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
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
        source.playbackRate.value = voiceSpeed;
        source.start();
      }
    } catch (e) { console.error(e); }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text }]);
    setInputText('');
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: text });
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: response.text || '' }]);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const voices: VoiceName[] = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

  return (
    <div className="view-container chat-view">
      <header className="view-header">
        <h2>Pénzügyi Mentor</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="icon-btn" onClick={() => setShowVoiceSettings(!showVoiceSettings)}>
            <Icon name="record_voice_over" style={{ color: showVoiceSettings ? 'var(--primary)' : 'inherit' }} />
          </button>
          <button className={`icon-btn ${isLive ? 'live-active' : ''}`} onClick={toggleLive}>
              <Icon name={isLive ? "mic" : "mic_off"} />
          </button>
        </div>
      </header>

      {showVoiceSettings && (
        <div className="voice-settings-overlay glass-panel fade-in">
          <div className="settings-section">
            <span className="section-title">AI Hang Kiválasztása</span>
            <div className="voice-grid">
              {voices.map(v => (
                <button 
                  key={v} 
                  className={`voice-chip ${selectedVoice === v ? 'active' : ''}`}
                  onClick={() => setSelectedVoice(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section" style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="section-title">Beszédsebesség</span>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>{voiceSpeed.toFixed(1)}x</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="2.0" 
              step="0.1" 
              value={voiceSpeed} 
              onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
              className="speed-slider"
            />
          </div>
          <button className="close-settings-btn" onClick={() => setShowVoiceSettings(false)}>Kész</button>
        </div>
      )}

      <div className="chat-messages custom-scrollbar">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
              {msg.role === 'model' && (
                <button className="tts-btn" onClick={() => speakText(msg.text)}>
                  <Icon name="volume_up" style={{ fontSize: '16px' }} />
                </button>
              )}
            </div>
          </div>
        ))}
        {isLoading && <div className="typing-indicator"><span></span><span></span><span></span></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area glass-panel">
        <input placeholder="Kérdezz vagy diktálj..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)} />
        <button onClick={() => sendMessage(inputText)} className="send-btn"><Icon name="send" /></button>
      </div>
    </div>
  );
};

// --- CREATIVE VIEW ---
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
    } catch (e: any) { console.error(e); alert("Hiba történt a generáláskor."); }
    finally { setIsGenerating(false); }
  };

  return (
    <div className="view-container">
      <header className="view-header">
        <h2>Vizualizáció</h2>
        <Icon name="palette" />
      </header>
      <div className="glass-panel">
        <textarea 
          placeholder="Pl: Luxus iroda kilátással Dubajra, éjszaka..." 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="creative-input"
        />
        <div className="aspect-ratio-selector">
          {(["1:1", "3:4", "16:9"] as AspectRatio[]).map(ratio => (
            <button key={ratio} className={aspectRatio === ratio ? 'active' : ''} onClick={() => setAspectRatio(ratio)}>{ratio}</button>
          ))}
        </div>
        <button className="ai-analysis-btn w-full" style={{ marginTop: '15px' }} onClick={generateImage} disabled={isGenerating}>
          {isGenerating ? 'Generálás...' : 'Kép Létrehozása'}
        </button>
      </div>
      {generatedImageUrl && <img src={generatedImageUrl} alt="Gen" className="gen-img fade-in" />}
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
    const [view, setView] = useState<'finance' | 'ledger' | 'ai' | 'creative'>('ai');
    const [ledgerRecords, setLedgerRecords] = useState<FinancialRecord[]>(() => {
        const saved = localStorage.getItem('herwinner_ledger');
        return saved ? JSON.parse(saved) : [
            { id: '1', name: 'Projekt Honorárium', amount: 450000, date: '2024-05-10', comment: 'Befektetői bemutató', category: 'Munka' },
            { id: '2', name: 'Szoftver előfizetés', amount: -12000, date: '2024-05-11', comment: 'Cloud tools', category: 'Tech' },
            { id: '3', name: 'Étterem', amount: -8500, date: '2024-05-12', comment: 'Vacsora', category: 'Étel' },
            { id: '4', name: 'Lakbér', amount: -150000, date: '2024-05-01', comment: 'Májusi díj', category: 'Lakhatás' },
            { id: '5', name: 'Benzin', amount: -18000, date: '2024-05-05', comment: 'Tele tank', category: 'Utazás' }
        ];
    });

    useEffect(() => {
        localStorage.setItem('herwinner_ledger', JSON.stringify(ledgerRecords));
    }, [ledgerRecords]);

    const addRecord = (r: FinancialRecord) => setLedgerRecords(prev => [r, ...prev]);
    const updateRecord = (r: FinancialRecord) => setLedgerRecords(prev => prev.map(item => item.id === r.id ? r : item));
    const deleteRecord = (id: string) => setLedgerRecords(prev => prev.filter(item => item.id !== id));

    return (
        <div className="app-shell">
            <BrandHeader />
            <div className="content-area">
                {view === 'finance' && <DashboardView records={ledgerRecords} />}
                {view === 'ledger' && (
                    <NotesView 
                        records={ledgerRecords} 
                        onAddRecord={addRecord} 
                        onUpdateRecord={updateRecord}
                        onDeleteRecord={deleteRecord}
                    />
                )}
                {view === 'ai' && <AiAssistantView onAddRecord={addRecord} />}
                {view === 'creative' && <CreativeView />}
            </div>
            
            <nav className="bottom-nav">
                <button className={`nav-item ${view === 'finance' ? 'active' : ''}`} onClick={() => setView('finance')}>
                    <Icon name="grid_view" /><span>Pénz</span>
                </button>
                <button className={`nav-item ${view === 'ledger' ? 'active' : ''}`} onClick={() => setView('ledger')}>
                    <Icon name="description" /><span>Napló</span>
                </button>
                <button className={`nav-item ${view === 'ai' ? 'active' : ''}`} onClick={() => setView('ai')}>
                    <div className="ai-nav-glow"><Icon name="smart_toy" /></div>
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
