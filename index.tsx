import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from "@google/genai";
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
    isAction?: boolean;
    groundingMetadata?: any;
}

// Financial Data Types
interface FinanceState {
    pettyCash: number;
    bankBalance: number;
    expectedTaxes: number;
    lastUpdated: string;
}

// Structured Note Types
interface LoanRecord {
    id: string;
    name: string;
    date: string;
    amount: number;
    returned: number;
    isPaidOff: boolean;
}

interface NoteItem {
    id: string;
    type: 'text' | 'voice' | 'loan';
    title: string;
    content?: string;
    loanData?: LoanRecord;
    timestamp: string;
}

interface PlannerEvent {
    id: string;
    title: string;
    date: string;
    time?: string;
    type: 'meeting' | 'personal' | 'work';
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

const MOCK_EVENTS: PlannerEvent[] = [
    { id: 'e1', title: 'Könyvelői egyeztetés', date: new Date().toISOString().split('T')[0], time: '10:00', type: 'work' },
    { id: 'e2', title: 'NAV Határidő', date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], type: 'work' },
    { id: 'e3', title: 'Bevásárlás', date: new Date().toISOString().split('T')[0], time: '17:00', type: 'personal' }
];

// --- UTILS ---
const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const Icon = ({ name, className = '', style }: { name: string, className?: string, style?: React.CSSProperties }) => (
    <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
);

// --- COMPONENTS ---

// 1. LOGIN VIEW (S23 Style)
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

