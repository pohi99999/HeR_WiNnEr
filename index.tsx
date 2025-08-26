/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, GenerateContentResponse, Content, Part, Type, FunctionDeclaration, Tool, SendMessageParameters, Modality } from "@google/genai";
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';


declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

const API_KEY = process.env.API_KEY;

// --- DATA INTERFACES ---
interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    isAction?: boolean; // New flag for tool calls
    isError?: boolean;
}

interface NavItem {
    id:string;
    label: string;
    icon?: string;
    subItems?: NavItem[];
}

type PlannerEventType = 'personal' | 'work' | 'email_task' | 'meeting' | 'deadline' | 'training_session' | 'client_task' | 'proposal_deadline' | 'declaration_deadline';

interface PlannerEvent {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM
    duration?: number; // in minutes
    type: PlannerEventType;
    description?: string;
    source?: string;
    location?: string;
}

interface EmailMessage {
    id: string;
    sender: string;
    recipient: string;
    subject: string;
    body: string;
    timestamp: string;
    read: boolean;
    important: boolean;
    category: 'inbox' | 'sent' | 'spam' | 'drafts';
}

interface TaskItem {
    id: string;
    title: string;
    description?: string;
    dueDate?: string; // YYYY-MM-DD
    priority: TaskPriority;
    status: TaskStatus;
    category?: TaskCategory;
    relatedTo?: string;
    assignedTo?: string;
    createdAt: string; // ISO Date string
    completedAt?: string; // ISO Date string
    subTasks?: SubTask[];
    projectId?: string;
    proposalId?: string;
    trainingId?: string;
}

interface SubTask {
    id:string;
    title: string;
    completed: boolean;
}

type TaskPriority = 'Alacsony' | 'Közepes' | 'Magas' | 'Kritikus';
type TaskStatus = 'Teendő' | 'Folyamatban' | 'Kész' | 'Blokkolt';
type TaskCategory = 'Munka' | 'Személyes' | 'Projekt' | 'Tanulás' | 'Ügyfél' | 'Email' | 'Pályázat' | 'Meeting';

type FinancialCategory = 'Fizetés' | 'Élelmiszer' | 'Rezsi' | 'Utazás' | 'Szórakozás' | 'Egyéb bevétel' | 'Egyéb kiadás';

interface Transaction {
    id: string;
    title: string;
    amount: number;
    type: 'income' | 'expense';
    category: FinancialCategory;
    date: string; // YYYY-MM-DD
}

type ProjectStatus = 'Tervezés' | 'Fejlesztés' | 'Tesztelés' | 'Kész';
interface Project {
    id: string;
    title: string;
    description: string;
    status: ProjectStatus;
    team: string[];
    dueDate?: string;
}

type ProposalStatus = 'Készül' | 'Beadva' | 'Értékelés alatt' | 'Elfogadva' | 'Elutasítva';
interface Proposal {
    id: string;
    title: string;
    funder: string;
    status: ProposalStatus;
    submissionDeadline: string; // YYYY-MM-DD
    amount: number;
    summary: string;
    relatedProjectId?: string;
    linkedDocIds?: string[];
    linkedContactIds?: string[];
}

type DocType = 'note' | 'link' | 'image';
interface DocItem {
    id: string;
    type: DocType;
    title: string;
    content: string; // note content, link URL, or base64 image data
    createdAt: string;
}

interface Budget {
    id: string;
    category: FinancialCategory;
    amount: number;
    period: 'havi'; // For now, only monthly
}

