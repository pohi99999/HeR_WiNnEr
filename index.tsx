/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, GenerateContentResponse, Content, Part, Type, FunctionDeclaration, Tool, SendMessageParameters } from "@google/genai";
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
    time?: string;
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
    { id: 'task-1', title: 'API végpontok dokumentálása', description: 'Swagger/OpenAPI dokumentáció készítése a V7 projekthez.', dueDate: '2024-08-10', priority: 'Magas', status: 'Folyamatban', category: 'Projekt', projectId: 'proj-1', createdAt: new Date().toISOString() },
    { id: 'task-2', title: 'Marketing anyagok előkészítése', description: 'Szöveges és vizuális tartalmak a Q3 kampányhoz.', dueDate: '2024-08-15', priority: 'Közepes', status: 'Teendő', category: 'Projekt', projectId: 'proj-2', createdAt: new Date().toISOString() },
    { id: 'task-3', title: 'Bevásárlás a hétvégére', priority: 'Alacsony', status: 'Teendő', category: 'Személyes', createdAt: new Date().toISOString() },
    { id: 'task-4', title: 'Teszt szerverek beállítása', description: 'Új szerverek konfigurálása és terheléses tesztelése.', dueDate: '2024-08-05', priority: 'Kritikus', status: 'Kész', category: 'Projekt', projectId: 'proj-3', createdAt: new Date().toISOString() },
    { id: 'task-5', title: 'Innovációs pályázat szövegezése', description: 'A pályázati űrlap "Szakmai tartalom" fejezetének megírása.', dueDate: '2024-08-20', priority: 'Magas', status: 'Teendő', category: 'Pályázat', proposalId: 'prop-1', createdAt: new Date().toISOString() },
    { id: 'task-6', title: 'Email a könyvelőnek', description: 'Júliusi számlák elküldése', priority: 'Közepes', status: 'Teendő', category: 'Email', createdAt: new Date().toISOString() }
];

const mockEmails: EmailMessage[] = [
    { id: 'email-1', sender: 'ertesites@bank.hu', recipient: 'felhasznalo@example.com', subject: 'Sikeres kártyás fizetés', body: 'Értesítjük, hogy kártyájával sikeresen fizetett 18,000 HUF értékben a Koncert.hu oldalon.', timestamp: new Date('2024-07-22 18:30').toISOString(), read: true, important: false, category: 'inbox' },
    { id: 'email-2', sender: 'felhasznalo@example.com', recipient: 'konyveles@example.com', subject: 'Júliusi számlák', body: 'Szia, küldöm a júliusi számlákat. Üdv, Felhasználó', timestamp: new Date().toISOString(), read: false, important: false, category: 'drafts' },
    { id: 'email-3', sender: 'hr@ceg.hu', recipient: 'felhasznalo@example.com', subject: 'Céges csapatépítő', body: 'Ne feledd, a céges csapatépítő augusztus 25-én lesz! Részletek hamarosan.', timestamp: new Date('2024-08-01 10:00').toISOString(), read: false, important: true, category: 'inbox' },
    { id: 'email-4', sender: 'spam@spam.com', recipient: 'felhasznalo@example.com', subject: 'NYERJ MOST!', body: 'Kattints ide a fantasztikus nyereményért!', timestamp: new Date('2024-08-02 11:00').toISOString(), read: false, important: false, category: 'spam' }
];

const mockPlannerEvents: PlannerEvent[] = [
    { id: 'event-1', title: 'Csapatépítő', date: '2024-08-25', type: 'work' },
    { id: 'event-2', title: 'Fogorvos', date: '2024-08-12', time: '14:00', type: 'personal' },
    { id: 'event-3', title: 'Marketing meeting', date: '2024-08-06', time: '10:00', type: 'meeting', source: 'proj-2' },
    { id: 'event-4', title: 'Szerver tesztelés határidő', date: '2024-08-05', type: 'deadline', source: 'task-4' },
    { id: 'event-5', title: 'Pályázat beadás', date: '2024-09-15', type: 'proposal_deadline', source: 'prop-1'}
];

// --- AI & GEMINI SETUP ---
const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-flash';

// Define tools
const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "create_task",
                description: "Új feladat létrehozása a felhasználó számára.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A feladat címe." },
                        description: { type: Type.STRING, description: "A feladat részletes leírása." },
                        dueDate: { type: Type.STRING, description: "A feladat határideje YYYY-MM-DD formátumban." },
                        priority: { type: Type.STRING, description: "A feladat prioritása (Alacsony, Közepes, Magas, Kritikus)." },
                        category: { type: Type.STRING, description: "A feladat kategóriája (pl. Munka, Személyes)." }
                    },
                    required: ["title", "priority"]
                }
            },
            {
                name: "create_calendar_event",
                description: "Új esemény létrehozása a felhasználó naptárában.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Az esemény címe." },
                        date: { type: Type.STRING, description: "Az esemény dátuma YYYY-MM-DD formátumban." },
                        time: { type: Type.STRING, description: "Az esemény időpontja HH:MM formátumban." },
                        description: { type: Type.STRING, description: "Az esemény leírása." }
                    },
                    required: ["title", "date"]
                }
            },
            {
                name: "send_email",
                description: "Email küldése a felhasználó nevében.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        recipient: { type: Type.STRING, description: "A címzett email címe." },
                        subject: { type: Type.STRING, description: "Az email tárgya." },
                        body: { type: Type.STRING, description: "Az email törzsszövege." }
                    },
                    required: ["recipient", "subject", "body"]
                }
            }
        ]
    }
];

