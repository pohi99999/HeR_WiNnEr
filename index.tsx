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
    { id: 'dashboard', label: 'Irányítópult', icon: 'dashboard' },
    { id: 'planner', label: 'Tervező', icon: 'calendar_month' },
    { id: 'tasks', label: 'Feladatok', icon: 'task_alt' },
    { id: 'email', label: 'Email', icon: 'mail' },
    {
        id: 'work', label: 'Munka', icon: 'work', subItems: [
            { id: 'projects', label: 'Projektek', icon: 'assignment' },
            { id: 'proposals', label: 'Pályázatok', icon: 'description' },
            { id: 'trainings', label: 'Képzések', icon: 'school' },
            { id: 'contacts', label: 'Névjegyek', icon: 'contacts' },
        ]
    },
    { id: 'finances', label: 'Pénzügyek', icon: 'account_balance_wallet' },
    { id: 'docs', label: 'Dokumentumok', icon: 'folder' },
    {
        id: 'ai_tools', label: 'AI Eszközök', icon: 'smart_toy', subItems: [
            { id: 'gemini_chat', label: 'Gemini Chat', icon: 'chat' },
            { id: 'creative_tools', label: 'Kreatív Eszközök', icon: 'brush' },
            { id: 'meeting_assistant', label: 'Meeting Asszisztens', icon: 'mic' },
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

    const updateProjectStatus = (projectId: string, newStatus: ProjectStatus) => {
        setData(prevData => ({
            ...prevData,
            projects: prevData.projects.map(project =>
                project.id === projectId ? { ...project, status: newStatus } : project
            ),
        }));
    };
    
    const addDoc = (doc: DocItem) => {
        setData(prev => ({...prev, docs: [doc, ...prev.docs]}));
    }

    return { ...data, updateTaskStatus, addDoc, updateProjectStatus };
};

const Icon = ({ name, filled }: { name: string, filled?: boolean }) => <span className={`material-symbols-outlined ${filled ? 'filled' : ''}`}>{name}</span>;


// --- UI COMPONENTS ---

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
            <h3>{currentNavItem?.label || 'Irányítópult'}</h3>
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
        <Card className="stagger-item" header={<h4>Hamarosan lejáró feladatok</h4>}>
            <ul className="quick-list">
                {tasks.filter(t => t.dueDate).slice(0, 5).map(task => (
                    <li key={task.id}>
                        <span>{task.title}</span>
                        <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </li>
                ))}
            </ul>
        </Card>
        <Card className="stagger-item" style={{animationDelay: '100ms'}} header={<h4>Legutóbbi Emailek</h4>}>
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
                    <h2>Tervező</h2>
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

const TaskCard = ({ task }: { task: TaskItem }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'TASK',
        item: { id: task.id, status: task.status },
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));
    drag(ref);

    return (
        <div ref={ref} className="task-card" style={{ opacity: isDragging ? 0.4 : 1 }}>
            <div className="task-card-header">
                <h4 className="task-title">{task.title}</h4>
                <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
            </div>
            {task.description && <p className="task-description">{task.description}</p>}
             <div className="task-card-footer">
                {task.dueDate && <div className="task-info-item"><Icon name="event" /><span>{task.dueDate}</span></div>}
                {task.projectId && <div className="task-info-item"><Icon name="assignment" /><span>Projekt</span></div>}
             </div>
        </div>
    );
};

const KanbanColumn = ({ status, tasks, onDropTask }: { status: TaskStatus, tasks: TaskItem[], onDropTask: (taskId: string, newStatus: TaskStatus) => void }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'TASK',
        drop: (item: { id: string }) => onDropTask(item.id, status),
        collect: (monitor) => ({
            isOver: !!monitor.isOver(),
        }),
    }));
    drop(ref);

    return (
        <div ref={ref} className={`kanban-column ${isOver ? 'is-over' : ''}`}>
            <div className="kanban-column-header">
                <h3>{status}</h3>
                <span className="task-count">{tasks.length}</span>
            </div>
            <div className="kanban-column-body">
                {tasks.map(task => <TaskCard key={task.id} task={task} />)}
            </div>
        </div>
    );
};