interface Notification {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

type TrainingStatus = 'Nem elkezdett' | 'Folyamatban' | 'Befejezett';
interface TrainingItem {
    id: string;
    title: string;
    provider: string;
    status: TrainingStatus;
    progress: number; // 0-100
    url?: string;
    description?: string;
}

interface Contact {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    notes?: string;
    linkedProjectIds?: string[];
    linkedProposalIds?: string[];
}


// --- MOCK DATA ---
const mockContacts: Contact[] = [
    { id: 'contact-1', name: 'Dénes', company: 'P-Day Kft.', role: 'Marketing Vezető', email: 'denes@example.com', phone: '+36 30 123 4567', linkedProjectIds: ['proj-2', 'proj-4'] },
    { id: 'contact-2', name: 'Eszter', company: 'P-Day Kft.', role: 'Marketing Menedzser', email: 'eszter@example.com', linkedProjectIds: ['proj-2'] },
    { id: 'contact-3', name: 'Kovács Gábor', company: 'Innovatív Zrt.', role: 'Innovációs Igazgató', email: 'gabor.kovacs@innovativ.com', notes: 'Potenciális partner a V7 fejlesztéshez.', linkedProposalIds: ['prop-1'] },
    { id: 'contact-4', name: 'Nagy Anna', company: 'NKFI Hivatal', role: 'Pályázati Referens', email: 'anna.nagy@nkfih.gov.hu', notes: 'Kapcsolattartó az "Innovációs Technológiai Fejlesztés 2024" pályázathoz.' },
    { id: 'contact-5', name: 'Béla', company: 'P-Day Kft.', role: 'Fejlesztő', email: 'bela@example.com', linkedProjectIds: ['proj-1'] },
];

const mockDocs: DocItem[] = [
    { id: 'doc-1', type: 'note', title: 'Q3 Marketing Jegyzetek', content: 'A kampány fő üzenete a megbízhatóság és az innováció. Célcsoport: 25-45 év közötti technológiai szakemberek...', createdAt: new Date('2024-07-30').toISOString() },
    { id: 'doc-2', type: 'link', title: 'Gemini API Dokumentáció', content: 'https://ai.google.dev/gemini-api/docs', createdAt: new Date('2024-07-29').toISOString() },
    { id: 'doc-3', type: 'image', title: 'Új Logó Terv', content: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iI2YxYzQwZiIvPjxwYXRoIGQ9Ik01MCwyMEw3NSw3MEwyNSw3MFoiIGZpbGw9IiNlNzRhM2MiLz48L3N2Zz4=', createdAt: new Date('2024-07-28').toISOString() },
    { id: 'doc-4', type: 'note', title: 'Projekt V7 Ötletek', content: 'Felhasználói authentikáció OAuth2-vel. Adatbázis séma optimalizálása. Valós idejű értesítések implementálása WebSocket segítségével.', createdAt: new Date('2024-07-25').toISOString() },
    { id: 'doc-5', type: 'image', title: 'AI által generált kép', content: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNhZmU5ZWEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiM1M2I4YjQiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg==', createdAt: new Date('2024-08-01').toISOString() }
];

const mockProposals: Proposal[] = [
    { id: 'prop-1', title: 'Innovációs Technológiai Fejlesztés 2024', funder: 'NKFI Hivatal', status: 'Készül', submissionDeadline: '2024-09-15', amount: 25000000, summary: 'A Projekt V7 fejlesztésének támogatása, fókuszban a mesterséges intelligencia integrációjával és a felhasználói élmény javításával.', relatedProjectId: 'proj-1' },
    { id: 'prop-2', title: 'Digitális Megjelenés KKV-knak', funder: 'GINOP Plusz', status: 'Beadva', submissionDeadline: '2024-07-20', amount: 15000000, summary: 'Online marketing és e-kereskedelmi képességek fejlesztése a P-Day Kft. számára.', relatedProjectId: 'proj-2' },
    { id: 'prop-3', title: 'Kutatási Infrastruktúra Modernizálása', funder: 'ELKH', status: 'Értékelés alatt', submissionDeadline: '2024-06-30', amount: 75000000, summary: 'Szerverpark bővítése és felhő alapú számítási kapacitás növelése.', relatedProjectId: 'proj-3' }
];

const mockTrainings: TrainingItem[] = [
    { id: 'train-1', title: 'Advanced React Patterns', provider: 'Frontend Masters', status: 'Folyamatban', progress: 65, url: '#' },
    { id: 'train-2', title: 'Gemini API Masterclass', provider: 'Google AI', status: 'Nem elkezdett', progress: 0, url: '#' },
    { id: 'train-3', title: 'UI/UX Design Fundamentals', provider: 'Coursera', status: 'Befejezett', progress: 100, url: '#' },
];

const mockProjects: Project[] = [
    { id: 'proj-1', title: 'Projekt V7 Fejlesztés', description: 'Az új generációs belső menedzsment szoftver fejlesztése.', status: 'Fejlesztés', team: ['Béla', 'Felhasználó'], dueDate: '2024-12-31' },
    { id: 'proj-2', title: 'Q3 Marketing Kampány', description: 'Online kampány a P-Day Kft. új szolgáltatásainak népszerűsítésére.', status: 'Tervezés', team: ['Dénes', 'Eszter', 'Felhasználó'], dueDate: '2024-09-30' },
    { id: 'proj-3', title: 'Szerver Infrastruktúra Bővítés', description: 'A megnövekedett terhelés kiszolgálása új szerverekkel.', status: 'Tesztelés', team: ['Béla'], dueDate: '2024-08-15' },
    { id: 'proj-4', title: 'Ügyfélkapcsolati Rendszer (CRM) Bevezetése', description: 'Új CRM rendszer implementálása az értékesítési folyamatok támogatására.', status: 'Kész', team: ['Dénes', 'Felhasználó'] }
];

const mockTransactions: Transaction[] = [
    { id: 't1', title: 'Fizetés - Július', amount: 750000, type: 'income', category: 'Fizetés', date: '2024-07-31' },
    { id: 't2', title: 'Nagybevásárlás', amount: -25000, type: 'expense', category: 'Élelmiszer', date: '2024-07-28' },
    { id: 't3', title: 'Villanyszámla', amount: -15000, type: 'expense', category: 'Rezsi', date: '2024-07-25' },
    { id: 't4', title: 'Koncertjegy', amount: -18000, type: 'expense', category: 'Szórakozás', date: '2024-07-22' },
    { id: 't5', title: 'Szabadúszó projekt', amount: 120000, type: 'income', category: 'Egyéb bevétel', date: '2024-07-20' },
];

const mockBudgets: Budget[] = [
    { id: 'b1', category: 'Élelmiszer', amount: 80000, period: 'havi' },
    { id: 'b2', category: 'Rezsi', amount: 50000, period: 'havi' },
    { id: 'b3', category: 'Szórakozás', amount: 40000, period: 'havi' },
];

const mockTasks: TaskItem[] = [
    { id: 'task-1', title: 'API végpontok dokumentálása', description: 'Swagger/OpenAPI dokumentáció készítése a V7 projekthez.', status: 'Folyamatban', priority: 'Magas', projectId: 'proj-1', createdAt: '2024-07-28' },
    { id: 'task-2', title: 'Felhasználói authentikáció implementálása', description: 'OAuth2 alapú bejelentkezés megvalósítása.', status: 'Teendő', priority: 'Kritikus', projectId: 'proj-1', createdAt: '2024-07-29' },
    { id: 'task-3', title: 'Marketing szövegek megírása', description: 'A Q3 kampányhoz tartozó hirdetési szövegek elkészítése.', status: 'Kész', priority: 'Közepes', projectId: 'proj-2', createdAt: '2024-07-25' },
    { id: 'task-4', title: 'Szerver terheléstesztelés', description: 'Az új infrastruktúra teljesítményének ellenőrzése.', status: 'Blokkolt', priority: 'Magas', projectId: 'proj-3', createdAt: '2024-08-01' },
    { id: 'task-5', title: 'Heti riport elkészítése', status: 'Teendő', priority: 'Közepes', category: 'Munka', createdAt: '2024-08-02', dueDate: '2024-08-05' },
    { id: 'task-6', title: 'Bevásárlás', status: 'Teendő', priority: 'Alacsony', category: 'Személyes', createdAt: '2024-08-02' },
    { id: 'task-7', title: 'Pályázati anyagok összegyűjtése', status: 'Folyamatban', priority: 'Magas', proposalId: 'prop-1', createdAt: '2024-07-30', dueDate: '2024-08-20' },
];

const mockPlannerEvents: PlannerEvent[] = [
    { id: 'event-1', title: 'Heti Projekt Míting', date: '2024-08-05', time: '10:00', duration: 60, type: 'meeting', location: 'Google Meet' },
    { id: 'event-2', title: 'Marketing Kampány Indítása', date: '2024-08-12', type: 'deadline', description: 'Q3 Kampány start' },
    { id: 'event-3', title: 'Edzés', date: '2024-08-05', time: '18:00', duration: 90, type: 'personal' },
    { id: 'event-4', title: 'Pályázat beadási határidő', date: '2024-09-15', type: 'proposal_deadline' }
];

const mockEmails: EmailMessage[] = [
    { id: 'email-1', sender: 'Dénes', recipient: 'Felhasználó', subject: 'Marketing kampány', body: 'Szia, átküldtem a legújabb anyagokat. Kérlek nézd át őket. Köszi, Dénes', timestamp: new Date().toISOString(), read: false, important: true, category: 'inbox' },
    { id: 'email-2', sender: 'Kovács Gábor', recipient: 'Felhasználó', subject: 'Ismerkedő megbeszélés', body: 'Kedves Felhasználó! A jövő hét megfelelő lenne egy rövid megbeszélésre? Üdv, Kovács Gábor', timestamp: new Date(Date.now() - 86400000).toISOString(), read: true, important: false, category: 'inbox' },
    { id: 'email-3', sender: 'Felhasználó', recipient: 'Béla', subject: 'Re: API bug', body: 'Szia Béla, találtam egy hibát a /users végponton. Ránéznél?', timestamp: new Date(Date.now() - 172800000).toISOString(), read: true, important: false, category: 'sent' },
];

const ai = new GoogleGenAI({ apiKey: API_KEY });

const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'planner', label: 'Planner', icon: 'calendar_month' },
    { id: 'tasks', label: 'Tasks', icon: 'task_alt' },
    { id: 'email', label: 'Email', icon: 'mail' },
    {
        id: 'work', label: 'Work', icon: 'work', subItems: [
            { id: 'projects', label: 'Projects', icon: 'assignment' },
            { id: 'proposals', label: 'Proposals', icon: 'description' },
            { id: 'trainings', label: 'Trainings', icon: 'school' },
            { id: 'contacts', label: 'Contacts', icon: 'contacts' },
        ]
    },
    { id: 'finances', label: 'Finances', icon: 'account_balance_wallet' },
    { id: 'docs', label: 'Documents', icon: 'folder' },
    {
        id: 'ai_tools', label: 'AI Tools', icon: 'smart_toy', subItems: [
            { id: 'gemini_chat', label: 'Gemini Chat', icon: 'chat' },
            { id: 'creative_tools', label: 'Creative Tools', icon: 'brush' },
            { id: 'meeting_assistant', label: 'Meeting Assistant', icon: 'mic' },
        ]
    }
];

// --- HELPER FUNCTIONS & HOOKS ---
const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const useMockData = () => {
    const [data, setData] = useState({
        contacts: mockContacts,
        docs: mockDocs,
        proposals: mockProposals,
        trainings: mockTrainings,
        projects: mockProjects,
        transactions: mockTransactions,
        budgets: mockBudgets,
        tasks: mockTasks,
        plannerEvents: mockPlannerEvents,
        emails: mockEmails,
    });

    const updateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
        setData(prevData => ({
            ...prevData,
            tasks: prevData.tasks.map(task => 
                task.id === taskId ? { ...task, status: newStatus } : task
            ),
        }));
    };
    