// --- UTILITY FUNCTIONS ---
const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// --- REACT COMPONENTS ---

const App: React.FC = () => {
    const [activeView, setActiveView] = useState('dashboard');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

    // --- Data State ---
    const [tasks, setTasks] = useState<TaskItem[]>(mockTasks);
    const [emails, setEmails] = useState<EmailMessage[]>(mockEmails);
    const [plannerEvents, setPlannerEvents] = useState<PlannerEvent[]>(mockPlannerEvents);
    const [projects, setProjects] = useState<Project[]>(mockProjects);
    const [proposals, setProposals] = useState<Proposal[]>(mockProposals);
    const [docs, setDocs] = useState<DocItem[]>(mockDocs);
    const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
    const [budgets, setBudgets] = useState<Budget[]>(mockBudgets);
    const [trainings, setTrainings] = useState<TrainingItem[]>(mockTrainings);
    const [contacts, setContacts] = useState<Contact[]>(mockContacts);
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const addNotification = (message: string, type: 'success' | 'error' | 'info') => {
        const newNotification = { id: generateId('notif'), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => {
            setNotifications(p => p.filter(n => n.id !== newNotification.id));
        }, 5000);
    };

    const handleAddTask = (task: Omit<TaskItem, 'id' | 'status' | 'createdAt'>) => {
        const newTask: TaskItem = {
            ...task,
            id: generateId('task'),
            status: 'Teendő',
            createdAt: new Date().toISOString(),
        };
        setTasks(prev => [newTask, ...prev]);
        addNotification(`'${task.title}' feladat hozzáadva.`, 'success');
        return newTask;
    };

    const handleUpdateTask = (updatedTask: TaskItem) => {
        setTasks(prev => prev.map(task => task.id === updatedTask.id ? updatedTask : task));
    };

    const handleDeleteTask = (taskId: string) => {
        setTasks(prev => prev.filter(task => task.id !== taskId));
    };

    const handleAddEvent = (event: Omit<PlannerEvent, 'id' | 'type'>) => {
        const newEvent: PlannerEvent = {
            ...event,
            id: generateId('event'),
            type: 'work', // Default type
        };
        setPlannerEvents(prev => [...prev, newEvent]);
        addNotification(`'${event.title}' esemény hozzáadva a naptárhoz.`, 'success');
        return newEvent;
    };

    const handleSendEmail = (email: Omit<EmailMessage, 'id' | 'timestamp' | 'read' | 'important' | 'category' | 'sender'>) => {
        const newEmail: EmailMessage = {
            ...email,
            id: generateId('email'),
            timestamp: new Date().toISOString(),
            read: true,
            important: false,
            category: 'sent',
            sender: 'felhasznalo@example.com'
        };
        setEmails(prev => [newEmail, ...prev]);
        addNotification(`Email elküldve a(z) ${email.recipient} címre.`, 'success');
        return newEmail;
    };

    const handleAddDoc = (doc: Omit<DocItem, 'id' | 'createdAt'>) => {
        const newDoc = { ...doc, id: generateId('doc'), createdAt: new Date().toISOString() };
        setDocs(prev => [newDoc, ...prev]);
        addNotification(`'${doc.title}' dokumentum elmentve.`, 'success');
    };

    const dataContextValue = {
        tasks, projects, proposals, emails, plannerEvents, docs, transactions, budgets, trainings, contacts,
        handleAddTask, handleUpdateTask, handleDeleteTask, handleAddEvent, handleSendEmail, handleAddDoc, addNotification
    };

    const renderActiveView = () => {
        const props = { ...dataContextValue }; // Pass all data and handlers
        switch (activeView) {
            case 'dashboard':
// FIX START: Added React.FC<any> to component definitions to resolve prop type errors. This is part of a larger set of fixes to make all view components compliant.
                return <DashboardView {...props} />;
            case 'planner':
                return <PlannerView {...props} />;
            case 'tasks':
                return <TasksView {...props} />;
            case 'emails':
                return <EmailView {...props} />;
            case 'projects':
                return <ProjectsView {...props} />;
            case 'finances':
                return <FinancesView {...props} />;
            case 'proposals':
                return <ProposalsView {...props} />;
            case 'documents':
                return <DocsView {...props} />;
            case 'contacts':
                return <ContactsView {...props} />;
            case 'training':
                return <TrainingView {...props} />;
            case 'gemini-chat':
                return <GeminiChatView {...props} />;
            case 'creative-tools':
                return <CreativeView {...props} />;
            case 'meeting-assistant':
                return <MeetingAssistantView {...props} />;
// FIX END: Added React.FC<any> to component definitions to resolve prop type errors. This is part of a larger set of fixes to make all view components compliant.
            default:
                return <div>Nézet nem található.</div>;
        }
    };
    
    return (
        <DndProvider backend={HTML5Backend}>
            <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileNavOpen ? 'mobile-nav-open' : ''}`}>
                <Sidebar
                    activeView={activeView}
                    setActiveView={setActiveView}
                    isCollapsed={isSidebarCollapsed}
                    toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    closeMobileNav={() => setIsMobileNavOpen(false)}
                />
                <div className="page-container">
                    <GlobalHeader 
                        toggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)} 
                    />
                    <main className="main-content">
                        <div key={activeView} className="view-fade-in">
                            {renderActiveView()}
                        </div>
                    </main>
                </div>
                {isMobileNavOpen && <div className="mobile-nav-overlay" onClick={() => setIsMobileNavOpen(false)}></div>}
                 <NotificationCenter notifications={notifications} />
            </div>
        </DndProvider>
    );
};

const NotificationCenter = ({ notifications }: { notifications: Notification[] }) => {
    return (
        <div className="notification-center">
            {notifications.map((notif, index) => (
                <div key={notif.id} className={`notification card ${notif.type}`} style={{ animationDelay: `${index * 100}ms`}}>
                    <span className="material-symbols-outlined">
                        {notif.type === 'success' ? 'check_circle' : notif.type === 'error' ? 'error' : 'info'}
                    </span>
                    {notif.message}
                </div>
            ))}
        </div>
    );
};


const Sidebar: React.FC<any> = ({ activeView, setActiveView, isCollapsed, toggleCollapse, closeMobileNav }) => {
    const [openSections, setOpenSections] = useState({ 'main': true, 'management': true, 'ai': true });

    const navItems: NavItem[] = [
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        { id: 'planner', label: 'Naptár', icon: 'calendar_month' },
        { id: 'tasks', label: 'Feladatok', icon: 'task_alt' },
        { id: 'emails', label: 'Emailek', icon: 'mail' },
        { 
            id: 'management', label: 'Menedzsment', icon: 'workspaces', subItems: [
                { id: 'projects', label: 'Projektek', icon: 'folder' },
                { id: 'proposals', label: 'Pályázatok', icon: 'description' },
                { id: 'finances', label: 'Pénzügyek', icon: 'monitoring' },
                { id: 'contacts', label: 'Névjegyek', icon: 'contacts' },
            ]
        },
        { id: 'documents', label: 'Dokumentumok', icon: 'source_notes' },
        { id: 'training', label: 'Képzések', icon: 'school' },
        {
            id: 'ai', label: 'AI Asszisztens', icon: 'smart_toy', subItems: [
                { id: 'gemini-chat', label: 'Chat', icon: 'chat' },
                { id: 'creative-tools', label: 'Kreatív Eszközök', icon: 'brush' },
                { id: 'meeting-assistant', label: 'Meeting Asszisztens', icon: 'group' },
            ]
        }
    ];

    const handleNavClick = (viewId) => {
        setActiveView(viewId);
        closeMobileNav();
    };

    const toggleSection = (sectionId) => {
        setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

    const renderNavItem = (item) => {
        if (item.subItems) {
            const isOpen = openSections[item.id] || false;
            return (
                <li key={item.id}>
                    <button className={`nav-link nav-section-header ${isOpen ? 'open' : ''}`} onClick={() => toggleSection(item.id)}>
                        <span className="material-symbols-outlined">{item.icon}</span>
                        <span>{item.label}</span>
                        <span className="material-symbols-outlined chevron">chevron_right</span>
                    </button>
                    <div className={`nav-sub-list-wrapper ${isOpen ? 'open' : ''}`}>
                        <ul className="nav-sub-list">
                            {item.subItems.map(renderNavItem)}
                        </ul>
                    </div>
                </li>
            );
        }
        return (
            <li key={item.id}>
                <a
                    href="#"
                    className={`nav-link ${activeView === item.id ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); handleNavClick(item.id); }}
                >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    <span>{item.label}</span>
                </a>
            </li>
        );
    };

    return (
        <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
            <div className="sidebar-inner">
                <div className="sidebar-header">
                    {!isCollapsed && <span className="logo">P-Day Light</span>}
                    <button onClick={toggleCollapse} className="collapse-toggle">
                        <span className="material-symbols-outlined">
                            {isCollapsed ? 'menu_open' : 'menu'}
                        </span>
                    </button>
                </div>
                <nav className="sidebar-nav">
                    <ul className="nav-list">
                        {navItems.map(renderNavItem)}
                    </ul>
                </nav>
            </div>
        </aside>
    );
};