const TasksView = ({ tasks, updateTaskStatus }: { tasks: TaskItem[], updateTaskStatus: (id: string, status: TaskStatus) => void }) => {
    const statuses: TaskStatus[] = ['Teendő', 'Folyamatban', 'Kész', 'Blokkolt'];
    const tasksByStatus = statuses.reduce((acc, status) => {
        acc[status] = tasks.filter(t => t.status === status);
        return acc;
    }, {} as Record<TaskStatus, TaskItem[]>);

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="view-fade-in kanban-board-container">
                <div className="view-header">
                    <h2>Feladatok</h2>
                     <button className="btn btn-primary"><Icon name="add"/><span>Új Feladat</span></button>
                </div>
                <div className="kanban-board">
                    {statuses.map(status => (
                        <KanbanColumn
                            key={status}
                            status={status}
                            tasks={tasksByStatus[status]}
                            onDropTask={updateTaskStatus}
                        />
                    ))}
                </div>
            </div>
        </DndProvider>
    );
};

const EmailView = ({ emails: initialEmails }) => {
    const [emails, setEmails] = useState(initialEmails);
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(emails.find(e => e.category === 'inbox')?.id || null);
    const [activeCategory, setActiveCategory] = useState<'inbox' | 'sent'>('inbox');
    
    const selectedEmail = emails.find(e => e.id === selectedEmailId);

    const handleSelectEmail = (id: string) => {
        setSelectedEmailId(id);
        setEmails(emails.map(e => e.id === id ? { ...e, read: true } : e));
    };

    const toggleImportance = (id: string) => {
        setEmails(emails.map(e => e.id === id ? { ...e, important: !e.important } : e));
    };

    const visibleEmails = emails.filter(e => e.category === activeCategory);

    return (
        <div className="view-fade-in">
            <Card fullHeight className="email-view-card">
                 <div className="email-view-layout">
                    <div className="email-sidebar">
                        <div className="email-actions">
                            <button className="btn btn-primary" style={{width: '100%'}}>Új Email</button>
                        </div>
                        <ul className="email-folders">
                            <li className={activeCategory === 'inbox' ? 'active' : ''} onClick={() => setActiveCategory('inbox')}>
                                <Icon name="inbox" /> Beérkezett
                            </li>
                             <li className={activeCategory === 'sent' ? 'active' : ''} onClick={() => setActiveCategory('sent')}>
                                <Icon name="send" /> Elküldött
                            </li>
                        </ul>
                    </div>
                    <div className="email-list-panel">
                        {visibleEmails.map(email => (
                            <div key={email.id} className={`email-list-item ${selectedEmailId === email.id ? 'selected' : ''} ${!email.read ? 'unread' : ''}`} onClick={() => handleSelectEmail(email.id)}>
                                <div className="email-list-item-header">
                                    <span className="email-sender">{email.sender}</span>
                                    <span className="email-timestamp">{new Date(email.timestamp).toLocaleDateString()}</span>
                                </div>
                                <div className="email-list-item-subject">{email.subject}</div>
                            </div>
                        ))}
                    </div>
                    <div className="email-content-panel">
                        {selectedEmail ? (
                             <>
                                <div className="email-content-header">
                                    <h3>{selectedEmail.subject}</h3>
                                     <button className="btn btn-icon btn-secondary" onClick={() => toggleImportance(selectedEmail.id)}>
                                        <Icon name="star" filled={selectedEmail.important} />
                                    </button>
                                </div>
                                <div className="email-content-meta">
                                    <p><strong>Feladó:</strong> {selectedEmail.sender}</p>
                                    <p><strong>Címzett:</strong> {selectedEmail.recipient}</p>
                                    <p><strong>Dátum:</strong> {new Date(selectedEmail.timestamp).toLocaleString()}</p>
                                </div>
                                <div className="email-content-body">
                                    {selectedEmail.body}
                                </div>
                            </>
                        ) : (
                            <div className="email-content-placeholder">Válasszon egy emailt a megtekintéshez.</div>
                        )}
                    </div>
                 </div>
            </Card>
        </div>
    );
};

