import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_KEY = process.env.API_KEY;

// --- DATA TYPES ---
interface User {
    name: string;
    email: string;
    avatarInitial: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    image?: string; // Base64 image for display
}

interface FinanceState {
    pettyCash: number;
    bankBalance: number;
    expectedTaxes: number;
    lastUpdated: string;
}

interface NoteItem {
    id: string;
    type: 'text' | 'voice' | 'loan';
    title: string;
    content?: string;
    loanData?: any;
    timestamp: string;
}

interface EmailItem {
    id: string;
    sender: string;
    subject: string;
    time: string;
    body: string;
}

// --- MOCK DATA ---
const MOCK_USER: User = {
    name: 'HeR WiNnEr',
    email: 'herwinner@gmail.com',
    avatarInitial: 'H',
};

const INITIAL_FINANCE: FinanceState = {
    pettyCash: 150000,
    bankBalance: 4500000,
    expectedTaxes: 850000,
    lastUpdated: new Date().toISOString()
};

const INITIAL_LOANS: NoteItem[] = [
    {
        id: 'loan-1',
        type: 'loan',
        title: 'Kölcsön - Kovács János',
        timestamp: new Date().toISOString(),
        loanData: {
            id: 'l1',
            name: 'Kovács János',
            date: '2024-05-10',
            amount: 500000,
            returned: 200000,
            isPaidOff: false
        }
    }
];

const MOCK_EVENTS = [
    { id: 'e1', title: 'Könyvelői egyeztetés', date: new Date().toISOString().split('T')[0], time: '10:00', type: 'work', status: 'in-progress' },
    { id: 'e2', title: 'NAV Határidő', date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], type: 'work', status: 'todo' },
    { id: 'e3', title: 'Bevásárlás', date: new Date().toISOString().split('T')[0], time: '17:00', type: 'personal', status: 'completed' }
];

const MOCK_EMAILS: EmailItem[] = [
    { id: 'em1', sender: 'Könyvelő Iroda', subject: 'Havi áfa bevallás tervezete', time: '10:30', body: 'Kedves Ügyfelünk! Mellékelten küldöm a havi ÁFA bevallás tervezetét ellenőrzésre. Kérjük péntekig jelezzen vissza. Üdvözlettel: Könyvelő' },
    { id: 'em2', sender: 'Google Payments', subject: 'Sikeres fizetés', time: 'Tegnap', body: 'A Google Cloud szolgáltatás megújult. Levont összeg: 12.000 Ft.' }
];

// --- UTILS ---
const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const Icon = ({ name, className = '', style }: { name: string, className?: string, style?: React.CSSProperties }) => (
    <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
);

// Helper for Audio Processing
const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
};

const base64ToUint8Array = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// --- COMPONENTS ---

// 1. LIVE VOICE OVERLAY
const LiveVoiceOverlay = ({ onClose }: { onClose: () => void }) => {
    const [status, setStatus] = useState('Kapcsolódás...');
    const [isTalking, setIsTalking] = useState(false);
    
    // Audio Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sessionRef = useRef<any>(null);

    useEffect(() => {
        let mounted = true;
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const startSession = async () => {
            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true
                }});

                const sessionPromise = ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                        systemInstruction: "Te vagy a HeR WiNnEr app hangasszisztense. Rövid, kedves, magyar válaszokat adj. Egy üzletasszonnyal beszélsz."
                    },
                    callbacks: {
                        onopen: () => {
                            if (!mounted) return;
                            setStatus('Hallgatlak...');
                            
                            // Input Processing
                            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                            const source = ctx.createMediaStreamSource(streamRef.current!);
                            const processor = ctx.createScriptProcessor(4096, 1, 1);
                            
                            processor.onaudioprocess = (e) => {
                                const inputData = e.inputBuffer.getChannelData(0);
                                const pcmData = floatTo16BitPCM(inputData);
                                const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
                                
                                sessionPromise.then(session => {
                                    session.sendRealtimeInput({
                                        media: {
                                            mimeType: 'audio/pcm;rate=16000',
                                            data: base64Data
                                        }
                                    });
                                });
                            };

                            source.connect(processor);
                            processor.connect(ctx.destination);
                            
                            processorRef.current = processor;
                        },
                        onmessage: async (msg: LiveServerMessage) => {
                            if (!mounted) return;
                            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                            if (audioData) {
                                setIsTalking(true);
                                const ctx = audioContextRef.current!;
                                const audioBytes = base64ToUint8Array(audioData);
                                
                                const int16 = new Int16Array(audioBytes.buffer);
                                const audioBuffer = ctx.createBuffer(1, int16.length, 24000);
                                const channelData = audioBuffer.getChannelData(0);
                                for(let i=0; i<int16.length; i++) {
                                    channelData[i] = int16[i] / 32768.0;
                                }

                                const source = ctx.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(ctx.destination);
                                
                                const currentTime = ctx.currentTime;
                                const startTime = Math.max(currentTime, nextStartTimeRef.current);
                                source.start(startTime);
                                nextStartTimeRef.current = startTime + audioBuffer.duration;
                                
                                source.onended = () => setIsTalking(false);
                            }
                        },
                        onclose: () => {
                           if(mounted) onClose();
                        },
                        onerror: (err) => {
                            console.error(err);
                            if(mounted) setStatus('Hiba történt.');
                        }
                    }
                });
                
                const session = await sessionPromise;
                sessionRef.current = session;

            } catch (err) {
                console.error("Live Init Error:", err);
                setStatus("Mikrofon hozzáférés szükséges.");
            }
        };

        startSession();

        return () => {
            mounted = false;
            sessionRef.current?.close();
            streamRef.current?.getTracks().forEach(t => t.stop());
            processorRef.current?.disconnect();
            audioContextRef.current?.close();
        };
    }, [onClose]);

    return (
        <div className="live-overlay">
            <button className="close-btn" onClick={onClose}><Icon name="close" /></button>
            <div className={`orb-container ${isTalking ? 'talking' : 'listening'}`}>
                <div className="orb-core"></div>
                <div className="orb-ring r1"></div>
                <div className="orb-ring r2"></div>
                <div className="orb-ring r3"></div>
            </div>
            <div className="live-status">{status}</div>
            <div className="live-controls">
                <button className="mute-btn"><Icon name="mic" /></button>
            </div>
        </div>
    );
};