    const addDoc = (doc: DocItem) => {
        setData(prev => ({...prev, docs: [doc, ...prev.docs]}));
    }

    return { ...data, updateTaskStatus, addDoc };
};

const Icon = ({ name }: { name: string }) => <span className="material-symbols-outlined">{name}</span>;


// --- UI COMPONENTS ---

// FIX: Add `style` prop to Card component to allow passing custom styles.
const Card = ({ children, className = '', header, fullHeight, style }: { children: React.ReactNode, className?: string, header?: React.ReactNode, fullHeight?: boolean, style?: React.CSSProperties }) => (
    <div className={`card ${className}`} style={{ height: fullHeight ? '100%' : 'auto', ...style }}>
        {header && <div className="card-header">{header}</div>}
        <div className="card-body" style={{ height: fullHeight && header ? 'calc(100% - 65px)' : fullHeight ? '100%' : 'auto' }}>
            {children}
        </div>
    </div>
);

// --- SIDEBAR & HEADER ---

const Sidebar = ({ currentView, setView, isCollapsed, setCollapsed }) => {
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({ work: true, ai_tools: true });

    const NavLink = ({ item }) => (
        <li>
            <a href="#" className={`nav-link ${currentView === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
            </a>
        </li>
    );

    const NavSection = ({ item }) => {
        const isOpen = openSections[item.id] || false;
        return (
            <li>
                <button className={`nav-link nav-section-header ${isOpen ? 'open' : ''}`} onClick={() => setOpenSections(s => ({...s, [item.id]: !s[item.id]}))}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <Icon name="chevron_right" />
                </button>
                <div className={`nav-sub-list-wrapper ${isOpen ? 'open' : ''}`}>
                    <ul className="nav-sub-list">
                        {item.subItems.map(subItem => <NavLink key={subItem.id} item={subItem} />)}
                    </ul>
                </div>
            </li>
        );
    };

    return (
        <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
            <div className="sidebar-inner">
                <header className="sidebar-header">
                    {!isCollapsed && <h2>P-Day Light</h2>}
                    <button className="collapse-toggle" onClick={() => setCollapsed(!isCollapsed)}>
                        <Icon name={isCollapsed ? 'menu_open' : 'menu'} />
                    </button>
                </header>
                <nav className="sidebar-nav">
                    <ul className="nav-list">
                        {navItems.map(item => item.subItems ? <NavSection key={item.id} item={item} /> : <NavLink key={item.id} item={item} />)}
                    </ul>
                </nav>
            </div>
        </aside>
    );
};

const GlobalHeader = ({ currentView }) => {
    const currentNavItem = navItems.flatMap(i => i.subItems || i).find(i => i.id === currentView);
    return (
        <header className="global-header">
            <h3>{currentNavItem?.label || 'Dashboard'}</h3>
            <div className="global-header-actions">
                <button className="user-profile-button">
                    <div className="avatar-sm">F</div>
                    <span>Felhasználó</span>
                </button>
            </div>
        </header>
    );
};

// --- VIEWS ---

const DashboardView = ({ tasks, emails }) => (
    <div className="dashboard-grid">
        <Card className="stagger-item" header={<h4>Tasks Due Soon</h4>}>
            <ul className="quick-list">
                {tasks.filter(t => t.dueDate).slice(0, 5).map(task => (
                    <li key={task.id}>
                        <span>{task.title}</span>
                        <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </li>
                ))}
            </ul>
        </Card>
        <Card className="stagger-item" style={{animationDelay: '100ms'}} header={<h4>Recent Emails</h4>}>
             <ul className="quick-list email-list">
                {emails.slice(0, 5).map(email => (
                    <li key={email.id}>
                       <div>
                            <span className="email-sender">{email.sender}</span>
                            <p className="email-subject">{email.subject}</p>
                       </div>
                    </li>
                ))}
            </ul>
        </Card>
    </div>
);

const PlannerView = ({ events }: { events: PlannerEvent[] }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const changeMonth = (offset: number) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    const { monthGrid, monthName, year } = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthName = currentDate.toLocaleString('hu-HU', { month: 'long' });

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const monthGrid: { date: Date; isCurrentMonth: boolean }[] = [];
        
        const correctedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = correctedFirstDay - 1; i >= 0; i--) {
            monthGrid.push({
                date: new Date(year, month - 1, prevMonthDays - i),
                isCurrentMonth: false,
            });
        }
        
        for (let i = 1; i <= daysInMonth; i++) {
            monthGrid.push({
                date: new Date(year, month, i),
                isCurrentMonth: true,
            });
        }

        const gridEndIndex = monthGrid.length;
        const remainingCells = 42 - gridEndIndex;
        for (let i = 1; i <= remainingCells; i++) {
            monthGrid.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false,
            });
        }

        return { monthGrid, monthName, year };
    }, [currentDate]);
    
    const weekDays = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

    const getEventsForDay = (day: Date) => {
        const dateString = day.toISOString().split('T')[0];
        return events.filter(event => event.date === dateString);
    };

    return (
        <div className="view-fade-in">
            <Card header={
                <div className="view-header" style={{marginBottom: 0, flexWrap: 'nowrap'}}>
                    <h2>Planner</h2>
                    <div className="calendar-controls">
                        <button className="btn btn-secondary btn-icon" onClick={() => changeMonth(-1)} aria-label="Previous month"><Icon name="chevron_left" /></button>
                         <h3 className="calendar-current-date">{`${year} ${monthName}`}</h3>
                        <button className="btn btn-secondary btn-icon" onClick={() => changeMonth(1)} aria-label="Next month"><Icon name="chevron_right" /></button>
                        <button className="btn btn-secondary" onClick={goToToday}>Ma</button>
                    </div>
                </div>
            }>
                <div className="calendar-container">
                    <div className="calendar-header">
                        {weekDays.map(day => <div key={day} className="day-header">{day}</div>)}
                    </div>
                    <div className="calendar-body">
                        {monthGrid.map((day, index) => {
                            const dayEvents = getEventsForDay(day.date);
                            const isToday = day.date.toDateString() === new Date().toDateString() && day.isCurrentMonth;
                            return (
                                <div key={index} className={`day-cell ${day.isCurrentMonth ? '' : 'other-month'}`}>
                                    <span className={`day-number ${isToday ? 'today' : ''}`}>{day.date.getDate()}</span>
                                    <div className="events-container">
                                        {dayEvents.slice(0,3).map(event => (
                                            <div key={event.id} className={`event-pill event-type-${event.type}`} title={event.title}>
                                                <span className="event-pill-dot"></span>
                                                <span className="event-title">{event.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Card>
        </div>
    );
};


// FIX: Changed `ref={drag}` to use a `useRef` hook to resolve react-dnd type incompatibility.
const TaskCard = ({ task }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'TASK',
        item: { id: task.id },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));
    drag(ref);

    return (
        <div ref={ref} className="task-card card" style={{ opacity: isDragging ? 0.5 : 1 }}>
            <div className="task-card-header">
                <h5 className="task-title">{task.title}</h5>
            </div>
            {task.description && <p>{task.description}</p>}
             <div className="task-card-pills">
                <span className={`task-pill priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
            </div>
        </div>
    );
};


// FIX: Changed `ref={drop}` to use a `useRef` hook to resolve react-dnd type incompatibility.
const KanbanColumn = ({ status, tasks, onDrop }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TASK',
        drop: (item: { id: string }) => onDrop(item.id, status),
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }));
    drop(ref);

    return (
        <div ref={ref} className={`kanban-column card ${isOver ? 'is-over' : ''}`} >
            <div className="kanban-column-header">
                <h3>{status} ({tasks.length})</h3>
            </div>
            <div className="kanban-column-body">
                {tasks.map(task => <TaskCard key={task.id} task={task} />)}
            </div>
        </div>
    );
};