const ProjectCard = ({ project, tasks }) => {
    const ref = useRef(null);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'PROJECT',
        item: { id: project.id },
        collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
    }));
    drag(ref);

    const projectTasks = tasks.filter(t => t.projectId === project.id);
    const completedTasks = projectTasks.filter(t => t.status === 'Kész').length;
    const progress = projectTasks.length > 0 ? (completedTasks / projectTasks.length) * 100 : 0;

    return (
        <div ref={ref} className="project-card" style={{ opacity: isDragging ? 0.5 : 1 }}>
            <h4>{project.title}</h4>
            <p>{project.description}</p>
            <div className="project-team">
                {project.team.map((member, index) => (
                    <div key={index} className="avatar-sm" title={member}>{member.charAt(0)}</div>
                ))}
            </div>
            <div className="project-progress">
                <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
                <span>{Math.round(progress)}%</span>
            </div>
        </div>
    );
};

const ProjectKanbanColumn = ({ status, projects, tasks, onDropProject }) => {
    const ref = useRef(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'PROJECT',
        // FIX: Add type to the dropped item to resolve TypeScript error.
        drop: (item: { id: string }) => onDropProject(item.id, status),
        collect: (monitor) => ({ isOver: !!monitor.isOver() }),
    }));
    drop(ref);

    return (
        <div ref={ref} className={`kanban-column ${isOver ? 'is-over' : ''}`}>
            <div className="kanban-column-header">
                <h3>{status}</h3>
                <span className="task-count">{projects.length}</span>
            </div>
            <div className="kanban-column-body">
                {projects.map(p => <ProjectCard key={p.id} project={p} tasks={tasks} />)}
            </div>
        </div>
    );
};

const ProjectsView = ({ projects, tasks, updateProjectStatus }) => {
    const statuses: ProjectStatus[] = ['Tervezés', 'Fejlesztés', 'Tesztelés', 'Kész'];
     const projectsByStatus = statuses.reduce((acc, status) => {
        acc[status] = projects.filter(p => p.status === status);
        return acc;
    }, {} as Record<ProjectStatus, Project[]>);

    return (
         <DndProvider backend={HTML5Backend}>
            <div className="view-fade-in kanban-board-container">
                 <div className="view-header">
                    <h2>Projektek</h2>
                </div>
                <div className="kanban-board">
                    {statuses.map(status => (
                        <ProjectKanbanColumn 
                            key={status}
                            status={status}
                            projects={projectsByStatus[status]}
                            tasks={tasks}
                            onDropProject={updateProjectStatus}
                        />
                    ))}
                </div>
            </div>
        </DndProvider>
    );
};

const ProposalCard = ({ proposal }: { proposal: Proposal }) => (
    <div className="proposal-card stagger-item">
        <div className="proposal-card-header">
            <h3 className="proposal-title">{proposal.title}</h3>
            <span className={`proposal-status status-${proposal.status.toLowerCase().replace(/ /g, '-').replace(/á/g, 'a').replace(/é/g, 'e')}`}>{proposal.status}</span>
        </div>
        <p className="proposal-funder">{proposal.funder}</p>
        <p className="proposal-summary">{proposal.summary}</p>
        <div className="proposal-card-footer">
            <div className="proposal-info-item">
                <Icon name="event" />
                <span>{proposal.submissionDeadline}</span>
            </div>
            <div className="proposal-info-item">
                <Icon name="payments" />
                <span>{proposal.amount.toLocaleString('hu-HU')} Ft</span>
            </div>
            {proposal.relatedProjectId &&
                <div className="proposal-info-item related-project">
                    <Icon name="assignment" />
                    <span>Kapcsolódó projekt</span>
                </div>
            }
        </div>
    </div>
);

const ProposalsView = ({ proposals }: { proposals: Proposal[] }) => {
    return (
        <div className="view-fade-in">
            <div className="view-header">
                <h2>Pályázatok</h2>
                <button className="btn btn-primary"><Icon name="add" /><span>Új Pályázat</span></button>
            </div>
            <div className="proposals-grid">
                {proposals.map(p => <ProposalCard key={p.id} proposal={p} />)}
            </div>
        </div>
    );
};