// 2. RECEIPT SCANNER MODAL
const ReceiptScannerModal = ({ onClose, onScanComplete }: { onClose: () => void, onScanComplete: (amount: number, type: string) => void }) => {
    const [image, setImage] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                setImage(ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const analyzeReceipt = async () => {
        if (!image) return;
        setIsAnalyzing(true);
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const base64Data = image.split(',')[1];
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                        { text: "Ez egy számla vagy nyugta. Elemezd és add meg a végösszeget (csak szám) és a kategóriát (pl. Élelmiszer, Üzemanyag, Egyéb). Válasz formátum JSON: { \"amount\": 1200, \"category\": \"Üzemanyag\" }" }
                    ]
                },
                config: { responseMimeType: "application/json" }
            });
            
            const result = JSON.parse(response.text || '{}');
            if (result.amount) {
                onScanComplete(result.amount, result.category || 'Egyéb');
            }
        } catch (error) {
            console.error(error);
            alert("Nem sikerült elemezni a képet.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content glass-panel">
                <h3>Számla Elemzése</h3>
                {!image ? (
                    <div className="upload-zone">
                        <label htmlFor="receipt-upload" className="upload-btn">
                            <Icon name="add_a_photo" style={{fontSize: '40px'}}/>
                            <span>Fotó készítése / Feltöltés</span>
                        </label>
                        <input id="receipt-upload" type="file" accept="image/*" onChange={handleFileChange} hidden />
                    </div>
                ) : (
                    <div className="preview-zone">
                        <img src={image} alt="Receipt" className="receipt-preview" />
                        {isAnalyzing ? (
                            <div className="analyzing-state">
                                <Icon name="smart_toy" className="spin" />
                                <span>Gemini Elemzés...</span>
                            </div>
                        ) : (
                            <div className="action-row">
                                <button className="btn-secondary" onClick={() => setImage(null)}>Újra</button>
                                <button className="btn-primary" onClick={analyzeReceipt}>Elemzés</button>
                            </div>
                        )}
                    </div>
                )}
                <button className="close-modal-text" onClick={onClose}>Mégse</button>
            </div>
        </div>
    );
};

// 3. MORNING BRIEFING CARD
const MorningBriefing = () => {
    const [briefing, setBriefing] = useState('');
    
    useEffect(() => {
        const fetchBriefing = async () => {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const prompt = `
                Dátum: ${new Date().toLocaleDateString('hu-HU')}.
                Események: ${JSON.stringify(MOCK_EVENTS)}.
                Pénzügy: ${JSON.stringify(INITIAL_FINANCE)}.
                Készíts egy nagyon rövid (max 2 mondat) reggeli motiváló összefoglalót a HeR WiNnEr felhasználónak.
            `;
            try {
                const result = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-lite',
                    contents: prompt,
                });
                setBriefing(result.text || 'Legyen sikeres napod!');
            } catch (e) {
                setBriefing('Legyen sikeres napod, HeR WiNnEr!');
            }
        };
        fetchBriefing();
    }, []);

    return (
        <div className="morning-card glass-panel">
            <div className="morning-icon"><Icon name="wb_sunny" /></div>
            <div className="morning-content">
                <h4>Reggeli Tájékoztató</h4>
                <p>{briefing || 'Betöltés...'}</p>
            </div>
        </div>
    );
};