const GlobalHeader: React.FC<any> = ({ toggleMobileNav }) => {
    const [profileOpen, setProfileOpen] = useState(false);
    return (
        <header className="global-header">
            <button className="mobile-nav-toggle" onClick={toggleMobileNav}>
                <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="global-header-actions">
                 <button className="search-button">
                     <span className="material-symbols-outlined">search</span>
                     <span>Keresés...</span>
                     <kbd>Ctrl+K</kbd>
                 </button>
                 {/* <button className="btn-icon"><span className="material-symbols-outlined">notifications</span></button> */}
                 <div className="user-profile">
                    <button className="user-profile-button" onClick={() => setProfileOpen(!profileOpen)}>
                        <div className="avatar-sm">F</div>
                        <span>Felhasználó</span>
                        <span className={`material-symbols-outlined chevron ${profileOpen ? 'open' : ''}`}>expand_more</span>
                    </button>
                    {profileOpen && (
                        <div className="profile-dropdown">
                            <div className="card">
                            <ul>
                                <li><button><span className="material-symbols-outlined">person</span>Profil</button></li>
                                <li><button><span className="material-symbols-outlined">settings</span>Beállítások</button></li>
                                <li className="separator"></li>
                                <li><button><span className="material-symbols-outlined">logout</span>Kijelentkezés</button></li>
                            </ul>
                            </div>
                        </div>
                    )}
                 </div>
            </div>
        </header>
    );
};

// --- VIEWS ---

