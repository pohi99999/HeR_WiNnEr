import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import { GoogleGenAI, Chat, GenerateContentResponse, Content, Part, Type, FunctionDeclaration, Tool, SendMessageParameters, Modality } from "@google/genai";
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Consolidated `declare global` blocks to resolve TypeScript error.
// Fix: Inline the AIStudio interface definition directly into Window to avoid potential conflicts
// with external or implicit declarations of AIStudio or window.aistudio.
declare global {
    interface Window {
        aistudio: {
            hasSelectedApiKey: () => Promise<boolean>;
            openSelectKey: () => Promise<void>;
        };
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

interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
  color?: 'primary' | 'secondary' | 'accent';
  direction?: 'in' | 'out';
}

// --- MOCK DATA ---
const mockMindMapData: MindMapNode = {
  id: 'root',
  label: 'Pohánka Kft. Digitális és Innovációs Stratégia',
  color: 'primary',
  children: [
    {
      id: 'n1', label: 'Vállalati Kettősség és Kihívások', direction: 'out', color: 'secondary', children: [
        { id: 'n1-1', label: 'DIMOP Plusz-1.2.3/B-24 (Kiegészítő Hitelprogram)', direction: 'in', color: 'accent', children: [
            { id: 'n1-1-1', label: 'Cél: MI infrastruktúra finanszírozása', color: 'accent'},
            { id: 'n1-1-2', label: 'Kamatmentes hitel: 20-200 millió Ft', color: 'accent'},
            { id: 'n1-1-3', label: 'Feltétel: Digitális érettség (valószínűleg megfelel)', color: 'accent'},
        ]},
      ]
    },
    { id: 'n2', label: 'Kétsávos Pályázati Stratégia', direction: 'out', color: 'secondary', children: [
        { id: 'n2-1', label: 'EIC Accelerator (Nemzetközi, Hosszú Távú)', direction: 'out', color: 'accent'},
    ] },
    { id: 'n3', label: 'Pályázati Jogosultsági Profil', direction: 'out', color: 'secondary', children: [
        { id: 'n3-1', label: 'OFA DigiKKV Program', color: 'accent' },
    ] },
    { id: 'n4', label: 'További Pályázati Lehetőségek', direction: 'in', color: 'secondary', children: [
        { id: 'n4-1', label: 'Minden Vállalkozásnak Legyen Saját Honlapja Program', direction: 'out', color: 'accent' },
    ] },
    { id: 'n5', label: 'Cselekvési Terv és Javaslatok', direction: 'out', color: 'secondary', children: [
        { id: 'n5-1', label: 'Modern Vállalkozások Program (MVP 2.0)', direction: 'out', color: 'accent'},
        { id: 'n5-2', label: 'DIMOP Plusz-1.2.6-24: Nem releváns (területi kizárás)', color: 'accent'},
        { id: 'n5-3', label: 'NKFIH Programok (Jövőbeli cél)', color: 'accent'},
    ] },
  ]
};


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
    { id: 'doc-5', type: 'image', title: 'AI által generált kép', content: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQuImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNhZmU5ZWEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY2NvbG9yPSIjNTNiOGI0Ii8+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZykiLz48L3N2Zz4=', createdAt: new Date('2024-08-01').toISOString() }
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
    { id: 'task-8', title: 'Ügyfél prezentáció előkészítése', description: 'Prezentáció az új ügyfélnek a Q4-es kampányról.', status: 'Teendő', priority: 'Magas', category: 'Ügyfél', createdAt: '2024-08-03', dueDate: '2024-08-09' },
    { id: 'task-9', title: 'Költségvetés áttekintése', description: 'Áttekintés és módosítás a havi költségvetésen.', status: 'Teendő', priority: 'Közepes', category: 'Munka', createdAt: '2024-08-03', dueDate: '2024-08-07' },
    { id: 'task-10', title: 'Új feature design tervezése', description: 'UX/UI tervek készítése a mobil app új funkciójához.', status: 'Folyamatban', priority: 'Magas', category: 'Projekt', createdAt: '2024-08-01', dueDate: '2024-08-10' },
];

const mockPlannerEvents: PlannerEvent[] = [
    { id: 'event-1', title: 'Heti Projekt Míting', date: '2024-08-05', time: '10:00', duration: 60, type: 'meeting', location: 'Google Meet' },
    { id: 'event-2', title: 'Marketing Kampány Indítása', date: '2024-08-12', type: 'deadline', description: 'Q3 Kampány start' },
    { id: 'event-3', title: 'Edzés', date: '2024-08-05', time: '18:00', duration: 90, type: 'personal' },
    { id: 'event-4', title: 'Pályázat beadási határidő', date: '2024-09-15', type: 'proposal_deadline' }
];

const mockEmails: EmailMessage[] = [
    { id: 'email-1', sender: 'Dénes', recipient: 'Felhasználó', subject: 'Marketing kampány', body: 'Szia, átküldtem a legújabb anyagokat. Kérlek nézd át őket a hét végéig. Köszi, Dénes', timestamp: new Date().toISOString(), read: false, important: true, category: 'inbox' },
    { id: 'email-2', sender: 'Kovács Gábor', recipient: 'Felhasználó', subject: 'Ismerkedő megbeszélés', body: 'Kedves Felhasználó! A jövő hét megfelelő lenne egy rövid megbeszélésre? Üdv, Kovács Gábor', timestamp: new Date(Date.now() - 86400000).toISOString(), read: true, important: false, category: 'inbox' },
    { id: 'email-3', sender: 'Felhasználó', recipient: 'Béla', subject: 'Re: API bug', body: 'Szia Béla, találtam egy hibát a /users végponton. Ránéznél?', timestamp: new Date(Date.now() - 172800000).toISOString(), read: true, important: false, category: 'sent' },
];

const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Irányítópult', icon: 'dashboard' },
    { id: 'planner', label: 'Tervező', icon: 'calendar_month' },
    { id: 'tasks', label: 'Feladatok', icon: 'task_alt' },
    { id: 'email', label: 'Email', icon: 'mail' },
    {
        id: 'work', label: 'Munka', icon: 'work', subItems: [
            { id: 'project_overview', label: 'Projekt Áttekintés', icon: 'monitoring' },
            { id: 'projects_kanban', label: 'Projekt Kanban', icon: 'view_kanban' },
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
            { id: 'mind_map', label: 'Stratégia Térkép', icon: 'account_tree' },
            { id: 'creative_tools', label: 'Kreatív Eszközök', icon: 'brush' },
            { id: 'meeting_assistant', label: 'Meeting Asszisztens', icon: 'mic' },
        ]
    }
];

