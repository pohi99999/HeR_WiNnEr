
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

const getCategorySlug = (cat: string) => cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// --- TYPES ---
type SyncStatus = 'synced' | 'pending' | 'conflict';

type PendingTransaction = {
    id: string;
    toolCallId: string;
    name: string;
    amount: number;
    category: string;
    comment: string;
    isEditing?: boolean;
    sessionResolver?: (response: any) => void;
};

type ChatMessage = { 
    id: string; 
    role: 'user' | 'model' | 'system'; 
    text: string; 
    pendingTx?: PendingTransaction;
    grounding?: any[]; 
};

type FinancialRecord = { 
    id: string; 
    name: string; 
    amount: number; 
    date: string; 
    comment: string; 
    category: string;
    syncStatus?: SyncStatus;
    lastModified?: number;
};

type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

// --- COMPONENTS ---
const Icon = ({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) => (
  <span className={`material-symbols-outlined ${className || ''}`} style={style}>{name}</span>
);

const BrandHeader = ({ isOnline, pendingCount, onRetry }: { isOnline: boolean; pendingCount: number; onRetry: () => void }) => (
    <div className="brand-header">
        <div className="brand-main">
            <span className="brand-text">HeR WiNnEr</span>
            <div className="brand-dot"></div>
        </div>
        <div className="status-container">
            {pendingCount > 0 && isOnline && (
                <button className="sync-badge-btn" onClick={onRetry} title="Kézi szinkronizálás">
                    <Icon name="sync" className="spin" style={{ fontSize: '14px' }} />
                    <span>{pendingCount}</span>
                </button>
            )}
            <div className={`connectivity-tag ${isOnline ? 'online' : 'offline'}`}>
                <Icon name={isOnline ? "cloud_done" : "cloud_off"} style={{ fontSize: '14px' }} />
                <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
            </div>
        </div>
    </div>
);

// --- CONFLICT RESOLUTION MODAL ---
const ConflictModal = ({ localRecord, remoteRecord, onResolve }: { 
    localRecord: FinancialRecord, 
    remoteRecord: FinancialRecord, 
    onResolve: (version: 'local' | 'remote') => void 
}) => {
    const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
    const formatDate = (ts?: number) => ts ? new Date(ts).toLocaleTimeString('hu-HU') : 'Ismeretlen';
    
    return (
        <div className="modal-overlay fade-in">
            <div className="modal-content glass-panel conflict-modal">
                <header className="modal-header">
                    <h3>Adatütközés feloldása</h3>
                    <Icon name="sync_problem" style={{ color: 'var(--warning)' }} />
                </header>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                    Ez a tétel módosult a szerveren és helyileg is, amíg offline voltál. Válaszd ki, melyik maradjon meg.
                </p>
                
                <div className="conflict-grid">
                    <div className="conflict-version local">
                        <span className="version-label">Helyi verzió (Saját)</span>
                        <div className="v-box">
                            <small className="v-ts">Saját módosítás: {formatDate(localRecord.lastModified)}</small>
                            <strong>{localRecord.name}</strong>
                            <span className={localRecord.amount >= 0 ? 'success-text' : 'danger-text'}>{formatCurrency(localRecord.amount)}</span>
                            <small>{localRecord.category}</small>
                        </div>
                        <button className="confirm-btn" onClick={() => onResolve('local')}>A sajátot tartom meg</button>
                    </div>
                    <div className="conflict-version remote">
                        <span className="version-label">Szerver verzió</span>
                        <div className="v-box">
                            <small className="v-ts">Szerver idő: {formatDate(remoteRecord.lastModified)}</small>
                            <strong>{remoteRecord.name}</strong>
                            <span className={remoteRecord.amount >= 0 ? 'success-text' : 'danger-text'}>{formatCurrency(remoteRecord.amount)}</span>
                            <small>{remoteRecord.category}</small>
                        </div>
                        <button className="cancel-btn" onClick={() => onResolve('remote')}>Váltás a szerverre</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

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
const DashboardView = ({ records, isOnline }: { records: FinancialRecord[], isOnline: boolean }) => {
    const [analysis, setAnalysis] = useState<string>('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [monthlyBudget, setMonthlyBudget] = useState(300000);
    const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);

    const income = records.filter(r => r.amount > 0).reduce((acc, r) => acc + r.amount, 0);
    const expenses = Math.abs(records.filter(r => r.amount < 0).reduce((acc, r) => acc + r.amount, 0));
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    const healthScore = Math.max(0, Math.min(100, Math.round(savingsRate + 50)));
    
    const budgetUsedPercent = Math.min(100, (expenses / monthlyBudget) * 100);

    const requestAiAnalysis = async () => {
        if (!isOnline) return;
        setIsAnalyzing(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Íme a pénzügyi adataim: ${records.map(r => `${r.name}: ${r.amount} Ft (${r.category})`).join(', ')}. 
            Kérlek elemezd a pénzügyi helyzetemet. Emeld ki a legnagyobb kiadásokat és adj 3 konkrét tippet a spórolásra. Tömör légy.`;
            
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

            <div className="summary-grid">
                <div className="summary-card glass-panel" style={{ gridColumn: 'span 2', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="label">Havi költségkeret</span>
                        <span className="value" style={{ fontSize: '14px' }}>{formatCurrency(monthlyBudget - expenses)} maradt</span>
                    </div>
                    <div className="budget-bar-container">
                        <div className={`budget-bar-fill ${budgetUsedPercent > 90 ? 'danger' : budgetUsedPercent > 70 ? 'warning' : ''}`} style={{ width: `${budgetUsedPercent}%` }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>Elköltve: {formatCurrency(expenses)}</span>
                        <span>Keret: {formatCurrency(monthlyBudget)}</span>
                    </div>
                </div>

                <div className="summary-card glass-panel">
                    <span className="label">Havi Bevétel</span>
                    <span className="value success-text">{formatCurrency(income)}</span>
                </div>
                <div className="summary-card glass-panel">
                    <span className="label">Megtakarítás</span>
                    <span className="value primary-text">{formatCurrency(income - expenses)}</span>
                </div>
            </div>

            <div className="glass-panel health-card" style={{ marginBottom: '20px', textAlign: 'center', padding: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div className="health-score-container" style={{ width: '80px', margin: 0 }}>
                    <svg viewBox="0 0 36 36" className="circular-chart">
                        <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="circle" strokeDasharray={`${healthScore}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <text x="18" y="20.35" className="percentage" style={{ fontSize: '8px' }}>{healthScore}%</text>
                    </svg>
                </div>
                <div style={{ textAlign: 'left' }}>
                    <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Pénzügyi Pontszám</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Megtakarítási ráta: {savingsRate.toFixed(1)}%</p>
                </div>
            </div>

            <div className={`ai-insights-section glass-panel ${!isOnline ? 'offline-dim' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span className="section-title">AI Pénzügyi Elemzés</span>
                    <button className="icon-btn" onClick={requestAiAnalysis} disabled={isAnalyzing || !isOnline}>
                        <Icon name={isOnline ? "auto_awesome" : "wifi_off"} style={{ color: !isOnline ? 'var(--danger)' : isAnalyzing ? 'var(--text-muted)' : 'var(--secondary)' }} />
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
const NotesView = ({ records, onAddRecord, onUpdateRecord, onDeleteRecord, isOnline }: { 
    records: FinancialRecord[], 
    onAddRecord: (r: FinancialRecord) => void,
    onUpdateRecord: (r: FinancialRecord) => void,
    onDeleteRecord: (id: string) => void,
    isOnline: boolean
}) => {
    const [search, setSearch] = useState('');
    const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);
    const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
    
    const filteredRecords = records.filter(r => 
        r.name.toLowerCase().includes(search.toLowerCase()) || 
        r.category.toLowerCase().includes(search.toLowerCase())
    );

    const exportToCSV = () => {
        const headers = ["Dátum", "Név", "Összeg", "Kategória", "Megjegyzés"];
        const rows = records.map(r => [r.date, r.name, r.amount, r.category, r.comment]);
        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `herwinner_export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="view-container">
            <header className="view-header">
                <div>
                    <h2>Pénzügyi Napló</h2>
                    {!isOnline && <span style={{ fontSize: '10px', color: 'var(--secondary)' }}>Offline szerkesztés mód</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="icon-btn-mini" onClick={exportToCSV} title="CSV Export">
                        <Icon name="download" />
                    </button>
                </div>
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
            
            <div className="ledger-container glass-panel">
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
                            <div key={r.id} className={`ledger-row ${r.syncStatus === 'pending' ? 'pending-sync' : ''} ${r.syncStatus === 'conflict' ? 'conflict-row' : ''}`} onClick={() => setEditingRecord(r)}>
                                <div className="col-date">
                                    {r.date.split('-').slice(1).join('.')}
                                    {r.syncStatus === 'pending' && <Icon name="sync" className="spin mini-icon" />}
                                    {r.syncStatus === 'conflict' && <Icon name="warning" className="mini-icon danger-text" />}
                                </div>
                                <div className="col-name">
                                    <div className="r-title">{r.name}</div>
                                    <div className="r-comment">
                                        <span className={`cat-tag cat-${getCategorySlug(r.category)}`}>{r.category}</span>
                                        {r.comment && <span> • {r.comment}</span>}
                                    </div>
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
                    category: 'Egyéb',
                    syncStatus: isOnline ? 'synced' : 'pending',
                    lastModified: Date.now()
                })}>
                    <Icon name="add" style={{ marginRight: '8px' }} /> Új tétel rögzítése
                </button>
            </div>
        </div>
    );
};

// --- AI ASSISTANT VIEW ---
const AiAssistantView = ({ onAddRecord, isOnline }: { onAddRecord: (r: FinancialRecord) => void, isOnline: boolean }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: '0', role: 'model', text: 'Szia! HeR vagyok. Miben segíthetek?' }]);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Zephyr');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const addRecordTool: FunctionDeclaration = {
    name: 'add_financial_record',
    parameters: {
      type: Type.OBJECT,
      description: 'Pénzügyi tétel rögzítése.',
      properties: {
        name: { type: Type.STRING },
        amount: { type: Type.NUMBER },
        category: { type: Type.STRING },
        comment: { type: Type.STRING },
      },
      required: ['name', 'amount']
    }
  };

  const speakText = async (text: string, voiceOverride?: VoiceName) => {
    if (!isOnline) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { 
            voiceConfig: { 
                prebuiltVoiceConfig: { voiceName: voiceOverride || selectedVoice } 
            } 
          },
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

  const handleConfirmation = (tx: PendingTransaction, confirmed: boolean) => {
    if (confirmed) {
        onAddRecord({
            id: tx.id,
            name: tx.name,
            amount: tx.amount,
            date: new Date().toISOString().split('T')[0],
            comment: tx.comment,
            category: tx.category,
            syncStatus: isOnline ? 'synced' : 'pending',
            lastModified: Date.now()
        });
        setMessages(prev => prev.map(m => m.pendingTx?.id === tx.id ? { ...m, pendingTx: undefined, text: `✓ Rögzítve: ${tx.name}` } : m));
        speakText("Sikeresen mentettem.");
    } else {
        setMessages(prev => prev.map(m => m.pendingTx?.id === tx.id ? { ...m, pendingTx: undefined, text: `✗ Elvetve: ${tx.name}` } : m));
        speakText("Megszakítva.");
    }
  };

  const updatePendingTx = (id: string, updates: Partial<PendingTransaction>) => {
      setMessages(prev => prev.map(m => m.pendingTx?.id === id ? { ...m, pendingTx: { ...m.pendingTx!, ...updates } } : m));
  };

  const toggleLive = async () => {
    if (!isOnline) return;
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
            sessionPromise.then(s => {
                s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inCtx.destination);
        },
        onmessage: async (msg: LiveServerMessage) => {
          if (msg.toolCall) {
            for (const fc of msg.toolCall.functionCalls) {
              if (fc.name === 'add_financial_record') {
                const args = fc.args as any;
                const txId = Date.now().toString();
                speakText("Rögzítsem?");
                setMessages(prev => [...prev, {
                    id: txId, role: 'system', text: 'Megerősítés...',
                    pendingTx: { id: txId, toolCallId: fc.id, name: args.name, amount: args.amount, category: args.category || 'Egyéb', comment: args.comment || 'Voice' }
                }]);
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
          }
        },
        onclose: () => setIsLive(false),
        onerror: () => setIsLive(false)
      },
      config: { 
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
        systemInstruction: 'Pénzügyi asszisztens vagy. Segíts kiadásokat és bevételeket kezelni.',
        tools: [{ functionDeclarations: [addRecordTool] }]
      }
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !isOnline) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text }]);
    setInputText('');
    setIsLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ 
          model: 'gemini-3-pro-preview', 
          contents: text,
          config: {
              tools: [{ functionDeclarations: [addRecordTool] }, { googleSearch: {} }]
          }
      });

      const toolCalls = response.candidates?.[0]?.content?.parts.filter(p => p.functionCall);
      const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

      if (toolCalls && toolCalls.length > 0) {
          for (const part of toolCalls) {
              const fc = part.functionCall!;
              const args = fc.args as any;
              const txId = Date.now().toString();
              speakText("Biztosan rögzíthetem?");
              setMessages(prev => [...prev, {
                id: txId, role: 'system', text: 'Megerősítés...',
                pendingTx: { id: txId, toolCallId: fc.id, name: args.name, amount: args.amount, category: args.category || 'Egyéb', comment: args.comment || 'Chat' }
              }]);
          }
      } else {
          const resText = response.text || '';
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: resText, grounding }]);
          speakText(resText);
      }
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="view-container chat-view">
      <header className="view-header">
        <h2>Asszisztens</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="icon-btn" onClick={() => setShowVoiceSettings(!showVoiceSettings)}>
            <Icon name="settings_voice" style={{ color: showVoiceSettings ? 'var(--primary)' : 'inherit' }} />
          </button>
          <button className={`icon-btn ${isLive ? 'live-active' : ''}`} onClick={toggleLive} disabled={!isOnline}>
              <Icon name={!isOnline ? "wifi_off" : isLive ? "mic" : "mic_off"} />
          </button>
        </div>
      </header>

      {showVoiceSettings && (
        <div className="voice-settings-overlay glass-panel fade-in">
          <div className="settings-section">
            <span className="section-title">AI Hang Kiválasztása</span>
            <div className="voice-grid">
              {['Kore', 'Puck', 'Charon', 'Zephyr'].map(v => (
                <div key={v} className="voice-selection-row">
                    <button 
                        className={`voice-chip ${selectedVoice === v ? 'active' : ''}`} 
                        onClick={() => setSelectedVoice(v as VoiceName)}
                    >
                        {v}
                    </button>
                    <button 
                        className="icon-btn-mini preview-btn" 
                        onClick={() => speakText(`Hello, én vagyok ${v}. Örülök a találkozásnak!`, v as VoiceName)}
                        title="Minta lejátszása"
                    >
                        <Icon name="play_circle" style={{ fontSize: '20px' }} />
                    </button>
                </div>
              ))}
            </div>
          </div>
          
          <div className="settings-section" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="section-title">Sebesség</span>
                <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 'bold' }}>{voiceSpeed.toFixed(1)}x</span>
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
            {msg.pendingTx ? (
                <div className="confirmation-card glass-panel fade-in">
                    <div className="tx-header">
                        <Icon name="receipt_long" />
                        <span>Jóváhagyás</span>
                        <button className="icon-btn-mini" onClick={() => updatePendingTx(msg.pendingTx!.id, { isEditing: !msg.pendingTx!.isEditing })}>
                            <Icon name={msg.pendingTx.isEditing ? "check" : "edit"} style={{ fontSize: '14px' }} />
                        </button>
                    </div>
                    {msg.pendingTx.isEditing ? (
                        <div className="tx-edit-fields">
                            <input className="tx-input" value={msg.pendingTx.name} onChange={e => updatePendingTx(msg.pendingTx!.id, { name: e.target.value })} />
                            <input className="tx-input" type="number" value={msg.pendingTx.amount} onChange={e => updatePendingTx(msg.pendingTx!.id, { amount: parseFloat(e.target.value) || 0 })} />
                        </div>
                    ) : (
                        <div className="tx-details">
                            <div className="tx-name">{msg.pendingTx.name}</div>
                            <div className={`tx-amt ${msg.pendingTx.amount >= 0 ? 'success-text' : 'danger-text'}`}>{formatCurrency(msg.pendingTx.amount)}</div>
                        </div>
                    )}
                    <div className="tx-actions">
                        <button className="confirm-btn" onClick={() => handleConfirmation(msg.pendingTx!, true)}>Mentés</button>
                        <button className="cancel-btn" onClick={() => handleConfirmation(msg.pendingTx!, false)}>Mégse</button>
                    </div>
                </div>
            ) : (
                <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    {msg.grounding && msg.grounding.length > 0 && (
                        <div className="grounding-sources">
                            <ul>
                                {msg.grounding.map((chunk, idx) => chunk.web && (
                                    <li key={idx}><a href={chunk.web.uri} target="_blank" rel="noopener noreferrer">{chunk.web.title || chunk.web.uri}</a></li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
          </div>
        ))}
        {isLoading && <div className="typing-indicator"><span></span><span></span><span></span></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className={`chat-input-area glass-panel ${!isOnline ? 'offline-dim' : ''}`}>
        <input placeholder="Írj üzenetet..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)} disabled={!isOnline} />
        <button onClick={() => sendMessage(inputText)} className="send-btn" disabled={!isOnline}><Icon name="send" /></button>
      </div>
    </div>
  );
};

// --- CREATIVE VIEW ---
const CreativeView = ({ isOnline }: { isOnline: boolean }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

  const generateImage = async () => {
    if (!prompt.trim() || !isOnline) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "1:1", imageSize: "1K" } }
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setGeneratedImageUrl(`data:image/png;base64,${part.inlineData.data}`);
          break;
        }
      }
    } catch (e: any) { console.error(e); }
    finally { setIsGenerating(false); }
  };

  return (
    <div className="view-container">
      <header className="view-header"><h2>Képgenerátor</h2><Icon name="palette" /></header>
      <div className={`glass-panel ${!isOnline ? 'offline-dim' : ''}`}>
        <textarea placeholder="Mit rajzoljak?" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="creative-input" disabled={!isOnline} />
        <button className="ai-analysis-btn w-full" onClick={generateImage} disabled={isGenerating || !isOnline}>{isGenerating ? 'Generálás...' : 'Indítás'}</button>
      </div>
      {generatedImageUrl && <img src={generatedImageUrl} alt="Gen" className="gen-img fade-in" />}
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
    const [view, setView] = useState<'finance' | 'ledger' | 'ai' | 'creative'>('ai');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    
    // Ütközési sor kezelése
    const [conflictsToResolve, setConflictsToResolve] = useState<{ local: FinancialRecord, remote: FinancialRecord }[]>([]);
    
    const [ledgerRecords, setLedgerRecords] = useState<FinancialRecord[]>(() => {
        const saved = localStorage.getItem('herwinner_ledger');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        const handleOnline = () => { setIsOnline(true); triggerSync(); };
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => { 
            window.removeEventListener('online', handleOnline); 
            window.removeEventListener('offline', handleOffline); 
        };
    }, [ledgerRecords]);

    const triggerSync = async () => {
        setIsSyncing(true);
        // Szimulált hálózati késleltetés
        await new Promise(r => setTimeout(r, 1500));
        
        const newConflicts: { local: FinancialRecord, remote: FinancialRecord }[] = [];
        const serverTime = Date.now();

        const updatedRecords = ledgerRecords.map(r => {
            const isExistingRecord = parseInt(r.id) < (serverTime - 10000);
            
            // Csak akkor szimulálunk szerver-oldali változást, ha a rekord már egy ideje létezik
            // Ez elkerüli, hogy az éppen most hozzáadott dolgok azonnal ütközzenek
            const serverHasUpdate = isExistingRecord && Math.random() > 0.92; // 8% esély szerver változásra

            if (serverHasUpdate) {
                const serverLastModified = serverTime - 5000;
                const remoteVersion: FinancialRecord = { 
                    ...r, 
                    name: r.name + " (Szerver frissítés)", 
                    amount: r.amount + (Math.random() > 0.5 ? 500 : -500),
                    lastModified: serverLastModified,
                    syncStatus: 'synced'
                };

                if (r.syncStatus === 'pending') {
                    // VALÓDI ÜTKÖZÉS: Mindkét fél módosította az adatot offline időszak alatt
                    newConflicts.push({ local: r, remote: remoteVersion });
                    return { ...r, syncStatus: 'conflict' as SyncStatus };
                } else {
                    // Csak a szerveren történt változás -> automatikus letöltés
                    return remoteVersion;
                }
            }

            // Ha nincs szerver változás, de nálunk pending, akkor sikeresen feltöltöttük
            if (r.syncStatus === 'pending') {
                return { ...r, syncStatus: 'synced' as SyncStatus, lastModified: serverTime };
            }

            return r;
        });

        if (newConflicts.length > 0) {
            setConflictsToResolve(prev => [...prev, ...newConflicts]);
        }

        setLedgerRecords(updatedRecords);
        setIsSyncing(false);
    };

    const handleResolveConflict = (version: 'local' | 'remote') => {
        if (conflictsToResolve.length === 0) return;
        
        const current = conflictsToResolve[0];
        const serverTime = Date.now();
        const resolved = version === 'local' 
            ? { ...current.local, syncStatus: 'synced' as SyncStatus, lastModified: serverTime } 
            : { ...current.remote, syncStatus: 'synced' as SyncStatus, lastModified: current.remote.lastModified };
            
        setLedgerRecords(prev => prev.map(r => r.id === resolved.id ? resolved : r));
        setConflictsToResolve(prev => prev.slice(1));
    };

    // CRUD műveletek metaadat-kezeléssel
    const addRecord = (r: FinancialRecord) => {
        const finalRecord = {
            ...r,
            lastModified: Date.now(),
            syncStatus: isOnline ? 'synced' : 'pending' as SyncStatus
        };
        setLedgerRecords([finalRecord, ...ledgerRecords]);
        if (isOnline) triggerSync();
    };

    const updateRecord = (r: FinancialRecord) => {
        const finalRecord = {
            ...r,
            lastModified: Date.now(),
            syncStatus: isOnline ? 'synced' : 'pending' as SyncStatus
        };
        setLedgerRecords(ledgerRecords.map(item => item.id === r.id ? finalRecord : item));
        if (isOnline) triggerSync();
    };

    const deleteRecord = (id: string) => {
        setLedgerRecords(ledgerRecords.filter(item => item.id !== id));
        // Megjegyzés: Egy robusztusabb rendszerben a törlést is "pending delete" státusszal kellene követni,
        // de ehhez a szervernek is tudnia kell a törlésről. Ebben a verzióban az azonnali lokális törlésre fókuszálunk.
    };

    const pendingCount = ledgerRecords.filter(r => r.syncStatus === 'pending').length;

    useEffect(() => { localStorage.setItem('herwinner_ledger', JSON.stringify(ledgerRecords)); }, [ledgerRecords]);

    return (
        <div className="app-shell">
            <BrandHeader isOnline={isOnline} pendingCount={pendingCount} onRetry={triggerSync} />
            {isSyncing && <div className="sync-toast fade-in"><Icon name="sync" className="spin" /><span>Háttérszinkronizálás...</span></div>}
            
            {conflictsToResolve.length > 0 && (
                <ConflictModal 
                    localRecord={conflictsToResolve[0].local} 
                    remoteRecord={conflictsToResolve[0].remote} 
                    onResolve={handleResolveConflict} 
                />
            )}

            <div className="content-area">
                {view === 'finance' && <DashboardView records={ledgerRecords} isOnline={isOnline} />}
                {view === 'ledger' && (
                    <NotesView 
                        records={ledgerRecords} 
                        onAddRecord={addRecord} 
                        onUpdateRecord={updateRecord} 
                        onDeleteRecord={deleteRecord} 
                        isOnline={isOnline} 
                    />
                )}
                {view === 'ai' && <AiAssistantView onAddRecord={addRecord} isOnline={isOnline} />}
                {view === 'creative' && <CreativeView isOnline={isOnline} />}
            </div>
            
            <nav className="bottom-nav">
                <button className={`nav-item ${view === 'finance' ? 'active' : ''}`} onClick={() => setView('finance')}><Icon name="grid_view" /><span>Pénz</span></button>
                <button className={`nav-item ${view === 'ledger' ? 'active' : ''}`} onClick={() => setView('ledger')}><Icon name="description" /><span>Napló</span></button>
                <button className={`nav-item ${view === 'ai' ? 'active' : ''}`} onClick={() => setView('ai')}><div className="ai-nav-glow"><Icon name="smart_toy" /></div></button>
                <button className={`nav-item ${view === 'creative' ? 'active' : ''}`} onClick={() => setView('creative')}><Icon name="auto_awesome" /><span>Alkotás</span></button>
            </nav>
        </div>
    );
};

const root = document.getElementById('root');
if (root) { createRoot(root).render(<App />); }