// 2. AI ASSISTANT (HOME) VIEW
const AssistantView = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { id: '1', role: 'model', text: 'Szia! Miben segíthetek ma a vállalkozásod körül?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<Chat | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        // Initialize Gemini
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        chatRef.current = ai.chats.create({
            model: 'gemini-3-pro-preview',
            config: {
                systemInstruction: "Te vagy a HeR WiNnEr alkalmazás asszisztense. A felhasználó egy vállalkozó (herwinner@gmail.com). Segíts neki üzleti, pénzügyi és szervezési kérdésekben. Légy tömör, lényegretörő és motiváló. A válaszaid formázd Markdown-ban.",
                thinkingConfig: { thinkingBudget: 1024 } // Low budget for faster snappy responses
            }
        });
    }, []);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = { id: generateId(), role: 'user', text: input };
        setMessages(p => [...p, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            if (!chatRef.current) throw new Error("AI not ready");
            
            // Fix: sendMessage takes an object with message property
            const result = await chatRef.current.sendMessage({ message: userMsg.text });
            // Fix: result is GenerateContentResponse, access text property directly
            const responseText = result.text || '';

            setMessages(p => [...p, { id: generateId(), role: 'model', text: responseText }]);
        } catch (err) {
            setMessages(p => [...p, { id: generateId(), role: 'model', text: 'Hiba történt a kapcsolatban.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="view-container assistant-view">
            <header className="view-header">
                <h2>Asszisztens</h2>
                <div className="status-dot online"></div>
            </header>
            
            <div className="chat-area custom-scrollbar">
                {messages.map(msg => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className="bubble">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
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
                <input 
                    type="text" 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    placeholder="Írj üzenetet..." 
                    disabled={isLoading}
                />
                <button type="submit" disabled={isLoading || !input.trim()}>
                    <Icon name="send" />
                </button>
            </form>
        </div>
    );
};

// 3. FINANCES VIEW
const FinanceView = () => {
    const [finance, setFinance] = useState<FinanceState>(INITIAL_FINANCE);

    // Formatter
    const fmt = (n: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

    return (
        <div className="view-container finance-view">
            <header className="view-header">
                <h2>Pénzügyi Kimutatás</h2>
            </header>

            <div className="finance-grid">
                {/* Petty Cash */}
                <div className="finance-card glass-panel">
                    <div className="card-icon cash">
                        <Icon name="payments" />
                    </div>
                    <div className="card-info">
                        <span className="label">Házi Pénztár</span>
                        <span className="amount">{fmt(finance.pettyCash)}</span>
                    </div>
                </div>

                {/* Bank */}
                <div className="finance-card glass-panel">
                    <div className="card-icon bank">
                        <Icon name="account_balance" />
                    </div>
                    <div className="card-info">
                        <span className="label">Bankszámla</span>
                        <span className="amount">{fmt(finance.bankBalance)}</span>
                    </div>
                </div>

                {/* Taxes */}
                <div className="finance-card glass-panel warning">
                    <div className="card-icon tax">
                        <Icon name="gavel" />
                    </div>
                    <div className="card-info">
                        <span className="label">Várható Adók</span>
                        <span className="amount negative">{fmt(finance.expectedTaxes)}</span>
                    </div>
                </div>

                {/* Total Available */}
                <div className="finance-summary glass-panel">
                    <h3>Likvid Tőke</h3>
                    <div className="big-number">{fmt(finance.pettyCash + finance.bankBalance - finance.expectedTaxes)}</div>
                    <p className="subtitle">Adók levonása után</p>
                </div>
            </div>
            
            <div className="finance-actions">
                <button className="btn-action primary"><Icon name="add" /> Bevétel</button>
                <button className="btn-action secondary"><Icon name="remove" /> Kiadás</button>
            </div>
        </div>
    );
};

// 4. NOTES & LOANS VIEW
const NotesView = () => {
    const [notes, setNotes] = useState<NoteItem[]>(INITIAL_LOANS);
    const [filter, setFilter] = useState<'all' | 'loan'>('all');

    const addLoan = () => {
        // Mocking adding a new loan logic
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

    const fmt = (n: number) => new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

    return (
        <div className="view-container notes-view">
            <header className="view-header">
                <h2>Jegyzetek & Tartozások</h2>
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
                                    <Icon name="handshake" />
                                    <span className="person-name">{note.loanData.name}</span>
                                    <span className="loan-date">{note.loanData.date}</span>
                                </div>
                                <div className="loan-body">
                                    <div className="loan-row">
                                        <span>Adott:</span>
                                        <span className="val-given">{fmt(note.loanData.amount)}</span>
                                    </div>
                                    <div className="loan-row">
                                        <span>Vissza:</span>
                                        <span className="val-ret">{fmt(note.loanData.returned)}</span>
                                    </div>
                                    <div className="loan-divider"></div>
                                    <div className="loan-row balance">
                                        <span>Egyenleg:</span>
                                        <span className={note.loanData.amount - note.loanData.returned > 0 ? 'negative' : 'positive'}>
                                            {fmt(note.loanData.amount - note.loanData.returned)}
                                        </span>
                                    </div>
                                </div>
                                <button className="btn-update-loan">Módosítás</button>
                            </div>
                        ) : (
                            <div className="text-note">
                                <h3>{note.title}</h3>
                                <p>{note.content}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="floating-actions">
                <button className="fab secondary" title="Hangjegyzet"><Icon name="mic" /></button>
                <button className="fab primary" onClick={addLoan} title="Új kölcsön"><Icon name="attach_money" /></button>
            </div>
        </div>
    );
};

// 5. PLANNER (CALENDAR + GMAIL)
const PlannerView = () => {
    // Mock Calendar Grid Logic (Simplified for mobile view)
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

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
                {MOCK_EVENTS.map(ev => (
                    <div key={ev.id} className="event-card glass-panel">
                        <div className={`event-strip ${ev.type}`}></div>
                        <div className="event-time">{ev.time || 'Egész nap'}</div>
                        <div className="event-details">
                            <h4>{ev.title}</h4>
                            <span className="tag">{ev.type}</span>
                        </div>
                    </div>
                ))}

                <div className="section-title" style={{marginTop: '24px'}}>
                    <Icon name="mail" style={{marginRight:'8px', fontSize:'18px'}}/> 
                    Beérkezett Levelek (Gmail)
                </div>
                <div className="email-preview glass-panel">
                    <div className="email-row">
                        <div className="sender">Könyvelő Iroda</div>
                        <div className="subject">Havi áfa bevallás tervezete</div>
                        <div className="date">10:30</div>
                    </div>
                    <div className="email-row">
                        <div className="sender">Google Payments</div>
                        <div className="subject">Sikeres fizetés</div>
                        <div className="date">Tegnap</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN LAYOUT (MOBILE SHELL) ---
const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState('assistant');

    // Simulate login persistence for demo
    useEffect(() => {
        // setUser(MOCK_USER); 
    }, []);

    if (!user) {
        return <LoginView onLogin={setUser} />;
    }

    return (
        <div className="app-shell">
            <div className="content-area">
                {activeTab === 'assistant' && <AssistantView />}
                {activeTab === 'finance' && <FinanceView />}
                {activeTab === 'notes' && <NotesView />}
                {activeTab === 'planner' && <PlannerView />}
            </div>

            {/* BOTTOM NAVIGATION BAR */}
            <nav className="bottom-nav">
                <button 
                    className={`nav-item ${activeTab === 'assistant' ? 'active' : ''}`}
                    onClick={() => setActiveTab('assistant')}
                >
                    <Icon name="smart_toy" />
                    <span>Asszisztens</span>
                </button>
                <button 
                    className={`nav-item ${activeTab === 'finance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('finance')}
                >
                    <Icon name="account_balance_wallet" />
                    <span>Pénzügy</span>
                </button>
                <button 
                    className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notes')}
                >
                    <Icon name="edit_note" />
                    <span>Jegyzet</span>
                </button>
                <button 
                    className={`nav-item ${activeTab === 'planner' ? 'active' : ''}`}
                    onClick={() => setActiveTab('planner')}
                >
                    <Icon name="calendar_month" />
                    <span>Naptár</span>
                </button>
                <a 
                    href="https://www.google.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="nav-item link-item"
                >
                    <Icon name="search" />
                    <span>Keresés</span>
                </a>
            </nav>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);