// --- HELPER FUNCTIONS & HOOKS ---
const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper function to encode file to base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // Remove the data:image/png;base64, or data:video/mp4;base64, prefix
            resolve(result.split(',')[1]);
        };
        reader.onerror = error => reject(error);
    });
};

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
        mindMap: mockMindMapData,
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
    
    const addTask = (task: Omit<TaskItem, 'id' | 'createdAt'>) => {
        const newTask: TaskItem = {
            ...task,
            id: generateId(),
            createdAt: new Date().toISOString()
        };
        setData(prev => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
    }

    return { ...data, updateTaskStatus, addDoc, updateProjectStatus, addTask };
};

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(window.matchMedia(query).matches);

    useEffect(() => {
        const media = window.matchMedia(query);
        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, [query]);

    return matches;
};

// Fix: Add className prop to Icon component definition
const Icon = ({ name, filled, className }: { name: string, filled?: boolean, className?: string }) => <span className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className || ''}`}>{name}</span>;


// --- UI COMPONENTS ---

const Card = ({ children, className = '', header, fullHeight, style }: { children?: React.ReactNode, className?: string, header?: React.ReactNode, fullHeight?: boolean, style?: React.CSSProperties }) => (
    <div className={`card ${className}`} style={{ height: fullHeight ? '100%' : 'auto', ...style }}>
        {header && <div className="card-header">{header}</div>}
        <div className="card-body" style={{ height: fullHeight && header ? 'calc(100% - 65px)' : fullHeight ? '100%' : 'auto', overflowY: fullHeight ? 'auto' : 'visible' }}>
            {children}
        </div>
    </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children?: React.ReactNode }) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button onClick={onClose} className="btn btn-icon btn-secondary"><Icon name="close" /></button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

const NotificationComponent: React.FC<{ notification: Notification, onDismiss: (id: string) => void }> = ({ notification, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(notification.id);
        }, 5000);
        return () => clearTimeout(timer);
    }, [notification, onDismiss]);

    return (
        <div className={`notification notification-${notification.type}`}>
            <Icon name={notification.type === 'success' ? 'check_circle' : 'error'} />
            <p>{notification.message}</p>
            <button onClick={() => onDismiss(notification.id)} className="dismiss-btn"><Icon name="close" /></button>
        </div>
    );
};


// --- SIDEBAR & HEADER ---

const Sidebar = ({ currentView, setView, isCollapsed, setCollapsed, isMobile, isMobileMenuOpen, setMobileMenuOpen }) => {
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({ work: true, ai_tools: true });

    const handleNavClick = (viewId) => {
        setView(viewId);
        if(isMobile) {
            setMobileMenuOpen(false);
        }
    };

    const NavLink: React.FC<{ item: NavItem }> = ({ item }) => (
        <li>
            <a href="#" className={`nav-link ${currentView === item.id ? 'active' : ''}`} onClick={() => handleNavClick(item.id)}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
            </a>
        </li>
    );

    const NavSection: React.FC<{ item: NavItem }> = ({ item }) => {
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
        <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''} ${isMobile && isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-inner">
                <header className="sidebar-header">
                    {(!isCollapsed || isMobile) && <h2>P-Day Light</h2>}
                     {!isMobile && (
                        <button className="collapse-toggle" onClick={() => setCollapsed(!isCollapsed)}>
                            <Icon name={isCollapsed ? 'menu_open' : 'menu'} />
                        </button>
                     )}
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

const GlobalHeader = ({ currentView, onMenuClick }) => {
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const currentNavItem = navItems.flatMap(i => i.subItems || i).find(i => i.id === currentView);
    return (
        <header className="global-header">
             {isMobile && (
                <button className="mobile-menu-toggle" onClick={onMenuClick}>
                    <Icon name="menu" />
                </button>
            )}
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

const DashboardView = ({ tasks, emails, addNotification }: { tasks: TaskItem[], emails: EmailMessage[], addNotification: (notification: Omit<Notification, 'id'>) => void }) => {
    const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

    const handleGenerateWeeklySummary = async () => {
        setIsGeneratingSummary(true);
        setWeeklySummary(null); // Clear previous summary

        try {
            const today = new Date();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
            startOfWeek.setHours(0, 0, 0, 0); // Set to start of day
            const endOfWeek = new Date(today);
            endOfWeek.setDate(today.getDate() - today.getDay() + 7); // Sunday
            endOfWeek.setHours(23, 59, 59, 999); // Set to end of day

            const relevantTasks = tasks.filter(task => {
                const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
                const isUpcomingOrActive = (task.status === 'Teendő' || task.status === 'Folyamatban');
                
                // Include active tasks, and tasks due this week (startOfWeek to endOfWeek)
                return isUpcomingOrActive && (!taskDueDate || (taskDueDate >= startOfWeek && taskDueDate <= endOfWeek));
            });

            if (relevantTasks.length === 0) {
                setWeeklySummary("Nincsenek releváns feladatok erre a hétre. Ideje pihenni, vagy új kihívásokat keresni!");
                addNotification({ message: 'Nincs generálható összefoglaló: Nincsenek releváns feladatok.', type: 'info' });
                return;
            }

            const taskList = relevantTasks.map(task => 
                `- ${task.title} (Státusz: ${task.status}, Prioritás: ${task.priority}${task.dueDate ? `, Határidő: ${task.dueDate}` : ''})`
            ).join('\n');

            const prompt = `
                Összegezd az alábbi heti feladatokat, és javasolj 2-3 fő fókuszterületet a hétre.
                Kérlek, vedd figyelembe a feladatok státuszát és prioritását.
                Az összefoglaló legyen tömör, hasznos, és motiváló.
                Formázd az eredményt Markdown-ban, címmel és felsorolásokkal.

                Feladatok:
                ${taskList}
            `;

            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: { parts: [{ text: prompt }] },
                config: {
                    systemInstruction: "Te egy hatékony és segítőkész asszisztens vagy, aki képes feladatlistákból releváns összefoglalókat és fókuszterületeket javasolni, a motiváció fenntartása érdekében.",
                    temperature: 0.7,
                    topP: 0.95,
                    topK: 64,
                },
            });

            setWeeklySummary(response.text);
            addNotification({ message: 'Összefoglaló sikeresen elkészítve!', type: 'success' });

        } catch (error: any) {
            console.error("Error generating weekly summary:", error);
            addNotification({ message: `Hiba az összefoglaló generálása során: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
            setWeeklySummary("Hiba történt az összefoglaló generálása során. Kérjük, próbálja újra.");
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    return (
        <div className="dashboard-grid">
            <Card fullHeight className="weekly-summary-card stagger-item" header={
                <div className="card-header-ai">
                    <h4>Heti Feladat Összefoglaló</h4>
                    <span className="ai-badge">AI</span>
                </div>
            }>
                {isGeneratingSummary ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Heti összefoglaló generálása... Ez eltarthat egy percig.</p>
                    </div>
                ) : weeklySummary ? (
                    <>
                        <div className="summary-content-scrollable">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{weeklySummary}</ReactMarkdown>
                        </div>
                        <button className="btn btn-secondary btn-small refresh-summary-btn" onClick={handleGenerateWeeklySummary} aria-label="Összefoglaló frissítése">
                            <Icon name="refresh" />
                            <span>Frissítés</span>
                        </button>
                    </>
                ) : (
                    <div className="empty-state">
                        <Icon name="auto_awesome" className="empty-state-icon" />
                        <p>Kattintson az alábbi gombra a heti feladat-összefoglaló elkészítéséhez és a fókuszterületek javaslatához.</p>
                        <button className="btn btn-primary" onClick={handleGenerateWeeklySummary} aria-label="Heti összefoglaló generálása">
                            <Icon name="auto_awesome" />
                            <span>Összefoglaló Generálása</span>
                        </button>
                    </div>
                )}
            </Card>
            <Card className="stagger-item" style={{animationDelay: '100ms'}} header={<h4>Hamarosan lejáró feladatok</h4>}>
                <ul className="quick-list">
                    {tasks.filter(t => t.dueDate && t.status !== 'Kész').sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5).map(task => (
                        <li key={task.id}>
                            <span>{task.title}</span>
                            <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                        </li>
                    ))}
                </ul>
            </Card>
            <Card className="stagger-item" style={{animationDelay: '200ms'}} header={<h4>Legutóbbi Emailek</h4>}>
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
};

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
    
    const weekDays = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']; // Fixed Tuesday to Szerda here

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