const TasksView = ({ tasks, updateTaskStatus }) => {
    const statuses: TaskStatus[] = ['Teendő', 'Folyamatban', 'Kész', 'Blokkolt'];

    const handleDrop = (taskId, newStatus) => {
        updateTaskStatus(taskId, newStatus);
    };
    
    const tasksByStatus = useMemo(() => {
        return statuses.reduce((acc, status) => {
            acc[status] = tasks.filter(t => t.status === status);
            return acc;
        }, {} as Record<TaskStatus, TaskItem[]>);
    }, [tasks]);

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="view-header"><h2>Tasks</h2></div>
            <div className="tasks-kanban-board-container">
                <div className="kanban-board">
                    {statuses.map(status => (
                        <KanbanColumn
                            key={status}
                            status={status}
                            tasks={tasksByStatus[status]}
                            onDrop={handleDrop}
                        />
                    ))}
                </div>
            </div>
        </DndProvider>
    );
};

const EmailView = () => <div className="view-fade-in"><Card header={<h2>Email</h2>}><p>Email View under construction.</p></Card></div>;
const ProjectsView = () => <div className="view-fade-in"><Card header={<h2>Projects</h2>}><p>Projects View under construction.</p></Card></div>;
const ProposalsView = () => <div className="view-fade-in"><Card header={<h2>Proposals</h2>}><p>Proposals View under construction.</p></Card></div>;
const TrainingsView = () => <div className="view-fade-in"><Card header={<h2>Trainings</h2>}><p>Trainings View under construction.</p></Card></div>;
const ContactsView = () => <div className="view-fade-in"><Card header={<h2>Contacts</h2>}><p>Contacts View under construction.</p></Card></div>;
const FinancesView = () => <div className="view-fade-in"><Card header={<h2>Finances</h2>}><p>Finances View under construction.</p></Card></div>;
const DocsView = () => <div className="view-fade-in"><Card header={<h2>Documents</h2>}><p>Documents View under construction.</p></Card></div>;