const TrainingsView = ({ trainings }: { trainings: TrainingItem[] }) => {
    const getStatusClass = (status: TrainingStatus) => {
        switch (status) {
            case 'Folyamatban': return 'in-progress';
            case 'Befejezett': return 'completed';
            case 'Nem elkezdett': return 'not-started';
            default: return '';
        }
    };

    return (
        <div className="view-fade-in">
            <div className="view-header">
                <h2>Képzések</h2>
                <button className="btn btn-primary"><Icon name="add" /><span>Új Képzés</span></button>
            </div>
            <div className="trainings-grid">
                {trainings.map(training => (
                    <div key={training.id} className={`training-card stagger-item status-${getStatusClass(training.status)}`}>
                        <div className="training-card-header">
                            <h3 className="training-title">{training.title}</h3>
                            <span className={`training-status`}>{training.status}</span>
                        </div>
                        <p className="training-provider">{training.provider}</p>
                        <div className="training-progress">
                            <div className="progress-bar-container">
                                <div className="progress-bar" style={{ width: `${training.progress}%` }}></div>
                            </div>
                            <span className="progress-percent">{training.progress}%</span>
                        </div>
                        {training.url && <a href={training.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Megnyitás</a>}
                    </div>
                ))}
            </div>
        </div>
    );
};

const ContactCard = ({ contact }: { contact: Contact }) => {
    const initial = contact.name.charAt(0).toUpperCase();

    return (
        <div className="contact-card stagger-item">
            <div className="contact-card-header">
                <div className="avatar-lg">{initial}</div>
                <div className="contact-info-main">
                    <h3 className="contact-name">{contact.name}</h3>
                    <p className="contact-role">{contact.role}{contact.company && `, ${contact.company}`}</p>
                </div>
            </div>
            <div className="contact-card-body">
                {contact.email && (
                    <div className="contact-detail-item">
                        <Icon name="mail" />
                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    </div>
                )}
                {contact.phone && (
                    <div className="contact-detail-item">
                        <Icon name="phone" />
                        <span>{contact.phone}</span>
                    </div>
                )}
                {contact.notes && (
                     <div className="contact-notes">
                        <p>{contact.notes}</p>
                    </div>
                )}
            </div>
            <div className="contact-card-footer">
                {(contact.linkedProjectIds?.length > 0 || contact.linkedProposalIds?.length > 0) && (
                     <div className="contact-links">
                        <Icon name="link" />
                        <span>
                            {contact.linkedProjectIds?.length > 0 && `${contact.linkedProjectIds.length} projekt`}
                            {(contact.linkedProjectIds?.length > 0 && contact.linkedProposalIds?.length > 0) && ', '}
                            {contact.linkedProposalIds?.length > 0 && `${contact.linkedProposalIds.length} pályázat`}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};


const ContactsView = ({ contacts }: { contacts: Contact[] }) => {
    return (
        <div className="view-fade-in">
            <div className="view-header">
                <h2>Névjegyek</h2>
                <button className="btn btn-primary">
                    <Icon name="add" />
                    <span>Új Névjegy</span>
                </button>
            </div>
            <div className="contacts-grid">
                {contacts.map((contact) => (
                    <ContactCard key={contact.id} contact={contact} />
                ))}
            </div>
        </div>
    );
};

const FinancesView = ({ transactions, budgets }) => {
    const thisMonthTransactions = transactions.filter(t => new Date(t.date).getMonth() === new Date().getMonth());
    const income = thisMonthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = thisMonthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = income + expense;

    return (
        <div className="view-fade-in finances-grid">
            <Card className="finance-summary-card stagger-item">
                <h4>Bevétel</h4>
                <p className="amount income">{income.toLocaleString('hu-HU')} Ft</p>
            </Card>
            <Card className="finance-summary-card stagger-item" style={{animationDelay: '100ms'}}>
                <h4>Kiadás</h4>
                <p className="amount expense">{Math.abs(expense).toLocaleString('hu-HU')} Ft</p>
            </Card>
            <Card className="finance-summary-card stagger-item" style={{animationDelay: '200ms'}}>
                <h4>Egyenleg</h4>
                <p className="amount">{balance.toLocaleString('hu-HU')} Ft</p>
            </Card>
            <Card className="stagger-item" style={{animationDelay: '300ms', gridColumn: '1 / -1'}} header={<h4>Költségvetés</h4>}>
                <div className="budget-list">
                    {budgets.map(b => {
                        const spent = Math.abs(thisMonthTransactions.filter(t => t.category === b.category).reduce((s, t) => s + t.amount, 0));
                        const percent = (spent / b.amount) * 100;
                        return (
                             <div key={b.id} className="budget-item">
                                <div className="budget-info">
                                    <span>{b.category}</span>
                                    <span>{spent.toLocaleString()} / {b.amount.toLocaleString()} Ft</span>
                                </div>
                                 <div className="progress-bar-container">
                                    <div className="progress-bar" style={{width: `${Math.min(percent, 100)}%`}}></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Card>
             <Card className="stagger-item" style={{animationDelay: '400ms', gridColumn: '1 / -1'}} header={<h4>Legutóbbi Tranzakciók</h4>}>
                <ul className="transaction-list">
                    {transactions.slice(0, 5).map(t => (
                        <li key={t.id}>
                            <Icon name={t.type === 'income' ? 'arrow_upward' : 'arrow_downward'} />
                            <span>{t.title}</span>
                            <span className={`amount ${t.type}`}>{t.amount.toLocaleString()} Ft</span>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
};

const DocsView = ({ docs: initialDocs, addDoc }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    
    const handleSubmit = (e) => {
        e.preventDefault();
        if(!title || !content) return;
        const newDoc: DocItem = {
            id: generateId(),
            type: 'note',
            title,
            content,
            createdAt: new Date().toISOString(),
        };
        addDoc(newDoc);
        setTitle('');
        setContent('');
    }

    const DocCard = ({ doc }: { doc: DocItem }) => {
        switch(doc.type) {
            case 'note': return <div className="doc-card note-card"><h4>{doc.title}</h4><p>{doc.content.substring(0, 100)}...</p></div>
            case 'link': return <div className="doc-card link-card"><Icon name="link"/><h4>{doc.title}</h4><a href={doc.content} target="_blank">{doc.content}</a></div>
            case 'image': return <div className="doc-card image-card"><h4>{doc.title}</h4><img src={doc.content} alt={doc.title}/></div>
            default: return null;
        }
    }

    return (
        <div className="view-fade-in docs-view-grid">
            <Card header={<h4>Új jegyzet</h4>} className="add-doc-card">
                <form onSubmit={handleSubmit} className="add-doc-form">
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Jegyzet címe..." />
                    <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Tartalom..."></textarea>
                    <button type="submit" className="btn btn-primary">Mentés</button>
                </form>
            </Card>
            {initialDocs.map(doc => <DocCard key={doc.id} doc={doc} />)}
        </div>
    );
};

const GeminiChatView = () => <Card>Gemini Chat helyőrző</Card>;
const CreativeToolsView = () => <Card>Kreatív Eszközök helyőrző</Card>;
const MeetingAssistantView = () => <Card>Meeting Asszisztens helyőrző</Card>;


const App = () => {
    const [currentView, setCurrentView] = useState('dashboard');
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const data = useMockData();

    const renderView = () => {
        switch (currentView) {
            case 'dashboard': return <DashboardView tasks={data.tasks} emails={data.emails} />;
            case 'planner': return <PlannerView events={data.plannerEvents} />;
            case 'tasks': return <TasksView tasks={data.tasks} updateTaskStatus={data.updateTaskStatus} />;
            case 'email': return <EmailView emails={data.emails} />;
            case 'projects': return <ProjectsView projects={data.projects} tasks={data.tasks} updateProjectStatus={data.updateProjectStatus} />;
            case 'proposals': return <ProposalsView proposals={data.proposals} />;
            case 'trainings': return <TrainingsView trainings={data.trainings} />;
            case 'contacts': return <ContactsView contacts={data.contacts} />;
            case 'finances': return <FinancesView transactions={data.transactions} budgets={data.budgets} />;
            case 'docs': return <DocsView docs={data.docs} addDoc={data.addDoc} />;
            case 'gemini_chat': return <GeminiChatView />;
            case 'creative_tools': return <CreativeToolsView />;
            case 'meeting_assistant': return <MeetingAssistantView />;
            default: return <DashboardView tasks={data.tasks} emails={data.emails}/>;
        }
    };

    return (
        <div className="app-layout">
            <Sidebar currentView={currentView} setView={setCurrentView} isCollapsed={isSidebarCollapsed} setCollapsed={setSidebarCollapsed} />
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