const DashboardView: React.FC<any> = ({ tasks, emails, projects, plannerEvents, proposals }) => {
    const upcomingEvents = plannerEvents
        .filter(e => new Date(e.date) >= new Date())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);

    const activeProposals = proposals.filter(p => p.status === 'Készül' || p.status === 'Beadva');

    const dashboardItems = [
        { id: 'tasks', size: 'large', title: 'Gyors Feladatok', content: (
            <ul className="quick-list">
                {tasks.filter(t => t.status !== 'Kész').slice(0, 5).map((task, index) => (
                    <li key={task.id} className="stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                        <span className="task-title">{task.title}</span>
                        <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </li>
                ))}
            </ul>
        )},
        { id: 'agenda', size: 'medium', title: 'Közelgő Események', content: (
            <ul className="quick-list">
                 {upcomingEvents.map((event, index) => (
                    <li key={event.id} className="stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                        <span>{event.title}</span>
                        <span>{new Date(event.date).toLocaleDateString()}</span>
                    </li>
                ))}
            </ul>
        )},
        { id: 'emails', size: 'medium', title: 'Legutóbbi Emailek', content: (
             <ul className="quick-list email-list">
                {emails.filter(e => e.category === 'inbox' && !e.read).slice(0, 4).map((email, index) => (
                    <li key={email.id} className="stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                        <span className="email-sender">{email.sender}</span>
                        <span className="email-subject">{email.subject}</span>
                    </li>
                ))}
            </ul>
        )},
         { id: 'proposals', size: 'full', title: 'Aktív Pályázatok', content: (
             <div className="proposals-overview">
                 {activeProposals.map((prop, index) => (
                     <div key={prop.id} className="proposal-summary-card stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                         <h4>{prop.title}</h4>
                         <p>Beadási határidő: {prop.submissionDeadline}</p>
                         <div className="progress-bar">
                             <div className="progress" style={{width: `75%`}}></div>
                         </div>
                     </div>
                 ))}
             </div>
        )},
    ];

    return (
        <div className="dashboard-view">
            <div className="view-header">
                <h2>Dashboard</h2>
            </div>
            <div className="dashboard-grid">
                {dashboardItems.map((item, index) => (
                    <div className={`dashboard-card card ${item.size} stagger-item`} key={item.id} style={{ animationDelay: `${index * 50}ms` }}>
                        <div className="card-header">
                            <h3>{item.title}</h3>
                        </div>
                        <div className="card-body">
                            {item.content}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const PlannerView: React.FC<any> = ({ plannerEvents, tasks }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // month, week, day

    const calendarData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());
        const endDate = new Date(lastDayOfMonth);
        endDate.setDate(endDate.getDate() + (6 - lastDayOfMonth.getDay()));
        
        const days = [];
        let day = new Date(startDate);

        while (day <= endDate) {
            days.push(new Date(day));
            day.setDate(day.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    const eventsForDate = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        const pEvents = plannerEvents.filter(e => e.date === dateStr);
        const tEvents = tasks.filter(t => t.dueDate === dateStr).map(t => ({...t, type: 'deadline'}));
        return [...pEvents, ...tEvents];
    };

    return (
        <div className="planner-view">
            <div className="view-header">
                <h2>Naptár</h2>
                <div className="calendar-controls">
                    <button className="btn btn-secondary" onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}>
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <h3>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                     <button className="btn btn-secondary" onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}>
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            </div>
            <div className="calendar-container card">
                <div className="calendar-header">
                    {['Vas', 'Hét', 'Kedd', 'Sze', 'Csüt', 'Pén', 'Szom'].map(day => <div key={day} className="day-header">{day}</div>)}
                </div>
                <div className="calendar-body">
                    {calendarData.map((day, index) => (
                        <div key={index} className={`day-cell ${day.getMonth() !== currentDate.getMonth() ? 'other-month' : ''}`}>
                            <span className="day-number">{day.getDate()}</span>
                            <div className="events-container">
                                {eventsForDate(day).map(event => (
                                    <div key={event.id} className={`event-pill event-type-${event.type}`}>
                                        <span className="event-pill-dot"></span>
                                        <span className="event-title">{event.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


const TaskCard = ({ task, onTaskUpdate, onTaskDelete, isDragging, style }: { task: TaskItem, onTaskUpdate: (task: TaskItem) => void, onTaskDelete: (id: string) => void, isDragging: boolean, style?: React.CSSProperties }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const [{ handlerId }, drop] = useDrop({
        accept: 'TASK',
        collect(monitor) {
            return {
                handlerId: monitor.getHandlerId(),
            };
        },
    });
    
    const [{ isDragging: isDrag }, drag, preview] = useDrag({
        type: 'TASK',
        item: () => {
            return { id: task.id, status: task.status };
        },
        collect: (monitor: any) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    drag(drop(ref));

    return (
// FIX START: Wrapped the react-dnd connector in a callback function to resolve TypeScript type mismatch with the 'ref' prop.
        <div ref={(node) => preview(node)} style={{ ...style, opacity: isDragging ? 0.5 : 1 }} className={`task-card card ${isExpanded ? 'expanded' : ''} stagger-item`}>
{/* FIX END: Wrapped the react-dnd connector in a callback function to resolve TypeScript type mismatch with the 'ref' prop. */}
            <div ref={ref} data-handler-id={handlerId}>
                <div className="task-card-header">
                    <h4 className="task-title">{task.title}</h4>
                    <div className="task-card-pills">
                        {task.dueDate && <span className="task-pill due-date">{task.dueDate}</span>}
                        <span className={`task-pill priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </div>
                    <button className="btn-icon expand-icon" onClick={() => setIsExpanded(!isExpanded)}>
                        <span className="material-symbols-outlined">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </button>
                </div>
                {isExpanded && (
                    <div className="task-card-body">
                        <p>{task.description}</p>
                        {task.subTasks && task.subTasks.length > 0 && (
                            <div className="subtasks-list">
                                <h5>Alfeladatok:</h5>
                                {task.subTasks.map(sub => (
                                    <div key={sub.id} className="subtask-item">
                                        <input type="checkbox" checked={sub.completed} readOnly />
                                        <label>{sub.title}</label>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="task-card-footer">
                            <button className="btn btn-secondary btn-sm">Szerkesztés</button>
                            <button className="btn-icon" onClick={() => onTaskDelete(task.id)}>
                                <span className="material-symbols-outlined">delete</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


const TasksView: React.FC<any> = ({ tasks, handleAddTask, handleUpdateTask, handleDeleteTask }) => {
    const [viewMode, setViewMode] = useState('kanban'); // 'list' or 'kanban'
    const [filter, setFilter] = useState('all');

    const statuses: TaskStatus[] = ['Teendő', 'Folyamatban', 'Kész', 'Blokkolt'];

    const moveTask = (taskId, newStatus) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            handleUpdateTask({ ...task, status: newStatus });
        }
    };

    const filteredTasks = tasks.filter(task => {
        if (filter === 'all') return true;
        return task.priority.toLowerCase() === filter;
    });

    return (
        <div className="tasks-view">
            <div className="view-header">
                <h2>Feladatok</h2>
                <div className="view-actions">
                    <div className="toggle-buttons">
                        <button className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('list')}>Lista</button>
                        <button className={`btn ${viewMode === 'kanban' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setViewMode('kanban')}>Kanban</button>
                    </div>
                    <button className="btn btn-primary" onClick={() => handleAddTask({ title: 'Új feladat', priority: 'Közepes' })}>
                        <span className="material-symbols-outlined">add</span>
                        Új feladat
                    </button>
                </div>
            </div>
            {viewMode === 'list' && (
                <div className="tasks-list-container">
                    {filteredTasks.map((task, index) => (
                         <TaskCard
                            key={task.id}
                            task={task}
                            onTaskUpdate={handleUpdateTask}
                            onTaskDelete={handleDeleteTask}
                            isDragging={false}
                            style={{ animationDelay: `${index * 50}ms` }}
                        />
                    ))}
                </div>
            )}
            {viewMode === 'kanban' && (
                <div className="tasks-kanban-board-container">
                    <div className="kanban-board">
                        {statuses.map(status => (
                            <KanbanColumn 
                                key={status} 
                                status={status} 
                                tasks={tasks.filter(t => t.status === status)}
                                onMoveTask={moveTask}
                                onTaskUpdate={handleUpdateTask}
                                onTaskDelete={handleDeleteTask}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const KanbanColumn: React.FC<any> = ({ status, tasks, onMoveTask, onTaskUpdate, onTaskDelete }) => {
    const [{ canDrop, isOver }, drop] = useDrop(() => ({
        accept: 'TASK',
        drop: (item: { id: string }) => onMoveTask(item.id, status),
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }));

    return (
// FIX START: Wrapped the react-dnd connector in a callback function to resolve TypeScript type mismatch with the 'ref' prop.
        <div ref={(node) => drop(node)} className={`kanban-column card ${isOver ? 'is-over' : ''}`}>
{/* FIX END: Wrapped the react-dnd connector in a callback function to resolve TypeScript type mismatch with the 'ref' prop. */}
            <div className="kanban-column-header">
                <h3>{status} ({tasks.length})</h3>
            </div>
            <div className="kanban-column-body">
                {tasks.map((task, index) => (
                    <TaskCard 
                        key={task.id} 
                        task={task}
                        onTaskUpdate={onTaskUpdate}
                        onTaskDelete={onTaskDelete}
                        isDragging={false} /* This would need more state mgmt to be accurate */
                        style={{ animationDelay: `${index * 50}ms` }}
                    />
                ))}
            </div>
        </div>
    );
};

const EmailView: React.FC<any> = ({ emails }) => {
    const [activeCategory, setActiveCategory] = useState('inbox');
    const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(emails.find(e => e.category === 'inbox') || null);

    const filteredEmails = emails.filter(e => e.category === activeCategory);

    return (
        <div className="email-view-layout card">
            <div className="email-sidebar">
                <button className="btn btn-primary compose-btn">Új levél</button>
                <ul className="email-folders">
                    <li className={activeCategory === 'inbox' ? 'active' : ''} onClick={() => setActiveCategory('inbox')}>Bejövő</li>
                    <li className={activeCategory === 'sent' ? 'active' : ''} onClick={() => setActiveCategory('sent')}>Elküldött</li>
                    <li className={activeCategory === 'drafts' ? 'active' : ''} onClick={() => setActiveCategory('drafts')}>Piszkozatok</li>
                    <li className={activeCategory === 'spam' ? 'active' : ''} onClick={() => setActiveCategory('spam')}>Spam</li>
                </ul>
            </div>
            <div className="email-list-pane">
                 {filteredEmails.map((email, index) => (
                    <div 
                        key={email.id} 
                        className={`email-item ${selectedEmail?.id === email.id ? 'selected' : ''} stagger-item`}
                        onClick={() => setSelectedEmail(email)}
                        style={{ animationDelay: `${index * 30}ms` }}
                    >
                        <div className="email-item-sender">{email.sender}</div>
                        <div className="email-item-subject">{email.subject}</div>
                        <div className="email-item-date">{new Date(email.timestamp).toLocaleDateString()}</div>
                    </div>
                ))}
            </div>
            <div className="email-content-pane">
                {selectedEmail ? (
                    <>
                        <div className="email-header">
                            <h2>{selectedEmail.subject}</h2>
                            <p><strong>Feladó:</strong> {selectedEmail.sender}</p>
                            <p><strong>Címzett:</strong> {selectedEmail.recipient}</p>
                        </div>
                        <div className="email-body">
                            {selectedEmail.body}
                        </div>
                    </>
                ) : (
                    <div className="no-email-selected">Válasszon ki egy emailt a megtekintéshez.</div>
                )}
            </div>
        </div>
    );
};

const ProjectsView: React.FC<any> = ({ projects, tasks }) => {

    const getProjectProgress = (projectId) => {
        const projectTasks = tasks.filter(t => t.projectId === projectId);
        if (projectTasks.length === 0) return 0;
        const completedTasks = projectTasks.filter(t => t.status === 'Kész').length;
        return Math.round((completedTasks / projectTasks.length) * 100);
    };

    return (
        <div className="projects-view">
             <div className="view-header">
                <h2>Projektek</h2>
                <div className="view-actions">
                    <button className="btn btn-primary">
                        <span className="material-symbols-outlined">add</span>
                        Új Projekt
                    </button>
                </div>
            </div>
            <div className="projects-grid">
                {projects.map((project, index) => (
                    <div className="project-card card stagger-item" key={project.id} style={{ animationDelay: `${index * 50}ms` }}>
                        <div className="project-card-header">
                            <h3>{project.title}</h3>
                            <span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span>
                        </div>
                        <p className="project-card-description">{project.description}</p>
                        <div className="project-card-footer">
                            <div className="team-avatars">
                                {project.team.map(member => <div key={member} className="avatar-xs">{member.charAt(0)}</div>)}
                            </div>
                            <div className="project-progress">
                                <span>{getProjectProgress(project.id)}%</span>
                                <div className="progress-bar-sm">
                                    <div className="progress" style={{width: `${getProjectProgress(project.id)}%`}}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FinancesView: React.FC<any> = ({ transactions, budgets }) => {
    const summary = transactions.reduce((acc, curr) => {
        if (curr.type === 'income') acc.income += curr.amount;
        else acc.expense += curr.amount;
        acc.balance = acc.income + acc.expense;
        return acc;
    }, { income: 0, expense: 0, balance: 0 });

    const expenseByCategory = transactions
        .filter(t => t.type === 'expense')
        .reduce((acc, curr) => {
            acc[curr.category] = (acc[curr.category] || 0) + Math.abs(curr.amount);
            return acc;
        }, {});

    return (
        <div className="finances-view">
            <div className="view-header">
                <h2>Pénzügyek</h2>
            </div>
            <div className="finances-view-layout">
                <div className="summary-cards">
                    <div className="summary-card card stagger-item" style={{animationDelay: '0ms'}} ><h4>Bevétel</h4><p className="income">{summary.income.toLocaleString()} Ft</p></div>
                    <div className="summary-card card stagger-item" style={{animationDelay: '50ms'}} ><h4>Kiadás</h4><p className="expense">{Math.abs(summary.expense).toLocaleString()} Ft</p></div>
                    <div className="summary-card card stagger-item" style={{animationDelay: '100ms'}}><h4>Egyenleg</h4><p>{summary.balance.toLocaleString()} Ft</p></div>
                </div>
                <div className="pie-chart-container card stagger-item" style={{animationDelay: '150ms'}}>
                    <h3>Kiadások megoszlása</h3>
                    {/* Placeholder for pie chart */}
                    <div className="chart-placeholder">Kördiagram helye</div>
                </div>
                <div className="transactions-list-container card stagger-item" style={{animationDelay: '200ms'}}>
                     <h3>Legutóbbi tranzakciók</h3>
                     <ul>
                         {transactions.slice(0, 5).map((t, index) => (
                             <li key={t.id} className="stagger-item" style={{ animationDelay: `${250 + index * 50}ms` }}>
                                 <span>{t.title}</span>
                                 <span className={t.type}>{t.amount.toLocaleString()} Ft</span>
                            </li>
                         ))}
                     </ul>
                </div>
            </div>
        </div>
    );
};

const ProposalsView: React.FC<any> = ({ proposals, tasks }) => {
    const statuses: ProposalStatus[] = ['Készül', 'Beadva', 'Értékelés alatt', 'Elfogadva', 'Elutasítva'];
    
    return (
         <div className="proposals-view">
             <div className="view-header">
                <h2>Pályázatok</h2>
                 <div className="view-actions">
                    <button className="btn btn-primary">
                        <span className="material-symbols-outlined">add</span>
                        Új Pályázat
                    </button>
                </div>
            </div>
            <div className="proposals-board-container">
                 <div className="kanban-board">
                    {statuses.map(status => (
                        <div className="kanban-column card" key={status}>
                            <div className="kanban-column-header"><h3>{status}</h3></div>
                            <div className="kanban-column-body">
                                {proposals.filter(p => p.status === status).map((prop, index) => (
                                    <div className="proposal-card card stagger-item" key={prop.id} style={{ animationDelay: `${index * 50}ms` }}>
                                        <h4>{prop.title}</h4>
                                        <p>{prop.funder}</p>
                                        <p>Határidő: {prop.submissionDeadline}</p>
                                        <p className="amount">{prop.amount.toLocaleString()} Ft</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


const DocsView: React.FC<any> = ({ docs, handleAddDoc }) => {
    return (
        <div className="docs-view">
            <div className="view-header">
                <h2>Dokumentumok</h2>
                <button className="btn btn-primary" onClick={() => handleAddDoc({ title: 'Új jegyzet', type: 'note', content: '' })}>
                    <span className="material-symbols-outlined">add</span>
                    Új Dokumentum
                </button>
            </div>
            <div className="docs-grid">
                {docs.map((doc, index) => (
                    <div className="doc-card card stagger-item" key={doc.id} style={{ animationDelay: `${index * 50}ms` }}>
                        <div className="doc-card-header">
                            <span className="material-symbols-outlined">
                                {doc.type === 'note' ? 'edit_note' : doc.type === 'link' ? 'link' : 'image'}
                            </span>
                            <h4>{doc.title}</h4>
                        </div>
                        <div className="doc-card-content">
                            {doc.type === 'image' ? <img src={doc.content} alt={doc.title} /> : <p>{doc.content}</p>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ContactsView: React.FC<any> = ({ contacts }) => {
    const [selectedContact, setSelectedContact] = useState<Contact | null>(contacts[0] || null);
    
    return (
         <div className="contacts-view-layout card">
            <div className="contact-list-pane">
                 {contacts.map((contact, index) => (
                     <div 
                        key={contact.id} 
                        className={`contact-item ${selectedContact?.id === contact.id ? 'selected' : ''} stagger-item`}
                        onClick={() => setSelectedContact(contact)}
                        style={{ animationDelay: `${index * 30}ms` }}
                    >
                         <div className="avatar-sm">{contact.name.charAt(0)}</div>
                         <div className="contact-item-info">
                             <div className="contact-item-name">{contact.name}</div>
                             <div className="contact-item-company">{contact.company}</div>
                         </div>
                    </div>
                 ))}
            </div>
             <div className="contact-detail-pane">
                 {selectedContact ? (
                    <>
                        <div className="contact-main-info card">
                             <div className="avatar-lg">{selectedContact.name.charAt(0)}</div>
                             <h2>{selectedContact.name}</h2>
                             <p>{selectedContact.role} at {selectedContact.company}</p>
                             <div className="contact-details-grid">
                                 <div><span className="material-symbols-outlined">email</span> {selectedContact.email}</div>
                                 <div><span className="material-symbols-outlined">phone</span> {selectedContact.phone}</div>
                             </div>
                        </div>
                        <div className="ai-contact-assistant card">
                            <h4>AI Asszisztens</h4>
                            <p>Összefoglaló a legutóbbi interakciókról és kapcsolódó feladatokról...</p>
                            <button className="btn btn-secondary">Email vázlat generálása</button>
                        </div>
                    </>
                 ) : (
                    <div className="no-contact-selected">Válasszon ki egy névjegyet.</div>
                 )}
            </div>
        </div>
    );
};


const TrainingView: React.FC<any> = ({ trainings }) => {
    return (
        <div className="training-view">
            <div className="view-header">
                <h2>Képzések</h2>
            </div>
            <div className="training-list">
                 {trainings.map((item, index) => (
                    <div key={item.id} className="training-item-card card stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                         <div className="training-item-header">
                            <h3>{item.title}</h3>
                            <span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span>
                         </div>
                         <p className="training-provider">{item.provider}</p>
                         <div className="progress-bar">
                             <div className="progress" style={{width: `${item.progress}%`}}></div>
                         </div>
                         <p>{item.progress}%</p>
                    </div>
                 ))}
            </div>
        </div>
    );
};


const GeminiChatView: React.FC<any> = ({ handleAddTask, handleAddEvent, handleSendEmail, addNotification }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [chat, setChat] = useState<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
// FIX START: The 'tools' parameter must be nested inside a 'config' object for ai.chats.create.
        const chatInstance = ai.chats.create({
            model: model,
            config: {
                tools: tools,
            },
        });
// FIX END: The 'tools' parameter must be nested inside a 'config' object for ai.chats.create.
        setChat(chatInstance);
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);
    
    const handleFunctionCall = async (functionCall) => {
        const { name, args } = functionCall;
        let result;
        let userMessage = "";
        try {
            if (name === 'create_task') {
                const newTask = handleAddTask(args);
                result = { success: true, taskId: newTask.id };
                userMessage = `Feladat létrehozva: "${newTask.title}"`;
            } else if (name === 'create_calendar_event') {
                const newEvent = handleAddEvent(args);
                result = { success: true, eventId: newEvent.id };
                userMessage = `Esemény létrehozva: "${newEvent.title}"`;
            } else if (name === 'send_email') {
                const sentEmail = handleSendEmail(args);
                result = { success: true, emailId: sentEmail.id };
                userMessage = `Email elküldve a(z) ${sentEmail.recipient} címre.`;
            } else {
                result = { success: false, error: 'Ismeretlen funkció' };
                userMessage = `Ismeretlen parancs: ${name}`;
                addNotification(`Ismeretlen parancs: ${name}`, 'error');
            }
             if(result.success) {
                setMessages(prev => [...prev, { id: generateId('bot'), text: userMessage, sender: 'bot', isAction: true }]);
            }
            return {
                functionResponse: {
                    name,
                    response: result
                }
            };
        } catch (e) {
            console.error("Function call error:", e);
            addNotification(`Hiba a parancs végrehajtása közben: ${name}`, 'error');
            return {
                functionResponse: {
                    name,
                    response: { success: false, error: e.message }
                }
            };
        }
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading || !chat) return;

        const userMessage: Message = { id: generateId('user'), text: input, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const result = await chat.sendMessageStream({ message: input });
            let accumulatedText = "";
            let functionCalls: any[] = [];
            
            for await (const chunk of result) {
                 if (chunk.functionCalls) {
                    functionCalls.push(...chunk.functionCalls);
                } else {
                    accumulatedText += chunk.text;
                    setMessages(prev => {
                        const lastMessage = prev[prev.length - 1];
                        if (lastMessage.sender === 'bot' && !lastMessage.isAction) {
                            return [...prev.slice(0, -1), { ...lastMessage, text: accumulatedText }];
                        }
                        return [...prev, { id: generateId('bot'), text: accumulatedText, sender: 'bot' }];
                    });
                }
            }
            
            if (functionCalls.length > 0) {
                setMessages(prev => [...prev, { id: generateId('bot'), text: "Parancs végrehajtása...", sender: 'bot', isAction: true }]);
                const functionResponses: Part[] = [];

                for (const call of functionCalls) {
                    const responsePart = await handleFunctionCall(call);
                    functionResponses.push(responsePart);
                }

// FIX START: The 'message' parameter for sendMessageStream should be the array of parts directly, not wrapped in an object with a 'parts' key.
                const finalResult = await chat.sendMessageStream({ message: functionResponses });
// FIX END: The 'message' parameter for sendMessageStream should be the array of parts directly, not wrapped in an object with a 'parts' key.
                let finalAccumulatedText = "";
                for await (const chunk of finalResult) {
                     finalAccumulatedText += chunk.text;
                    setMessages(prev => {
                        const lastMessage = prev[prev.length - 1];
                        if (lastMessage.sender === 'bot' && !lastMessage.isAction) {
                            return [...prev.slice(0, -1), { ...lastMessage, text: finalAccumulatedText }];
                        }
                        return [...prev, { id: generateId('bot'), text: finalAccumulatedText, sender: 'bot' }];
                    });
                }
            }
            

        } catch (error) {
            console.error("Gemini API error:", error);
            setMessages(prev => [...prev, { id: generateId('bot'), text: 'Hoppá, valami hiba történt.', sender: 'bot', isError: true }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="gemini-chat-view">
            <div className="chat-window card">
                <div className="chat-messages">
                    {messages.map(msg => (
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
                <form onSubmit={handleSubmit} className="chat-input-form">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Kérdezz valamit..."
                        disabled={isLoading}
                        className="form-input"
                    />
                    <button type="submit" className="btn btn-primary" disabled={isLoading}>
                        <span className="material-symbols-outlined">send</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

const CreativeView: React.FC<any> = ({ handleAddDoc }) => {
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generateImage = async () => {
        if (!prompt.trim()) {
            setError('A leírás nem lehet üres.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setImages([]);

        try {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                 config: {
                    numberOfImages: 1,
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                 const imageUrls = response.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
                 setImages(imageUrls);
            } else {
                 setError('Nem sikerült képet generálni. Próbálja újra egy másik leírással.');
            }
        } catch (e) {
            console.error("Image generation error:", e);
            setError('Hiba történt a kép generálása során.');
        } finally {
            setIsLoading(false);
        }
    };

    const saveImage = (imageData: string) => {
        handleAddDoc({
            type: 'image',
            title: `AI Kép: ${prompt.substring(0, 20)}...`,
            content: imageData
        });
    };

    return (
        <div className="creative-view-container">
            <div className="generation-form-card card">
                <h3>Képgenerátor</h3>
                <p>Írja le, milyen képet szeretne létrehozni.</p>
                <div className="form-group">
                    <textarea
                        className="form-textarea"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Pl.: Egy fotorealisztikus kép egy vörös macskáról, amint egy laptopon dolgozik egy kávézóban."
                    />
                </div>
                <button className="btn btn-primary" onClick={generateImage} disabled={isLoading}>
                    {isLoading ? 'Generálás...' : 'Kép generálása'}
                </button>
            </div>
            <div className="image-results-card card">
                 <h3>Eredmények</h3>
                {isLoading && <div className="loader">Kép generálása, ez eltarthat egy ideig...</div>}
                {error && <div className="error-message">{error}</div>}
                <div className="image-results-grid">
                    {images.map((imgSrc, index) => (
                        <div key={index} className="image-result-item">
                            <img src={imgSrc} alt={`Generated image for: ${prompt}`} />
                             <button className="btn btn-secondary" onClick={() => saveImage(imgSrc)}>Mentés a dokumentumokba</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MeetingAssistantView: React.FC<any> = () => {
    // Placeholder state
    return (
        <div className="meeting-assistant-view">
             <div className="view-header">
                <h2>Meeting Asszisztens</h2>
            </div>
            <div className="card meeting-controls-card">
                 <h3>Hangfelvétel</h3>
                <p>Indítsa el a felvételt, hogy az AI elemezhesse a megbeszélést.</p>
                <button className="btn btn-primary"><span className="material-symbols-outlined">mic</span> Felvétel indítása</button>
            </div>
             <div className="card analysis-results-card">
                 <h3>Elemzés</h3>
                 <p>A felvétel után itt jelennek meg az eredmények.</p>
            </div>
        </div>
    );
};


// --- RENDER APP ---
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