const GeminiChatView = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chat = useRef<Chat | null>(null);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);

    useEffect(() => {
        chat.current = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { tools: [{ googleSearch: {} }] },
        });
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);
    
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { id: generateId(), text: input, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const responseStream = await chat.current.sendMessageStream({ message: input });
            
            let botMessage: Message = { id: generateId(), text: '', sender: 'bot' };
            setMessages(prev => [...prev, botMessage]);

            for await (const chunk of responseStream) {
                botMessage.text += chunk.text;
                setMessages(prev => prev.map(m => m.id === botMessage.id ? { ...m, text: botMessage.text } : m));
            }

        } catch (error) {
            console.error(error);
            const errorMessage: Message = { id: generateId(), text: 'Sorry, I encountered an error.', sender: 'bot', isError: true };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card fullHeight className="gemini-chat-view view-fade-in">
             <div className="chat-window">
                <div className="chat-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`message ${msg.sender} ${msg.isError ? 'error' : ''} ${msg.isAction ? 'action' : ''}`}>
                            <div className="message-content">
                               <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                     {isLoading && (
                        <div className="message bot">
                            <div className="message-content typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="chat-input-form">
                    <input
                        type="text"
                        className="form-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Gemini anything..."
                        disabled={isLoading}
                        aria-label="Chat input"
                    />
                    <button type="submit" className="btn btn-primary" disabled={isLoading}>
                        <Icon name="send" />
                    </button>
                </form>
            </div>
        </Card>
    );
};

const CreativeView = () => {
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const { addDoc } = useMockData();

    const generateImage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsLoading(true);
        setError('');
        setImages([]);

        try {
             const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1 },
            });
            const base64Image = response.generatedImages[0].image.imageBytes;
            setImages([`data:image/png;base64,${base64Image}`]);

        } catch (err) {
            console.error(err);
            setError('Failed to generate image. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const saveImage = (base64Image: string) => {
        const newDoc: DocItem = {
            id: generateId(),
            type: 'image',
            title: `AI Image: ${prompt.substring(0, 20)}...`,
            content: base64Image,
            createdAt: new Date().toISOString(),
        };
        addDoc(newDoc);
        // Add notification logic here if available
    };

    return (
        <div className="creative-view-container view-fade-in">
            <Card className="generation-form-card">
                <form onSubmit={generateImage} className="generation-form">
                    <h4>Image Generation</h4>
                    <textarea
                        className="form-textarea"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the image you want to create..."
                        rows={5}
                        disabled={isLoading}
                    />
                    <button type="submit" className="btn btn-primary" disabled={isLoading}>
                        {isLoading ? 'Generating...' : 'Generate'}
                    </button>
                </form>
            </Card>
            <Card className="image-results-card">
                {isLoading && <div className="loading-spinner"><div></div><div></div><div></div><div></div></div>}
                {error && <p className="error-message">{error}</p>}
                {!isLoading && !error && images.length === 0 && <p className="placeholder-text">Your generated images will appear here.</p>}
                {images.length > 0 && (
                    <div className="image-results-grid">
                        {images.map((img, index) => (
                             <div key={index} className="generated-image-container">
                                <img src={img} alt={`Generated image ${index + 1}`} />
                                <button className="btn btn-primary save-btn" onClick={() => saveImage(img)}>
                                    <Icon name="save" /> Save
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

const MeetingAssistantView = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [analysis, setAnalysis] = useState<{ summary: string; actionItems: string[]; keyTopics: string[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'hu-HU'; // Or any other language

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                setTranscript(prev => prev + finalTranscript);
            };
            
            recognitionRef.current = recognition;
        }
        
        return () => {
             if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        }

    }, []);

    const toggleRecording = () => {
        if (!recognitionRef.current) {
            setError('Speech Recognition is not supported by your browser.');
            return;
        }
        if (isRecording) {
            recognitionRef.current.stop();
            setIsRecording(false);
        } else {
            setTranscript('');
            setAnalysis(null);
            setError('');
            recognitionRef.current.start();
            setIsRecording(true);
        }
    };
    
    const analyzeTranscript = async () => {
        if (!transcript.trim()) return;
        setIsLoading(true);
        setError('');
        setAnalysis(null);
        
        const prompt = `Analyze the following meeting transcript. Provide a concise summary, a list of action items, and a list of key topics discussed.
        Transcript:
        ---
        ${transcript}
        ---
        `;
        
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING, description: 'A brief summary of the meeting.' },
                            actionItems: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: 'A list of action items from the meeting.'
                            },
                            keyTopics: {
                                type: Type.ARRAY,
                                items: { type: Type.STRING },
                                description: 'A list of key topics discussed.'
                            },
                        }
                    },
                },
            });
            
            const jsonString = response.text;
            const parsedJson = JSON.parse(jsonString);
            setAnalysis(parsedJson);

        } catch (err) {
            console.error(err);
            setError("Failed to analyze the transcript. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };


    return (
         <div className="view-fade-in meeting-assistant-layout">
            <Card className="transcript-panel" fullHeight
                header={
                    <div className="card-header-content">
                        <h4>Transcript</h4>
                        <div className="meeting-controls">
                            <button onClick={toggleRecording} className={`btn ${isRecording ? 'btn-destructive' : 'btn-primary'}`}>
                                <Icon name={isRecording ? 'stop' : 'mic'} />
                                {isRecording ? 'Stop Recording' : 'Start Recording'}
                            </button>
                        </div>
                    </div>
                }>
                <div className="transcript-body">
                    {transcript || <p className="placeholder-text">Your meeting transcript will appear here...</p>}
                </div>
            </Card>

            <Card className="analysis-panel" fullHeight
                header={
                     <div className="card-header-content">
                        <h4>AI Analysis</h4>
                        <button onClick={analyzeTranscript} className="btn btn-secondary" disabled={isLoading || isRecording || !transcript}>
                            <Icon name="auto_awesome" />
                            Analyze
                        </button>
                    </div>
                }>
                 <div className="analysis-results">
                    {isLoading && <div className="loading-spinner"><div></div><div></div><div></div><div></div></div>}
                    {error && <p className="error-message">{error}</p>}
                    {!analysis && !isLoading && <p className="placeholder-text">Analysis results will appear here after recording and analyzing.</p>}
                    {analysis && (
                        <>
                            <div className="analysis-section">
                                <h4>Summary</h4>
                                <p>{analysis.summary}</p>
                            </div>
                            <div className="analysis-section">
                                <h4>Action Items</h4>
                                <ul>
                                    {analysis.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                            <div className="analysis-section">
                                <h4>Key Topics</h4>
                                <ul>
                                    {analysis.keyTopics.map((topic, i) => <li key={i}>{topic}</li>)}
                                </ul>
                            </div>
                        </>
                    )}
                </div>
            </Card>
        </div>
    )
}

// --- MAIN APP ---

const App = () => {
    const [currentView, setCurrentView] = useState('dashboard');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const data = useMockData();

    const renderView = () => {
        switch (currentView) {
            case 'dashboard': return <DashboardView tasks={data.tasks} emails={data.emails}/>;
            case 'planner': return <PlannerView events={data.plannerEvents} />;
            case 'tasks': return <TasksView tasks={data.tasks} updateTaskStatus={data.updateTaskStatus}/>;
            case 'email': return <EmailView />;
            case 'projects': return <ProjectsView />;
            case 'proposals': return <ProposalsView />;
            case 'trainings': return <TrainingsView />;
            case 'contacts': return <ContactsView />;
            case 'finances': return <FinancesView />;
            case 'docs': return <DocsView />;
            case 'gemini_chat': return <GeminiChatView />;
            case 'creative_tools': return <CreativeView />;
            case 'meeting_assistant': return <MeetingAssistantView />;
            default: return <DashboardView tasks={data.tasks} emails={data.emails} />;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar 
                currentView={currentView} 
                setView={setCurrentView} 
                isCollapsed={isSidebarCollapsed}
                setCollapsed={setIsSidebarCollapsed}
            />
            <div className="page-container" style={{paddingLeft: isSidebarCollapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)'}}>
                <GlobalHeader currentView={currentView} />
                <main className="main-content">
                    {renderView()}
                </main>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);