const TaskCard: React.FC<{ task: TaskItem }> = ({ task }) => {
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

const KanbanColumn: React.FC<{ status: TaskStatus, tasks: TaskItem[], onDropTask: (taskId: string, newStatus: TaskStatus) => void }> = ({ status, tasks, onDropTask }) => {
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

const EmailView = ({ emails: initialEmails, addTask, addNotification }) => {
    const [emails, setEmails] = useState(initialEmails);
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(emails.find(e => e.category === 'inbox')?.id || null);
    const [activeCategory, setActiveCategory] = useState<'inbox' | 'sent'>('inbox');
    const [isProcessing, setIsProcessing] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [aiGeneratedTask, setAiGeneratedTask] = useState<Partial<TaskItem> | null>(null);
    
    const selectedEmail = emails.find(e => e.id === selectedEmailId);

    const handleSelectEmail = (id: string) => {
        setSelectedEmailId(id);
        setEmails(emails.map(e => e.id === id ? { ...e, read: true } : e));
    };

    const toggleImportance = (id: string) => {
        setEmails(emails.map(e => e.id === id ? { ...e, important: !e.important } : e));
    };
    
    const handleCreateTaskFromEmail = async () => {
        if (!selectedEmail) return;
        setIsProcessing(true);
        try {
            const schema = {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "A tömör, egyértelmű feladatcím, legfeljebb 10 szó." },
                    description: { type: Type.STRING, description: "A feladat részletes leírása az email törzséből." },
                    dueDate: { type: Type.STRING, description: "A feladat határideje YYYY-MM-DD formátumban. Ha nincs konkrét dátum említve, legyen null." }
                },
                required: ["title", "description"]
            };

            const prompt = `
                Elemezd a következő emailt és vonj ki belőle egy feladatot.
                Email Tárgy: ${selectedEmail.subject}
                Email Szöveg: ${selectedEmail.body}
                A mai dátum: ${new Date().toISOString().split('T')[0]}. Használd ezt kontextusként relatív dátumokhoz (pl. "holnap", "hétvége").
                Add meg a kimenetet a megadott séma szerinti JSON formátumban.
            `;

            // Initialize AI here to ensure it uses the latest API_KEY if updated by user
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema },
            });

            const taskData = JSON.parse(response.text);
            setAiGeneratedTask({
                title: taskData.title || '',
                description: taskData.description || '',
                dueDate: taskData.dueDate || undefined,
            });
            setShowTaskModal(true);

        } catch (error) {
            console.error("Error generating task from email:", error);
            addNotification({ message: 'Hiba történt a feladat létrehozása során.', type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveTask = (taskData: Partial<TaskItem>) => {
        const finalTask = {
            title: taskData.title!, // Use non-null assertion as title is required by schema
            description: taskData.description,
            dueDate: taskData.dueDate,
            priority: taskData.priority || 'Közepes',
            status: taskData.status || 'Teendő',
            category: 'Email'
        };
        addTask(finalTask);
        setShowTaskModal(false);
        setAiGeneratedTask(null);
        addNotification({ message: 'Feladat sikeresen létrehozva!', type: 'success' });
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
                                    <div className="email-content-actions">
                                        <button className="btn btn-secondary btn-icon-text" onClick={handleCreateTaskFromEmail} disabled={isProcessing}>
                                            <Icon name={isProcessing ? 'progress_activity' : 'auto_awesome'} />
                                            {isProcessing ? 'Feldolgozás...' : 'Feladat Létrehozása'}
                                        </button>
                                        <button className="btn btn-icon btn-secondary" onClick={() => toggleImportance(selectedEmail.id)}>
                                            <Icon name="star" filled={selectedEmail.important} />
                                        </button>
                                    </div>
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
            {aiGeneratedTask && (
                <TaskCreationModal 
                    isOpen={showTaskModal}
                    onClose={() => setShowTaskModal(false)}
                    initialTaskData={aiGeneratedTask}
                    onSave={handleSaveTask}
                />
            )}
        </div>
    );
};

const TaskCreationModal = ({ isOpen, onClose, initialTaskData, onSave }: { isOpen: boolean, onClose: () => void, initialTaskData: Partial<TaskItem>, onSave: (taskData: Partial<TaskItem>) => void }) => {
    const [taskData, setTaskData] = useState<Partial<TaskItem>>(initialTaskData);

    useEffect(() => {
        setTaskData(initialTaskData);
    }, [initialTaskData]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setTaskData(prev => ({...prev, [name]: value}));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(taskData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Új feladat létrehozása Emailből">
            <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group">
                    <label htmlFor="title">Cím</label>
                    <input type="text" id="title" name="title" value={taskData.title || ''} onChange={handleChange} required />
                </div>
                <div className="form-group">
                    <label htmlFor="description">Leírás</label>
                    <textarea id="description" name="description" value={taskData.description || ''} onChange={handleChange} rows={4}></textarea>
                </div>
                <div className="form-group">
                    <label htmlFor="dueDate">Határidő</label>
                    <input type="date" id="dueDate" name="dueDate" value={taskData.dueDate || ''} onChange={handleChange} />
                </div>
                 <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Mégse</button>
                    <button type="submit" className="btn btn-primary">Mentés</button>
                </div>
            </form>
        </Modal>
    );
};


const ProjectCard: React.FC<{ project: Project, tasks: TaskItem[] }> = ({ project, tasks }) => {
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

const ProjectKanbanColumn: React.FC<{ status: ProjectStatus, projects: Project[], tasks: TaskItem[], onDropProject: (id: string, newStatus: ProjectStatus) => void }> = ({ status, projects, tasks, onDropProject }) => {
    const ref = useRef(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: 'PROJECT',
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

const ProjectsKanbanView = ({ projects, tasks, updateProjectStatus }: { projects: Project[], tasks: TaskItem[], updateProjectStatus: (id: string, newStatus: ProjectStatus) => void }) => {
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

const ProjectOverviewView = ({ projects, tasks }: { projects: Project[], tasks: TaskItem[] }) => {
    const statusOrder: ProjectStatus[] = ['Tervezés', 'Fejlesztés', 'Tesztelés', 'Kész'];
    const statusColors = {
        'Tervezés': '#3498db',
        'Fejlesztés': '#f39c12',
        'Tesztelés': '#9b59b6',
        'Kész': '#34d399'
    };

    const projectsByStatus = statusOrder.reduce((acc, status) => {
        acc[status] = projects.filter(p => p.status === status);
        return acc;
    }, {} as Record<ProjectStatus, Project[]>);

    const totalProjects = projects.length;

    const upcomingDeadlines = projects
        .filter(p => p.dueDate && new Date(p.dueDate) >= new Date())
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5);

    const keyTasks = tasks
        .filter(t => (t.priority === 'Kritikus' || t.priority === 'Magas') && t.status !== 'Kész' && t.projectId)
        .slice(0, 5);
        
    const getProjectById = (id: string) => projects.find(p => p.id === id);

    const DonutChart = () => {
        const radius = 80;
        const strokeWidth = 25;
        const circumference = 2 * Math.PI * radius;
        let accumulatedPercentage = 0;

        return (
            <div className="donut-chart-container">
                <svg className="donut-chart" viewBox="0 0 200 200">
                    <circle className="donut-hole" cx="100" cy="100" r={radius - strokeWidth / 2} fill="transparent"></circle>
                    <circle className="donut-ring" cx="100" cy="100" r={radius} fill="transparent" strokeWidth={strokeWidth}></circle>
                    {statusOrder.map(status => {
                        const percentage = totalProjects > 0 ? (projectsByStatus[status].length / totalProjects) * 100 : 0;
                        const offset = circumference - (accumulatedPercentage / 100) * circumference;
                        accumulatedPercentage += percentage;
                        if (percentage === 0) return null;
                        return (
                            <circle
                                key={status}
                                className="donut-segment"
                                cx="100"
                                cy="100"
                                r={radius}
                                fill="transparent"
                                stroke={statusColors[status]}
                                strokeWidth={strokeWidth}
                                strokeDasharray={`${circumference} ${circumference}`}
                                strokeDashoffset={offset}
                                transform="rotate(-90 100 100)"
                            />
                        );
                    })}
                </svg>
                <div className="chart-center-text">
                    <span className="total-count">{totalProjects}</span>
                    <span>Projekt</span>
                </div>
            </div>
        );
    };

    return (
        <div className="view-fade-in project-overview-grid">
            <Card header={<h4>Projektek Státusz Szerint</h4>} className="stagger-item">
                <div className="chart-card-content">
                    <DonutChart />
                    <ul className="chart-legend">
                        {statusOrder.map(status => (
                            <li key={status}>
                                <span className="legend-dot" style={{ backgroundColor: statusColors[status] }}></span>
                                <span>{status}</span>
                                <span className="legend-count">{projectsByStatus[status].length}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </Card>
            <Card header={<h4>Közelgő Határidők</h4>} className="stagger-item" style={{ animationDelay: '100ms' }}>
                <ul className="quick-list">
                    {upcomingDeadlines.map(p => {
                         const daysLeft = Math.ceil((new Date(p.dueDate!).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                        return (
                             <li key={p.id}>
                                <div>
                                    <Icon name="event" />
                                    <span>{p.title}</span>
                                </div>
                                <span className="deadline-days">{p.dueDate} ({daysLeft} nap)</span>
                            </li>
                        )
                    })}
                </ul>
            </Card>
             <Card header={<h4>Kiemelt Feladatok</h4>} className="stagger-item" style={{ gridColumn: '1 / -1', animationDelay: '200ms' }}>
                 <ul className="quick-list">
                    {keyTasks.map(task => {
                        const project = getProjectById(task.projectId!); // Use non-null assertion as projectId is filtered
                        return (
                            <li key={task.id}>
                                <div>
                                    <Icon name="flag" />
                                    <div>
                                        <span className="task-title-with-project">{task.title}</span>
                                        {project && <span className="task-project-name">{project.title}</span>}
                                    </div>
                                </div>
                                <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                            </li>
                        );
                    })}
                </ul>
            </Card>
        </div>
    );
};


const ProposalCard: React.FC<{ proposal: Proposal }> = ({ proposal }) => (
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

const ContactCard: React.FC<{ contact: Contact }> = ({ contact }) => {
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
                {(contact.linkedProjectIds?.length! > 0 || contact.linkedProposalIds?.length! > 0) && ( // Use non-null assertion if lengths are checked
                     <div className="contact-links">
                        <Icon name="link" />
                        <span>
                            {contact.linkedProjectIds?.length! > 0 && `${contact.linkedProjectIds!.length} projekt`}
                            {(contact.linkedProjectIds?.length! > 0 && contact.linkedProposalIds?.length! > 0) && ', '}
                            {contact.linkedProposalIds?.length! > 0 && `${contact.linkedProposalIds!.length} pályázat`}
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

const FinancesView = ({ transactions, budgets }: { transactions: Transaction[], budgets: Budget[] }) => {
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

const DocsView = ({ docs: initialDocs, addDoc }: { docs: DocItem[], addDoc: (doc: DocItem) => void }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    
    const handleSubmit = (e: React.FormEvent) => {
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

    const DocCard: React.FC<{ doc: DocItem }> = ({ doc }) => {
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
const MeetingAssistantView = () => <Card>Meeting Asszisztens helyőrző</Card>;

const CreativeToolsView = ({ addDoc, addNotification }: { addDoc: (doc: DocItem) => void, addNotification: (notification: Omit<Notification, 'id'>) => void }) => {
    const [activeTool, setActiveTool] = useState<'generate_image' | 'generate_video' | 'edit_image' | 'edit_video'>('generate_image');
    const [prompt, setPrompt] = useState('');
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
    const [editedVideoUrl, setEditedVideoUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [videoResolution, setVideoResolution] = useState<'720p' | '1080p'>('1080p');
    const [hasVeoApiKey, setHasVeoApiKey] = useState(false); // State to track Veo API key status

    useEffect(() => {
        checkVeoApiKey();
    }, []);

    const checkVeoApiKey = async () => {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            setHasVeoApiKey(hasKey);
        }
    };

    const handleSelectVeoApiKey = async () => {
        if (window.aistudio && window.aistudio.openSelectKey) {
            await window.aistudio.openSelectKey();
            setHasVeoApiKey(true); // Assume success after opening dialog
            addNotification({ message: 'API kulcs kiválasztva. Ha hiba történik, próbálja meg újra kiválasztani.', type: 'info' });
        }
    };

    const handleGenerateImage = async () => {
        if (!prompt) {
            addNotification({ message: 'Kérjük, adjon meg egy leírást a kép generálásához.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setLoadingMessage('Kép generálása...');
        setGeneratedImageUrl(null);
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY }); // Re-initialize for up-to-date key
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                setGeneratedImageUrl(imageUrl);
                addNotification({ message: 'Kép sikeresen generálva!', type: 'success' });
                addDoc({ id: generateId(), type: 'image', title: `Generált Kép: ${prompt.substring(0, 30)}`, content: imageUrl, createdAt: new Date().toISOString() });
            } else {
                addNotification({ message: 'A kép generálása sikertelen: Nincs kép a válaszban.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error generating image:", error);
            addNotification({ message: `Hiba a kép generálása során: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
        } finally {
            setIsGenerating(false);
            setLoadingMessage('');
        }
    };

    const handleGenerateVideo = async () => {
        if (!prompt) {
            addNotification({ message: 'Kérjük, adjon meg egy leírást a videó generálásához.', type: 'error' });
            return;
        }
        if (!hasVeoApiKey) {
            addNotification({ message: 'Kérjük, válassza ki az API kulcsot a videógeneráláshoz.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setLoadingMessage('Videó generálása (ez eltarthat néhány percig)...');
        setGeneratedVideoUrl(null);

        let operation = null;
        try {
            // Re-initialize AI right before making the call to ensure it uses the most up-to-date API key
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                config: {
                    numberOfVideos: 1,
                    resolution: videoResolution,
                    aspectRatio: videoAspectRatio
                }
            });

            while (!operation.done) {
                setLoadingMessage('Videó generálása (még dolgozunk rajta)...');
                await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }

            if (operation.response?.generatedVideos?.[0]?.video?.uri) {
                const downloadLink = operation.response.generatedVideos[0].video.uri;
                // The response.body contains the MP4 bytes. You must append an API key when fetching from the download link.
                const videoUrl = `${downloadLink}&key=${API_KEY}`;
                setGeneratedVideoUrl(videoUrl);
                addNotification({ message: 'Videó sikeresen generálva!', type: 'success' });
                addDoc({ id: generateId(), type: 'link', title: `Generált Videó: ${prompt.substring(0, 30)}`, content: videoUrl, createdAt: new Date().toISOString() });
            } else {
                addNotification({ message: 'A videó generálása sikertelen: Nincs videó a válaszban.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error generating video:", error);
            if (error.message && error.message.includes("Requested entity was not found.")) {
                 addNotification({ message: 'Hiba a videógenerálás során. Kérjük, válassza ki újra az API kulcsot.', type: 'error' });
                 setHasVeoApiKey(false); // Reset key status
            } else {
                addNotification({ message: `Hiba a videó generálása során: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
            }
        } finally {
            setIsGenerating(false);
            setLoadingMessage('');
        }
    };

    const handleEditImage = async () => {
        if (!imageFile || !prompt) {
            addNotification({ message: 'Kérjük, töltsön fel egy képet és adjon meg egy szerkesztési leírást.', type: 'error' });
            return;
        }
        setIsGenerating(true);
        setLoadingMessage('Kép szerkesztése...');
        setEditedImageUrl(null);

        try {
            const base64ImageData = await fileToBase64(imageFile);
            // Re-initialize AI here to ensure it uses the latest API_KEY if updated by user
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        { inlineData: { data: base64ImageData, mimeType: imageFile.type } },
                        { text: prompt },
                    ],
                },
                config: { responseModalities: [Modality.IMAGE] },
            });

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64ImageBytes: string = part.inlineData.data;
                        const imageUrl = `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
                        setEditedImageUrl(imageUrl);
                        addNotification({ message: 'Kép sikeresen szerkesztve!', type: 'success' });
                        addDoc({ id: generateId(), type: 'image', title: `Szerkesztett Kép: ${prompt.substring(0, 30)}`, content: imageUrl, createdAt: new Date().toISOString() });
                        break;
                    }
                }
            } else {
                addNotification({ message: 'A kép szerkesztése sikertelen: Nincs kép a válaszban.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error editing image:", error);
            addNotification({ message: `Hiba a kép szerkesztése során: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
        } finally {
            setIsGenerating(false);
            setLoadingMessage('');
        }
    };

    const handleEditVideo = async () => {
        if (!videoFile || !prompt) {
            addNotification({ message: 'Kérjük, töltsön fel egy videót és adjon meg egy szerkesztési leírást az extendáláshoz.', type: 'error' });
            return;
        }
        if (!hasVeoApiKey) {
            addNotification({ message: 'Kérjük, válassza ki az API kulcsot a videószerkesztéshez.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setLoadingMessage('Videó extendálása (ez eltarthat néhány percig)...');
        setEditedVideoUrl(null);

        let operation = null;
        try {
            const base64VideoData = await fileToBase64(videoFile);
            // Re-initialize AI right before making the call to ensure it uses the most up-to-date API key
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            operation = await ai.models.generateVideos({
                model: 'veo-3.1-generate-preview', // Use the generate-preview model for more advanced features like video extension
                prompt: prompt,
                video: {
                    videoBytes: base64VideoData,
                    mimeType: videoFile.type
                },
                config: {
                    numberOfVideos: 1,
                    resolution: '720p', // Assume 720p for extension for simplicity, as only 720p videos can be extended
                    aspectRatio: '16:9' // Aspect ratio must be the same as the previous video. For upload, we assume 16:9.
                }
            });

            while (!operation.done) {
                setLoadingMessage('Videó extendálása (még dolgozunk rajta)...');
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }

            if (operation.response?.generatedVideos?.[0]?.video?.uri) {
                const downloadLink = operation.response.generatedVideos[0].video.uri;
                const videoUrl = `${downloadLink}&key=${API_KEY}`;
                setEditedVideoUrl(videoUrl);
                addNotification({ message: 'Videó sikeresen extendálva!', type: 'success' });
                addDoc({ id: generateId(), type: 'link', title: `Szerkesztett Videó: ${prompt.substring(0, 30)}`, content: videoUrl, createdAt: new Date().toISOString() });
            } else {
                addNotification({ message: 'A videó extendálása sikertelen: Nincs videó a válaszban.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error extending video:", error);
            if (error.message && error.message.includes("Requested entity was not found.")) {
                 addNotification({ message: 'Hiba a videóextendálás során. Kérjük, válassza ki újra az API kulcsot.', type: 'error' });
                 setHasVeoApiKey(false); // Reset key status
            } else {
                addNotification({ message: `Hiba a videó extendálása során: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
            }
        } finally {
            setIsGenerating(false);
            setLoadingMessage('');
        }
    };


    const renderContent = () => {
        switch (activeTool) {
            case 'generate_image':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="imagePrompt">Kép leírása:</label>
                            <textarea id="imagePrompt" className="creative-prompt-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le a generálni kívánt képet..." rows={3}></textarea>
                        </div>
                        <button className="btn btn-primary" onClick={handleGenerateImage} disabled={isGenerating}>
                            <Icon name={isGenerating ? 'progress_activity' : 'auto_awesome'} />
                            {isGenerating ? loadingMessage : 'Kép Generálása'}
                        </button>
                        {generatedImageUrl && (
                            <div className="generated-content-output">
                                <h4>Generált Kép:</h4>
                                <img src={generatedImageUrl} alt="Generated" className="generated-media" />
                            </div>
                        )}
                    </>
                );
            case 'generate_video':
                return (
                    <>
                        {!hasVeoApiKey && (
                            <div className="api-key-warning">
                                <p>A videógenerálás prémium szolgáltatás, ami saját API kulcsot igényel. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">További információ a számlázásról.</a></p>
                                <button className="btn btn-warning" onClick={handleSelectVeoApiKey}>
                                    <Icon name="key" /> API Kulcs Kiválasztása
                                </button>
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="videoPrompt">Videó leírása:</label>
                            <textarea id="videoPrompt" className="creative-prompt-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le a generálni kívánt videót..." rows={3}></textarea>
                        </div>
                        <div className="form-group">
                            <label>Képarány:</label>
                            <div className="option-buttons">
                                <button className={`btn btn-secondary ${videoAspectRatio === '16:9' ? 'active' : ''}`} onClick={() => setVideoAspectRatio('16:9')}>16:9</button>
                                <button className={`btn btn-secondary ${videoAspectRatio === '9:16' ? 'active' : ''}`} onClick={() => setVideoAspectRatio('9:16')}>9:16</button>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Felbontás:</label>
                            <div className="option-buttons">
                                <button className={`btn btn-secondary ${videoResolution === '720p' ? 'active' : ''}`} onClick={() => setVideoResolution('720p')}>720p</button>
                                <button className={`btn btn-secondary ${videoResolution === '1080p' ? 'active' : ''}`} onClick={() => setVideoResolution('1080p')}>1080p</button>
                            </div>
                        </div>
                        <button className="btn btn-primary" onClick={handleGenerateVideo} disabled={isGenerating || !hasVeoApiKey}>
                            <Icon name={isGenerating ? 'progress_activity' : 'movie_creation'} />
                            {isGenerating ? loadingMessage : 'Videó Generálása'}
                        </button>
                        {generatedVideoUrl && (
                            <div className="generated-content-output">
                                <h4>Generált Videó:</h4>
                                <video src={generatedVideoUrl} controls className="generated-media"></video>
                                <a href={generatedVideoUrl} download="generated-video.mp4" className="btn btn-secondary download-link">Letöltés</a>
                            </div>
                        )}
                    </>
                );
            case 'edit_image':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="imageUpload">Kép feltöltése:</label>
                            <input type="file" id="imageUpload" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                            {imageFile && <p>Feltöltött fájl: {imageFile.name}</p>}
                        </div>
                        <div className="form-group">
                            <label htmlFor="editImagePrompt">Szerkesztési leírás:</label>
                            <textarea id="editImagePrompt" className="creative-prompt-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le a szerkesztést (pl. 'Adj hozzá egy kalapot')..." rows={3}></textarea>
                        </div>
                        <button className="btn btn-primary" onClick={handleEditImage} disabled={isGenerating || !imageFile}>
                            <Icon name={isGenerating ? 'progress_activity' : 'edit'} />
                            {isGenerating ? loadingMessage : 'Kép Szerkesztése'}
                        </button>
                        {editedImageUrl && (
                            <div className="generated-content-output">
                                <h4>Szerkesztett Kép:</h4>
                                <img src={editedImageUrl} alt="Edited" className="generated-media" />
                            </div>
                        )}
                    </>
                );
            case 'edit_video':
                return (
                    <>
                        {!hasVeoApiKey && (
                            <div className="api-key-warning">
                                <p>A videószerkesztés prémium szolgáltatás, ami saját API kulcsot igényel. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">További információ a számlázásról.</a></p>
                                <button className="btn btn-warning" onClick={handleSelectVeoApiKey}>
                                    <Icon name="key" /> API Kulcs Kiválasztása
                                </button>
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="videoUpload">Videó feltöltése:</label>
                            <input type="file" id="videoUpload" accept="video/mp4,video/quicktime" onChange={e => setVideoFile(e.target.files?.[0] || null)} />
                            {videoFile && <p>Feltöltött fájl: {videoFile.name}</p>}
                        </div>
                        <div className="form-group">
                            <label htmlFor="editVideoPrompt">Extendálási leírás:</label>
                            <textarea id="editVideoPrompt" className="creative-prompt-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le, mit szeretne hozzáadni a videó végéhez (pl. 'adj hozzá 7 másodpercet egy kutyáról, ami fut')..." rows={3}></textarea>
                        </div>
                        <button className="btn btn-primary" onClick={handleEditVideo} disabled={isGenerating || !videoFile || !hasVeoApiKey}>
                            <Icon name={isGenerating ? 'progress_activity' : 'movie_filter'} />
                            {isGenerating ? loadingMessage : 'Videó Extendálása'}
                        </button>
                        {editedVideoUrl && (
                            <div className="generated-content-output">
                                <h4>Extendált Videó:</h4>
                                <video src={editedVideoUrl} controls className="generated-media"></video>
                                <a href={editedVideoUrl} download="edited-video.mp4" className="btn btn-secondary download-link">Letöltés</a>
                            </div>
                        )}
                    </>
                );
            default: return null;
        }
    };

    return (
        <div className="view-fade-in creative-tools-view">
            <Card fullHeight header={<h2>Kreatív Eszközök</h2>}>
                <div className="creative-tools-nav">
                    <button className={`btn btn-segment ${activeTool === 'generate_image' ? 'active' : ''}`} onClick={() => { setActiveTool('generate_image'); setPrompt(''); setGeneratedImageUrl(null); setEditedImageUrl(null); setImageFile(null); setGeneratedVideoUrl(null); setEditedVideoUrl(null); setVideoFile(null); setIsGenerating(false); setLoadingMessage(''); }}>
                        <Icon name="image" /> Kép Generálása
                    </button>
                    <button className={`btn btn-segment ${activeTool === 'generate_video' ? 'active' : ''}`} onClick={() => { setActiveTool('generate_video'); setPrompt(''); setGeneratedImageUrl(null); setEditedImageUrl(null); setImageFile(null); setGeneratedVideoUrl(null); setEditedVideoUrl(null); setVideoFile(null); setIsGenerating(false); setLoadingMessage(''); }}>
                        <Icon name="movie" /> Videó Generálása
                    </button>
                     <button className={`btn btn-segment ${activeTool === 'edit_image' ? 'active' : ''}`} onClick={() => { setActiveTool('edit_image'); setPrompt(''); setGeneratedImageUrl(null); setEditedImageUrl(null); setImageFile(null); setGeneratedVideoUrl(null); setEditedVideoUrl(null); setVideoFile(null); setIsGenerating(false); setLoadingMessage(''); }}>
                        <Icon name="edit" /> Kép Szerkesztése
                    </button>
                    <button className={`btn btn-segment ${activeTool === 'edit_video' ? 'active' : ''}`} onClick={() => { setActiveTool('edit_video'); setPrompt(''); setGeneratedImageUrl(null); setEditedImageUrl(null); setImageFile(null); setGeneratedVideoUrl(null); setEditedVideoUrl(null); setVideoFile(null); setIsGenerating(false); setLoadingMessage(''); }}>
                        <Icon name="movie_filter" /> Videó Szerkesztése
                    </button>
                </div>
                <div className="creative-tools-content">
                    {isGenerating && <div className="loading-overlay"><div className="spinner"></div><p>{loadingMessage}</p></div>}
                    {renderContent()}
                </div>
            </Card>
        </div>
    );
};


const MindMapNodeComponent: React.FC<{ node: MindMapNode; onUpdatePosition: (id: string, rect: any) => void; }> = ({ node, onUpdatePosition }) => {
    const [isExpanded, setExpanded] = useState(true);
    const nodeRef = useRef(null);

    useEffect(() => {
        const observer = new ResizeObserver(() => {
            if (nodeRef.current) {
                const rect = nodeRef.current.getBoundingClientRect();
                onUpdatePosition(node.id, {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                });
            }
        });

        if (nodeRef.current) {
            observer.observe(nodeRef.current);
        }

        return () => observer.disconnect();
    }, [node.id, onUpdatePosition]);

    const hasChildren = node.children && node.children.length > 0;

    return (
        <li className="mind-map-node">
            <div ref={nodeRef} className={`mind-map-node-content color-${node.color || 'secondary'}`} onClick={() => hasChildren && setExpanded(!isExpanded)}>
                {node.label}
                {node.direction && <Icon name={node.direction === 'in' ? 'arrow_back' : 'arrow_forward'} />}
            </div>
            {hasChildren && isExpanded && (
                <ul className="mind-map-children">
                    {node.children.map(child => (
                        <MindMapNodeComponent key={child.id} node={child} onUpdatePosition={onUpdatePosition} />
                    ))}
                </ul>
            )}
        </li>
    );
};

const ConnectorLine: React.FC<{ from: any; to: any; containerRect: any; }> = ({ from, to, containerRect }) => {
    if (!from || !to) return null;
    
    const startX = (from.direction === 'out' ? from.x + from.width : from.x) - containerRect.x;
    const startY = from.y + from.height / 2 - containerRect.y;
    const endX = (to.direction === 'in' || !to.direction ? to.x : to.x + to.width) - containerRect.x;
    const endY = to.y + to.height / 2 - containerRect.y;

    const controlX1 = startX + (endX - startX) * 0.5;
    const controlY1 = startY;
    const controlX2 = startX + (endX - startX) * 0.5;
    const controlY2 = endY;

    const pathData = `M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`;

    return <path d={pathData} className="mind-map-connector" />;
};


const MindMapView = ({ data }: { data: MindMapNode }) => {
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [nodePositions, setNodePositions] = useState<Record<string, any>>({});
    
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const handleUpdatePosition = useCallback((id: string, rect: any) => {
        setNodePositions(prev => ({
            ...prev,
            [id]: { ...rect, id }
        }));
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsPanning(true);
        setStartPoint({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({
            x: e.clientX - startPoint.x,
            y: e.clientY - startPoint.y,
        });
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    const handleMouseLeave = () => { // Added for better UX
        setIsPanning(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const newScale = Math.min(Math.max(0.2, scale - e.deltaY * 0.001), 2);
        setScale(newScale);
    };
    
    const zoom = (factor: number) => {
        setScale(prev => Math.min(Math.max(0.2, prev * factor), 2));
    }
    
    const [connections, setConnections] = useState<Array<{from: string, to: string}>>([]);
    const containerRect = containerRef.current?.getBoundingClientRect();

    useEffect(() => {
        const newConnections: Array<{from: string, to: string}> = [];
        const findConnections = (node: MindMapNode) => {
            if (node.children) {
                node.children.forEach(child => {
                    newConnections.push({ from: node.id, to: child.id });
                    findConnections(child);
                });
            }
        };
        findConnections(data);
        setConnections(newConnections);
    }, [data, nodePositions]);


    return (
        <div className="view-fade-in" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
            <Card fullHeight>
                <div 
                    className="mind-map-view" 
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave} // Use the new handler
                    onWheel={handleWheel}
                >
                    <div 
                        className="mind-map-content" 
                        ref={contentRef}
                        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
                    >
                         <ul className="mind-map-tree">
                            <MindMapNodeComponent node={data} onUpdatePosition={handleUpdatePosition} />
                        </ul>
                    </div>
                     <svg className="mind-map-svg-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
                        {containerRect && connections.map(conn => (
                             <ConnectorLine 
                                key={`${conn.from}-${conn.to}`}
                                from={nodePositions[conn.from]}
                                to={nodePositions[conn.to]}
                                // Provide a valid Rect-like object for containerRect
                                containerRect={{x: containerRef.current!.getBoundingClientRect().x, y: containerRef.current!.getBoundingClientRect().y, width: 0, height: 0}}
                             />
                        ))}
                    </svg>

                     <div className="mind-map-controls">
                        <button className="btn btn-icon" onClick={() => zoom(1.2)}><Icon name="add"/></button>
                        <button className="btn btn-icon" onClick={() => zoom(0.8)}><Icon name="remove"/></button>
                        <button className="btn btn-icon" onClick={() => { setPan({x:0, y:0}); setScale(1); }}><Icon name="center_focus_strong"/></button>
                    </div>
                </div>
            </Card>
        </div>
    );
};


const App = () => {
    const [currentView, setCurrentView] = useState('dashboard');
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const data = useMockData();

    const addNotification = (notification: Omit<Notification, 'id'>) => {
        const id = generateId();
        setNotifications(prev => [...prev, { id, ...notification }]);
    };
    
    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const renderView = () => {
        switch (currentView) {
            case 'dashboard': return <DashboardView tasks={data.tasks} emails={data.emails} addNotification={addNotification} />;
            case 'planner': return <PlannerView events={data.plannerEvents} />;
            case 'tasks': return <TasksView tasks={data.tasks} updateTaskStatus={data.updateTaskStatus} />;
            case 'email': return <EmailView emails={data.emails} addTask={data.addTask} addNotification={addNotification} />;
            case 'project_overview': return <ProjectOverviewView projects={data.projects} tasks={data.tasks} />;
            case 'projects_kanban': return <ProjectsKanbanView projects={data.projects} tasks={data.tasks} updateProjectStatus={data.updateProjectStatus} />;
            case 'proposals': return <ProposalsView proposals={data.proposals} />;
            case 'trainings': return <TrainingsView trainings={data.trainings} />;
            case 'contacts': return <ContactsView contacts={data.contacts} />;
            case 'finances': return <FinancesView transactions={data.transactions} budgets={data.budgets} />;
            case 'docs': return <DocsView docs={data.docs} addDoc={data.addDoc} />;
            case 'gemini_chat': return <GeminiChatView />;
            case 'mind_map': return <MindMapView data={data.mindMap} />;
            case 'creative_tools': return <CreativeToolsView addDoc={data.addDoc} addNotification={addNotification} />;
            case 'meeting_assistant': return <MeetingAssistantView />;
            default: return <DashboardView tasks={data.tasks} emails={data.emails} addNotification={addNotification} />;
        }
    };

    return (
        <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            <Sidebar 
                currentView={currentView} 
                setView={setCurrentView} 
                isCollapsed={isSidebarCollapsed} 
                setCollapsed={setSidebarCollapsed}
                isMobile={isMobile}
                isMobileMenuOpen={isMobileMenuOpen}
                setMobileMenuOpen={setMobileMenuOpen}
            />
            <div className="main-content">
                <GlobalHeader currentView={currentView} onMenuClick={() => setMobileMenuOpen(true)} />
                <main className="view-content">
                    {renderView()}
                </main>
            </div>
            <div className="notification-container">
                {notifications.map(n => (
                    <NotificationComponent key={n.id} notification={n} onDismiss={dismissNotification} />
                ))}
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);