// 4. INCOME MODAL
const IncomeModal = ({ onClose, onSave }: { onClose: () => void, onSave: (amount: number, desc: string) => void }) => {
    const [amount, setAmount] = useState('');
    const [desc, setDesc] = useState('');

    const handleSubmit = () => {
        if (!amount) return;
        onSave(parseInt(amount), desc || 'Egyéb bevétel');
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content glass-panel">
                <h3>Bevétel Rögzítése</h3>
                <input 
                    type="number" 
                    placeholder="Összeg (Ft)" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="modal-input"
                />
                <input 
                    type="text" 
                    placeholder="Megnevezés (pl. Készpénz eladás)" 
                    value={desc} 
                    onChange={e => setDesc(e.target.value)} 
                    className="modal-input"
                />
                <div className="action-row">
                    <button className="btn-action secondary" onClick={onClose}>Mégse</button>
                    <button className="btn-action primary" onClick={handleSubmit}>Mentés</button>
                </div>
            </div>
        </div>
    );
};

// 5. EMAIL DETAIL MODAL
const EmailDetailModal = ({ email, onClose }: { email: EmailItem, onClose: () => void }) => {
    const [aiReply, setAiReply] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const generateReply = async () => {
        setIsGenerating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Írj egy udvarias, professzionális válaszlevelet erre az emailre:
                Feladó: ${email.sender}
                Tárgy: ${email.subject}
                Üzenet: ${email.body}
                A válasz legyen rövid, lényegretörő és magyar nyelvű.`
            });
            setAiReply(response.text || 'Nem sikerült generálni.');
        } catch (e) {
            setAiReply('Hiba történt a generálás során.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content glass-panel" style={{maxWidth: '90%'}}>
                <div className="email-header-modal">
                    <h3>{email.subject}</h3>
                    <div className="email-meta">
                        <span>{email.sender}</span>
                        <span>{email.time}</span>
                    </div>
                </div>
                <div className="email-body-modal custom-scrollbar">
                    {email.body}
                </div>
                
                {aiReply && (
                    <div className="ai-reply-box custom-scrollbar">
                        <strong>AI Tervezet:</strong>
                        <p>{aiReply}</p>
                        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(aiReply)}>Másolás</button>
                    </div>
                )}

                <div className="action-row">
                     <button className="btn-action secondary" onClick={onClose}>Bezárás</button>
                     <button className="btn-action primary" onClick={generateReply} disabled={isGenerating}>
                        {isGenerating ? 'Írás...' : <><Icon name="auto_awesome" /> Válasz Tervezet</>}
                     </button>
                </div>
            </div>
        </div>
    );
};

// --- MODIFIED VIEWS ---

// ASSISTANT VIEW
const AssistantView = ({ onStartLive }: { onStartLive: () => void }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { id: '1', role: 'model', text: 'Szia! Miben segíthetek ma a vállalkozásod körül?' }
    ]);
    const [input, setInput] = useState('');
    const [chatImage, setChatImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<any>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        chatRef.current = ai.chats.create({
            model: 'gemini-3-pro-preview',
            config: {
                systemInstruction: "Te vagy a HeR WiNnEr alkalmazás asszisztense. A felhasználó egy vállalkozó. Segíts neki üzleti, pénzügyi és szervezési kérdésekben. Használd a googleSearch és googleMaps eszközöket ha aktuális infó kell.",
                thinkingConfig: { thinkingBudget: 32768 },
                tools: [{ googleSearch: {} }, { googleMaps: {} }]
            }
        });
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const r = new FileReader();
            r.onload = (ev) => setChatImage(ev.target?.result as string);
            r.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!input.trim() && !chatImage) || isLoading) return;

        const userMsg: ChatMessage = { id: generateId(), role: 'user', text: input, image: chatImage || undefined };
        setMessages(p => [...p, userMsg]);
        setInput('');
        setChatImage(null);
        setIsLoading(true);

        try {
            if (!chatRef.current) throw new Error("AI not ready");
            
            let messagePayload: any = { role: 'user', parts: [] };
            if (userMsg.image) {
                const base64 = userMsg.image.split(',')[1];
                messagePayload.parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
            }
            if (userMsg.text) {
                messagePayload.parts.push({ text: userMsg.text });
            }

            // Using sendMessage with complex payload
            const result = await chatRef.current.sendMessage(messagePayload.parts.length === 1 && messagePayload.parts[0].text ? messagePayload.parts[0].text : messagePayload.parts);
            
            const responseText = result.text || '';
            const grounding = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
            let finalText = responseText;
            
            if (grounding && grounding.length > 0) {
                 finalText += "\n\n**Források:**\n" + grounding.map((g: any) => {
                     if (g.web) return `- [${g.web.title || 'Weboldal'}](${g.web.uri})`;
                     if (g.maps) return `- [${g.maps.title || 'Térkép'}](${g.maps.googleMapsUri})`;
                     return '';
                 }).filter(Boolean).join('\n');
            }

            setMessages(p => [...p, { id: generateId(), role: 'model', text: finalText }]);
        } catch (err) {
            console.error(err);
            setMessages(p => [...p, { id: generateId(), role: 'model', text: 'Hiba történt a kapcsolatban.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="view-container assistant-view">
            <header className="view-header">
                <h2>Asszisztens</h2>
                <div className="header-actions" style={{display:'flex', gap:'8px'}}>
                     <a href="https://www.google.com" target="_blank" rel="noopener noreferrer" className="icon-btn" title="Keresés">
                        <Icon name="search" />
                     </a>
                     <button className="icon-btn" onClick={onStartLive} title="Live Hangvezérlés">
                        <Icon name="graphic_eq" style={{color: 'var(--primary)'}} />
                     </button>
                </div>
            </header>
            
            <MorningBriefing />

            <div className="chat-area custom-scrollbar">
                {messages.map(msg => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className="bubble">
                            {msg.image && <img src={msg.image} alt="User Upload" className="chat-img-display" />}
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                div: ({node, ...props}) => <div className="md-content" {...props} />
                            }}>{msg.text}</ReactMarkdown>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="message model">
                        <div className="bubble loading">
                            <span>.</span><span>.</span><span>.</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-bar" onSubmit={handleSend}>
                {chatImage && (
                    <div className="chat-img-preview">
                        <img src={chatImage} alt="Preview" />
                        <button type="button" onClick={() => setChatImage(null)}><Icon name="close" /></button>
                    </div>
                )}
                <label className="attach-btn">
                    <Icon name="attach_file" />
                    <input type="file" hidden accept="image/*" onChange={handleImageUpload} />
                </label>
                <input 
                    type="text" 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    placeholder="Írj üzenetet..." 
                    disabled={isLoading}
                />
                <button type="submit" disabled={isLoading || (!input.trim() && !chatImage)}>
                    <Icon name="send" />
                </button>
            </form>
        </div>
    );
};

// FINANCE VIEW
const FinanceView = () => {
    const [finance, setFinance] = useState<FinanceState>(INITIAL_FINANCE);
    const [showScanner, setShowScanner] = useState(false);
    const [showIncome, setShowIncome] = useState(false);
    const [advisorTip, setAdvisorTip] = useState<string | null>(null);
    const [isThinking, setIsThinking] = useState(false);

    const fmt = (n: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

    const handleScanComplete = (amount: number, category: string) => {
        setShowScanner(false);
        setFinance(prev => ({
            ...prev,
            pettyCash: prev.pettyCash - amount, 
            lastUpdated: new Date().toISOString()
        }));
        alert(`Sikeres rögzítés: ${fmt(amount)} (${category})`);
    };

    const handleIncomeSave = (amount: number, desc: string) => {
        setFinance(prev => ({
            ...prev,
            pettyCash: prev.pettyCash + amount,
            lastUpdated: new Date().toISOString()
        }));
        setShowIncome(false);
    };

    const getAdvice = async () => {
        setIsThinking(true);
        setAdvisorTip(null);
        try {
             const ai = new GoogleGenAI({ apiKey: API_KEY });
             const response = await ai.models.generateContent({
                 model: 'gemini-3-pro-preview',
                 contents: `A vállalkozás állapota: Házi pénztár: ${finance.pettyCash}, Bank: ${finance.bankBalance}, Adók: ${finance.expectedTaxes}. Adj egy stratégiai pénzügyi tanácsot. Használd a thinking módot alapos elemzéshez.`,
                 config: { thinkingConfig: { thinkingBudget: 2048 } }
             });
             setAdvisorTip(response.text || "Nincs adat.");
        } catch(e) {
            setAdvisorTip("Jelenleg nem elérhető a tanácsadó.");
        } finally {
            setIsThinking(false);
        }
    };

    return (
        <div className="view-container finance-view">
            <header className="view-header">
                <h2>Pénzügyi Kimutatás</h2>
                <button className="icon-btn" onClick={getAdvice} title="Pénzügyi Tanácsadó">
                    <Icon name="psychology" />
                </button>
            </header>

            {advisorTip && (
                <div className="advisor-card glass-panel">
                    <div className="advisor-header">
                        <Icon name="auto_awesome" style={{color: 'var(--warning)'}}/>
                        <span>Gemini Tanácsadó</span>
                        <button className="close-tiny" onClick={() => setAdvisorTip(null)}><Icon name="close"/></button>
                    </div>
                    <div className="advisor-content">
                        <ReactMarkdown>{advisorTip}</ReactMarkdown>
                    </div>
                </div>
            )}
             
            {isThinking && (
                 <div className="thinking-indicator">
                    <Icon name="motion_mode" className="spin"/>
                    <span>Elemzés folyamatban...</span>
                 </div>
            )}

            <div className="finance-grid">
                <div className="finance-card glass-panel">
                    <div className="card-icon cash">
                        <Icon name="payments" />
                    </div>
                    <div className="card-info">
                        <span className="label">Házi Pénztár</span>
                        <span className="amount">{fmt(finance.pettyCash)}</span>
                    </div>
                </div>

                <div className="finance-card glass-panel">
                    <div className="card-icon bank">
                        <Icon name="account_balance" />
                    </div>
                    <div className="card-info">
                        <span className="label">Bankszámla</span>
                        <span className="amount">{fmt(finance.bankBalance)}</span>
                    </div>
                </div>

                <div className="finance-card glass-panel warning">
                    <div className="card-icon tax">
                        <Icon name="gavel" />
                    </div>
                    <div className="card-info">
                        <span className="label">Várható Adók</span>
                        <span className="amount negative">{fmt(finance.expectedTaxes)}</span>
                    </div>
                </div>

                <div className="finance-summary glass-panel">
                    <h3>Likvid Tőke</h3>
                    <div className="big-number">{fmt(finance.pettyCash + finance.bankBalance - finance.expectedTaxes)}</div>
                    <p className="subtitle">Adók levonása után</p>
                </div>
            </div>
            
            <div className="finance-actions">
                <button className="btn-action primary" onClick={() => setShowIncome(true)}><Icon name="add" /> Bevétel</button>
                <button className="btn-action secondary" onClick={() => setShowScanner(true)}><Icon name="receipt_long" /> Számla Elemzése</button>
            </div>

            {showScanner && <ReceiptScannerModal onClose={() => setShowScanner(false)} onScanComplete={handleScanComplete} />}
            {showIncome && <IncomeModal onClose={() => setShowIncome(false)} onSave={handleIncomeSave} />}
        </div>
    );
};

// NOTES VIEW with Transcribe & TTS
const NotesView = () => {
    const [notes, setNotes] = useState<NoteItem[]>(INITIAL_LOANS);
    const [filter, setFilter] = useState<'all' | 'loan'>('all');
    const [isRecording, setIsRecording] = useState(false);
    
    // Audio Rec Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const addLoan = () => {
        const newLoan: NoteItem = {
            id: generateId(),
            type: 'loan',
            title: 'Új kölcsön',
            timestamp: new Date().toISOString(),
            loanData: {
                id: generateId(),
                name: 'Új Adós',
                date: new Date().toISOString().split('T')[0],
                amount: 0,
                returned: 0,
                isPaidOff: false
            }
        };
        setNotes([newLoan, ...notes]);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                setIsRecording(false);
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' }); // or webm
                // Convert blob to base64
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64String = (reader.result as string).split(',')[1];
                    // Send to Gemini
                    await transcribeAudio(base64String);
                };
                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error(err);
            alert("Nem sikerült elérni a mikrofont.");
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
    };

    const transcribeAudio = async (base64Audio: string) => {
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'audio/wav', data: base64Audio } }, // Adjust mime if needed usually webm or wav
                        { text: "Írd le pontosan, hogy mi hangzott el ebben a hangfelvételben magyarul. Csak a szöveget add vissza." }
                    ]
                }
            });
            
            const newNote: NoteItem = {
                id: generateId(),
                type: 'voice',
                title: 'Hangjegyzet',
                content: result.text || 'Nem sikerült az átirat.',
                timestamp: new Date().toISOString()
            };
            setNotes([newNote, ...notes]);
        } catch (e) {
            alert("Hiba történt az átírás során.");
        }
    };

    const playTTS = async (text: string) => {
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-preview-tts',
                contents: { parts: [{ text: text }] },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
                }
            });
            
            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (audioData) {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const bytes = base64ToUint8Array(audioData);
                const int16 = new Int16Array(bytes.buffer);
                const audioBuffer = ctx.createBuffer(1, int16.length, 24000);
                const channelData = audioBuffer.getChannelData(0);
                for(let i=0; i<int16.length; i++) {
                    channelData[i] = int16[i] / 32768.0;
                }
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.start();
            }
        } catch (e) {
            console.error(e);
            alert("Nem sikerült felolvasni.");
        }
    };

    const fmt = (n: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

    return (
        <div className="view-container notes-view">
            <header className="view-header">
                <h2>Jegyzetek</h2>
                <div className="filter-tabs">
                    <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Minden</button>
                    <button className={filter === 'loan' ? 'active' : ''} onClick={() => setFilter('loan')}>Pénzügy</button>
                </div>
            </header>

            <div className="notes-list custom-scrollbar">
                {notes.filter(n => filter === 'all' || n.type === filter).map(note => (
                    <div key={note.id} className={`note-card ${note.type}`}>
                        {note.type === 'loan' && note.loanData ? (
                            <div className="loan-tracker">
                                <div className="loan-header">
                                    <div className="loan-avatar">{note.loanData.name.charAt(0)}</div>
                                    <div className="loan-info-col">
                                        <span className="person-name">{note.loanData.name}</span>
                                        <span className="loan-date">{note.loanData.date}</span>
                                    </div>
                                    <div className={`loan-badge ${note.loanData.amount - note.loanData.returned <= 0 ? 'paid' : 'pending'}`}>
                                        {note.loanData.amount - note.loanData.returned <= 0 ? 'Rendezve' : 'Aktív'}
                                    </div>
                                </div>
                                <div className="loan-body">
                                    <div className="loan-progress-track">
                                        <div 
                                            className="loan-progress-fill" 
                                            style={{width: `${Math.min(100, (note.loanData.returned / note.loanData.amount) * 100)}%`}}
                                        ></div>
                                    </div>
                                    <div className="loan-stats-grid">
                                        <div className="stat-item">
                                            <span className="lbl">Adott</span>
                                            <span className="val">{fmt(note.loanData.amount)}</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="lbl">Vissza</span>
                                            <span className="val success">{fmt(note.loanData.returned)}</span>
                                        </div>
                                        <div className="stat-item">
                                            <span className="lbl">Egyenleg</span>
                                            <span className={`val ${note.loanData.amount - note.loanData.returned > 0 ? 'negative' : ''}`}>
                                                {fmt(note.loanData.amount - note.loanData.returned)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-note">
                                <div className="note-header-row">
                                    <div className="note-icon-circle">
                                        <Icon name={note.type === 'voice' ? 'mic' : 'description'} />
                                    </div>
                                    <div className="note-title-col">
                                        <h3>{note.title}</h3>
                                        <span className="note-time">{new Date(note.timestamp).toLocaleTimeString('hu-HU', {hour:'2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    {note.content && (
                                        <button className="icon-btn-small" onClick={() => playTTS(note.content!)}>
                                            <Icon name="volume_up" />
                                        </button>
                                    )}
                                </div>
                                <p className="note-content-text">{note.content}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {isRecording ? (
                <div className="recording-overlay glass-panel">
                    <div className="pulsing-mic-large">
                        <Icon name="mic" style={{fontSize: '48px', color: 'white'}}/>
                    </div>
                    <span className="rec-text">Felvétel folyamatban...</span>
                    <button className="btn-stop-rec" onClick={stopRecording}>Befejezés</button>
                </div>
            ) : (
                <div className="floating-actions">
                    <button className="fab secondary" title="Hangjegyzet" onClick={startRecording}>
                        <Icon name="mic" />
                    </button>
                    <button className="fab primary" onClick={addLoan} title="Új kölcsön">
                        <Icon name="attach_money" />
                    </button>
                </div>
            )}
        </div>
    );
};

// CREATIVE VIEW
const CreativeView = () => {
    const [tab, setTab] = useState<'image' | 'video' | 'edit'>('image');
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultType, setResultType] = useState<'image' | 'video' | null>(null);
    
    // Configs
    const [imgSize, setImgSize] = useState('1K');
    const [videoRatio, setVideoRatio] = useState('16:9');
    const [editBaseImg, setEditBaseImg] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt) return;
        setIsGenerating(true);
        setResultUrl(null);
        setResultType(null);

        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            
            if (tab === 'image') {
                const response = await ai.models.generateContent({
                    model: 'gemini-3-pro-image-preview',
                    contents: { parts: [{ text: prompt }] },
                    config: { imageConfig: { imageSize: imgSize as any, aspectRatio: '1:1' } }
                });
                const imgPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (imgPart && imgPart.inlineData) {
                    setResultUrl(`data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`);
                    setResultType('image');
                }
            } else if (tab === 'video') {
                let op = await ai.models.generateVideos({
                    model: 'veo-3.1-fast-generate-preview',
                    prompt: prompt,
                    config: {
                        numberOfVideos: 1,
                        aspectRatio: videoRatio as any,
                        resolution: '720p'
                    }
                });
                
                while (!op.done) {
                    await new Promise(r => setTimeout(r, 5000));
                    op = await ai.operations.getVideosOperation({ operation: op });
                }
                
                const vidUri = op.response?.generatedVideos?.[0]?.video?.uri;
                if (vidUri) {
                    const vidRes = await fetch(`${vidUri}&key=${API_KEY}`);
                    const blob = await vidRes.blob();
                    setResultUrl(URL.createObjectURL(blob));
                    setResultType('video');
                }
            } else if (tab === 'edit') {
                if (!editBaseImg) { alert("Tölts fel egy alap képet!"); return; }
                const base64Data = editBaseImg.split(',')[1];
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                            { text: prompt }
                        ]
                    }
                });
                const imgPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (imgPart && imgPart.inlineData) {
                    setResultUrl(`data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`);
                    setResultType('image');
                }
            }

        } catch (e) {
            console.error(e);
            alert("Hiba történt a generálás során.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleEditUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const r = new FileReader();
            r.onload = (ev) => setEditBaseImg(ev.target?.result as string);
            r.readAsDataURL(e.target.files[0]);
        }
    };

    return (
        <div className="view-container creative-view">
             <header className="view-header">
                <h2>Stúdió</h2>
            </header>

            <div className="creative-tabs glass-panel">
                <button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}><Icon name="image"/> Kép</button>
                <button className={tab === 'video' ? 'active' : ''} onClick={() => setTab('video')}><Icon name="movie"/> Videó</button>
                <button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><Icon name="auto_fix"/> Szerk.</button>
            </div>

            <div className="creative-workspace custom-scrollbar">
                <div className="input-section glass-panel">
                    {tab === 'edit' && (
                        <div className="upload-mini" onClick={() => document.getElementById('edit-up')?.click()}>
                            {editBaseImg ? <img src={editBaseImg} alt="base" /> : <div className="placeholder"><Icon name="add_photo_alternate"/> Alapkép</div>}
                            <input id="edit-up" type="file" hidden accept="image/*" onChange={handleEditUpload}/>
                        </div>
                    )}

                    <textarea 
                        placeholder={tab === 'image' ? "Pl: Futurisztikus iroda Budapest felett..." : tab === 'video' ? "Pl: Egy macska vezet egy autót..." : "Pl: Adj hozzá napszemüveget..."}
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                    />
                    
                    <div className="controls-row">
                        {tab === 'image' && (
                            <select value={imgSize} onChange={e => setImgSize(e.target.value)}>
                                <option value="1K">1K</option>
                                <option value="2K">2K</option>
                                <option value="4K">4K</option>
                            </select>
                        )}
                        {tab === 'video' && (
                            <select value={videoRatio} onChange={e => setVideoRatio(e.target.value)}>
                                <option value="16:9">16:9 (Fekvő)</option>
                                <option value="9:16">9:16 (Álló)</option>
                            </select>
                        )}
                        <button className="generate-btn" onClick={handleGenerate} disabled={isGenerating || !prompt}>
                            {isGenerating ? <Icon name="sync" className="spin"/> : <Icon name="auto_awesome"/>}
                            Generálás
                        </button>
                    </div>
                </div>

                <div className="result-area">
                    {resultUrl ? (
                        resultType === 'image' ? <img src={resultUrl} alt="Result" className="result-media"/> : 
                        <video src={resultUrl} controls autoPlay loop className="result-media"/>
                    ) : (
                        <div className="empty-state">
                            <Icon name="palette" style={{fontSize: '48px', opacity: 0.3}}/>
                            <p>Az alkotás itt jelenik meg</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// PLANNER VIEW
const PlannerView = () => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

    return (
        <div className="view-container planner-view">
            <header className="view-header">
                <h2>Naptár & Gmail</h2>
            </header>

            <div className="calendar-strip">
                <div className="month-label">
                    {today.toLocaleString('hu-HU', { month: 'long', year: 'numeric' })}
                </div>
                <div className="days-scroller hide-scrollbar">
                    {days.map(d => (
                        <div key={d} className={`day-chip ${d === today.getDate() ? 'active' : ''}`}>
                            <span className="num">{d}</span>
                            <span className="dot"></span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="planner-content custom-scrollbar">
                <div className="section-title">Mai Teendők</div>
                {MOCK_EVENTS.map((ev: any) => (
                    <div key={ev.id} className="event-card glass-panel">
                        <div className={`event-strip ${ev.type}`}></div>
                        <div className="event-time">{ev.time || 'Egész nap'}</div>
                        <div className="event-details">
                            <h4 className={ev.status === 'completed' ? 'completed-task' : ''}>{ev.title}</h4>
                            <div className="event-meta-row">
                                <span className="tag">{ev.type}</span>
                                <span className={`status-pill ${ev.status || 'todo'}`}>
                                    {ev.status === 'completed' ? 'Kész' : ev.status === 'in-progress' ? 'Folyamatban' : 'Teendő'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}

                <div className="section-title" style={{marginTop: '24px'}}>
                    <Icon name="mail" style={{marginRight:'8px', fontSize:'18px'}}/> 
                    Beérkezett Levelek (Gmail)
                </div>
                <div className="email-preview glass-panel">
                    {MOCK_EMAILS.map(email => (
                         <div key={email.id} className="email-row clickable" onClick={() => setSelectedEmail(email)}>
                            <div className="sender">{email.sender}</div>
                            <div className="subject">{email.subject}</div>
                            <div className="date">{email.time}</div>
                        </div>
                    ))}
                </div>
            </div>
            
            {selectedEmail && (
                <EmailDetailModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />
            )}
        </div>
    );
};

const LoginView = ({ onLogin }: { onLogin: (user: User) => void }) => {
    return (
        <div className="login-screen">
            <div className="login-content">
                <div className="logo-orb">
                    <Icon name="diamond" style={{fontSize: '48px', color: '#fff'}} />
                </div>
                <h1 className="app-title-large">HeR WiNnEr</h1>
                <p className="login-subtitle">A Te személyes üzleti asszisztensed</p>
                <div className="user-card-preview" onClick={() => onLogin(MOCK_USER)}>
                    <div className="avatar">{MOCK_USER.avatarInitial}</div>
                    <div className="user-details">
                        <span className="name">{MOCK_USER.name}</span>
                        <span className="email">{MOCK_USER.email}</span>
                    </div>
                    <Icon name="arrow_forward_ios" style={{fontSize: '16px', opacity: 0.5}} />
                </div>
                <div className="gmail-badge">
                    <Icon name="mail" />
                    <span>Gmail Integráció Aktív</span>
                </div>
            </div>
        </div>
    );
};

// --- APP ---
const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState('assistant');
    const [showLive, setShowLive] = useState(false);

    if (!user) return <LoginView onLogin={setUser} />;

    return (
        <div className="app-shell">
            <div className="content-area">
                {activeTab === 'assistant' && <AssistantView onStartLive={() => setShowLive(true)} />}
                {activeTab === 'finance' && <FinanceView />}
                {activeTab === 'creative' && <CreativeView />}
                {activeTab === 'notes' && <NotesView />}
                {activeTab === 'planner' && <PlannerView />}
            </div>
            
            {showLive && <LiveVoiceOverlay onClose={() => setShowLive(false)} />}

            <nav className="bottom-nav">
                <button className={`nav-item ${activeTab === 'assistant' ? 'active' : ''}`} onClick={() => setActiveTab('assistant')}>
                    <Icon name="smart_toy" />
                    <span>Asszisztens</span>
                </button>
                <button className={`nav-item ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>
                    <Icon name="account_balance_wallet" />
                    <span>Pénzügy</span>
                </button>
                 <button className={`nav-item ${activeTab === 'creative' ? 'active' : ''}`} onClick={() => setActiveTab('creative')}>
                    <Icon name="palette" />
                    <span>Stúdió</span>
                </button>
                <button className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => setActiveTab('notes')}>
                    <Icon name="edit_note" />
                    <span>Jegyzet</span>
                </button>
                <button className={`nav-item ${activeTab === 'planner' ? 'active' : ''}`} onClick={() => setActiveTab('planner')}>
                    <Icon name="calendar_month" />
                    <span>Naptár</span>
                </button>
            </nav>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);