
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
    { id: 'doc-1', type: 'note', title: 'Q3 Marketing Jegyzetek', content: 'A kampány fő üzenete a megbízhatóság és az innováció. Célcsoport: 25-45 év közötti technológiai szakemberek...', createdAt: new Date('2024-07-30T10:00:00Z').toISOString() },
    { id: 'doc-2', type: 'link', title: 'React Design Patterns', content: 'https://reactpatterns.com/', createdAt: new Date('2024-07-29T11:00:00Z').toISOString() },
    { id: 'doc-3', type: 'note', title: 'P-Day-Light V7 ötletek', content: '1. Gamification elemek bevezetése.\n2. Témák közötti váltás (világos/sötét).\n3. Részletesebb riportok a pénzügyek modulba.', createdAt: new Date('2024-07-28T14:00:00Z').toISOString() },
];

const mockInitialEmails: EmailMessage[] = [
    { id: 'email-1', sender: 'support@figma.com', recipient: 'felhasznalo@domain.com', subject: 'Figma Project Update: New Comments on "P-Day Light UI"', body: 'Hello,\n\nThere are new comments on your project that need your attention. Please review them and provide feedback to the team by Friday.\n\nThanks,\nThe Figma Team', timestamp: '2024-07-30T10:00:00Z', read: false, important: true, category: 'inbox' },
    { id: 'email-2', sender: 'NAV Értesítő', recipient: 'felhasznalo@domain.com', subject: 'Fontos: Változás a TAO bevallásban', body: 'Tisztelt Ügyfelünk! Tájékoztatjuk, hogy a társasági adó bevallásával kapcsolatos szabályozás megváltozott. Kérjük, olvassa el a frissített tájékoztatót a weboldalunkon. A bevallás határideje augusztus 10. Üdvözlettel, NAV', timestamp: '2024-07-29T14:30:00Z', read: true, important: true, category: 'inbox' },
    { id: 'email-3', sender: 'hello@example.com', recipient: 'felhasznalo@domain.com', subject: 'Re: Meeting Follow-up', body: 'Just wanted to follow up on our meeting yesterday. The action items are in the shared document.', timestamp: '2024-07-30T11:00:00Z', read: false, important: false, category: 'inbox' },
    { id: 'email-4', sender: 'felhasznalo@domain.com', recipient: 'team@example.com', subject: 'Weekly Report', body: 'Hi Team,\n\nPlease find attached the weekly report.\n\nBest,', timestamp: '2024-07-28T16:00:00Z', read: true, important: false, category: 'sent' },
    { id: 'email-5', sender: 'denes@example.com', recipient: 'felhasznalo@domain.com', subject: 'Q3 Kampány', body: 'Szia, átküldtem a kampánytervet. Várjuk a visszajelzésed. Üdv, Dénes', timestamp: '2024-07-29T09:00:00Z', read: false, important: false, category: 'inbox'},
];

const mockProjects: Project[] = [
    { id: 'proj-1', title: 'P-Day Light V6 Fejlesztés', description: 'A P-Day Light alkalmazás következő verziójának fejlesztése, fókuszban az új modulok és a felhasználói élmény javítása.', status: 'Fejlesztés', team: ['Anna', 'Béla', 'Cecília'], dueDate: '2024-09-30' },
    { id: 'proj-2', title: 'Q3 Marketing Kampány', description: 'A harmadik negyedéves marketing kampány tervezése és kivitelezése.', status: 'Tervezés', team: ['Dénes', 'Eszter'], dueDate: '2024-09-15' },
    { id: 'proj-3', title: 'Belső IT Infrastruktúra Audit', description: 'A vállalati belső IT rendszerek és biztonsági protokollok teljes körű felülvizsgálata.', status: 'Tesztelés', team: ['Ferenc', 'Gábor'], dueDate: '2024-08-31' },
    { id: 'proj-4', title: 'Ügyfél Portál Frissítés', description: 'Az ügyfélportál frissítése, új funkciók hozzáadása és reszponzív design implementálása.', status: 'Kész', team: ['Anna', 'Dénes'], dueDate: '2024-07-20' }
];

const mockProposals: Proposal[] = [
    { id: 'prop-1', title: 'Innovációs Technológiai Fejlesztés 2024', funder: 'Nemzeti Kutatási, Fejlesztési és Innovációs Hivatal', status: 'Készül', submissionDeadline: '2024-09-15', amount: 15000000, summary: 'A P-Day Light V7 AI-képességeinek továbbfejlesztése, különös tekintettel a prediktív analitikára és a természetes nyelvfeldogozásra.', relatedProjectId: 'proj-1', linkedContactIds: ['contact-3', 'contact-4'], linkedDocIds: ['doc-3'] },
    { id: 'prop-2', title: 'Digitális Megjelenés Támogatása KKV-knak', funder: 'Magyar Kereskedelmi és Iparkamara', status: 'Beadva', submissionDeadline: '2024-07-20', amount: 5000000, summary: 'Új marketing kampány és weboldal fejlesztés a célpiac elérésére.', relatedProjectId: 'proj-2', linkedContactIds: ['contact-2'] },
    { id: 'prop-3', title: 'Zöld Vállalat Fejlesztési Program', funder: 'Európai Unió Regionális Fejlesztési Alap', status: 'Elfogadva', submissionDeadline: '2024-06-01', amount: 25000000, summary: 'A vállalati működés karbonsemlegessé tétele, IT infrastruktúra modernizálásával.' },
];

const mockTrainings: TrainingItem[] = [
    { id: 'train-1', title: 'Haladó TypeScript', provider: 'Udemy', status: 'Folyamatban', progress: 45, url: '#', description: 'Deep dive into advanced TypeScript features like decorators, generics, and conditional types.' },
    { id: 'train-2', title: 'React Performance', provider: 'Frontend Masters', status: 'Nem elkezdett', progress: 0, url: '#', description: 'Learn to optimize React applications for speed and efficiency.'},
    { id: 'train-3', title: 'AI-alapú Alkalmazásfejlesztés', provider: 'Coursera', status: 'Befejezett', progress: 100, url: '#', description: 'Building applications with modern AI APIs.' },
    { id: 'train-4', title: 'UI/UX Design Alapok', provider: 'Figma Academy', status: 'Folyamatban', progress: 75, url: '#', description: 'Az alapvető felhasználói felület és élmény tervezési elvek.' },
];

const mockTasks: TaskItem[] = [
    { id: 'task-1', title: 'Felülvizsgálni a Q3 marketing költségvetést', status: 'Folyamatban', priority: 'Magas', dueDate: '2024-08-15', category: 'Munka', createdAt: '2024-07-28T09:00:00Z', subTasks: [{id: 'sub-1', title: 'Beszélni a pénzüggyel', completed: true}, {id: 'sub-2', title: 'Adatok összegyűjtése', completed: false}], projectId: 'proj-2' },
    { id: 'task-2', title: 'Heti riport elkészítése', status: 'Teendő', priority: 'Közepes', dueDate: '2024-08-02', category: 'Munka', createdAt: '2024-07-29T11:00:00Z' },
    { id: 'task-3', title: 'Bevásárlás', status: 'Teendő', priority: 'Alacsony', category: 'Személyes', createdAt: '2024-07-30T15:00:00Z', dueDate: '2024-08-01' },
    { id: 'task-4', title: 'P-Day Light UI fejlesztés folytatása', status: 'Kész', priority: 'Magas', category: 'Projekt', createdAt: '2024-07-25T10:00:00Z', completedAt: '2024-07-30T17:00:00Z', projectId: 'proj-1' },
    { id: 'task-5', title: 'NAV TAO bevallás elkészítése', status: 'Teendő', priority: 'Kritikus', dueDate: '2024-08-10', category: 'Pályázat', createdAt: '2024-07-29T15:00:00Z', relatedTo: 'email-2'},
    { id: 'task-6', title: 'Komponens könyvtár létrehozása', status: 'Folyamatban', priority: 'Magas', dueDate: '2024-08-20', category: 'Projekt', createdAt: '2024-08-01T10:00:00Z', projectId: 'proj-1' },
    { id: 'task-7', title: 'API végpontok dokumentálása', status: 'Teendő', priority: 'Közepes', dueDate: '2024-08-25', category: 'Projekt', createdAt: '2024-08-02T14:00:00Z', projectId: 'proj-1' },
    { id: 'task-8', title: 'Kampány vizuális elemeinek megtervezése', status: 'Teendő', priority: 'Magas', dueDate: '2024-08-18', category: 'Munka', createdAt: '2024-08-03T11:00:00Z', projectId: 'proj-2' },
    { id: 'task-9', title: 'NKFIH pályázati dokumentáció összeállítása', status: 'Folyamatban', priority: 'Magas', dueDate: '2024-09-10', category: 'Pályázat', createdAt: '2024-08-05T10:00:00Z', proposalId: 'prop-1' },
    { id: 'task-10', title: 'Pénzügyi terv elkészítése az innovációs pályázathoz', status: 'Teendő', priority: 'Kritikus', dueDate: '2024-08-30', category: 'Pályázat', createdAt: '2024-08-06T11:00:00Z', proposalId: 'prop-1' },
    { id: 'task-11', title: 'Generikusok megértése', status: 'Folyamatban', priority: 'Közepes', dueDate: '2024-08-15', category: 'Tanulás', createdAt: '2024-08-06T11:00:00Z', trainingId: 'train-1' },
];

const generateInitialPlannerEvents = (tasks: TaskItem[], proposals: Proposal[]): PlannerEvent[] => {
    const eventsFromTasks = tasks
        .filter(task => task.dueDate)
        .map(task => ({
            id: `event-from-${task.id}`,
            title: task.title,
            date: task.dueDate!,
            type: ((): PlannerEventType => {
                switch (task.category) {
                    case 'Munka': case 'Projekt': return 'work';
                    case 'Pályázat': return 'declaration_deadline';
                    case 'Személyes': return 'personal';
                    default: return 'deadline';
                }
            })(),
            source: task.id,
        }));

    const eventsFromProposals = proposals.map(proposal => ({
        id: `event-from-${proposal.id}`,
        title: `Pályázat: ${proposal.title}`,
        date: proposal.submissionDeadline,
        type: 'proposal_deadline' as PlannerEventType,
        source: proposal.id
    }));

    const staticEvents: PlannerEvent[] = [
        { id: 'event-1', title: 'Heti szinkron', date: '2024-08-05', time: '10:00', type: 'meeting', location: 'Google Meet' },
        { id: 'event-2', title: 'Fogorvos', date: '2024-08-12', time: '14:30', type: 'personal' },
        { id: 'event-3', title: 'P-Day Light V6 Tervezés', date: '2024-08-20', time: '09:00', type: 'work', description: 'Új funkciók specifikálása' },
    ];
    
    return [...eventsFromTasks, ...eventsFromProposals, ...staticEvents];
};

const mockTransactions: Transaction[] = [
    { id: 'tran-1', title: 'Havi fizetés', amount: 550000, type: 'income', category: 'Fizetés', date: '2024-08-01' },
    { id: 'tran-2', title: 'Nagybevásárlás - Aldi', amount: 25000, type: 'expense', category: 'Élelmiszer', date: '2024-08-02' },
    { id: 'tran-3', title: 'Villanyszámla', amount: 12000, type: 'expense', category: 'Rezsi', date: '2024-08-05' },
    { id: 'tran-4', title: 'Konzol játék', amount: 18000, type: 'expense', category: 'Szórakozás', date: '2024-08-06' },
    { id: 'tran-5', title: 'Ebéd a kollégákkal', amount: 4500, type: 'expense', category: 'Élelmiszer', date: '2024-08-07' },
    { id: 'tran-6', title: 'Szabadúszó projekt', amount: 75000, type: 'income', category: 'Egyéb bevétel', date: '2024-08-10' },
    { id: 'tran-7', title: 'Budapest-Bécs vonatjegy', amount: 15000, type: 'expense', category: 'Utazás', date: '2024-08-12' },
    { id: 'tran-8', title: 'Internet & TV', amount: 8000, type: 'expense', category: 'Rezsi', date: '2024-08-14' },
];

const mockBudgets: Budget[] = [
    { id: 'budget-1', category: 'Élelmiszer', amount: 80000, period: 'havi' },
    { id: 'budget-2', category: 'Rezsi', amount: 40000, period: 'havi' },
    { id: 'budget-3', category: 'Szórakozás', amount: 50000, period: 'havi' },
];

const navigationData: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { 
        id: 'workspace', 
        label: 'Munkaterület', 
        icon: 'workspaces', 
        subItems: [
            { id: 'planner', label: 'Naptár', icon: 'calendar_month' },
            { id: 'tasks', label: 'Feladatok', icon: 'task_alt' },
            { id: 'projects', label: 'Projektek', icon: 'schema' },
            { id: 'proposals', label: 'Pályázatok', icon: 'description' },
        ]
    },
    {
        id: 'knowledge',
        label: 'Tudás & Kapcsolatok',
        icon: 'hub',
        subItems: [
            { id: 'email', label: 'Email', icon: 'mail' },
            { id: 'contacts', label: 'Kapcsolatok', icon: 'contacts' },
            { id: 'docs', label: 'Dokumentumok', icon: 'folder' },
        ]
    },
    {
        id: 'growth',
        label: 'Fejlődés & Elemzés',
        icon: 'monitoring',
        subItems: [
            { id: 'training', label: 'Képzések', icon: 'school' },
            { id: 'finances', label: 'Pénzügyek', icon: 'account_balance_wallet' },
            { id: 'reports', label: 'Riportok', icon: 'bar_chart' },
        ]
    },
    { 
        id: 'ai', 
        label: 'Gemini Asszisztens', 
        icon: 'smart_toy', 
        subItems: [
            { id: 'ai-chat', label: 'Általános Chat', icon: 'chat' },
            { id: 'ai-meeting', label: 'Meeting Asszisztens', icon: 'mic' },
            { id: 'ai-creative', label: 'Kreatív Eszközök', icon: 'brush' },
        ] 
    },
    { id: 'settings', label: 'Beállítások', icon: 'settings' },
];


// --- UTILITY HOOK ---
const useWindowSize = () => {
    const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
    useEffect(() => {
        const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return size;
};

// --- UTILITY FUNCTIONS ---
const getPriorityClass = (priority: TaskPriority) => ({ 'Alacsony': 'priority-low', 'Közepes': 'priority-medium', 'Magas': 'priority-high', 'Kritikus': 'priority-critical' })[priority] || '';
const getEventTypeClass = (type: PlannerEventType) => ({ 'personal': 'event-personal', 'work': 'event-work', 'meeting': 'event-meeting', 'deadline': 'event-deadline', 'declaration_deadline': 'event-deadline', 'proposal_deadline': 'event-deadline' })[type] || 'event-default';
const getProposalStatusClass = (status: ProposalStatus) => ({ 'Készül': 'status-draft', 'Beadva': 'status-submitted', 'Értékelés alatt': 'status-review', 'Elfogadva': 'status-accepted', 'Elutasítva': 'status-rejected', })[status] || '';
const getTrainingStatusClass = (status: TrainingStatus) => ({ 'Nem elkezdett': 'status-not-started', 'Folyamatban': 'status-in-progress', 'Befejezett': 'status-completed' })[status] || '';
const formatDate = (dateString?: string) => dateString ? new Date(dateString).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Nincs határidő';
const financialCategoryColors: Record<FinancialCategory, string> = { 'Fizetés': '#2ecc71', 'Egyéb bevétel': '#27ae60', 'Élelmiszer': '#e74c3c', 'Rezsi': '#f39c12', 'Utazás': '#3498db', 'Szórakozás': '#9b59b6', 'Egyéb kiadás': '#7f8c8d' };
const getCategoryColor = (category: FinancialCategory) => financialCategoryColors[category] || '#bdc3c7';
const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
});


// --- GLOBAL COMPONENTS ---
const SkeletonLoader = ({ lines = 3, className = '' }) => (
    <div className={`skeleton-loader ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="skeleton-line" style={{ width: `${80 + Math.random() * 15}%` }}></div>
        ))}
    </div>
);

const NotificationToast = ({ message, type, onDismiss }) => (
    <div className={`notification-toast ${type}`} onClick={onDismiss}>
        <span className="material-symbols-outlined">{type === 'success' ? 'check_circle' : 'error'}</span>
        <p>{message}</p>
    </div>
);

const NotificationContainer = ({ notifications, onDismiss }) => (
    <div className="notification-container">
        {notifications.map(n => <NotificationToast key={n.id} {...n} onDismiss={() => onDismiss(n.id)} />)}
    </div>
);

// --- DASHBOARD WIDGETS ---
const QuickActions = ({ onOpenTaskModal, onOpenEventModal, onOpenEmailComposeModal, onOpenNewDoc }) => (
    <div className="quick-actions">
        <button className="quick-action-card" onClick={() => onOpenTaskModal()}>
            <span className="material-symbols-outlined">add_task</span>
            <span>Új feladat</span>
        </button>
        <button className="quick-action-card" onClick={() => onOpenEventModal()}>
            <span className="material-symbols-outlined">edit_calendar</span>
            <span>Új esemény</span>
        </button>
        <button className="quick-action-card" onClick={onOpenNewDoc}>
            <span className="material-symbols-outlined">post_add</span>
            <span>Új dokumentum</span>
        </button>
        <button className="quick-action-card" onClick={() => onOpenEmailComposeModal()}>
            <span className="material-symbols-outlined">edit</span>
            <span>Email írása</span>
        </button>
    </div>
);

const DailyBriefingWidget = ({ tasks, events, emails, proposals, ai }: { tasks: TaskItem[], events: PlannerEvent[], emails: EmailMessage[], proposals: Proposal[], ai: GoogleGenAI }) => {
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const generateBriefing = useCallback(async () => {
        setIsLoading(true); setError(null); setSummary('');
        const upcomingTasks = tasks.filter(t => t.status !== 'Kész' && t.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 5).map(t => `- **${t.title}** (Prioritás: ${t.priority}, Határidő: ${formatDate(t.dueDate)})`).join('\n');
        const todaysEvents = events.filter(e => e.date === new Date().toISOString().split('T')[0]).map(e => `- **${e.title}** ${e.time ? `(${e.time})` : ''}`).join('\n');
        const upcomingProposals = proposals.filter(p => p.status === 'Készül').sort((a,b) => new Date(a.submissionDeadline).getTime() - new Date(b.submissionDeadline).getTime()).slice(0, 3).map(p => `- **${p.title}** pályázat beadási határideje: ${formatDate(p.submissionDeadline)}`).join('\n');
        const importantEmails = emails.filter(e => e.important || !e.read).slice(0, 3).map(e => `- Email **${e.sender}** feladótól, tárgya: "${e.subject}"`).join('\n');
        const prompt = `Te egy személyi asszisztens vagy a P-Day Light alkalmazásban. A feladatod, hogy egy rövid, barátságos és motiváló napi összefoglalót készíts a felhasználó számára a megadott adatok alapján. Emeld ki a legfontosabbakat. A válaszod legyen tömör, markdown formátumú, például egy rövid bevezető mondat után egy 3-4 pontos lista. A válaszodat magyarul add meg.\n\nMai dátum: ${new Date().toLocaleDateString('hu-HU')}\n\n**Közelgő feladatok:**\n${upcomingTasks || "Nincsenek kiemelt feladataid."}\n\n**Közelgő pályázati határidők:**\n${upcomingProposals || "Nincsenek közelgő pályázati határidők."}\n\n**Mai események:**\n${todaysEvents || "Nincsenek mai eseményeid."}\n\n**Fontos Emailek:**\n${importantEmails || "Nincsenek olvasatlan/fontos emailjeid."}\n\nKezdd egy barátságos üdvözléssel, pl. "Szia! Lássuk, mi vár rád ma:"`;
        try { const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt }); const summaryText = response.text; setSummary(summaryText); } catch (err) { console.error("Briefing generation error:", err); setError("Hiba történt az összefoglaló generálása közben."); } finally { setIsLoading(false); }
    }, [tasks, events, emails, proposals, ai]);
    useEffect(() => { generateBriefing(); }, [generateBriefing]);
    return ( <div className="card dashboard-widget daily-briefing-widget"> <div className="daily-briefing-header"> <h3><span className="material-symbols-outlined">tips_and_updates</span>Napi Összefoglaló</h3> <button onClick={generateBriefing} disabled={isLoading} className="button button-icon-only" aria-label="Összefoglaló frissítése"> <span className={`material-symbols-outlined ${isLoading ? 'progress_activity' : ''}`}>{isLoading ? 'progress_activity' : 'refresh'}</span> </button> </div> <div className="widget-content"> {isLoading && <SkeletonLoader lines={4} />} {error && <div className="error-message">{error}</div>} {!isLoading && !error && summary && <div className="briefing-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown></div>} </div> </div> );
};

const UpcomingTasksWidget = ({ tasks }: { tasks: TaskItem[] }) => {
    const upcoming = tasks.filter(t => t.status !== 'Kész').sort((a, b) => {
        const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (timeA === timeB) return 0;
        return timeA < timeB ? -1 : 1;
    }).slice(0, 4);
    return ( <div className="card dashboard-widget upcoming-tasks-widget"> <h3><span className="material-symbols-outlined">list_alt</span>Közelgő Feladatok</h3> <div className="widget-content"> {upcoming.length > 0 ? ( <ul className="widget-list"> {upcoming.map(task => ( <li key={task.id} className="widget-list-item"> <div className="task-item-info"> <span className="task-item-title">{task.title}</span> <span className="task-item-due-date">{formatDate(task.dueDate)}</span> </div> <span className={`priority-pill ${getPriorityClass(task.priority)}`}>{task.priority}</span> </li> ))} </ul> ) : ( <div className="empty-state-placeholder" style={{minHeight: '100px', padding: 0, border: 'none', background: 'transparent'}}> <span className="material-symbols-outlined">task_alt</span> <p>Nincsenek közelgő feladataid. Szép munka!</p> </div> )} </div> </div> );
};

const ImportantEmailsWidget = ({ emails }: { emails: EmailMessage[] }) => {
    const importantEmails = emails.filter(e => !e.read || e.important).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 4);
    return ( <div className="card dashboard-widget important-emails-widget"> <h3><span className="material-symbols-outlined">mark_email_unread</span>Fontos Emailek</h3> <div className="widget-content"> {importantEmails.length > 0 ? ( <ul className="widget-list"> {importantEmails.map(email => ( <li key={email.id} className="widget-list-item"> <div className="email-item-info"> <span className="sender">{email.sender}</span> <span className="subject" title={email.subject}>{email.subject}</span> </div> {!email.read && <div className="unread-dot"></div>} </li> ))} </ul> ) : ( <div className="empty-state-placeholder" style={{minHeight: '100px', padding: 0, border: 'none', background: 'transparent'}}> <span className="material-symbols-outlined">drafts</span> <p>A postaládád naprakész.</p> </div> )} </div> </div> );
};

const ProjectsOverviewWidget = ({ projects, tasks }: { projects: Project[], tasks: TaskItem[] }) => {
    const getProjectProgress = (projectId: string) => {
        const relatedTasks = tasks.filter(t => t.projectId === projectId);
        if (relatedTasks.length === 0) return 0;
        const completedTasks = relatedTasks.filter(t => t.status === 'Kész').length;
        return (completedTasks / relatedTasks.length) * 100;
    };

    const ongoingProjects = projects.filter(p => p.status !== 'Kész').slice(0, 4);

    return (
        <div className="card dashboard-widget projects-overview-widget">
            <h3><span className="material-symbols-outlined">schema</span>Projektek Áttekintése</h3>
            <div className="widget-content">
                {ongoingProjects.length > 0 ? (
                    <ul className="widget-list projects-overview-list">
                        {ongoingProjects.map(project => {
                            const progress = getProjectProgress(project.id);
                            return (
                                <li key={project.id} className="widget-list-item">
                                    <div className="project-overview-info">
                                        <span className="project-title">{project.title}</span>
                                        <div className="project-card-footer" style={{padding: 0, marginTop: 'var(--spacing-xs)'}}>
                                            <span>Haladás</span>
                                            <span>{Math.round(progress)}%</span>
                                        </div>
                                        <div className="progress-bar-container">
                                            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                     <div className="empty-state-placeholder" style={{minHeight: '100px', padding: 0, border: 'none', background: 'transparent'}}>
                         <span className="material-symbols-outlined">celebration</span>
                         <p>Minden projekt befejeződött!</p>
                     </div>
                )}
            </div>
        </div>
    );
};


// --- VIEW COMPONENTS ---
const View = ({ title, subtitle, children, actions }: { title: any; subtitle: any; children?: React.ReactNode; actions?: React.ReactNode }) => (
    <div className="view-container">
        <div className="view-header">
            <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
            </div>
            {actions && <div className="view-actions">{actions}</div>}
        </div>
        <div className="view-content">{children}</div>
    </div>
);

const DashboardView = ({ tasks, projects, events, emails, proposals, ai, onOpenTaskModal, onOpenEventModal, onOpenEmailComposeModal, onOpenNewDoc }: { tasks: TaskItem[], projects: Project[], events: PlannerEvent[], emails: EmailMessage[], proposals: Proposal[], ai: GoogleGenAI, onOpenTaskModal: () => void, onOpenEventModal: () => void, onOpenEmailComposeModal: () => void, onOpenNewDoc: () => void }) => (
    <View title="Dashboard" subtitle="Üdvözöljük a P-Day Light alkalmazásban!">
        <div className="dashboard-layout">
            <QuickActions onOpenTaskModal={onOpenTaskModal} onOpenEventModal={onOpenEventModal} onOpenEmailComposeModal={onOpenEmailComposeModal} onOpenNewDoc={onOpenNewDoc}/>
            <div className="dashboard-grid">
                <DailyBriefingWidget tasks={tasks} events={events} emails={emails} proposals={proposals} ai={ai} />
                <UpcomingTasksWidget tasks={tasks} />
                <ImportantEmailsWidget emails={emails} />
                <ProjectsOverviewWidget projects={projects} tasks={tasks} />
            </div>
        </div>
    </View>
);
// --- PLANNER / CALENDAR VIEW ---
const PlannerView = ({ events, onOpenEventModal, onOpenDayModal }: { events: PlannerEvent[], onOpenEventModal: (date?: string) => void, onOpenDayModal: (date: string, events: PlannerEvent[]) => void }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const handlePrevMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    const handleGoToToday = () => setCurrentDate(new Date());

    const eventsByDate = useMemo(() => {
        return events.reduce((acc, event) => {
            (acc[event.date] = acc[event.date] || []).push(event);
            return acc;
        }, {} as Record<string, PlannerEvent[]>);
    }, [events]);

    const calendarDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const startDate = new Date(firstDayOfMonth);
        const dayOfWeek = firstDayOfMonth.getDay(); // Sunday: 0, Monday: 1, etc.
        const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1; // Adjust for Monday-first week
        startDate.setDate(startDate.getDate() - daysToSubtract);

        const days = [];
        for (let i = 0; i < 42; i++) {
            days.push(new Date(startDate));
            startDate.setDate(startDate.getDate() + 1);
        }
        return days;
    }, [currentDate]);

    const weekDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']; 
    const today = new Date();

    const renderEventPill = (event: PlannerEvent) => (
        <div key={event.id} className={`event-pill ${getEventTypeClass(event.type)}`} title={event.title}>
            <div className="event-pill-dot"></div>
            <span className="event-title">{event.title}</span>
        </div>
    );
    
    return (
        <View 
            title="Naptár" 
            subtitle="Személyes és munkahelyi események áttekintése."
            actions={
                 <button className="button button-primary" onClick={() => onOpenEventModal()}>
                    <span className="material-symbols-outlined">edit_calendar</span> Új esemény
                </button>
            }
        >
            <div className="planner-view-container">
                <div className="calendar-header card">
                    <div className="calendar-title">{currentDate.toLocaleDateString('hu-HU', { month: 'long', year: 'numeric' })}</div>
                    <div className="calendar-controls">
                        <button onClick={handlePrevMonth} className="button button-icon-only" aria-label="Előző hónap"><span className="material-symbols-outlined">chevron_left</span></button>
                        <button onClick={handleGoToToday} className="button button-secondary">Ma</button>
                        <button onClick={handleNextMonth} className="button button-icon-only" aria-label="Következő hónap"><span className="material-symbols-outlined">chevron_right</span></button>
                    </div>
                </div>
                <div className="calendar-body card">
                    <div className="calendar-day-names">{weekDays.map(day => <div key={day} className="calendar-day-name">{day}</div>)}</div>
                    <div className="calendar-grid">{calendarDays.map((day, index) => {
                        const dayString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                        const eventsForDay = eventsByDate[dayString] || [];
                        const isToday = day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate();
                        const isOtherMonth = day.getMonth() !== currentDate.getMonth();
                        const maxEventsToShow = 2;
                        const hiddenEventsCount = eventsForDay.length > maxEventsToShow ? eventsForDay.length - maxEventsToShow : 0;

                        return (
                            <div key={index} className={`day-cell ${isToday ? 'today' : ''} ${isOtherMonth ? 'other-month' : ''}`} onClick={() => onOpenDayModal(dayString, eventsForDay)}>
                                <div className="day-number">{day.getDate()}</div>
                                <div className="events-list">
                                    {eventsForDay.slice(0, maxEventsToShow).map(renderEventPill)}
                                    {hiddenEventsCount > 0 && (
                                        <div className="more-events-indicator">
                                            +{hiddenEventsCount} további
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}</div>
                </div>
            </div>
        </View>
    );
};


// --- MODALS ---
const TaskModal = ({ isOpen, onClose, onSaveTask, initialData = null, defaultValues = {} }: {
    isOpen: boolean;
    onClose: () => void;
    onSaveTask: (task: any) => void;
    initialData?: TaskItem | null;
    defaultValues?: {
        category?: TaskCategory;
        projectId?: string;
    };
}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState<TaskPriority>('Közepes');
    const [category, setCategory] = useState<TaskCategory>('Személyes');
    const [projectId, setProjectId] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title || '');
                setDescription(initialData.description || '');
                setDueDate(initialData.dueDate ? initialData.dueDate.split('T')[0] : '');
                setPriority(initialData.priority || 'Közepes');
                setCategory(initialData.category || 'Személyes');
                setProjectId(initialData.projectId);
            } else {
                setTitle('');
                setDescription('');
                setDueDate('');
                setPriority('Közepes');
                setCategory(defaultValues.category || 'Személyes');
                setProjectId(defaultValues.projectId);
            }
        }
    }, [initialData, defaultValues, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSaveTask({ 
            id: initialData?.id,
            title: title.trim(), 
            description: description.trim(), 
            dueDate, 
            priority, 
            category,
            projectId,
        });
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{initialData ? "Feladat Módosítása" : "Új Feladat Létrehozása"}</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="task-title">Cím</label>
                        <input id="task-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="task-description">Leírás</label>
                        <textarea id="task-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}></textarea>
                    </div>
                    <div className="form-group-inline">
                        <div className="form-group">
                            <label htmlFor="task-duedate">Határidő</label>
                            <input id="task-duedate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="task-priority">Prioritás</label>
                            <select id="task-priority" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                                <option value="Alacsony">Alacsony</option>
                                <option value="Közepes">Közepes</option>
                                <option value="Magas">Magas</option>
                                <option value="Kritikus">Kritikus</option>
                            </select>
                        </div>
                    </div>
                     <div className="form-group">
                        <label htmlFor="task-category">Kategória</label>
                        <select id="task-category" value={category} onChange={e => setCategory(e.target.value as TaskCategory)} disabled={!!projectId}>
                             {Object.values(['Munka', 'Személyes', 'Projekt', 'Tanulás', 'Ügyfél', 'Email', 'Pályázat', 'Meeting']).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="submit" className="button button-primary">Feladat Mentése</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EventModal = ({ isOpen, onClose, onAddEvent, initialDate = '' }) => {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [type, setType] = useState<PlannerEventType>('personal');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTitle('');
            setDate(initialDate || new Date().toISOString().split('T')[0]);
            setTime('');
            setType('personal');
            setDescription('');
            setLocation('');
        }
    }, [isOpen, initialDate]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim() || !date) return;
        onAddEvent({
            title: title.trim(),
            date,
            time: time || undefined,
            type,
            description: description.trim() || undefined,
            location: location.trim() || undefined,
        });
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Új Esemény Létrehozása</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="event-title">Esemény címe</label>
                        <input id="event-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
                    </div>
                    <div className="form-group-inline">
                        <div className="form-group">
                            <label htmlFor="event-date">Dátum</label>
                            <input id="event-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="event-time">Időpont (opcionális)</label>
                            <input id="event-time" type="time" value={time} onChange={e => setTime(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="event-type">Típus</label>
                        <select id="event-type" value={type} onChange={e => setType(e.target.value as PlannerEventType)}>
                            <option value="personal">Személyes</option>
                            <option value="work">Munka</option>
                            <option value="meeting">Megbeszélés</option>
                            <option value="deadline">Határidő</option>
                        </select>
                    </div>
                     <div className="form-group">
                        <label htmlFor="event-location">Helyszín</label>
                        <input id="event-location" type="text" value={location} onChange={e => setLocation(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="event-description">Leírás</label>
                        <textarea id="event-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}></textarea>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="submit" className="button button-primary">Esemény Mentése</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DayDetailModal = ({ isOpen, onClose, date, events, onOpenEventModal }) => {
    if (!isOpen || !date) return null;

    const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    });

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{formattedDate}</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <div className="day-detail-modal-body">
                    {events.length > 0 ? (
                        <ul className="day-detail-event-list">
                            {events.map(event => (
                                <li key={event.id} className={`day-detail-event-item ${getEventTypeClass(event.type)}`}>
                                    <div className="event-item-dot"></div>
                                    <div className="event-item-info">
                                        <span className="event-item-time">{event.time || 'Egész nap'}</span>
                                        <span className="event-item-title">{event.title}</span>
                                        {event.location && <span className="event-item-location"><span className="material-symbols-outlined">location_on</span>{event.location}</span>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="empty-state-placeholder" style={{ background: 'transparent' }}>
                             <span className="material-symbols-outlined">event_busy</span>
                            <p>Erre a napra nincsenek események.</p>
                        </div>
                    )}
                </div>
                <div className="modal-actions" style={{ marginTop: 0, borderTop: 'none', paddingTop: 'var(--spacing-md)'}}>
                    <button type="button" className="button button-primary" onClick={() => { onOpenEventModal(date); onClose(); }}>
                       <span className="material-symbols-outlined">add</span> Új esemény erre a napra
                    </button>
                </div>
            </div>
        </div>
    );
};

const TransactionModal = ({ isOpen, onClose, onAddTransaction }) => {
    const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(new Date().toISOString().split('T')[0]); const [type, setType] = useState<'income' | 'expense'>('expense'); const [category, setCategory] = useState<FinancialCategory>('Élelmiszer');
    
    const availableCategories = useMemo(() => {
        return type === 'income' 
            ? ['Fizetés', 'Egyéb bevétel'] 
            : ['Élelmiszer', 'Rezsi', 'Utazás', 'Szórakozás', 'Egyéb kiadás'];
    }, [type]);

    useEffect(() => {
        if (isOpen) {
            setCategory(availableCategories[0] as FinancialCategory);
        }
    }, [isOpen, availableCategories]);

    if (!isOpen) return null;

    const handleSubmit = (e) => { e.preventDefault(); if (!title.trim() || !amount) return; onAddTransaction({ title: title.trim(), amount: parseFloat(amount), date, type, category }); onClose(); };
    

    return ( <div className="modal-overlay" onClick={onClose}> <div className="modal-content card" onClick={e => e.stopPropagation()}> <div className="modal-header"><h3>Új Tranzakció</h3><button onClick={onClose} className="button-icon-close">&times;</button></div> <form onSubmit={handleSubmit} className="modal-form"> <div className="form-group"><label htmlFor="tran-title">Megnevezés</label><input id="tran-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required /></div> <div className="form-group-inline"> <div className="form-group"><label htmlFor="tran-amount">Összeg (Ft)</label><input id="tran-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} required /></div> <div className="form-group"><label htmlFor="tran-date">Dátum</label><input id="tran-date" type="date" value={date} onChange={e => setDate(e.target.value)} required /></div> </div> <div className="form-group-inline"> <div className="form-group"><label htmlFor="tran-type">Típus</label><select id="tran-type" value={type} onChange={e => setType(e.target.value as any)}><option value="expense">Kiadás</option><option value="income">Bevétel</option></select></div> <div className="form-group"><label htmlFor="tran-category">Kategória</label><select id="tran-category" value={category} onChange={e => setCategory(e.target.value as FinancialCategory)}>{availableCategories.map(c => <option key={c} value={c}>{c}</option>)}</select></div> </div> <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Mégse</button><button type="submit" className="button button-primary">Tranzakció Mentése</button></div> </form> </div> </div> );
};

const ProposalModal = ({ isOpen, onClose, onAddProposal }) => {
    const [title, setTitle] = useState('');
    const [funder, setFunder] = useState('');
    const [submissionDeadline, setSubmissionDeadline] = useState('');
    const [amount, setAmount] = useState('');
    const [summary, setSummary] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setTitle(''); setFunder(''); setSubmissionDeadline(''); setAmount(''); setSummary('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim() || !funder.trim() || !submissionDeadline || !amount) return;
        onAddProposal({
            title: title.trim(),
            funder: funder.trim(),
            submissionDeadline,
            amount: parseInt(amount, 10),
            summary: summary.trim(),
        });
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Új Pályázat Létrehozása</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="prop-title">Pályázat címe</label>
                        <input id="prop-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
                    </div>
                     <div className="form-group">
                        <label htmlFor="prop-funder">Kiíró</label>
                        <input id="prop-funder" type="text" value={funder} onChange={e => setFunder(e.target.value)} required />
                    </div>
                    <div className="form-group-inline">
                        <div className="form-group">
                            <label htmlFor="prop-deadline">Beadási határidő</label>
                            <input id="prop-deadline" type="date" value={submissionDeadline} onChange={e => setSubmissionDeadline(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="prop-amount">Megpályázott összeg (Ft)</label>
                            <input id="prop-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="prop-summary">Rövid leírás</label>
                        <textarea id="prop-summary" value={summary} onChange={e => setSummary(e.target.value)} rows={3}></textarea>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="submit" className="button button-primary">Pályázat Mentése</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ProjectModal = ({ isOpen, onClose, onAddProject }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [team, setTeam] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTitle(''); setDescription(''); setDueDate(''); setTeam('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const teamArray = team.split(',').map(name => name.trim()).filter(Boolean);
        onAddProject({
            title: title.trim(),
            description: description.trim(),
            dueDate,
            team: teamArray,
        });
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Új Projekt Létrehozása</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="project-title">Projekt címe</label>
                        <input id="project-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="project-description">Rövid leírás</label>
                        <textarea id="project-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}></textarea>
                    </div>
                    <div className="form-group-inline">
                        <div className="form-group">
                            <label htmlFor="project-duedate">Határidő</label>
                            <input id="project-duedate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        </div>
                         <div className="form-group">
                            <label htmlFor="project-team">Csapattagok (vesszővel elválasztva)</label>
                            <input id="project-team" type="text" value={team} onChange={e => setTeam(e.target.value)} />
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="submit" className="button button-primary">Projekt Mentése</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AiProjectModal = ({ isOpen, onClose, onAddProjectWithTasks, ai, onAddNotification }) => {
    const [step, setStep] = useState('prompt'); // prompt, loading, review
    const [prompt, setPrompt] = useState('');
    const [editedPlan, setEditedPlan] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setStep('prompt');
            setPrompt('');
            setEditedPlan(null);
            setError('');
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setStep('loading');
        setError('');
        
        const schema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "A projekt rövid, lényegretörő címe, maximum 10 szóban." },
                description: { type: Type.STRING, description: "A projekt részletesebb leírása 2-3 mondatban." },
                dueDate: { type: Type.STRING, description: `A projekt becsült határideje YYYY-MM-DD formátumban. Ha a promptból nem derül ki, becsüld meg a leírás alapján. A mai nap: ${new Date().toISOString().split('T')[0]}` },
                team: { 
                    type: Type.ARRAY, 
                    description: "A projektben résztvevő csapattagok nevei, ha meg vannak említve.",
                    items: { type: Type.STRING }
                },
                tasks: {
                    type: Type.ARRAY,
                    description: "A projekt megvalósításához szükséges 5-8 legfontosabb, végrehajtható feladat listája. A feladatok legyenek konkrétak.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "A feladat címe." }
                        },
                        required: ['title']
                    }
                }
            },
            required: ['title', 'description', 'tasks']
        };

        const generationPrompt = `Te egy profi projektmenedzser vagy. A feladatod, hogy a felhasználó által megadott ötletből egy strukturált projekttervet készíts a megadott JSON séma szerint. Legyél kreatív és logikus. A feladatok legyenek konkrétak és végrehajthatóak.\n\nFelhasználó ötlete: "${prompt}"`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: generationPrompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });
            const plan = JSON.parse(response.text.trim());
            setEditedPlan({
                ...plan,
                tasks: Array.isArray(plan.tasks) ? plan.tasks.map((task, index) => ({ id: `new-task-${index}`, title: task.title, checked: true })) : []
            });
            setStep('review');
        } catch (err) {
            console.error("AI Project Generation Error:", err);
            setError("Hiba történt a terv generálása közben. Kérjük, próbálja újra egy másik leírással.");
            onAddNotification({ message: 'Hiba a projektterv generálása közben.', type: 'error' });
            setStep('prompt');
        }
    };

    const handleCreateProject = () => {
        if (!editedPlan) return;
        const projectData = {
            title: editedPlan.title,
            description: editedPlan.description,
            dueDate: editedPlan.dueDate,
            team: editedPlan.team || [],
        };
        const tasksToCreate = editedPlan.tasks
            .filter(task => task.checked)
            .map(task => ({ title: task.title, description: `(AI által generált feladat a(z) "${editedPlan.title}" projekthez)` }));
        
        onAddProjectWithTasks(projectData, tasksToCreate);
        onClose();
    };

    const handlePlanChange = (field, value) => {
        setEditedPlan(prev => ({ ...prev, [field]: value }));
    };

    const handleTaskChange = (taskId, newTitle) => {
        setEditedPlan(prev => ({
            ...prev,
            tasks: prev.tasks.map(task => task.id === taskId ? { ...task, title: newTitle } : task)
        }));
    };

    const handleTaskCheck = (taskId) => {
        setEditedPlan(prev => ({
            ...prev,
            tasks: prev.tasks.map(task => task.id === taskId ? { ...task, checked: !task.checked } : task)
        }));
    };

    if (!isOpen) return null;

    const renderContent = () => {
        switch (step) {
            case 'prompt':
                return (
                    <div className="ai-project-modal-step">
                        <h3><span className="material-symbols-outlined">lightbulb</span>Mondja el az ötletét!</h3>
                        <p>Írja le pár mondatban, mit szeretne elérni, és a Gemini segít megtervezni a lépéseket.</p>
                        {error && <p className="error-message" style={{textAlign: 'left'}}>{error}</p>}
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Pl. Szeretnék egy marketing kampányt a nyári szezonra. A cél a fiatal felnőttek elérése a közösségi médián keresztül. Készítsünk videókat és képeket is. A kampány fusson július végéig. A csapat tagjai Dénes és Eszter."
                            rows={6}
                        />
                        <div className="modal-actions">
                            <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                            <button type="button" className="button button-primary" onClick={handleGenerate} disabled={!prompt.trim()}>
                                <span className="material-symbols-outlined">auto_awesome</span>Terv Generálása
                            </button>
                        </div>
                    </div>
                );
            case 'loading':
                return (
                    <div className="ai-project-modal-step">
                        <div className="empty-state-placeholder" style={{ background: 'transparent', border: 'none' }}>
                            <span className="material-symbols-outlined progress_activity">progress_activity</span>
                            <p>Projektterv készítése...</p>
                            <span>Ez eltarthat pár másodpercig.</span>
                        </div>
                    </div>
                );
            case 'review':
                if (!editedPlan) return null;
                return (
                    <div className="ai-project-modal-step">
                        <h3><span className="material-symbols-outlined">checklist</span>Javasolt Terv</h3>
                        <p>Itt a generált projektterv. Módosítsa bátran, mielőtt létrehozza!</p>
                        <div className="ai-project-review-form">
                            <div className="form-group">
                                <label>Projekt címe</label>
                                <input type="text" value={editedPlan.title} onChange={(e) => handlePlanChange('title', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Leírás</label>
                                <textarea value={editedPlan.description} onChange={(e) => handlePlanChange('description', e.target.value)} rows={3}></textarea>
                            </div>
                            <div className="form-group-inline">
                                <div className="form-group">
                                    <label>Határidő</label>
                                    <input type="date" value={editedPlan.dueDate || ''} onChange={(e) => handlePlanChange('dueDate', e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Csapattagok</label>
                                    <input type="text" value={(editedPlan.team || []).join(', ')} onChange={(e) => handlePlanChange('team', e.target.value.split(',').map(n => n.trim()))} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Javasolt Feladatok</label>
                                <div className="generated-task-list">
                                    {editedPlan.tasks.map(task => (
                                        <div key={task.id} className="generated-task-item">
                                            <input type="checkbox" checked={task.checked} onChange={() => handleTaskCheck(task.id)} />
                                            <input type="text" value={task.title} onChange={(e) => handleTaskChange(task.id, e.target.value)} disabled={!task.checked} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="button button-secondary" onClick={() => setStep('prompt')}>Vissza</button>
                            <button type="button" className="button button-primary" onClick={handleCreateProject}>
                                <span className="material-symbols-outlined">rocket_launch</span>Projekt Indítása
                            </button>
                        </div>
                    </div>
                );
        }
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
                <div className="modal-header" style={{border: 'none', paddingBottom: 0}}>
                    <h3>AI Projekt Tervező</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

const AiLearningPathModal = ({ isOpen, onClose, onAddTrainingWithPath, ai, onAddNotification }) => {
    const [step, setStep] = useState('prompt'); // prompt, loading, review
    const [prompt, setPrompt] = useState('');
    const [editedPlan, setEditedPlan] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setStep('prompt');
            setPrompt('');
            setEditedPlan(null);
            setError('');
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setStep('loading');
        setError('');
        
        const schema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "A teljes tanulási útvonal összefoglaló címe, pl. 'Modern Webfejlesztés Mesterkurzus'." },
                description: { type: Type.STRING, description: "A tanulási útvonal rövid, 1-2 mondatos leírása." },
                modules: {
                    type: Type.ARRAY,
                    description: "A tanulási útvonal logikailag szekvenciális moduljainak listája, 5-8 modulból álljon.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "A modul címe. Pl. 'React Alapok'." },
                            description: { type: Type.STRING, description: "A modul tartalmának rövid leírása (1 mondat)." }
                        },
                        required: ['title', 'description']
                    }
                }
            },
            required: ['title', 'description', 'modules']
        };

        const generationPrompt = `Te egy szakértő tananyagfejlesztő és karrier-tanácsadó vagy. A feladatod, hogy a felhasználó által megadott tanulási célból egy strukturált, lépésekre bontott tanulási tervet készíts a megadott JSON séma szerint. A modulok logikusan épüljenek egymásra.\n\nFelhasználó tanulási célja: "${prompt}"`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: generationPrompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            const plan = JSON.parse(response.text.trim());
            setEditedPlan({
                ...plan,
                modules: Array.isArray(plan.modules) ? plan.modules.map((mod, index) => ({ id: `new-mod-${index}`, ...mod, checked: true })) : []
            });
            setStep('review');
        } catch (err) {
            console.error("AI Learning Path Generation Error:", err);
            setError("Hiba történt a terv generálása közben. Kérjük, próbálja újra egy másik leírással.");
            onAddNotification({ message: 'Hiba a tanulási terv generálása közben.', type: 'error' });
            setStep('prompt');
        }
    };

    const handleCreatePlan = () => {
        if (!editedPlan) return;
        const trainingData = {
            title: editedPlan.title,
            description: editedPlan.description,
            provider: 'AI által generált',
        };
        const tasksToCreate = editedPlan.modules
            .filter(mod => mod.checked)
            .map(mod => ({ title: mod.title, description: mod.description }));
        
        onAddTrainingWithPath(trainingData, tasksToCreate);
        onClose();
    };

    const handlePlanChange = (field, value) => {
        setEditedPlan(prev => ({ ...prev, [field]: value }));
    };

    const handleModuleCheck = (moduleId) => {
        setEditedPlan(prev => ({
            ...prev,
            modules: prev.modules.map(mod => mod.id === moduleId ? { ...mod, checked: !mod.checked } : mod)
        }));
    };
    
    if (!isOpen) return null;

    const renderContent = () => {
        switch (step) {
            case 'prompt':
                return (
                    <div className="ai-project-modal-step">
                        <h3><span className="material-symbols-outlined">school</span>Mit szeretne megtanulni?</h3>
                        <p>Írja le a tanulási célját, és a Gemini segít megtervezni a lépéseket egy strukturált útvonalon.</p>
                        {error && <p className="error-message" style={{textAlign: 'left'}}>{error}</p>}
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Pl. Szeretnék profi szinten megtanulni webalkalmazásokat fejleszteni React és TypeScript segítségével az alapoktól."
                            rows={6}
                        />
                        <div className="modal-actions">
                            <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                            <button type="button" className="button button-primary" onClick={handleGenerate} disabled={!prompt.trim()}>
                                <span className="material-symbols-outlined">auto_awesome</span>Terv Generálása
                            </button>
                        </div>
                    </div>
                );
            case 'loading':
                return (
                    <div className="ai-project-modal-step">
                        <div className="empty-state-placeholder" style={{ background: 'transparent', border: 'none' }}>
                            <span className="material-symbols-outlined progress_activity">progress_activity</span>
                            <p>Tanulási útvonal készítése...</p>
                            <span>Ez eltarthat pár másodpercig.</span>
                        </div>
                    </div>
                );
            case 'review':
                if (!editedPlan) return null;
                return (
                    <div className="ai-project-modal-step">
                        <h3><span className="material-symbols-outlined">checklist</span>Javasolt Tanulási Útvonal</h3>
                        <p>Itt a generált terv. Módosítsa bátran, és válassza ki a modulokat, mielőtt létrehozza a képzést és a feladatokat!</p>
                        <div className="ai-project-review-form">
                            <div className="form-group">
                                <label>Képzés címe</label>
                                <input type="text" value={editedPlan.title} onChange={(e) => handlePlanChange('title', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Leírás</label>
                                <textarea value={editedPlan.description} onChange={(e) => handlePlanChange('description', e.target.value)} rows={2}></textarea>
                            </div>
                            <div className="form-group">
                                <label>Javasolt Modulok (Feladatok)</label>
                                <div className="generated-task-list">
                                    {editedPlan.modules.map(mod => (
                                        <div key={mod.id} className="generated-task-item">
                                            <input type="checkbox" checked={mod.checked} onChange={() => handleModuleCheck(mod.id)} />
                                            <div className="module-info">
                                                <strong>{mod.title}</strong>
                                                <span>{mod.description}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="button button-secondary" onClick={() => setStep('prompt')}>Vissza</button>
                            <button type="button" className="button button-primary" onClick={handleCreatePlan}>
                                <span className="material-symbols-outlined">rocket_launch</span>Tanulás Indítása
                            </button>
                        </div>
                    </div>
                );
        }
    };
    
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
                <div className="modal-header" style={{border: 'none', paddingBottom: 0}}>
                    <h3>AI Tanulási Tervező</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

const ContactModal = ({ isOpen, onClose, onSave, contact }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [role, setRole] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (contact) {
                setName(contact.name || '');
                setEmail(contact.email || '');
                setPhone(contact.phone || '');
                setCompany(contact.company || '');
                setRole(contact.role || '');
                setNotes(contact.notes || '');
            } else {
                // Reset form for new contact
                setName(''); setEmail(''); setPhone(''); setCompany(''); setRole(''); setNotes('');
            }
        }
    }, [contact, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
            id: contact?.id,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            company: company.trim(),
            role: role.trim(),
            notes: notes.trim(),
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{contact ? "Kapcsolat Módosítása" : "Új Kapcsolat"}</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label htmlFor="contact-name">Név</label>
                        <input id="contact-name" type="text" value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="form-group-inline">
                        <div className="form-group">
                            <label htmlFor="contact-email">Email</label>
                            <input id="contact-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="contact-phone">Telefonszám</label>
                            <input id="contact-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group-inline">
                        <div className="form-group">
                            <label htmlFor="contact-company">Cég</label>
                            <input id="contact-company" type="text" value={company} onChange={e => setCompany(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="contact-role">Szerepkör</label>
                            <input id="contact-role" type="text" value={role} onChange={e => setRole(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="contact-notes">Jegyzetek</label>
                        <textarea id="contact-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}></textarea>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="submit" className="button button-primary">Mentés</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- TASK MANAGEMENT: KANBAN COMPONENTS ---

const ItemTypes = {
  TASK: 'task',
  PROPOSAL: 'proposal',
};

const TaskBoardCard = ({ task, onOpenTaskModal }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.TASK,
        item: { id: task.id },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }));
    drag(ref);

    return (
        <div ref={ref} className="task-card-kanban card" onClick={() => onOpenTaskModal(task)} style={{ opacity: isDragging ? 0.5 : 1 }}>
            <span className="task-title">{task.title}</span>
            {task.subTasks && task.subTasks.length > 0 && (
                <div className="task-kanban-subtasks">
                    <span className="material-symbols-outlined">checklist</span>
                    <span>{task.subTasks.filter(st => st.completed).length}/{task.subTasks.length}</span>
                </div>
            )}
            <div className="task-card-footer-kanban">
                <span className={`task-pill priority-pill ${getPriorityClass(task.priority)}`}>{task.priority}</span>
                {task.dueDate && <span className="task-pill pill-date"><span className="material-symbols-outlined">event</span>{formatDate(task.dueDate).split(',')[0]}</span>}
            </div>
        </div>
    );
};

const TaskColumn = ({ status, tasks, onTaskDrop, onOpenTaskModal }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [{ isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.TASK,
        drop: (item: { id: string }) => onTaskDrop(item.id, status),
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
                {tasks.map(task => (
                    <TaskBoardCard key={task.id} task={task} onOpenTaskModal={onOpenTaskModal} />
                ))}
                 {tasks.length === 0 && <div className="kanban-empty-placeholder">Húzzon ide egy feladatot</div>}
            </div>
        </div>
    );
};

const TaskKanbanBoard = ({ tasks, setTasks, onOpenTaskModal, onAddNotification }) => {
    const statuses: TaskStatus[] = ['Teendő', 'Folyamatban', 'Kész', 'Blokkolt'];

    const handleTaskDrop = (taskId: string, newStatus: TaskStatus) => {
        const taskToMove = tasks.find(t => t.id === taskId);
        if (taskToMove && taskToMove.status !== newStatus) {
            setTasks(currentTasks => 
                currentTasks.map(t =>
                    t.id === taskId ? { ...t, status: newStatus, completedAt: newStatus === 'Kész' ? new Date().toISOString() : undefined } : t
                )
            );
            onAddNotification({ message: `"${taskToMove.title}" státusza megváltozott: ${newStatus}`, type: 'success' });
        }
    };
    
    const tasksByStatus = useMemo(() => {
        const grouped: { [key in TaskStatus]?: TaskItem[] } = {};
        tasks.forEach(task => {
            if (!grouped[task.status]) {
                grouped[task.status] = [];
            }
            grouped[task.status]!.push(task);
        });
        return grouped;
    }, [tasks]);

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="tasks-kanban-board-container">
                <div className="kanban-board">
                    {statuses.map(status => (
                        <TaskColumn 
                            key={status} 
                            status={status} 
                            tasks={tasksByStatus[status] || []} 
                            onTaskDrop={handleTaskDrop}
                            onOpenTaskModal={onOpenTaskModal} 
                        />
                    ))}
                </div>
            </div>
        </DndProvider>
    );
};


// --- TASK MANAGEMENT VIEW ---
const TasksView = ({ tasks, setTasks, onOpenTaskModal, onAddNotification, emails, projects, proposals, trainings }: { tasks: TaskItem[], emails: EmailMessage[], projects: Project[], proposals: Proposal[], trainings: TrainingItem[], setTasks: React.Dispatch<React.SetStateAction<TaskItem[]>>, onOpenTaskModal: (task?: TaskItem) => void, onAddNotification: (notification: Omit<Notification, 'id'>) => void }) => {
    const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all'); 
    const [sortOrder, setSortOrder] = useState<'dueDate' | 'priority' | 'createdAt'>('createdAt'); 
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

    const handleToggleSubTask = (taskId: string, subTaskId: string) => { 
        setTasks(currentTasks => currentTasks.map(task => 
            task.id === taskId && task.subTasks 
            ? { ...task, subTasks: task.subTasks.map(sub => sub.id === subTaskId ? { ...sub, completed: !sub.completed } : sub) } 
            : task
        )); 
    };

    const sortedAndFilteredTasks = useMemo(() => {
        let result = tasks.filter(task => filterStatus === 'all' || task.status === filterStatus);
        return [...result].sort((a, b) => {
            if (sortOrder === 'dueDate') {
                const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                if (timeA < timeB) return -1;
                if (timeA > timeB) return 1;
                return 0;
            }
            if (sortOrder === 'priority') {
                const p: Record<TaskPriority, number> = { 'Kritikus': 4, 'Magas': 3, 'Közepes': 2, 'Alacsony': 1 };
                const priorityA = p[a.priority] || 0;
                const priorityB = p[b.priority] || 0;
                return priorityB - priorityA;
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [tasks, filterStatus, sortOrder]);

    return ( 
        <View title="Feladatok" subtitle="Itt kezelheti az összes teendőjét."> 
            <div className="tasks-view-container"> 
                <div className="tasks-toolbar"> 
                    <div className="view-mode-switcher">
                        <button onClick={() => setViewMode('list')} className={`button button-icon-only ${viewMode === 'list' ? 'active' : ''}`} aria-label="Lista nézet">
                            <span className="material-symbols-outlined">view_list</span>
                        </button>
                         <button onClick={() => setViewMode('board')} className={`button button-icon-only ${viewMode === 'board' ? 'active' : ''}`} aria-label="Tábla nézet">
                            <span className="material-symbols-outlined">view_kanban</span>
                        </button>
                    </div>
                    {viewMode === 'list' && (
                        <>
                            <div className="filter-group">
                                <label htmlFor="status-filter">Szűrés státusz szerint:</label>
                                <select id="status-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
                                    <option value="all">Összes</option>
                                    <option value="Teendő">Teendő</option>
                                    <option value="Folyamatban">Folyamatban</option>
                                    <option value="Kész">Kész</option>
                                    <option value="Blokkolt">Blokkolt</option>
                                </select>
                            </div> 
                            <div className="filter-group">
                                <label htmlFor="sort-order">Rendezés:</label>
                                <select id="sort-order" value={sortOrder} onChange={e => setSortOrder(e.target.value as any)}>
                                    <option value="createdAt">Létrehozás dátuma</option>
                                    <option value="dueDate">Határidő</option>
                                    <option value="priority">Prioritás</option>
                                </select>
                            </div> 
                        </>
                    )}
                    <button className="button button-primary" onClick={() => onOpenTaskModal()}><span className="material-symbols-outlined">add</span> Új feladat</button>
                </div> 

                {viewMode === 'list' ? (
                    <div className="task-list"> {sortedAndFilteredTasks.map(task => ( 
                        <div key={task.id} className={`task-card card ${task.status === 'Kész' ? 'done' : ''}`}> 
                            <div className="task-card-header" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}> 
                                <input type="checkbox" checked={task.status === 'Kész'} onChange={() => { const newStatus = task.status === 'Kész' ? 'Teendő' : 'Kész'; setTasks(current => current.map(t => t.id === task.id ? { ...t, status: newStatus, completedAt: newStatus === 'Kész' ? new Date().toISOString() : undefined } : t)); }} onClick={e => e.stopPropagation()} /> 
                                <span className="task-title">{task.title}</span> 
                                <div className="task-card-pills"> 
                                    {task.category && <span className="task-pill pill-category">{task.category}</span>} 
                                    <span className={`task-pill priority-pill ${getPriorityClass(task.priority)}`}>{task.priority}</span> 
                                    <span className="task-pill pill-status">{task.status}</span> 
                                </div> 
                                <span className="material-symbols-outlined expand-icon">{expandedTaskId === task.id ? 'expand_less' : 'expand_more'}</span> 
                            </div> 
                            {expandedTaskId === task.id && ( 
                                <div className="task-card-body"> 
                                    <p className="task-description">{task.description || 'Nincs leírás megadva.'}</p> 
                                    <div className="task-meta"> 
                                        <span><strong>Határidő:</strong> {formatDate(task.dueDate)}</span> 
                                        {task.projectId && <span className="task-project"><strong>Projekt:</strong> {projects.find(p => p.id === task.projectId)?.title}</span>} 
                                        {task.proposalId && <span className="task-proposal"><strong>Pályázat:</strong> {proposals.find(p => p.id === task.proposalId)?.title}</span>} 
                                        {task.trainingId && <span className="task-training"><strong>Képzés:</strong> {trainings.find(t => t.id === task.trainingId)?.title}</span>} 
                                        {task.relatedTo && <span className="task-email"><strong>Kapcsolódó email:</strong> {emails.find(e => e.id === task.relatedTo)?.subject}</span>} 
                                    </div> 
                                    {task.subTasks && task.subTasks.length > 0 && ( 
                                        <div className="subtask-list"> 
                                            <h5>Részfeladatok:</h5> 
                                            <ul> {task.subTasks.map(sub => ( 
                                                <li key={sub.id} className={sub.completed ? 'completed' : ''}> 
                                                    <input type="checkbox" checked={sub.completed} onChange={() => handleToggleSubTask(task.id, sub.id)} /> 
                                                    <span>{sub.title}</span> 
                                                </li> 
                                            ))} </ul> 
                                        </div> 
                                    )} 
                                </div> 
                            )} 
                        </div> 
                    ))} </div>
                ) : (
                    <TaskKanbanBoard tasks={tasks} setTasks={setTasks} onOpenTaskModal={onOpenTaskModal} onAddNotification={onAddNotification} />
                )}
            </div> 
        </View> 
    );
};

// --- AI CHAT VIEW ---
const AiChatView = ({ ai, tasks, onAddTask, onAddNotification }) => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const appTools: FunctionDeclaration[] = useMemo(() => [
        {
            name: "add_task",
            description: "Új feladat hozzáadása a felhasználó feladatlistájához. Mindig kérj megerősítést a felhasználótól a feladat hozzáadása előtt, és csak azután hívd meg ezt a funkciót, ha igent mondott.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "A feladat címe." },
                    description: { type: Type.STRING, description: "A feladat részletesebb leírása." },
                    dueDate: { type: Type.STRING, description: `A feladat határideje YYYY-MM-DD formátumban. A mai dátum: ${new Date().toISOString().split('T')[0]}` },
                    priority: { type: Type.STRING, enum: ['Alacsony', 'Közepes', 'Magas', 'Kritikus'], description: "A feladat prioritása." },
                },
                required: ["title"],
            },
        },
        {
            name: "get_tasks",
            description: "A felhasználó feladatainak lekérdezése különböző szűrők alapján. A válaszban csak azokat a mezőket add vissza, amik nem üresek (pl. a `description`-t ne add vissza, ha nincs).",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    status: { type: Type.STRING, enum: ['Teendő', 'Folyamatban', 'Kész', 'Blokkolt'], description: "Szűrés a feladat státusza alapján." },
                    priority: { type: Type.STRING, enum: ['Alacsony', 'Közepes', 'Magas', 'Kritikus'], description: "Szűrés a feladat prioritása alapján." },
                    dateRange: { type: Type.STRING, enum: ['today', 'tomorrow', 'this_week'], description: "Szűrés relatív időtartam alapján (mai, holnapi, e heti feladatok)." },
                },
            },
        },
    ], []);

    useEffect(() => {
        if (ai) {
            const newChat = ai.chats.create({
                model: 'gemini-2.5-flash',
                tools: [{ functionDeclarations: appTools }],
                systemInstruction: "Te egy segítőkész asszisztens vagy a P-Day Light alkalmazásban. A válaszaidat mindig magyarul add. Légy tömör és barátságos. Ha egy eszközt kell használnod, használd azt, majd a kapott JSON-adatok alapján adj egy ember által olvasható, formázott választ.",
            });
            setChat(newChat);
            setMessages([{
                id: 'init',
                sender: 'bot',
                text: 'Szia! Miben segíthetek ma?'
            }]);
        }
    }, [ai, appTools]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    const handleFunctionCall = useCallback(async (functionCalls: any[]) => {
        const call = functionCalls[0];
        let functionResponse;

        setMessages(prev => [...prev, {
            id: `action-${Date.now()}`, text: `Eszköz használata: ${call.name}...`, sender: 'bot', isAction: true
        }]);

        try {
            switch (call.name) {
                case 'add_task':
                    onAddTask(call.args);
                    functionResponse = { success: true, message: `A "${call.args.title}" feladatot sikeresen hozzáadtam.` };
                    break;
                case 'get_tasks': {
                    let filteredTasks = [...tasks];
                    const { status, priority, dateRange } = call.args;

                    if (status) {
                        filteredTasks = filteredTasks.filter(t => t.status === status);
                    }
                    if (priority) {
                        filteredTasks = filteredTasks.filter(t => t.priority === priority);
                    }
                    if (dateRange) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        if (dateRange === 'today') {
                            const todayStr = today.toISOString().split('T')[0];
                            filteredTasks = filteredTasks.filter(t => t.dueDate === todayStr);
                        } else if (dateRange === 'tomorrow') {
                            const tomorrow = new Date(today);
                            tomorrow.setDate(today.getDate() + 1);
                            const tomorrowStr = tomorrow.toISOString().split('T')[0];
                            filteredTasks = filteredTasks.filter(t => t.dueDate === tomorrowStr);
                        } else if (dateRange === 'this_week') {
                             const firstDayOfWeek = new Date(today.getTime());
                             const dayOfWeek = firstDayOfWeek.getDay(); // 0=Sun, 1=Mon...
                             firstDayOfWeek.setDate(firstDayOfWeek.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                             
                             const lastDayOfWeek = new Date(firstDayOfWeek.getTime());
                             lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
                             
                             filteredTasks = filteredTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() >= firstDayOfWeek.getTime() && new Date(t.dueDate).getTime() <= lastDayOfWeek.getTime());
                        }
                    }
                    functionResponse = { tasks: filteredTasks.map(({id, title, status, priority, dueDate}) => ({id, title, status, priority, dueDate})) };
                    break;
                }
                default:
                    functionResponse = { error: true, message: "Ismeretlen funkció." };
            }

            return [{ functionResponse: { name: call.name, response: functionResponse } }];
        } catch (error) {
            console.error("Function call error:", error);
            onAddNotification({ message: `Hiba a(z) ${call.name} funkció végrehajtása közben.`, type: 'error' });
            return [{ functionResponse: { name: call.name, response: { error: true, message: 'Hiba történt a funkció végrehajtása közben.' } } }];
        }
    }, [tasks, onAddTask, onAddNotification]);

    const handleSend = useCallback(async (prompt: string) => {
        if (!prompt.trim() || !chat) return;

        setIsLoading(true);
        const text = prompt.trim();
        setUserInput('');
        
        setMessages(prev => [...prev, { id: `user-${Date.now()}`, text, sender: 'user' }]);

        let currentBotMessageId = `bot-${Date.now()}`;
        setMessages(prev => [...prev, { id: currentBotMessageId, text: '', sender: 'bot' }]);
        
        try {
            let stream = await chat.sendMessageStream({ message: text });

            for await (const chunk of stream) {
                if (chunk.functionCalls) {
                    // Remove the placeholder action message and the empty bot message
                    setMessages(prev => prev.filter(m => !m.isAction && m.id !== currentBotMessageId));
                    const functionCallResult = await handleFunctionCall(chunk.functionCalls);
                    // Get new stream from function response
                    stream = await chat.sendMessageStream({ message: functionCallResult });
                    // Add a new empty message for the final response
                    currentBotMessageId = `bot-${Date.now()}-2`;
                    setMessages(prev => [...prev, { id: currentBotMessageId, text: '', sender: 'bot' }]);

                } else if (chunk.text) {
                     setMessages(prev => prev.map(msg => 
                        msg.id === currentBotMessageId ? { ...msg, text: msg.text + chunk.text } : msg
                    ));
                }
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => prev.map(msg => 
                msg.id === currentBotMessageId ? { ...msg, text: "Sajnálom, hiba történt a válasszal.", isError: true } : msg
            ));
        } finally {
            setIsLoading(false);
        }
    }, [chat, handleFunctionCall]);

    // Voice Input Handling
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.lang = 'hu-HU';
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript;
                setUserInput(transcript);
            };
            recognitionRef.current.onend = () => setIsListening(false);
            recognitionRef.current.onerror = (event) => { console.error('Speech recognition error:', event.error); setIsListening(false); };
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            recognitionRef.current?.start();
        }
        setIsListening(!isListening);
    };

    return (
        <View title="Gemini Általános Chat" subtitle="Kérdezzen bármit, vagy adjon utasításokat az alkalmazás kezeléséhez.">
            <div className="chat-view">
                <div className="chat-messages">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`message-bubble-wrapper ${msg.sender === 'user' ? 'user-message' : 'bot-message'}`}>
                             {msg.sender === 'bot' && <div className="avatar"><span className="material-symbols-outlined">smart_toy</span></div>}
                             <div className={`message-bubble ${msg.isAction ? 'action-message' : ''} ${msg.isError ? 'error-message-chat' : ''}`}>
                                {msg.isAction ? (
                                    <>
                                        <span className="material-symbols-outlined action-icon">settings_b_roll</span>
                                        <p>{msg.text}</p>
                                    </>
                                ) : (
                                    <div className="markdown-content">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && !messages.some(m => m.isAction) && (
                         <div className="message-bubble-wrapper bot-message">
                            <div className="avatar"><span className="material-symbols-outlined settings_b_roll">settings_b_roll</span></div>
                             <div className="message-bubble">
                                <div className="markdown-content">Gondolkodom...</div>
                             </div>
                         </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="chat-input-area">
                     {recognitionRef.current && (
                        <button onClick={toggleListening} className={`mic-button button button-icon-only ${isListening ? 'listening' : ''}`} disabled={isLoading}>
                            <span className="material-symbols-outlined">{isListening ? 'mic' : 'mic_none'}</span>
                        </button>
                    )}
                    <textarea
                        className="chat-input"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Írjon üzenetet, vagy használja a mikrofont..."
                        rows={1}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(userInput); } }}
                        disabled={isLoading}
                    />
                    <button className="send-button button button-primary" onClick={() => handleSend(userInput)} disabled={isLoading || !userInput.trim()}>
                        {isLoading ? ( <span className="material-symbols-outlined progress_activity">progress_activity</span> ) : ( <span className="material-symbols-outlined">send</span> )}
                    </button>
                </div>
            </div>
        </View>
    );
};

const AiMeetingView = ({ ai, onAddTasksBatch, onAddNotification }) => {
    const [mode, setMode] = useState<'record' | 'paste'>('record');
    const [isRecording, setIsRecording] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const [fullTranscript, setFullTranscript] = useState('');
    const recognitionRef = useRef<any>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<{ summary: string; tasks: any[] } | null>(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'hu-HU';

            recognitionRef.current.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                setLiveTranscript(fullTranscript + finalTranscript + interimTranscript);
                if (finalTranscript) {
                    setFullTranscript(prev => prev + finalTranscript + ' ');
                }
            };
            recognitionRef.current.onerror = (event) => console.error('Speech recognition error:', event.error);
        }
    }, [fullTranscript]);

    const handleToggleRecording = () => {
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
            if (liveTranscript.trim()) {
                handleProcessTranscript(liveTranscript);
            }
        } else {
            setFullTranscript('');
            setLiveTranscript('');
            setAnalysisResult(null);
            recognitionRef.current?.start();
            setIsRecording(true);
        }
    };

    const handleProcessTranscript = async (transcriptToProcess) => {
        if (!transcriptToProcess.trim()) return;
        setIsLoading(true);
        setAnalysisResult(null);

        const schema = {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING, description: "A megbeszélés rövid, 3-4 mondatos összefoglalója." },
                tasks: {
                    type: Type.ARRAY,
                    description: "A megbeszélésen elhangzott konkrét, végrehajtható feladatok listája, felelősök megnevezése nélkül.",
                    items: {
                        type: Type.OBJECT,
                        properties: { title: { type: Type.STRING, description: "A feladat címe." } },
                        required: ['title']
                    }
                }
            },
            required: ['summary', 'tasks']
        };

        const prompt = `Te egy intelligens meeting asszisztens vagy. A feladatod, hogy elemezd a következő megbeszélés leiratát. Készíts egy rövid összefoglalót a megbeszélésről, és szedd ki a konkrét, végrehajtható feladatokat. Válaszodat a megadott JSON séma szerint add meg.\n\nLeirat:\n"${transcriptToProcess}"`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            const result = JSON.parse(response.text.trim());
            setAnalysisResult({
                summary: result.summary || '',
                tasks: Array.isArray(result.tasks) ? result.tasks.map((task: { title: string }) => ({ ...task, id: `sugg-${Math.random()}`, checked: true })) : []
            });
        } catch (err) {
            console.error("AI Transcript Error:", err);
            onAddNotification({ message: 'Hiba a leirat feldolgozása közben.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleToggleSuggestedTask = (taskId: string) => {
        if (!analysisResult) return;
        setAnalysisResult(prev => ({
            ...prev!,
            tasks: prev!.tasks.map(t => t.id === taskId ? { ...t, checked: !t.checked } : t)
        }));
    };

    const handleAddSelectedTasks = () => {
        if (!analysisResult) return;
        const tasksToAdd = analysisResult.tasks
            .filter(t => t.checked)
            .map(t => ({
                title: t.title,
                priority: 'Közepes' as TaskPriority,
                category: 'Meeting' as TaskCategory,
            }));
        if (tasksToAdd.length > 0) {
            onAddTasksBatch(tasksToAdd);
            setAnalysisResult(null);
            setFullTranscript('');
            setLiveTranscript('');
        }
    };
    
    return (
        <View title="Meeting Asszisztens" subtitle="Rögzítsen megbeszélést vagy illesszen be leiratot az AI elemzéshez.">
            <div className="meeting-view-container">
                <div className="meeting-controls card">
                    <button onClick={handleToggleRecording} className={`button button-primary record-button ${isRecording ? 'recording' : ''}`} disabled={isLoading}>
                        <span className="material-symbols-outlined">{isRecording ? 'stop_circle' : 'mic'}</span>
                        {isRecording ? 'Megállítás és Elemzés' : 'Meeting Indítása'}
                    </button>
                    <p>A böngésző engedélyt fog kérni a mikrofon használatához. A felvétel leállítása után az AI automatikusan elemzi a szöveget.</p>
                </div>

                <div className="meeting-content-grid">
                    <div className="card live-transcript-card">
                        <h4>Élő Átirat</h4>
                        {isRecording && <p className="recording-indicator">Felvétel folyamatban...</p>}
                        <div className="transcript-box">
                            {liveTranscript || "A felvétel elindítása után itt jelenik meg a szöveg..."}
                        </div>
                    </div>
                    <div className="card analysis-results-card">
                        <h4>Elemzés Eredményei</h4>
                         {isLoading && <SkeletonLoader lines={5}/>}
                         {!isLoading && !analysisResult && (
                            <div className="empty-state-placeholder" style={{border: 'none'}}>
                                <p>A felvétel leállítása után az eredmények itt jelennek meg.</p>
                            </div>
                        )}
                        {analysisResult && (
                            <div className="analysis-results-grid">
                                {analysisResult.summary && (
                                    <div className="result-summary">
                                        <h5>Összefoglaló</h5>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult.summary}</ReactMarkdown>
                                    </div>
                                )}
                                {analysisResult.tasks.length > 0 && (
                                    <div className="result-action-items">
                                        <h5>Akciópontok</h5>
                                        <ul className="suggested-task-list">
                                            {analysisResult.tasks.map(task => (
                                                <li key={task.id}>
                                                    <input type="checkbox" checked={task.checked} onChange={() => handleToggleSuggestedTask(task.id)} id={`task-${task.id}`} />
                                                    <label htmlFor={`task-${task.id}`}>{task.title}</label>
                                                </li>
                                            ))}
                                        </ul>
                                        <button onClick={handleAddSelectedTasks} className="button button-primary">Kijelöltek Hozzáadása a Feladatokhoz</button>
                                    </div>
                                )}
                                 {fullTranscript && (
                                    <details className="result-full-transcript">
                                        <summary>Teljes leirat megtekintése</summary>
                                        <p>{fullTranscript}</p>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </View>
    );
};


// --- NEW CREATIVE VIEW ---
const AiCreativeView = ({ ai, onSaveToDocs, onAddNotification }) => {
    const [activeTab, setActiveTab] = useState('image');
    // Image state
    const [imagePrompt, setImagePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [imageResults, setImageResults] = useState([]);
    const [imageError, setImageError] = useState('');
    // Video state
    const [videoPrompt, setVideoPrompt] = useState('');
    const [videoImageFile, setVideoImageFile] = useState<File | null>(null);
    const [videoImagePreview, setVideoImagePreview] = useState<string | null>(null);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoResult, setVideoResult] = useState<string | null>(null);
    const [videoError, setVideoError] = useState('');
    const [videoLoadingMessage, setVideoLoadingMessage] = useState('');
    
    const handleGenerateImage = async () => {
        if (!imagePrompt.trim()) { setImageError('Kérjük, adjon meg egy leírást a képhez.'); return; }
        setIsGeneratingImage(true); setImageError(''); setImageResults([]);
        try {
            const response = await ai.models.generateImages({
                model: 'imagen-3.0-generate-002', prompt: imagePrompt,
                config: { numberOfImages: 2, outputMimeType: 'image/jpeg', aspectRatio: aspectRatio, },
            });
            setImageResults(response.generatedImages);
        } catch (err) {
            console.error("Image generation error:", err);
            setImageError("Hiba történt a kép generálása közben. Próbálja újra később.");
            onAddNotification({ message: 'Hiba a kép generálása közben.', type: 'error' });
        } finally { setIsGeneratingImage(false); }
    };
    
    const handleSaveImage = (base64Image, prompt) => {
        onSaveToDocs({ type: 'image', title: `AI Kép: ${prompt.substring(0, 30)}...`, content: base64Image, });
        onAddNotification({ message: 'Kép sikeresen a dokumentumokhoz mentve!', type: 'success' });
    };

    const handleVideoImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setVideoImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => { setVideoImagePreview(reader.result as string); };
            reader.readAsDataURL(file);
        }
    };
    
    const handleGenerateVideo = async () => {
        if (!videoPrompt.trim()) { setVideoError('Kérjük, adjon meg egy leírást a videóhoz.'); return; }
        setIsGeneratingVideo(true); setVideoError(''); setVideoResult(null);
        setVideoLoadingMessage('Videógenerálás indítása...');

        try {
            const imagePart = videoImageFile ? { imageBytes: await fileToBase64(videoImageFile), mimeType: videoImageFile.type } : undefined;
            
            let operation = await ai.models.generateVideos({
                model: 'veo-2.0-generate-001', prompt: videoPrompt, image: imagePart,
                config: { numberOfVideos: 1 }
            });

            setVideoLoadingMessage('Az AI feldolgozza a kérést (ez eltarthat pár percig)...');
            
            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10 seconds
                setVideoLoadingMessage('Státusz ellenőrzése...');
                operation = await ai.operations.getVideosOperation({operation: operation});
            }

            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink) {
                 setVideoLoadingMessage('Videó letöltése...');
                 // The response.body contains the MP4 bytes. You must append an API key when fetching from the download link.
                 const response = await fetch(`${downloadLink}&key=${API_KEY}`);
                 const blob = await response.blob();
                 setVideoResult(URL.createObjectURL(blob));
            } else {
                throw new Error("Nem sikerült lekérni a videó URL-jét.");
            }

        } catch (err) {
             console.error("Video generation error:", err);
             setVideoError("Hiba történt a videó generálása közben. Próbálja újra később.");
             onAddNotification({ message: 'Hiba a videó generálása közben.', type: 'error' });
        } finally {
            setIsGeneratingVideo(false);
            setVideoLoadingMessage('');
        }
    };


    const aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];

    return (
        <View title="Kreatív Eszközök" subtitle="Hozzon létre egyedi képeket és videókat a Gemini segítségével.">
            <div className="creative-view-container">
                <div className="card generation-form-card">
                    <div className="creative-view-tabs">
                        <button onClick={() => setActiveTab('image')} className={activeTab === 'image' ? 'active' : ''}>Képgenerálás</button>
                        <button onClick={() => setActiveTab('video')} className={activeTab === 'video' ? 'active' : ''}>Videógenerálás</button>
                    </div>

                    {activeTab === 'image' && (
                        <div className="generation-form">
                            <div className="form-group">
                                <label htmlFor="image-prompt">Kép Leírása</label>
                                <textarea id="image-prompt" value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} placeholder="Pl. egy cica szkafanderben a Holdon, olajfestmény stílusban" rows={4} disabled={isGeneratingImage}/>
                            </div>
                            <div className="form-group">
                                <label>Képarány</label>
                                <div className="aspect-ratio-selector">
                                    {aspectRatios.map(ratio => (
                                        <label key={ratio} className="aspect-ratio-option">
                                            <input type="radio" name="aspect-ratio" value={ratio} checked={aspectRatio === ratio} onChange={e => setAspectRatio(e.target.value)} disabled={isGeneratingImage}/>
                                            <div className="aspect-ratio-visual" data-ratio={ratio} title={ratio}><span>{ratio}</span></div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {imageError && <p className="error-message" style={{textAlign: 'left', marginBottom: 'var(--spacing-md)'}}>{imageError}</p>}
                            <button onClick={handleGenerateImage} disabled={isGeneratingImage} className="button button-primary generate-button">
                                {isGeneratingImage ? (<><span className="material-symbols-outlined progress_activity"></span><span>Generálás...</span></>) : (<><span className="material-symbols-outlined">auto_awesome</span><span>Kép Létrehozása</span></>)}
                            </button>
                        </div>
                    )}

                    {activeTab === 'video' && (
                        <div className="generation-form">
                             <div className="form-group">
                                <label htmlFor="video-prompt">Videó Leírása</label>
                                <textarea id="video-prompt" value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} placeholder="Pl. egy neon hologram macska száguld egy futurisztikus városban" rows={4} disabled={isGeneratingVideo}/>
                            </div>
                            <div className="form-group">
                                <label>Kezdőkép (opcionális)</label>
                                <div className="video-image-upload">
                                    <input type="file" id="video-image-file" accept="image/*" onChange={handleVideoImageChange} disabled={isGeneratingVideo} />
                                    {videoImagePreview ? <img src={videoImagePreview} alt="Előnézet" className="image-preview" /> : <div className="upload-placeholder">Kép feltöltése</div>}
                                </div>
                            </div>
                            {videoError && <p className="error-message" style={{textAlign: 'left', marginBottom: 'var(--spacing-md)'}}>{videoError}</p>}
                            <button onClick={handleGenerateVideo} disabled={isGeneratingVideo} className="button button-primary generate-button">
                                {isGeneratingVideo ? (<><span className="material-symbols-outlined progress_activity"></span><span>Generálás...</span></>) : (<><span className="material-symbols-outlined">movie</span><span>Videó Létrehozása</span></>)}
                            </button>
                        </div>
                    )}
                </div>

                <div className="card image-results-card">
                     <div className="results-header"><h3>Eredmények</h3></div>
                     {activeTab === 'image' && (
                        <>
                            {isGeneratingImage && (<div className="empty-state-placeholder" style={{ background: 'transparent', border: 'none' }}><span className="material-symbols-outlined progress_activity"></span><p>Képek készítése...</p></div>)}
                            {!isGeneratingImage && imageResults.length > 0 && (
                                <div className="image-results-grid">
                                    {imageResults.map((img, index) => (
                                        <div key={index} className="generated-image-container">
                                            <img src={`data:image/jpeg;base64,${img.image.imageBytes}`} alt={imagePrompt} />
                                            <button className="button button-secondary button-save-to-docs" onClick={() => handleSaveImage(img.image.imageBytes, imagePrompt)}><span className="material-symbols-outlined">save</span>Mentés a dokumentumokba</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!isGeneratingImage && imageResults.length === 0 && !imageError && (<div className="empty-state-placeholder"><span className="material-symbols-outlined">image_search</span><p>A generált képek itt fognak megjelenni.</p></div>)}
                        </>
                     )}
                     {activeTab === 'video' && (
                        <>
                            {isGeneratingVideo && (<div className="empty-state-placeholder" style={{ background: 'transparent', border: 'none' }}><span className="material-symbols-outlined progress_activity"></span><p>Videó generálása...</p><span className="video-loading-message">{videoLoadingMessage}</span></div>)}
                            {!isGeneratingVideo && videoResult && (
                                <div className="video-result-container">
                                    <video src={videoResult} controls autoPlay loop />
                                    <a href={videoResult} download={`ai_video_${Date.now()}.mp4`} className="button button-secondary"><span className="material-symbols-outlined">download</span>Videó letöltése</a>
                                </div>
                            )}
                             {!isGeneratingVideo && !videoResult && !videoError && (<div className="empty-state-placeholder"><span className="material-symbols-outlined">video_library</span><p>A generált videó itt fog megjelenni.</p></div>)}
                        </>
                     )}
                </div>
            </div>
        </View>
    );
};

const SettingsView = ({ theme, setTheme, onAddNotification }) => {
    
    const handleThemeChange = (newTheme: 'light' | 'dark') => {
        setTheme(newTheme);
        onAddNotification({ message: `Téma megváltoztatva: ${newTheme === 'dark' ? 'Sötét' : 'Világos'}`, type: 'success' });
    };

    return (
        <View title="Beállítások" subtitle="Alkalmazás testreszabása.">
            <div className="settings-view-layout">
                <div className="card settings-card">
                    <h4><span className="material-symbols-outlined">palette</span>Téma</h4>
                    <p>Válasszon a világos és sötét mód között.</p>
                    <div className="theme-selector">
                        <button onClick={() => handleThemeChange('light')} className={`button ${theme === 'light' ? 'button-primary' : 'button-secondary'}`}>
                            <span className="material-symbols-outlined">light_mode</span> Világos
                        </button>
                        <button onClick={() => handleThemeChange('dark')} className={`button ${theme === 'dark' ? 'button-primary' : 'button-secondary'}`}>
                            <span className="material-symbols-outlined">dark_mode</span> Sötét
                        </button>
                    </div>
                </div>
                 <div className="card settings-card">
                    <h4><span className="material-symbols-outlined">notifications</span>Értesítések</h4>
                    <p>Értesítési beállítások (hamarosan).</p>
                    <div className="form-group-switch">
                         <label htmlFor="email-notif">Email értesítések</label>
                         <input type="checkbox" id="email-notif" disabled />
                    </div>
                     <div className="form-group-switch">
                         <label htmlFor="push-notif">Push értesítések</label>
                         <input type="checkbox" id="push-notif" disabled />
                    </div>
                </div>
                 <div className="card settings-card">
                    <h4><span className="material-symbols-outlined">key</span>API Kulcs</h4>
                    <p>A Gemini API kulcs a környezeti változókból van betöltve. Itt nem módosítható.</p>
                     <input type="text" value="******************" disabled />
                </div>
            </div>
        </View>
    );
};

const AiContactAssistant = ({ contact, relatedItems, ai, onAddNotification }) => {
    const [emailPrompt, setEmailPrompt] = useState('');
    const [generatedEmail, setGeneratedEmail] = useState('');
    const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

    const [summary, setSummary] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);
    
    useEffect(() => {
        // Reset state when contact changes
        setEmailPrompt('');
        setGeneratedEmail('');
        setSummary('');
    }, [contact]);

    const handleGenerateEmail = async () => {
        if (!emailPrompt.trim()) return;
        setIsGeneratingEmail(true);
        setGeneratedEmail('');
        const prompt = `Te egy profi üzleti asszisztens vagy. Írj egy udvarias, professzionális emailt a következő személynek a megadott utasítások alapján. A válaszodban csak magát az email szövegét add vissza, mindenféle bevezető vagy magyarázat nélkül.\n\nCímzett neve: ${contact.name}\nCímzett email címe: ${contact.email}\n\nUtasítás: "${emailPrompt}"`;

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setGeneratedEmail(response.text);
        } catch (err) {
            console.error("AI Email Generation Error:", err);
            onAddNotification({ message: 'Hiba az email piszkozat generálása közben.', type: 'error' });
        } finally {
            setIsGeneratingEmail(false);
        }
    };
    
    const handleSummarize = async () => {
        setIsSummarizing(true);
        setSummary('');
        
        const contextData = `
            Jegyzetek: ${contact.notes || 'Nincs'}
            Kapcsolódó projektek: ${relatedItems.relatedProjects.map(p => p.title).join(', ') || 'Nincs'}
            Kapcsolódó pályázatok: ${relatedItems.relatedProposals.map(p => p.title).join(', ') || 'Nincs'}
            Legutóbbi emailek (tárgy): ${relatedItems.relatedEmails.slice(0, 3).map(e => e.subject).join('; ') || 'Nincs'}
        `;

        const prompt = `Te egy intelligens asszisztens vagy. A feladatod, hogy összefoglald a kapcsolatot egy személlyel a megadott adatok alapján. Adj egy rövid, lényegretörő, 3-4 mondatos összefoglalót a kapcsolat státuszáról és a legutóbbi interakciókról. A válaszodat magyarul add meg.\n\nSzemély neve: ${contact.name}\nAdatok:\n${contextData}`;

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setSummary(response.text);
        } catch (err) {
            console.error("AI Summary Error:", err);
            onAddNotification({ message: 'Hiba az összefoglaló generálása közben.', type: 'error' });
        } finally {
            setIsSummarizing(false);
        }
    };

    return (
        <aside className="ai-contact-assistant card">
            <h4><span className="material-symbols-outlined">psychology</span>AI Asszisztens</h4>
            <div className="ai-assistant-section">
                <h5>Email piszkozat generálása</h5>
                <textarea 
                    value={emailPrompt}
                    onChange={e => setEmailPrompt(e.target.value)}
                    placeholder="Írja le röviden, miről szóljon az email..."
                    rows={3}
                    disabled={isGeneratingEmail}
                />
                <button className="button button-secondary" onClick={handleGenerateEmail} disabled={isGeneratingEmail || !emailPrompt.trim()}>
                    {isGeneratingEmail ? <span className="material-symbols-outlined progress_activity"></span> : <span className="material-symbols-outlined">edit_note</span>}
                    Piszkozat
                </button>
                {generatedEmail && (
                    <div className="ai-result-box">
                        <pre>{generatedEmail}</pre>
                        <button className="button button-secondary" onClick={() => navigator.clipboard.writeText(generatedEmail)}>
                            <span className="material-symbols-outlined">content_copy</span>Másolás
                        </button>
                    </div>
                )}
            </div>

            <div className="ai-assistant-section">
                <h5>Interakciók Összefoglalása</h5>
                <button className="button button-secondary" onClick={handleSummarize} disabled={isSummarizing}>
                     {isSummarizing ? <span className="material-symbols-outlined progress_activity"></span> : <span className="material-symbols-outlined">summarize</span>}
                    Kapcsolat Összefoglalása
                </button>
                 {summary && (
                    <div className="ai-result-box">
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                    </div>
                )}
            </div>
        </aside>
    );
};

const ContactsView = ({ contacts, projects, proposals, emails, onOpenContactModal, ai, onAddNotification }) => {
    const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id || null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredContacts = contacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const selectedContact = contacts.find(c => c.id === selectedContactId);

    const relatedItems = useMemo(() => {
        if (!selectedContact) return { relatedProjects: [], relatedProposals: [], relatedEmails: [] };
        const relatedProjects = projects.filter(p => selectedContact.linkedProjectIds?.includes(p.id));
        const relatedProposals = proposals.filter(p => selectedContact.linkedProposalIds?.includes(p.id));
        const relatedEmails = emails.filter(e => e.sender === selectedContact.email || e.recipient === selectedContact.email)
            .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return { relatedProjects, relatedProposals, relatedEmails };
    }, [selectedContact, projects, proposals, emails]);

    return (
        <View 
            title="Kapcsolatok" 
            subtitle="Ügyfelek, partnerek és csapattagok kezelése."
            actions={<button className="button button-primary" onClick={() => onOpenContactModal()}><span className="material-symbols-outlined">add</span>Új Kapcsolat</button>}
        >
            <div className="contacts-view-layout card">
                <aside className="contact-list-pane">
                    <div className="contact-search-bar">
                        <input type="search" placeholder="Kapcsolat keresése..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <ul className="contact-list">
                        {filteredContacts.map(contact => (
                            <li 
                                key={contact.id} 
                                className={`contact-list-item ${selectedContactId === contact.id ? 'selected' : ''}`}
                                onClick={() => setSelectedContactId(contact.id)}
                            >
                                <div className="avatar-sm">{contact.name.charAt(0).toUpperCase()}</div>
                                <div className="contact-item-info">
                                    <span className="contact-name">{contact.name}</span>
                                    <span className="contact-company">{contact.company}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </aside>
                <div className="contact-detail-pane">
                    {selectedContact ? (
                        <>
                            <div className="contact-main-info">
                                <div className="contact-header">
                                    <h3>{selectedContact.name}</h3>
                                    <p>{selectedContact.role} @ {selectedContact.company}</p>
                                </div>
                                <div className="contact-info-grid">
                                    {selectedContact.email && <span><span className="material-symbols-outlined">email</span>{selectedContact.email}</span>}
                                    {selectedContact.phone && <span><span className="material-symbols-outlined">phone</span>{selectedContact.phone}</span>}
                                </div>
                                <div className="contact-actions">
                                    <button className="button button-secondary" onClick={() => onOpenContactModal(selectedContact)}>
                                        <span className="material-symbols-outlined">edit</span>Szerkesztés
                                    </button>
                                </div>
                                <div className="contact-notes">
                                    <h4>Jegyzetek</h4>
                                    <p>{selectedContact.notes || 'Nincsenek jegyzetek ehhez a kontakthoz.'}</p>
                                </div>
                                <div className="related-items-grid">
                                    <div className="related-item-list">
                                        <h4>Kapcsolódó Projektek ({relatedItems.relatedProjects.length})</h4>
                                        <ul>{relatedItems.relatedProjects.map(p => <li key={p.id}>{p.title}</li>)}</ul>
                                    </div>
                                     <div className="related-item-list">
                                        <h4>Kapcsolódó Pályázatok ({relatedItems.relatedProposals.length})</h4>
                                        <ul>{relatedItems.relatedProposals.map(p => <li key={p.id}>{p.title}</li>)}</ul>
                                    </div>
                                     <div className="related-item-list">
                                        <h4>Kapcsolódó Emailek ({relatedItems.relatedEmails.length})</h4>
                                        <ul>{relatedItems.relatedEmails.slice(0, 5).map(e => <li key={e.id} title={e.subject}>{e.subject}</li>)}</ul>
                                    </div>
                                </div>
                            </div>
                            <AiContactAssistant contact={selectedContact} relatedItems={relatedItems} ai={ai} onAddNotification={onAddNotification} />
                        </>
                    ) : (
                        <div className="empty-state-placeholder">
                             <span className="material-symbols-outlined">person_search</span>
                            <p>Válasszon ki egy kapcsolatot a részletek megtekintéséhez.</p>
                        </div>
                    )}
                </div>
            </div>
        </View>
    );
};

const ReportsView = ({ tasks, transactions, projects, trainings, ai }) => {
    const [summary, setSummary] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const taskStats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === 'Kész').length;
        const inProgress = tasks.filter(t => t.status === 'Folyamatban').length;
        const todo = tasks.filter(t => t.status === 'Teendő').length;
        return { total, completed, inProgress, todo, completionRate: total > 0 ? (completed / total) * 100 : 0 };
    }, [tasks]);

    const projectStats = useMemo(() => {
        const total = projects.length;
        const completed = projects.filter(p => p.status === 'Kész').length;
        return { total, completed, completionRate: total > 0 ? (completed / total) * 100 : 0 };
    }, [projects]);

    const financeStats = useMemo(() => {
        const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        return { income, expense, balance: income - expense };
    }, [transactions]);
    
    const generateSummary = async () => {
        setIsLoading(true);
        setSummary('');
        const prompt = `Te egy adatelemző asszisztens vagy. Készíts egy rövid, 1-2 bekezdéses vezetői összefoglalót a felhasználó heti teljesítményéről az alábbi adatok alapján. Emeld ki a sikereket és a lehetséges kockázatokat. A válaszod legyen magyar nyelvű, és markdown formátumú.\n\n**Feladat Statisztikák:**\n- Összes feladat: ${taskStats.total}\n- Befejezett: ${taskStats.completed}\n- Folyamatban: ${taskStats.inProgress}\n\n**Projekt Statisztikák:**\n- Befejezett projektek aránya: ${projectStats.completionRate.toFixed(1)}%\n\n**Pénzügyi Statisztikák:**\n- Havi bevétel: ${financeStats.income} Ft\n- Havi kiadás: ${financeStats.expense} Ft\n`;
        
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setSummary(response.text);
        } catch (err) {
            console.error("AI report summary error:", err);
            setSummary("Hiba történt az összefoglaló generálása közben.");
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <View title="Riportok" subtitle="Teljesítmény és statisztikák áttekintése.">
            <div className="reports-view-layout">
                <div className="report-card card">
                    <h4><span className="material-symbols-outlined">auto_awesome</span>AI Összefoglaló</h4>
                     <button className="button button-primary" onClick={generateSummary} disabled={isLoading}>
                         {isLoading ? 'Generálás...' : 'Heti Jelentés Generálása'}
                     </button>
                     {isLoading && <SkeletonLoader lines={4} />}
                     {summary && (
                        <div className="ai-result-box" style={{marginTop: 'var(--spacing-md)'}}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                        </div>
                     )}
                </div>

                <div className="report-card card">
                    <h4><span className="material-symbols-outlined">task_alt</span>Feladatok</h4>
                    <div className="stat-grid">
                        <div className="stat-item"><span>Befejezett</span><p>{taskStats.completed}</p></div>
                        <div className="stat-item"><span>Folyamatban</span><p>{taskStats.inProgress}</p></div>
                        <div className="stat-item"><span>Teendő</span><p>{taskStats.todo}</p></div>
                    </div>
                    <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${taskStats.completionRate}%` }}></div></div>
                    <p>Teljesítési arány: {taskStats.completionRate.toFixed(1)}%</p>
                </div>
                 <div className="report-card card">
                    <h4><span className="material-symbols-outlined">account_balance_wallet</span>Pénzügyek</h4>
                     <div className="stat-grid">
                        <div className="stat-item income"><span>Bevétel</span><p>{new Intl.NumberFormat('hu-HU').format(financeStats.income)} Ft</p></div>
                        <div className="stat-item expense"><span>Kiadás</span><p>{new Intl.NumberFormat('hu-HU').format(financeStats.expense)} Ft</p></div>
                        <div className="stat-item"><span>Egyenleg</span><p>{new Intl.NumberFormat('hu-HU').format(financeStats.balance)} Ft</p></div>
                    </div>
                </div>
                 <div className="report-card card">
                    <h4><span className="material-symbols-outlined">schema</span>Projektek</h4>
                    <p>Összesen {projectStats.total} projektből {projectStats.completed} van kész.</p>
                    <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${projectStats.completionRate}%` }}></div></div>
                    <p>Teljesítési arány: {projectStats.completionRate.toFixed(1)}%</p>
                </div>
            </div>
        </View>
    );
};

const GlobalHeader = ({ onToggleNav, onOpenSearch, onNavigate }) => {
    const [isDropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleNavigation = (viewId) => {
        onNavigate(viewId);
        setDropdownOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);
    
    return (
        <header className="global-header">
            <button className="mobile-nav-toggle" onClick={onToggleNav}>
                <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="global-header-actions">
                <button className="search-button" onClick={onOpenSearch}>
                    <span className="material-symbols-outlined">search</span>
                    <span>Keresés</span>
                    <kbd>Ctrl+K</kbd>
                </button>
                <div className="user-profile" ref={dropdownRef}>
                    <button className="user-profile-button" onClick={() => setDropdownOpen(!isDropdownOpen)}>
                       <span>Üdv, Felhasználó</span>
                       <div className="avatar-sm">F</div>
                       <span className={`material-symbols-outlined chevron ${isDropdownOpen ? 'open' : ''}`}>expand_more</span>
                   </button>
                    {isDropdownOpen && (
                        <div className="profile-dropdown card">
                            <ul>
                                <li><button onClick={() => handleNavigation('settings')}><span className="material-symbols-outlined">account_circle</span>Profil</button></li>
                                <li><button onClick={() => handleNavigation('settings')}><span className="material-symbols-outlined">settings</span>Beállítások</button></li>
                                <li className="separator"></li>
                                <li><button><span className="material-symbols-outlined">logout</span>Kijelentkezés</button></li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

const GlobalSearchModal = ({ isOpen, onClose, ai, allData, onNavigate, onAddNotification }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setResults(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSearch = useCallback(async (term) => {
        if (!term.trim()) {
            setResults(null);
            return;
        }

        const lowerTerm = term.toLowerCase();

        // Local search first
        const localResults = {
            tasks: allData.tasks.filter(i => i.title.toLowerCase().includes(lowerTerm)).slice(0, 5),
            projects: allData.projects.filter(i => i.title.toLowerCase().includes(lowerTerm)).slice(0, 5),
            proposals: allData.proposals.filter(i => i.title.toLowerCase().includes(lowerTerm)).slice(0, 5),
            contacts: allData.contacts.filter(i => i.name.toLowerCase().includes(lowerTerm)).slice(0, 5),
            docs: allData.docs.filter(i => i.title.toLowerCase().includes(lowerTerm)).slice(0, 5),
            emails: allData.emails.filter(i => i.subject.toLowerCase().includes(lowerTerm) || i.body.toLowerCase().includes(lowerTerm)).slice(0, 5),
        };
        setResults({ local: localResults, web: null });

        // If it looks like a question, perform a web search
        if (term.includes('?') || term.split(' ').length > 3) {
            setIsLoading(true);
            try {
                const response = await ai.models.generateContent({
                   model: "gemini-2.5-flash",
                   contents: term,
                   config: { tools: [{googleSearch: {}}] },
                });
                const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
                setResults(prev => ({ 
                    ...prev, 
                    web: { 
                        answer: response.text, 
                        sources: Array.isArray(groundingChunks) ? groundingChunks : []
                    } 
                }));
            } catch (err) {
                console.error("Web search error:", err);
                onAddNotification({ message: 'Hiba a webes keresés során.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        }
    }, [ai, allData, onAddNotification]);

    const debouncedSearch = useCallback(
        (nextValue) => {
            const timer = setTimeout(() => {
                handleSearch(nextValue);
            }, 300); // 300ms debounce time
            return () => clearTimeout(timer);
        },
        [handleSearch]
    );

     useEffect(() => {
        if (searchTerm) {
            debouncedSearch(searchTerm);
        } else {
            setResults(null);
        }
    }, [searchTerm, debouncedSearch]);


    const handleResultClick = (viewId, params = {}) => {
        onNavigate(viewId, params);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card global-search-modal" onClick={e => e.stopPropagation()}>
                <div className="search-input-wrapper">
                    <span className="material-symbols-outlined">search</span>
                    <input 
                        ref={inputRef}
                        type="text" 
                        placeholder="Keressen bármire az alkalmazásban, vagy tegyen fel egy kérdést..." 
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value) }}
                    />
                     <button onClick={onClose} className="button-icon-close" style={{position: 'static'}}>&times;</button>
                </div>

                <div className="search-results-container">
                    {isLoading && !results?.web && <div className="empty-state-placeholder" style={{border: 'none'}}><span className="material-symbols-outlined progress_activity"></span><p>Keresés az interneten...</p></div>}
                    
                    {results?.web && (
                        <div className="search-result-group web-results">
                            <h4>Gemini Válasza</h4>
                            <div className="web-answer">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{results.web.answer}</ReactMarkdown>
                            </div>
                            {Array.isArray(results.web.sources) && results.web.sources.length > 0 && (
                                <div className="web-sources">
                                    <h5>Források:</h5>
                                    <ul>
                                        {results.web.sources.map((source: any, index: number) => (
                                            <li key={index}>
                                                <a href={source.web.uri} target="_blank" rel="noopener noreferrer">{source.web.title}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {results?.local && Object.entries(results.local).map(([key, items]) => {
                        if (!Array.isArray(items) || items.length === 0) return null;
                        const categoryInfo = {
                            tasks: { title: 'Feladatok', icon: 'task_alt', view: 'tasks' },
                            projects: { title: 'Projektek', icon: 'schema', view: 'projects' },
                            proposals: { title: 'Pályázatok', icon: 'description', view: 'proposals' },
                            contacts: { title: 'Kapcsolatok', icon: 'contacts', view: 'contacts' },
                            docs: { title: 'Dokumentumok', icon: 'folder', view: 'docs' },
                            emails: { title: 'Emailek', icon: 'mail', view: 'email' },
                        }[key];
                        return (
                             <div key={key} className="search-result-group">
                                <h4>{categoryInfo.title}</h4>
                                <ul className="search-result-list">
                                    {items.map((item: any) => (
                                        <li key={item.id} onClick={() => handleResultClick(categoryInfo.view)}>
                                            <span className="material-symbols-outlined">{categoryInfo.icon}</span>
                                            <span>{item.title || item.name || item.subject}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}

                    {!isLoading && !results && searchTerm && (
                         <div className="empty-state-placeholder" style={{border: 'none'}}>
                            <p>Nincs találat a "{searchTerm}" kifejezésre.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- APP ---
const App = () => {
    const [ai, setAi] = useState<GoogleGenAI | null>(null);
    const [tasks, setTasks] = useState<TaskItem[]>(mockTasks);
    const [docs, setDocs] = useState<DocItem[]>(mockDocs);
    const [projects, setProjects] = useState<Project[]>(mockProjects);
    const [proposals, setProposals] = useState<Proposal[]>(mockProposals);
    const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
    const [budgets, setBudgets] = useState<Budget[]>(mockBudgets);
    const [trainings, setTrainings] = useState<TrainingItem[]>(mockTrainings);
    const [contacts, setContacts] = useState<Contact[]>(mockContacts);
    const [emails, setEmails] = useState<EmailMessage[]>(mockInitialEmails);
    const [plannerEvents, setPlannerEvents] = useState<PlannerEvent[]>(() => generateInitialPlannerEvents(mockTasks, mockProposals));
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    const [activeView, setActiveView] = useState<{ id: string; params?: any }>({ id: 'dashboard' });
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobileNavOpen, setMobileNavOpen] = useState(false);
    
    const [isTaskModalOpen, setTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<TaskItem | null>(null);
    const [taskDefaultValues, setTaskDefaultValues] = useState({});

    const [isEventModalOpen, setEventModalOpen] = useState(false);
    const [eventInitialDate, setEventInitialDate] = useState<string | undefined>(undefined);

    const [isDayDetailModalOpen, setDayDetailModalOpen] = useState(false);
    const [dayDetailModalData, setDayDetailModalData] = useState<{ date: string, events: PlannerEvent[] } | null>(null);

    const [isTransactionModalOpen, setTransactionModalOpen] = useState(false);
    const [isProposalModalOpen, setProposalModalOpen] = useState(false);
    const [isProjectModalOpen, setProjectModalOpen] = useState(false);
    const [isAiProjectModalOpen, setAiProjectModalOpen] = useState(false);
    const [isSearchModalOpen, setSearchModalOpen] = useState(false);

    const [isTrainingModalOpen, setTrainingModalOpen] = useState(false);
    const [currentTraining, setCurrentTraining] = useState<TrainingItem | null>(null);
    const [isAiLearningPathModalOpen, setAiLearningPathModalOpen] = useState(false);

    const [isContactModalOpen, setContactModalOpen] = useState(false);
    const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);

    const [isEmailComposeModalOpen, setEmailComposeModalOpen] = useState(false);
    const [emailComposeData, setEmailComposeData] = useState(null);
    
    const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<Project | null>(null);
    const [selectedProposalForDetail, setSelectedProposalForDetail] = useState<Proposal | null>(null);

    const [notifications, setNotifications] = useState<Notification[]>([]);
    
    const [isDocEditorModalOpen, setDocEditorModalOpen] = useState(false);
    const [docToEdit, setDocToEdit] = useState<DocItem | null>(null);
    const [isImageModalOpen, setImageModalOpen] = useState(false);
    const [imageModalSrc, setImageModalSrc] = useState('');
    
    const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
    const [isAiBudgetSuggestionModalOpen, setAiBudgetSuggestionModalOpen] = useState(false);
    const [isAiFinancialAnalysisModalOpen, setAiFinancialAnalysisModalOpen] = useState(false);
    
    const size = useWindowSize();

    useEffect(() => {
        try {
            const genAI = new GoogleGenAI({ apiKey: API_KEY });
            setAi(genAI);
        } catch(e) {
            console.error(e);
            handleAddNotification({message: "API kulcs hiba. Kérjük, ellenőrizze a beállításokat.", type: 'error'});
        }
    }, []);
    
    useEffect(() => {
        setPlannerEvents(generateInitialPlannerEvents(tasks, proposals));
    }, [tasks, proposals]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleAddNotification = useCallback((notification: Omit<Notification, 'id'>) => {
        const newNotification = { ...notification, id: `notif-${Date.now()}` };
        setNotifications(prev => [newNotification, ...prev]);
        setTimeout(() => {
            setNotifications(current => current.filter(n => n.id !== newNotification.id));
        }, 5000);
    }, []);
    
    const handleDismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleOpenTaskModal = (task = null, defaultValues = {}) => {
        setTaskToEdit(task);
        setTaskDefaultValues(defaultValues);
        setTaskModalOpen(true);
    };
    
    const handleOpenEventModal = (date?: string) => {
        setEventInitialDate(date);
        setEventModalOpen(true);
    };
    
    const handleOpenDayModal = (date: string, events: PlannerEvent[]) => {
        setDayDetailModalData({ date, events });
        setDayDetailModalOpen(true);
    };

    const handleSaveTask = useCallback((taskData) => {
        if (taskData.id) { // Editing existing task
            setTasks(prev => prev.map(t => t.id === taskData.id ? { ...t, ...taskData } : t));
            handleAddNotification({ message: 'Feladat sikeresen frissítve!', type: 'success' });
        } else { // Creating new task
            const newTask: TaskItem = {
                id: `task-${Date.now()}`,
                title: taskData.title,
                description: taskData.description,
                dueDate: taskData.dueDate,
                priority: taskData.priority || 'Közepes',
                category: taskData.category || 'Személyes',
                status: 'Teendő',
                createdAt: new Date().toISOString(),
                projectId: taskData.projectId,
                proposalId: taskData.proposalId,
                trainingId: taskData.trainingId,
                relatedTo: taskData.relatedTo,
            };
            setTasks(prev => [newTask, ...prev]);
            handleAddNotification({ message: 'Feladat sikeresen létrehozva!', type: 'success' });
        }
    }, [handleAddNotification]);
    
    const handleAddTasksBatch = (tasksData: Omit<TaskItem, 'id' | 'createdAt' | 'status'>[]) => {
        const newTasks: TaskItem[] = tasksData.map(taskData => ({
            id: `task-${Date.now()}-${Math.random()}`,
            ...taskData,
            status: 'Teendő',
            createdAt: new Date().toISOString(),
        }));
        setTasks(prev => [...newTasks, ...prev]);
        handleAddNotification({ message: `${newTasks.length} új feladat hozzáadva!`, type: 'success' });
    };
    
    const handleAddEvent = (eventData: Omit<PlannerEvent, 'id'>) => {
        const newEvent: PlannerEvent = {
            id: `event-${Date.now()}`,
            ...eventData
        };
        setPlannerEvents(prev => [...prev, newEvent].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        handleAddNotification({ message: 'Esemény sikeresen létrehozva!', type: 'success' });
    };

    const handleAddProject = (projectData) => {
        const newProject: Project = {
            id: `proj-${Date.now()}`,
            ...projectData,
            status: 'Tervezés'
        };
        setProjects(prev => [newProject, ...prev]);
        handleAddNotification({ message: 'Projekt sikeresen létrehozva!', type: 'success' });
    };
    
    const handleAddProjectWithTasks = (projectData, tasksData: {title: string, description: string}[]) => {
        const newProjectId = `proj-${Date.now()}`;
        const newProject: Project = {
            ...projectData,
            id: newProjectId,
            status: 'Tervezés',
        };
        const newTasks: TaskItem[] = tasksData.map((taskData, index) => ({
            id: `task-${Date.now()}-${index}`,
            title: taskData.title,
            description: taskData.description,
            status: 'Teendő',
            priority: 'Közepes',
            category: 'Projekt',
            projectId: newProjectId,
            createdAt: new Date().toISOString(),
        }));

        setProjects(prev => [newProject, ...prev]);
        setTasks(prev => [...newTasks, ...prev]);
        handleAddNotification({ message: `Projekt "${newProject.title}" és ${newTasks.length} feladat létrehozva!`, type: 'success' });
    };
    
    const handleAddTrainingWithPath = (trainingData, tasksData: {title: string, description: string}[]) => {
        const newTrainingId = `train-${Date.now()}`;
        const newTraining: TrainingItem = {
            id: newTrainingId,
            title: trainingData.title,
            description: trainingData.description,
            provider: trainingData.provider,
            status: 'Nem elkezdett',
            progress: 0,
        };
        const newTasks: TaskItem[] = tasksData.map((taskData, index) => ({
            id: `task-${Date.now()}-${index}`,
            title: taskData.title,
            description: taskData.description,
            status: 'Teendő',
            priority: 'Közepes',
            category: 'Tanulás',
            trainingId: newTrainingId,
            createdAt: new Date().toISOString(),
        }));

        setTrainings(prev => [newTraining, ...prev]);
        setTasks(prev => [...newTasks, ...prev]);
        handleAddNotification({ message: `Képzés "${newTraining.title}" és ${newTasks.length} feladat létrehozva!`, type: 'success' });
    };

    const handleAddTransaction = (transactionData) => {
        const newTransaction: Transaction = {
            id: `tran-${Date.now()}`,
            ...transactionData
        };
        setTransactions(prev => [newTransaction, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        handleAddNotification({ message: 'Tranzakció sikeresen rögzítve!', type: 'success' });
    };
    
    const handleAddProposal = (proposalData) => {
        const newProposal: Proposal = {
            id: `prop-${Date.now()}`,
            ...proposalData,
            status: 'Készül',
        };
        setProposals(prev => [newProposal, ...prev]);
        handleAddNotification({ message: 'Pályázat sikeresen létrehozva!', type: 'success' });
    };

    const handleSaveProposal = (proposalData: Partial<Proposal>) => {
        setProposals(prev => prev.map(p => p.id === proposalData.id ? { ...p, ...proposalData } : p));
        handleAddNotification({ message: 'Pályázat sikeresen frissítve!', type: 'success' });
    };


    const handleSaveImageToDocs = (docData: Omit<DocItem, 'id' | 'createdAt'>) => {
        const newDoc: DocItem = {
            id: `doc-${Date.now()}`,
            ...docData,
            createdAt: new Date().toISOString(),
        };
        setDocs(prev => [newDoc, ...prev]);
    };
    
    const handleAddTraining = (trainingData) => {
        const newTraining = {
            id: `train-${Date.now()}`,
            ...trainingData,
            status: 'Nem elkezdett',
            progress: 0,
        };
        setTrainings(prev => [newTraining, ...prev]);
        handleAddNotification({ message: 'Képzés sikeresen hozzáadva!', type: 'success' });
    };
    
    const handleSaveTraining = (trainingData: Partial<TrainingItem> & { id?: string }) => {
        if (trainingData.id) {
            setTrainings(prev => prev.map(t => t.id === trainingData.id ? {...t, ...trainingData} : t));
            handleAddNotification({ message: 'Képzés frissítve!', type: 'success' });
        } else {
            const newTraining: TrainingItem = {
                id: `train-${Date.now()}`,
                title: trainingData.title || 'Cím nélküli képzés',
                provider: trainingData.provider || 'Ismeretlen',
                description: trainingData.description,
                url: trainingData.url,
                progress: trainingData.progress ?? 0,
                status: (trainingData.progress ?? 0) === 100 ? 'Befejezett' : ((trainingData.progress ?? 0) > 0 ? 'Folyamatban' : 'Nem elkezdett'),
            };
            setTrainings(prev => [newTraining, ...prev]);
            handleAddNotification({ message: 'Képzés létrehozva!', type: 'success' });
        }
        setCurrentTraining(null);
        setTrainingModalOpen(false);
    };

    const handleOpenTrainingModal = (training: TrainingItem | null = null) => {
        setCurrentTraining(training);
        setTrainingModalOpen(true);
    };
    
    const handleOpenContactModal = (contact = null) => {
        setContactToEdit(contact);
        setContactModalOpen(true);
    };
    
    const handleOpenProjectDetail = (project: Project) => {
        setSelectedProjectForDetail(project);
    };

    const handleOpenProposalDetail = (proposal: Proposal) => {
        setSelectedProposalForDetail(proposal);
    };

    const handleSaveContact = (contactData) => {
        if (contactData.id) {
            setContacts(prev => prev.map(c => c.id === contactData.id ? { ...c, ...contactData } : c));
            handleAddNotification({ message: 'Kapcsolat sikeresen frissítve!', type: 'success' });
        } else {
            const newContact: Contact = {
                id: `contact-${Date.now()}`,
                ...contactData,
            };
            setContacts(prev => [newContact, ...prev]);
            handleAddNotification({ message: 'Kapcsolat sikeresen létrehozva!', type: 'success' });
        }
        setContactModalOpen(false);
    };

    const handleOpenDocEditor = (doc: DocItem | null) => {
        if (doc) {
            setDocToEdit(doc);
        } else { // New note
            const newDoc: DocItem = {
                id: `doc-${Date.now()}`,
                type: 'note',
                title: 'Új jegyzet',
                content: '',
                createdAt: new Date().toISOString(),
            };
            setDocs(prev => [newDoc, ...prev]);
            setDocToEdit(newDoc);
        }
        setDocEditorModalOpen(true);
    };

    const handleSaveDoc = (docId: string, newTitle: string, newContent: string) => {
        setDocs(prevDocs => prevDocs.map(doc =>
            doc.id === docId ? { ...doc, title: newTitle, content: newContent } : doc
        ));
        setDocEditorModalOpen(false);
        handleAddNotification({ message: 'Dokumentum mentve!', type: 'success' });
    };
    
    const handleDeleteDoc = (docId: string) => {
        setDocs(prev => prev.filter(doc => doc.id !== docId));
        setDocEditorModalOpen(false); // Ensure modal is closed if the doc was open
        handleAddNotification({ message: 'Dokumentum törölve!', type: 'success' });
    };


    const handleOpenEmailComposeModal = (data = null) => {
        setEmailComposeData(data);
        setEmailComposeModalOpen(true);
    };

    const handleSendEmail = (emailData) => {
        const newEmail: EmailMessage = {
            id: `email-${Date.now()}`,
            sender: 'felhasznalo@domain.com',
            recipient: emailData.recipient,
            subject: emailData.subject,
            body: emailData.body,
            timestamp: new Date().toISOString(),
            read: true,
            important: false,
            category: 'sent',
        };
        setEmails(prev => [newEmail, ...prev]);
        handleAddNotification({ message: 'Email sikeresen elküldve!', type: 'success' });
    };

    const handleSaveBudget = (budgetData) => {
        if(budgetData.id){
            setBudgets(prev => prev.map(b => b.id === budgetData.id ? {...b, ...budgetData} : b));
        } else {
            setBudgets(prev => [...prev, {id: `budget-${Date.now()}`, period: 'havi', ...budgetData}]);
        }
        handleAddNotification({ message: `Költségvetés mentve a(z) ${budgetData.category} kategóriára.`, type: 'success' });
        setBudgetModalOpen(false);
    };
    
    const handleAddBudgetsBatch = (budgetsData) => {
        const newBudgets = budgetsData.map(b => ({
            id: `budget-${Date.now()}-${Math.random()}`,
            ...b,
            period: 'havi',
        }));

        // Replace existing budgets for the same category, add new ones
        const updatedBudgets = [...budgets];
        newBudgets.forEach(newBudget => {
            const existingIndex = updatedBudgets.findIndex(b => b.category === newBudget.category);
            if (existingIndex > -1) {
                updatedBudgets[existingIndex] = newBudget;
            } else {
                updatedBudgets.push(newBudget);
            }
        });

        setBudgets(updatedBudgets);
        handleAddNotification({ message: `${newBudgets.length} költségvetési javaslat elfogadva.`, type: 'success' });
    };

    const handleNavigate = (viewId, params = {}) => {
        setActiveView({ id: viewId, params });
        if (size.width <= 1024) { setMobileNavOpen(false); }
    };
    
    const allData = { tasks, projects, docs, proposals, emails: emails, trainings, transactions, contacts };

    const renderView = () => {
        let viewComponent;
        switch (activeView.id) {
            case 'dashboard': viewComponent = <DashboardView tasks={tasks} projects={projects} events={plannerEvents} emails={emails} proposals={proposals} ai={ai} onOpenTaskModal={handleOpenTaskModal} onOpenEventModal={handleOpenEventModal} onOpenEmailComposeModal={handleOpenEmailComposeModal} onOpenNewDoc={() => handleOpenDocEditor(null)} />; break;
            case 'tasks': viewComponent = <TasksView tasks={tasks} emails={emails} projects={projects} proposals={proposals} trainings={trainings} setTasks={setTasks} onOpenTaskModal={handleOpenTaskModal} onAddNotification={handleAddNotification} />; break;
            case 'planner': viewComponent = <PlannerView events={plannerEvents} onOpenEventModal={handleOpenEventModal} onOpenDayModal={handleOpenDayModal} />; break;
            case 'email': viewComponent = <EmailView emails={emails} ai={ai} onAddTask={handleSaveTask} onAddNotification={handleAddNotification} onOpenEmailCompose={handleOpenEmailComposeModal} />; break;
            case 'projects': viewComponent = <ProjectsView projects={projects} tasks={tasks} ai={ai} onAddNotification={handleAddNotification} onOpenProjectModal={() => setProjectModalOpen(true)} onOpenAiProjectModal={() => setAiProjectModalOpen(true)} onProjectClick={handleOpenProjectDetail} />; break;
            case 'proposals': viewComponent = <ProposalsView proposals={proposals} setProposals={setProposals} onOpenProposalModal={() => setProposalModalOpen(true)} onProposalClick={handleOpenProposalDetail} onAddNotification={handleAddNotification} />; break;
            case 'finances': viewComponent = <FinancesView transactions={transactions} budgets={budgets} ai={ai} onAddNotification={handleAddNotification} onOpenTransactionModal={() => setTransactionModalOpen(true)} onOpenBudgetModal={() => setBudgetModalOpen(true)} onOpenAiBudgetModal={() => setAiBudgetSuggestionModalOpen(true)} onOpenAiAnalysisModal={() => setAiFinancialAnalysisModalOpen(true)} />; break;
            case 'docs': viewComponent = <DocsView docs={docs} onImageClick={(src) => { setImageModalSrc(src); setImageModalOpen(true); }} onOpenEditor={handleOpenDocEditor} onDeleteDoc={handleDeleteDoc} />; break;
            case 'training': viewComponent = <TrainingView trainings={trainings} onOpenTrainingModal={handleOpenTrainingModal} onSaveTraining={handleSaveTraining} onOpenAiLearningPathModal={() => setAiLearningPathModalOpen(true)} ai={ai} onAddNotification={handleAddNotification} />; break;
            case 'contacts': viewComponent = <ContactsView contacts={contacts} projects={projects} proposals={proposals} emails={emails} onOpenContactModal={handleOpenContactModal} ai={ai} onAddNotification={handleAddNotification} />; break;
            case 'reports': viewComponent = <ReportsView tasks={tasks} transactions={transactions} projects={projects} trainings={trainings} ai={ai} />; break;
            case 'ai-chat': viewComponent = <AiChatView ai={ai} tasks={tasks} onAddTask={handleSaveTask} onAddNotification={handleAddNotification} />; break;
            case 'ai-meeting': viewComponent = <AiMeetingView ai={ai} onAddTasksBatch={handleAddTasksBatch} onAddNotification={handleAddNotification} />; break;
            case 'ai-creative': viewComponent = <AiCreativeView ai={ai} onSaveToDocs={handleSaveImageToDocs} onAddNotification={handleAddNotification} />; break;
            case 'settings': viewComponent = <SettingsView theme={theme} setTheme={setTheme} onAddNotification={handleAddNotification}/>; break;
            default: viewComponent = <DashboardView tasks={tasks} projects={projects} events={plannerEvents} emails={emails} proposals={proposals} ai={ai} onOpenTaskModal={handleOpenTaskModal} onOpenEventModal={handleOpenEventModal} onOpenEmailComposeModal={handleOpenEmailComposeModal} onOpenNewDoc={() => handleOpenDocEditor(null)} />;
        }
        return React.cloneElement(viewComponent as React.ReactElement, { key: activeView.id });
    };

    if (!ai) {
        return <div className="loading-screen"><span className="material-symbols-outlined progress_activity">progress_activity</span><p>P-Day Light betöltése...</p></div>;
    }

    return (
        <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileNavOpen ? 'mobile-nav-open' : ''} theme-${theme}`}>
            <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}></div>
            <Sidebar
                activeViewId={activeView.id}
                onNavigate={handleNavigate}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!isSidebarCollapsed)}
                isMobile={size.width <= 1024}
                onCloseMobileNav={() => setMobileNavOpen(false)}
            />
            <div className="page-container">
                <GlobalHeader 
                    onToggleNav={() => setMobileNavOpen(!isMobileNavOpen)} 
                    onOpenSearch={() => setSearchModalOpen(true)}
                    onNavigate={handleNavigate}
                />
                <main className="main-content">
                    {renderView()}
                </main>
            </div>
            
            <GlobalSearchModal
                isOpen={isSearchModalOpen}
                onClose={() => setSearchModalOpen(false)}
                ai={ai}
                allData={allData}
                onNavigate={handleNavigate}
                onAddNotification={handleAddNotification}
            />
            
            <TaskModal
                isOpen={isTaskModalOpen}
                onClose={() => setTaskModalOpen(false)}
                onSaveTask={handleSaveTask}
                initialData={taskToEdit}
                defaultValues={taskDefaultValues}
            />

            <EventModal
                isOpen={isEventModalOpen}
                onClose={() => setEventModalOpen(false)}
                onAddEvent={handleAddEvent}
                initialDate={eventInitialDate}
            />
            
            <DayDetailModal
                isOpen={isDayDetailModalOpen}
                onClose={() => setDayDetailModalOpen(false)}
                date={dayDetailModalData?.date}
                events={dayDetailModalData?.events || []}
                onOpenEventModal={handleOpenEventModal}
            />
            
            <ProjectDetailModal 
                isOpen={!!selectedProjectForDetail}
                onClose={() => setSelectedProjectForDetail(null)}
                project={selectedProjectForDetail}
                tasks={tasks}
                onOpenTaskModal={handleOpenTaskModal}
            />

            <ProposalDetailModal
                isOpen={!!selectedProposalForDetail}
                onClose={() => setSelectedProposalForDetail(null)}
                proposal={selectedProposalForDetail}
                tasks={tasks}
                docs={docs}
                contacts={contacts}
                onSaveProposal={handleSaveProposal}
                onAddTasksBatch={handleAddTasksBatch}
                ai={ai}
                onAddNotification={handleAddNotification}
            />

            <TransactionModal
                isOpen={isTransactionModalOpen}
                onClose={() => setTransactionModalOpen(false)}
                onAddTransaction={handleAddTransaction}
            />
            
            <ProposalModal
                isOpen={isProposalModalOpen}
                onClose={() => setProposalModalOpen(false)}
                onAddProposal={handleAddProposal}
            />

            <ProjectModal 
                isOpen={isProjectModalOpen}
                onClose={() => setProjectModalOpen(false)}
                onAddProject={handleAddProject}
            />

            <AiProjectModal
                isOpen={isAiProjectModalOpen}
                onClose={() => setAiProjectModalOpen(false)}
                onAddProjectWithTasks={handleAddProjectWithTasks}
                ai={ai}
                onAddNotification={handleAddNotification}
            />
            
            <AiLearningPathModal
                isOpen={isAiLearningPathModalOpen}
                onClose={() => setAiLearningPathModalOpen(false)}
                onAddTrainingWithPath={handleAddTrainingWithPath}
                ai={ai}
                onAddNotification={handleAddNotification}
            />
            
            <TrainingModal
                isOpen={isTrainingModalOpen}
                onClose={() => { setTrainingModalOpen(false); setCurrentTraining(null); }}
                onSave={handleSaveTraining}
                training={currentTraining}
            />

            <ContactModal
                isOpen={isContactModalOpen}
                onClose={() => setContactModalOpen(false)}
                onSave={handleSaveContact}
                contact={contactToEdit}
            />
            
            <EmailComposeModal
                isOpen={isEmailComposeModalOpen}
                onClose={() => setEmailComposeModalOpen(false)}
                onSend={handleSendEmail}
                initialData={emailComposeData}
                ai={ai}
                onAddNotification={handleAddNotification}
            />

            <DocEditorModal
                isOpen={isDocEditorModalOpen}
                onClose={() => setDocEditorModalOpen(false)}
                doc={docToEdit}
                onSave={handleSaveDoc}
                onDelete={handleDeleteDoc}
                ai={ai}
                theme={theme}
            />
            
             <BudgetModal 
                isOpen={isBudgetModalOpen}
                onClose={() => setBudgetModalOpen(false)}
                onSave={handleSaveBudget}
            />

            <AiBudgetSuggestionModal
                isOpen={isAiBudgetSuggestionModalOpen}
                onClose={() => setAiBudgetSuggestionModalOpen(false)}
                transactions={transactions}
                ai={ai}
                onAddBudgets={handleAddBudgetsBatch}
                onAddNotification={handleAddNotification}
            />
            
            <AiFinancialAnalysisModal
                isOpen={isAiFinancialAnalysisModalOpen}
                onClose={() => setAiFinancialAnalysisModalOpen(false)}
                transactions={transactions}
                ai={ai}
                onAddNotification={handleAddNotification}
            />

             {isImageModalOpen && (
                <div className="image-modal-overlay" onClick={() => setImageModalOpen(false)}>
                    <div className="image-modal-content" onClick={e => e.stopPropagation()}>
                        <img src={imageModalSrc} alt="Nagyított kép" className="image-modal-image" />
                        <button onClick={() => setImageModalOpen(false)} className="button-icon-close">&times;</button>
                    </div>
                </div>
            )}
            
            <NotificationContainer notifications={notifications} onDismiss={handleDismissNotification} />
        </div>
    );
};


const Sidebar = ({ activeViewId, onNavigate, isCollapsed, onToggleCollapse, isMobile, onCloseMobileNav }) => {
    const [openSections, setOpenSections] = useState(['workspace', 'knowledge', 'growth', 'ai']);

    const handleToggleSection = (sectionId) => {
        setOpenSections(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
    };

    const renderNavItems = (items) => {
        return items.map(item => {
            if (item.subItems) {
                const isOpen = openSections.includes(item.id);
                return (
                    <li key={item.id} className="nav-item">
                        <button onClick={() => handleToggleSection(item.id)} className={`nav-link nav-section-header ${isOpen ? 'open' : ''}`} title={isCollapsed ? item.label : undefined}>
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span>{item.label}</span>
                            <span className="material-symbols-outlined chevron">chevron_right</span>
                        </button>
                        <div className={`nav-sub-list-wrapper ${isOpen ? 'open' : ''}`}>
                            <ul className="nav-sub-list">
                                {renderNavItems(item.subItems)}
                            </ul>
                        </div>
                    </li>
                );
            }
            return (
                <li key={item.id} className="nav-item">
                    <button onClick={() => onNavigate(item.id)} className={`nav-link ${activeViewId === item.id ? 'active' : ''}`} title={isCollapsed ? item.label : undefined}>
                        <span className="material-symbols-outlined">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                </li>
            );
        });
    };

    const toggleHandler = isMobile ? onCloseMobileNav : onToggleCollapse;
    const toggleIcon = isMobile ? 'arrow_back_ios' : (isCollapsed ? 'arrow_forward_ios' : 'arrow_back_ios');
    const title = (!isMobile && isCollapsed) 
        ? <span className="material-symbols-outlined">api</span> 
        : (
            <svg width="120" height="24" viewBox="0 0 132 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{transform: 'translateY(2px)'}}>
                <path d="M14.72 2.52H9.08V25.48H14.72V16.6H20.48V25.48H26.12V2.52H20.48V11.2H14.72V2.52Z" fill="url(#paint0_linear_1_2)"/>
                <path d="M47.2266 2.52C42.4866 2.52 38.6666 6.3 38.6666 11.08V16.92C38.6666 21.7 42.4866 25.48 47.2266 25.48C51.9666 25.48 55.7866 21.7 55.7866 16.92V11.08C55.7866 6.3 51.9666 2.52 47.2266 2.52ZM50.1466 16.92C50.1466 20 48.8866 21.28 47.2266 21.28C45.5666 21.28 44.3066 20 44.3066 16.92V11.08C44.3066 8.12 45.5666 6.8 47.2266 6.8C48.8866 6.8 50.1466 8.12 50.1466 11.08V16.92Z" fill="url(#paint1_linear_1_2)"/>
                <path d="M68.5226 13.92L62.7226 2.52H69.0026L71.8426 7.92L74.6826 2.52H80.9626L75.1626 13.92V25.48H68.5226V13.92Z" fill="url(#paint2_linear_1_2)"/>
                <path d="M2.8 0H0V28H2.8V0Z" fill="url(#paint3_linear_1_2)"/>
                <path d="M102.534 2.52H88.7738V7.2H94.1738V25.48H99.8138V7.2H105.214V2.52H102.534Z" fill="url(#paint4_linear_1_2)"/>
                <path d="M117.828 2.52L108.948 25.48H114.948L116.868 20.32H124.788L126.708 25.48H132.708L123.828 2.52H117.828ZM120.828 7.4L123.708 15.92H117.948L120.828 7.4Z" fill="url(#paint5_linear_1_2)"/>
                <defs>
                <linearGradient id="paint0_linear_1_2" x1="17.6" y1="2.52" x2="17.6" y2="25.48" gradientUnits="userSpaceOnUse"><stop stop-color="#00BFFF"/><stop offset="1" stop-color="#50E3C2"/></linearGradient>
                <linearGradient id="paint1_linear_1_2" x1="47.2266" y1="2.52" x2="47.2266" y2="25.48" gradientUnits="userSpaceOnUse"><stop stop-color="#00BFFF"/><stop offset="1" stop-color="#50E3C2"/></linearGradient>
                <linearGradient id="paint2_linear_1_2" x1="71.8426" y1="2.52" x2="71.8426" y2="25.48" gradientUnits="userSpaceOnUse"><stop stop-color="#00BFFF"/><stop offset="1" stop-color="#50E3C2"/></linearGradient>
                <linearGradient id="paint3_linear_1_2" x1="1.4" y1="0" x2="1.4" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#00BFFF"/><stop offset="1" stop-color="#50E3C2"/></linearGradient>
                <linearGradient id="paint4_linear_1_2" x1="98.4938" y1="2.52" x2="98.4938" y2="25.48" gradientUnits="userSpaceOnUse"><stop stop-color="#00BFFF"/><stop offset="1" stop-color="#50E3C2"/></linearGradient>
                <linearGradient id="paint5_linear_1_2" x1="120.828" y1="2.52" x2="120.828" y2="25.48" gradientUnits="userSpaceOnUse"><stop stop-color="#00BFFF"/><stop offset="1" stop-color="#50E3C2"/></linearGradient>
                </defs>
            </svg>
        );

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                {title}
                <button onClick={toggleHandler} className="nav-link collapse-toggle">
                    <span className="material-symbols-outlined">{toggleIcon}</span>
                </button>
            </div>
            <nav className="sidebar-nav">
                <ul className="nav-list">
                    {renderNavItems(navigationData)}
                </ul>
            </nav>
        </aside>
    );
};

const EmailComposeModal = ({ isOpen, onClose, onSend, initialData, ai, onAddNotification }) => {
    const [recipient, setRecipient] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData?.mode === 'reply' && initialData?.originalEmail) {
                const original = initialData.originalEmail;
                setRecipient(original.sender);
                setSubject(`Re: ${original.subject}`);
                setBody(`\n\n---\nOn ${new Date(original.timestamp).toLocaleString()}, ${original.sender} wrote:\n>${original.body.split('\n').join('\n>')}`);
            } else {
                setRecipient(initialData?.recipient || '');
                setSubject(initialData?.subject || '');
                setBody(initialData?.body || '');
            }
            setAiPrompt('');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!recipient.trim() || !subject.trim()) return;
        onSend({ recipient, subject, body });
        onClose();
    };
    
    const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        const prompt = `Írj egy professzionális emailt a következő instrukciók alapján. A válaszodban csak az email törzsét add vissza, mindenféle bevezető vagy magyarázat nélkül.\n\nCímzett: ${recipient}\nTárgy: ${subject}\n\nInstrukciók: "${aiPrompt}"`;
        try {
            const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
            setBody(prev => (prev.trim() ? prev + '\n\n' : '') + response.text);
        } catch (err) {
            console.error("AI Email generation error:", err);
            onAddNotification({ message: 'Hiba történt az email generálása közben.', type: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()} style={{maxWidth: '800px'}}>
                <div className="modal-header">
                    <h3>Új Email</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group"><label htmlFor="email-recipient">Címzett</label><input id="email-recipient" type="email" value={recipient} onChange={e => setRecipient(e.target.value)} required /></div>
                    <div className="form-group"><label htmlFor="email-subject">Tárgy</label><input id="email-subject" type="text" value={subject} onChange={e => setSubject(e.target.value)} required /></div>
                    <div className="form-group"><label htmlFor="email-body">Szöveg</label><textarea id="email-body" value={body} onChange={e => setBody(e.target.value)} rows={10}></textarea></div>
                    
                    <div className="ai-assistant-panel card" style={{marginBottom: 'var(--spacing-md)'}}>
                         <h4><span className="material-symbols-outlined">psychology</span>AI Asszisztens</h4>
                         <div className="form-group">
                            <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Írja le, mit szeretne az emailbe..." rows={2} disabled={isGenerating} />
                         </div>
                         <button type="button" onClick={handleAiGenerate} disabled={isGenerating || !aiPrompt.trim()} className="button button-secondary">
                            {isGenerating ? <span className="material-symbols-outlined progress_activity"></span> : <span className="material-symbols-outlined">auto_draw</span>}
                            Szöveg generálása
                         </button>
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="submit" className="button button-primary"><span className="material-symbols-outlined">send</span>Küldés</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DocEditorModal = ({ isOpen, onClose, doc, onSave, onDelete, ai, theme }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (doc) {
            setTitle(doc.title);
            setContent(doc.content);
        }
    }, [doc]);

    if (!isOpen || !doc) return null;

    const handleSave = () => {
        onSave(doc.id, title, content);
    };
    
    const handleAiAction = async (action: 'summarize' | 'improve' | 'correct') => {
        if (!content.trim()) return;
        setIsGenerating(true);
        
        let promptText = '';
        switch(action) {
            case 'summarize': promptText = `Foglald össze a következő szöveget röviden, 2-3 mondatban:\n\n${content}`; break;
            case 'improve': promptText = `Javítsd fel a következő szöveg stílusát és fogalmazását, hogy professzionálisabb legyen:\n\n${content}`; break;
            case 'correct': promptText = `Javítsd ki a nyelvtani hibákat és elgépeléseket a következő szövegben:\n\n${content}`; break;
        }

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: promptText });
            setContent(response.text);
        } catch (err) {
            console.error(`AI doc ${action} error:`, err);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card doc-editor-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <input className="doc-editor-title-input" value={title} onChange={e => setTitle(e.target.value)} />
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <div className="doc-editor-toolbar">
                    <button onClick={() => handleAiAction('summarize')} disabled={isGenerating}><span className="material-symbols-outlined">compress</span>Összefoglal</button>
                    <button onClick={() => handleAiAction('improve')} disabled={isGenerating}><span className="material-symbols-outlined">auto_fix_high</span>Javít</button>
                    <button onClick={() => handleAiAction('correct')} disabled={isGenerating}><span className="material-symbols-outlined">spellcheck</span>Helyesírás</button>
                    {isGenerating && <span className="material-symbols-outlined progress_activity">progress_activity</span>}
                </div>
                <div className="editor-container">
                    <Editor
                        height="60vh"
                        language="markdown"
                        value={content}
                        onChange={(value) => setContent(value || '')}
                        theme={theme === 'dark' ? 'vs-dark' : 'light'}
                        options={{ minimap: { enabled: false } }}
                    />
                </div>
                <div className="modal-actions">
                    <button type="button" className="button button-danger" onClick={() => onDelete(doc.id)}>Törlés</button>
                    <div>
                        <button type="button" className="button button-secondary" onClick={onClose}>Mégse</button>
                        <button type="button" className="button button-primary" onClick={handleSave}>Mentés</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EmailView = ({ emails, ai, onAddTask, onAddNotification, onOpenEmailCompose }) => {
    const [selectedCategory, setSelectedCategory] = useState<'inbox' | 'sent'>('inbox');
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(emails.filter(e=>e.category==='inbox')[0]?.id || null);
    const [isLoading, setIsLoading] = useState(false);

    const filteredEmails = emails.filter(e => e.category === selectedCategory).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const selectedEmail = emails.find(e => e.id === selectedEmailId);

    const handleCreateTaskFromEmail = async (email: EmailMessage) => {
        if (!email) return;
        setIsLoading(true);

        const schema = {
            type: Type.OBJECT,
            properties: {
                isTask: { type: Type.BOOLEAN, description: "Igaz, ha az email tartalmaz egy konkrét, végrehajtható feladatot. Hamis, ha csak tájékoztató jellegű vagy egy sima beszélgetés." },
                title: { type: Type.STRING, description: "A feladat rövid címe, ha van. Pl. 'Heti riport elkészítése'." },
                description: { type: Type.STRING, description: "A feladat rövid leírása, utalva az emailre." },
                dueDate: { type: Type.STRING, description: `A feladat határideje YYYY-MM-DD formátumban. A mai nap: ${new Date().toISOString().split('T')[0]}. Ha nincs konkrét dátum, de relatív (pl. 'péntekig'), számold ki.` },
                priority: { type: Type.STRING, enum: ['Alacsony', 'Közepes', 'Magas', 'Kritikus'], description: "A feladat prioritása az email hangvétele és a határidő alapján." }
            },
            required: ['isTask']
        };

        const prompt = `Elemezd a következő emailt, és döntsd el, hogy tartalmaz-e konkrét, végrehajtható feladatot. Add vissza a választ a megadott JSON séma szerint.\n\nFeladó: ${email.sender}\nTárgy: ${email.subject}\n\nTartalom:\n${email.body}`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            const taskData = JSON.parse(response.text.trim());

            if (taskData.isTask) {
                onAddTask({
                    title: taskData.title || 'Emailből generált feladat',
                    description: taskData.description || `Feladat a(z) "${email.subject}" tárgyú email alapján.`,
                    dueDate: taskData.dueDate,
                    priority: taskData.priority || 'Közepes',
                    category: 'Email',
                    relatedTo: email.id,
                });
            } else {
                onAddNotification({ message: 'Ez az email nem tartalmazott egyértelmű feladatot.', type: 'info' });
            }
        } catch (err) {
            console.error("AI Task Creation Error:", err);
            onAddNotification({ message: 'Hiba a feladat létrehozása közben.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <View title="Email" subtitle="Bejövő és kimenő levelek kezelése.">
            <div className="email-view-layout card">
                <aside className="email-sidebar">
                    <button className="button button-primary" style={{ width: '100%' }} onClick={() => onOpenEmailCompose()}>Új Email</button>
                    <ul className="email-category-list" style={{ marginTop: 'var(--spacing-lg)' }}>
                        <li onClick={() => setSelectedCategory('inbox')} className={`email-category-item ${selectedCategory === 'inbox' ? 'active' : ''}`}><span className="material-symbols-outlined">inbox</span>Bejövő</li>
                        <li onClick={() => setSelectedCategory('sent')} className={`email-category-item ${selectedCategory === 'sent' ? 'active' : ''}`}><span className="material-symbols-outlined">send</span>Elküldött</li>
                    </ul>
                </aside>
                <div className="email-list-pane">
                    <ul className="email-message-list">
                        {filteredEmails.map(email => (
                            <li key={email.id} className={`email-list-item ${selectedEmailId === email.id ? 'selected' : ''} ${!email.read ? 'unread' : ''}`} onClick={() => setSelectedEmailId(email.id)}>
                                {!email.read && <div className="unread-indicator"></div>}
                                <div className="email-item-header">
                                    <span className="email-sender">{email.sender}</span>
                                    <span className="email-timestamp">{new Date(email.timestamp).toLocaleDateString()}</span>
                                </div>
                                <p className="email-subject">{email.subject}</p>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="email-content-pane">
                    {selectedEmail ? (
                        <>
                            <div className="email-content-header">
                                <h3>{selectedEmail.subject}</h3>
                                <p><strong>Feladó:</strong> {selectedEmail.sender}</p>
                                <p><strong>Címzett:</strong> {selectedEmail.recipient}</p>
                                <div className="email-actions">
                                    <button className="button button-secondary" onClick={() => onOpenEmailCompose({ mode: 'reply', originalEmail: selectedEmail })}><span className="material-symbols-outlined">reply</span>Válasz</button>
                                    <button className="button button-secondary"><span className="material-symbols-outlined">delete</span>Törlés</button>
                                    <button className="button button-secondary" onClick={() => handleCreateTaskFromEmail(selectedEmail)} disabled={isLoading}>
                                        <span className={`material-symbols-outlined ${isLoading ? 'progress_activity' : ''}`}>{isLoading ? 'progress_activity' : 'add_task'}</span>
                                        Feladat létrehozása AI-val
                                    </button>
                                </div>
                            </div>
                            <div className="email-body">
                                <pre>{selectedEmail.body}</pre>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state-placeholder">
                            <span className="material-symbols-outlined">mark_email_read</span>
                            <p>Válasszon ki egy emailt a megtekintéshez.</p>
                        </div>
                    )}
                </div>
            </div>
        </View>
    );
};

const ProjectsView = ({ projects, tasks, ai, onAddNotification, onOpenProjectModal, onOpenAiProjectModal, onProjectClick }) => {
    const statuses: ProjectStatus[] = ['Tervezés', 'Fejlesztés', 'Tesztelés', 'Kész'];

    const getProjectProgress = (projectId: string) => {
        const relatedTasks = tasks.filter(t => t.projectId === projectId);
        if (relatedTasks.length === 0) return 0;
        const completedTasks = relatedTasks.filter(t => t.status === 'Kész').length;
        return (completedTasks / relatedTasks.length) * 100;
    };
    
    const projectsByStatus = useMemo(() => {
        const grouped: { [key in ProjectStatus]?: Project[] } = {};
        projects.forEach(project => {
            if (!grouped[project.status]) {
                grouped[project.status] = [];
            }
            grouped[project.status]!.push(project);
        });
        return grouped;
    }, [projects]);

    return (
        <View 
            title="Projektek" 
            subtitle="Projektek követése Kanban-táblán."
            actions={
                <>
                    <button className="button button-secondary" onClick={onOpenProjectModal}>
                        <span className="material-symbols-outlined">add</span>Új Projekt
                    </button>
                    <button className="button button-primary" onClick={onOpenAiProjectModal}>
                        <span className="material-symbols-outlined">auto_awesome</span>Létrehozás AI-val
                    </button>
                </>
            }
        >
            <div className="projects-view-container">
                <div className="kanban-board">
                    {statuses.map(status => (
                        <div key={status} className="kanban-column">
                            <div className="kanban-column-header">
                                <h3>{status}</h3>
                                <span className="task-count">{(projectsByStatus[status] || []).length}</span>
                            </div>
                            <div className="kanban-column-body">
                                {(projectsByStatus[status] || []).map(project => {
                                    const progress = getProjectProgress(project.id);
                                    return (
                                        <div key={project.id} className="project-card card" onClick={() => onProjectClick(project)}>
                                            <h4>{project.title}</h4>
                                            {project.team.length > 0 &&
                                                <div className="team-avatars">
                                                    {project.team.map(member => (
                                                        <div key={member} className="avatar-sm" title={member}>
                                                            {member.charAt(0).toUpperCase()}
                                                        </div>
                                                    ))}
                                                </div>
                                            }
                                            <div className="project-card-footer">
                                                <span>Haladás</span>
                                                <span>{Math.round(progress)}%</span>
                                            </div>
                                            <div className="progress-bar-container">
                                                <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </View>
    );
};

const ProjectDetailModal = ({ isOpen, onClose, project, tasks, onOpenTaskModal }) => {
    if (!isOpen || !project) return null;

    const relatedTasks = tasks.filter(t => t.projectId === project.id);
    const completedTasks = relatedTasks.filter(t => t.status === 'Kész').length;
    const progress = relatedTasks.length > 0 ? (completedTasks / relatedTasks.length) * 100 : 0;

    const handleAddTaskClick = () => {
        onOpenTaskModal(null, { projectId: project.id, category: 'Projekt' });
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{project.title}</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <div className="project-detail-modal-body">
                    <div className="project-details-grid">
                        <div>
                            <h4>Leírás</h4>
                            <p>{project.description || "Nincs leírás megadva."}</p>
                        </div>
                        <div className="project-meta-grid">
                            <div>
                                <h4>Státusz</h4>
                                <span className="task-pill pill-status">{project.status}</span>
                            </div>
                            <div>
                                <h4>Határidő</h4>
                                <p>{formatDate(project.dueDate)}</p>
                            </div>
                             <div>
                                <h4>Csapat</h4>
                                <div className="team-avatars">
                                    {project.team.map(member => (
                                        <div key={member} className="avatar-sm" title={member}>
                                            {member.charAt(0).toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="project-progress-section">
                        <h4>Haladás ({Math.round(progress)}%)</h4>
                        <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                    
                    <div className="related-tasks-section">
                        <h4>Kapcsolódó feladatok ({relatedTasks.length})</h4>
                        <div className="task-list">
                            {relatedTasks.length > 0 ? (
                                relatedTasks.map(task => (
                                    <div key={task.id} className="task-item-title-container">
                                        <span className={`material-symbols-outlined ${task.status === 'Kész' ? 'check_circle' : 'radio_button_unchecked'}`}>{task.status === 'Kész' ? 'check_circle' : 'radio_button_unchecked'}</span>
                                        <span className={`task-item-title ${task.status === 'Kész' ? 'completed' : ''}`}>{task.title}</span>
                                        <span className={`task-pill priority-pill ${getPriorityClass(task.priority)}`}>{task.priority}</span>
                                    </div>
                                ))
                            ) : (
                                <p>Nincsenek még feladatok ehhez a projekthez.</p>
                            )}
                        </div>
                    </div>
                </div>
                 <div className="modal-actions">
                    <button type="button" className="button button-primary" onClick={handleAddTaskClick}>
                       <span className="material-symbols-outlined">add_task</span> Új feladat hozzáadása
                    </button>
                </div>
            </div>
        </div>
    );
};

interface AiSuggestedTask {
    id: string;
    title: string;
    checked: boolean;
}

const ProposalDetailModal = ({ isOpen, onClose, proposal, tasks, docs, contacts, onSaveProposal, onAddTasksBatch, ai, onAddNotification }) => {
    if (!isOpen || !proposal) return null;

    const [currentSummary, setCurrentSummary] = useState(proposal.summary);
    const [improvedSummary, setImprovedSummary] = useState('');
    const [isImprovingSummary, setIsImprovingSummary] = useState(false);
    
    const [suggestedTasks, setSuggestedTasks] = useState<AiSuggestedTask[]>([]);
    const [isSuggestingTasks, setIsSuggestingTasks] = useState(false);
    
    const [linkedDocs, setLinkedDocs] = useState<string[]>([]);
    const [linkedContacts, setLinkedContacts] = useState<string[]>([]);
    
    const [aiSection, setAiSection] = useState('objectives');
    const [aiKeywords, setAiKeywords] = useState('');
    const [generatedText, setGeneratedText] = useState('');
    const [isGeneratingText, setIsGeneratingText] = useState(false);

    useEffect(() => {
        if(proposal) {
            setCurrentSummary(proposal.summary);
            setImprovedSummary('');
            setSuggestedTasks([]);
            setLinkedDocs(proposal.linkedDocIds || []);
            setLinkedContacts(proposal.linkedContactIds || []);
            setGeneratedText('');
            setAiKeywords('');
        }
    }, [proposal]);

    const handleImproveSummary = async () => {
        setIsImprovingSummary(true);
        const prompt = `Te egy profi pályázatíró asszisztens vagy. Javítsd fel a következő pályázati összefoglalót, hogy professzionálisabb és meggyőzőbb legyen. A válaszod magyarul add meg, és csak a javított szöveget add vissza, mindenféle bevezető vagy magyarázat nélkül.\n\nPályázat címe: "${proposal.title}"\n\nEredeti összefoglaló:\n"${currentSummary}"`;
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setImprovedSummary(response.text);
        } catch (err) {
            console.error("AI Summary Error:", err);
            onAddNotification({ message: 'Hiba az összefoglaló javítása közben.', type: 'error' });
        } finally {
            setIsImprovingSummary(false);
        }
    };
    
    const handleSuggestTasks = async () => {
        setIsSuggestingTasks(true);
        setSuggestedTasks([]);

        const schema = {
            type: Type.OBJECT,
            properties: {
                tasks: {
                    type: Type.ARRAY,
                    description: "A pályázat megvalósításához szükséges 4-6 legfontosabb feladat listája.",
                    items: {
                        type: Type.OBJECT,
                        properties: { title: { type: Type.STRING, description: "A feladat címe." } },
                        required: ['title']
                    }
                }
            },
            required: ['tasks']
        };

        const prompt = `Te egy tapasztalt projektmenedzser vagy. A felhasználó egy pályázatot készít. Elemezd a pályázat címét és összefoglalóját, és generálj egy listát a 4-6 legfontosabb, konkrét feladatról, ami a sikeres pályázáshoz szükséges. Válaszodat a megadott JSON séma szerint add meg.\n\nPályázat címe: "${proposal.title}"\nÖsszefoglaló: "${currentSummary}"`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            const result = JSON.parse(response.text.trim());
            setSuggestedTasks(Array.isArray(result.tasks) ? result.tasks.map((task: { title: string }) => ({ ...task, id: `sugg-${Math.random()}`, checked: true })) : []);
        } catch (err) {
            console.error("AI Task Suggestion Error:", err);
            onAddNotification({ message: 'Hiba a feladatok javaslata közben.', type: 'error' });
        } finally {
            setIsSuggestingTasks(false);
        }
    };
    
    const handleGenerateText = async () => {
        if (!aiKeywords.trim()) return;
        setIsGeneratingText(true);
        setGeneratedText('');
        const sectionMap = {
            summary: "Összefoglaló",
            objectives: "Célkitűzések",
            methodology: "Módszertan",
            budget_narrative: "Költségvetés leírása"
        };
        const prompt = `Te egy profi pályázatíró specialista vagy. Írj egy kidolgozott, professzionális szövegrészt a(z) "${sectionMap[aiSection]}" szekcióhoz a következő pályázathoz. Használd fel a megadott kulcsszavakat/vázlatpontokat. A válaszod legyen meggyőző, formázott (ahol kell) és magyar nyelvű. Csak a generált szöveget add vissza, mindenféle bevezető nélkül.\n\nPályázat címe: "${proposal.title}"\nKulcsszavak/vázlat: "${aiKeywords}"`;

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setGeneratedText(response.text);
        } catch (err) {
            console.error("AI Text Generation Error:", err);
            onAddNotification({ message: 'Hiba a szöveg generálása közben.', type: 'error' });
        } finally {
            setIsGeneratingText(false);
        }
    };


    const handleToggleSuggestedTask = (taskId: string) => {
        setSuggestedTasks(prev => prev.map(t => t.id === taskId ? { ...t, checked: !t.checked } : t));
    };

    const handleAddSelectedTasks = () => {
        const tasksToAdd = suggestedTasks
            .filter(t => t.checked)
            .map(t => ({
                title: t.title,
                priority: 'Magas' as TaskPriority,
                category: 'Pályázat' as TaskCategory,
                proposalId: proposal.id,
            }));
        if (tasksToAdd.length > 0) {
            onAddTasksBatch(tasksToAdd);
        }
        onClose();
    };
    
    const handleAddLink = (type: 'doc' | 'contact', id: string) => {
        if (!id) return;
        if (type === 'doc' && !linkedDocs.includes(id)) {
            const newLinkedDocs = [...linkedDocs, id];
            setLinkedDocs(newLinkedDocs);
            onSaveProposal({ id: proposal.id, linkedDocIds: newLinkedDocs });
        }
        if (type === 'contact' && !linkedContacts.includes(id)) {
            const newLinkedContacts = [...linkedContacts, id];
            setLinkedContacts(newLinkedContacts);
            onSaveProposal({ id: proposal.id, linkedContactIds: newLinkedContacts });
        }
    };

    const handleRemoveLink = (type: 'doc' | 'contact', id: string) => {
        if (type === 'doc') {
            const newLinkedDocs = linkedDocs.filter(docId => docId !== id);
            setLinkedDocs(newLinkedDocs);
            onSaveProposal({ id: proposal.id, linkedDocIds: newLinkedDocs });
        }
        if (type === 'contact') {
            const newLinkedContacts = linkedContacts.filter(contactId => contactId !== id);
            setLinkedContacts(newLinkedContacts);
            onSaveProposal({ id: proposal.id, linkedContactIds: newLinkedContacts });
        }
    };

    const relatedTasks = tasks.filter(t => t.proposalId === proposal.id);
    const availableDocs = docs.filter(d => !linkedDocs.includes(d.id));
    const availableContacts = contacts.filter(c => !linkedContacts.includes(c.id));

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{proposal.title}</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                 <div className="proposal-detail-modal-body">
                    <div className="proposal-detail-main">
                        <div className="proposal-summary-section">
                            <h4>Összefoglaló</h4>
                            <textarea value={currentSummary} onChange={e => setCurrentSummary(e.target.value)} rows={4} onBlur={() => onSaveProposal({id: proposal.id, summary: currentSummary})}></textarea>
                            <button className="button button-secondary" onClick={handleImproveSummary} disabled={isImprovingSummary}>
                                {isImprovingSummary ? <span className="material-symbols-outlined progress_activity"></span> : <span className="material-symbols-outlined">auto_fix_high</span>}
                                Összefoglaló Javítása AI-val
                            </button>
                            {improvedSummary && (
                                <div className="ai-result-box">
                                    <p>{improvedSummary}</p>
                                    <button onClick={() => { setCurrentSummary(improvedSummary); onSaveProposal({id: proposal.id, summary: improvedSummary }); setImprovedSummary(''); }} className="button button-primary">Változtatás elfogadása</button>
                                </div>
                            )}
                        </div>
                        
                        <div className="proposal-links-section">
                             <h4>Kapcsolatok és Dokumentumok</h4>
                             <div className="link-grid">
                                 <div className="link-column">
                                     <h5>Kapcsolódó Dokumentumok</h5>
                                     <ul>
                                         {linkedDocs.map(docId => (
                                            <li key={docId}>{docs.find(d => d.id === docId)?.title} <button onClick={() => handleRemoveLink('doc', docId)}>&times;</button></li>
                                         ))}
                                     </ul>
                                     <select onChange={e => handleAddLink('doc', e.target.value)} value="">
                                         <option value="">Dokumentum hozzáadása...</option>
                                         {availableDocs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                                     </select>
                                 </div>
                                 <div className="link-column">
                                     <h5>Kapcsolódó Kontaktok</h5>
                                      <ul>
                                         {linkedContacts.map(contactId => (
                                            <li key={contactId}>{contacts.find(c => c.id === contactId)?.name} <button onClick={() => handleRemoveLink('contact', contactId)}>&times;</button></li>
                                         ))}
                                     </ul>
                                     <select onChange={e => handleAddLink('contact', e.target.value)} value="">
                                         <option value="">Kontakt hozzáadása...</option>
                                         {availableContacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                     </select>
                                 </div>
                             </div>
                        </div>

                        <div className="proposal-tasks-section">
                            <h4>Kapcsolódó Feladatok</h4>
                            <div className="task-list" style={{maxHeight: '150px', overflowY: 'auto', marginBottom: 'var(--spacing-md)'}}>
                                {relatedTasks.length > 0 ? relatedTasks.map(task => (
                                     <div key={task.id} className="task-item-title-container">
                                        <span className={`material-symbols-outlined ${task.status === 'Kész' ? 'check_circle' : 'radio_button_unchecked'}`}>{task.status === 'Kész' ? 'check_circle' : 'radio_button_unchecked'}</span>
                                        <span className={`task-item-title ${task.status === 'Kész' ? 'completed' : ''}`}>{task.title}</span>
                                    </div>
                                )) : <p>Nincsenek még feladatok.</p>}
                            </div>
                            <button className="button button-secondary" onClick={handleSuggestTasks} disabled={isSuggestingTasks}>
                                {isSuggestingTasks ? <span className="material-symbols-outlined progress_activity"></span> : <span className="material-symbols-outlined">checklist</span>}
                                Feladatok Javaslata AI-val
                            </button>
                            {suggestedTasks.length > 0 && (
                                <div className="ai-result-box">
                                    <h5>Javasolt feladatok</h5>
                                    <ul className="suggested-task-list">
                                        {suggestedTasks.map(task => (
                                            <li key={task.id}>
                                                <input type="checkbox" checked={task.checked} onChange={() => handleToggleSuggestedTask(task.id)} id={`task-${task.id}`} />
                                                <label htmlFor={`task-${task.id}`}>{task.title}</label>
                                            </li>
                                        ))}
                                    </ul>
                                    <button onClick={handleAddSelectedTasks} className="button button-primary">Kijelöltek Hozzáadása</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <aside className="proposal-ai-writer-panel card">
                        <h4><span className="material-symbols-outlined">edit_note</span>AI Pályázatíró</h4>
                        <p>Generáljon szöveget a pályázat különböző részeihez.</p>
                        <div className="form-group">
                            <label>Szekció</label>
                            <select value={aiSection} onChange={e => setAiSection(e.target.value)}>
                                <option value="objectives">Célkitűzések</option>
                                <option value="methodology">Módszertan</option>
                                <option value="summary">Összefoglaló</option>
                                <option value="budget_narrative">Költségvetés leírása</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Kulcsszavak / Vázlat</label>
                            <textarea value={aiKeywords} onChange={e => setAiKeywords(e.target.value)} rows={4} placeholder="Pl. prediktív analitika, NLP, felhasználói élmény javítása..."></textarea>
                        </div>
                        <button className="button button-primary" onClick={handleGenerateText} disabled={isGeneratingText}>
                             {isGeneratingText ? <span className="material-symbols-outlined progress_activity"></span> : <span className="material-symbols-outlined">auto_draw</span>}
                            Szöveg Generálása
                        </button>
                         {generatedText && (
                            <div className="ai-result-box">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedText}</ReactMarkdown>
                                <button className="button button-secondary" onClick={() => navigator.clipboard.writeText(generatedText)}>
                                    <span className="material-symbols-outlined">content_copy</span>Másolás
                                </button>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
};

const ProposalsView = ({ proposals, setProposals, onOpenProposalModal, onProposalClick, onAddNotification }) => {
    const statuses: ProposalStatus[] = ['Készül', 'Beadva', 'Értékelés alatt', 'Elfogadva', 'Elutasítva'];
    
    const handleProposalDrop = (proposalId: string, newStatus: ProposalStatus) => {
        const proposalToMove = proposals.find(p => p.id === proposalId);
        if (proposalToMove && proposalToMove.status !== newStatus) {
            setProposals(current => current.map(p => p.id === proposalId ? { ...p, status: newStatus } : p));
            onAddNotification({ message: `"${proposalToMove.title}" státusza megváltozott: ${newStatus}`, type: 'success' });
        }
    };

    const proposalsByStatus = useMemo(() => {
        const grouped: { [key in ProposalStatus]?: Proposal[] } = {};
        proposals.forEach(p => {
            if (!grouped[p.status]) grouped[p.status] = [];
            grouped[p.status]!.push(p);
        });
        return grouped;
    }, [proposals]);

    const ProposalCard = ({ proposal, onProposalClick }) => {
        const ref = React.useRef<HTMLDivElement>(null);
        const [{ isDragging }, drag] = useDrag(() => ({
            type: ItemTypes.PROPOSAL,
            item: { id: proposal.id },
            collect: (monitor) => ({
                isDragging: monitor.isDragging(),
            }),
        }));
        drag(ref);

        return (
            <div ref={ref} className="proposal-card card" onClick={() => onProposalClick(proposal)} style={{ opacity: isDragging ? 0.5 : 1 }}>
                <h4>{proposal.title}</h4>
                <span className="funder">{proposal.funder}</span>
                <div className="proposal-card-footer">
                    <span className="amount">{new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(proposal.amount)}</span>
                    <span className="deadline">
                        <span className="material-symbols-outlined">event</span>
                        {formatDate(proposal.submissionDeadline)}
                    </span>
                </div>
            </div>
        );
    };

    const ProposalColumn = ({ status, proposals, onProposalDrop, onProposalClick }) => {
        const ref = React.useRef<HTMLDivElement>(null);
        const [{ isOver }, drop] = useDrop(() => ({
            accept: ItemTypes.PROPOSAL,
            drop: (item: { id: string }) => onProposalDrop(item.id, status),
            collect: (monitor) => ({
                isOver: !!monitor.isOver(),
            }),
        }));
        drop(ref);

        return (
            <div ref={ref} className={`kanban-column ${isOver ? 'is-over' : ''}`}>
                <div className="kanban-column-header">
                    <h3>{status}</h3>
                    <span className="task-count">{proposals.length}</span>
                </div>
                <div className="kanban-column-body">
                    {proposals.map(proposal => (
                        <ProposalCard key={proposal.id} proposal={proposal} onProposalClick={onProposalClick} />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <View 
            title="Pályázatok" 
            subtitle="Pályázatok követése Kanban-táblán."
            actions={
                <button className="button button-primary" onClick={onOpenProposalModal}>
                    <span className="material-symbols-outlined">add</span>Új Pályázat
                </button>
            }
        >
        <DndProvider backend={HTML5Backend}>
            <div className="proposals-board-container">
                <div className="kanban-board">
                    {statuses.map(status => (
                        <ProposalColumn
                            key={status}
                            status={status}
                            proposals={proposalsByStatus[status] || []}
                            onProposalDrop={handleProposalDrop}
                            onProposalClick={onProposalClick}
                        />
                    ))}
                </div>
            </div>
        </DndProvider>
        </View>
    );
};

const DocsView = ({ docs, onImageClick, onOpenEditor, onDeleteDoc }) => (
    <View 
        title="Dokumentumok" 
        subtitle="Jegyzetek, linkek és képek központi tárhelye."
        actions={<button className="button button-primary" onClick={() => onOpenEditor(null)}><span className="material-symbols-outlined">add</span>Új Jegyzet</button>}
    >
        <div className="docs-grid">
            {docs.map(doc => (
                <div key={doc.id} className="doc-card card">
                    {doc.type === 'image' && <img src={`data:image/jpeg;base64,${doc.content}`} alt={doc.title} className="doc-image-preview" onClick={() => onImageClick(`data:image/jpeg;base64,${doc.content}`)} />}
                    <div className="doc-card-content">
                        <h4><span className="material-symbols-outlined">{ {note: 'edit_note', link: 'link', image: 'image'}[doc.type] }</span> {doc.title}</h4>
                        {doc.type === 'link' ? <a href={doc.content} target="_blank" rel="noopener noreferrer" className="doc-link">{doc.content}</a> : <p className="doc-content-preview">{doc.type === 'note' ? doc.content.substring(0,100)+'...' : 'Kép'}</p>}
                        <div className="doc-card-footer">
                            <span>{formatDate(doc.createdAt)}</span>
                            {doc.type === 'note' && <button className="button button-secondary" onClick={() => onOpenEditor(doc)}><span className="material-symbols-outlined">edit</span>Szerkesztés</button>}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </View>
);

const TrainingView = ({ trainings, onOpenTrainingModal, onSaveTraining, onOpenAiLearningPathModal, ai, onAddNotification }) => (
    <View 
        title="Képzések" 
        subtitle="Szakmai fejlődés követése."
        actions={<>
            <button className="button button-secondary" onClick={() => onOpenTrainingModal(null)}><span className="material-symbols-outlined">add</span>Új Képzés</button>
            <button className="button button-primary" onClick={onOpenAiLearningPathModal}><span className="material-symbols-outlined">auto_awesome</span>Tanulási Útvonal Tervezése AI-val</button>
        </>}
    >
        <div className="training-grid">
            {trainings.map(training => (
                <div key={training.id} className="training-card card">
                    <h4>{training.title}</h4>
                    <p className="provider">{training.provider}</p>
                    <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${training.progress}%` }}></div></div>
                    <div className="training-card-footer">
                        <span className={`training-pill ${getTrainingStatusClass(training.status)}`}>{training.status}</span>
                        <button className="button button-icon-only" onClick={() => onOpenTrainingModal(training)}><span className="material-symbols-outlined">edit</span></button>
                    </div>
                </div>
            ))}
        </div>
    </View>
);

const TrainingModal = ({ isOpen, onClose, onSave, training }) => {
    const [title, setTitle] = useState(''); const [provider, setProvider] = useState(''); const [url, setUrl] = useState(''); const [description, setDescription] = useState(''); const [progress, setProgress] = useState(0);

    useEffect(() => {
        if(isOpen) {
            setTitle(training?.title || ''); setProvider(training?.provider || ''); setUrl(training?.url || ''); setDescription(training?.description || ''); setProgress(training?.progress || 0);
        }
    }, [isOpen, training]);

    if (!isOpen) return null;

    const handleSubmit = (e) => { e.preventDefault(); onSave({ id: training?.id, title, provider, url, description, progress }); };

    return (
        <div className="modal-overlay" onClick={onClose}><div className="modal-content card" onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h3>{training ? 'Képzés Módosítása' : 'Új Képzés'}</h3><button onClick={onClose} className="button-icon-close">&times;</button></div>
            <form onSubmit={handleSubmit} className="modal-form">
                <div className="form-group"><label>Cím</label><input type="text" value={title} onChange={e=>setTitle(e.target.value)} required /></div>
                <div className="form-group"><label>Szolgáltató</label><input type="text" value={provider} onChange={e=>setProvider(e.target.value)} /></div>
                <div className="form-group"><label>URL</label><input type="url" value={url} onChange={e=>setUrl(e.target.value)} /></div>
                <div className="form-group"><label>Leírás</label><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3}></textarea></div>
                <div className="form-group"><label>Haladás: {progress}%</label><input type="range" min="0" max="100" value={progress} onChange={e=>setProgress(parseInt(e.target.value))} /></div>
                <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Mégse</button><button type="submit" className="button button-primary">Mentés</button></div>
            </form>
        </div></div>
    );
};

const FinancesView = ({ transactions, budgets, ai, onAddNotification, onOpenTransactionModal, onOpenBudgetModal, onOpenAiBudgetModal, onOpenAiAnalysisModal }) => {
    const { income, expense, balance } = useMemo(() => {
        const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        return { income, expense, balance: income - expense };
    }, [transactions]);
    
    return (
        <View title="Pénzügyek" subtitle="Bevételek és kiadások követése."
            actions={<>
                <button className="button button-secondary" onClick={onOpenTransactionModal}><span className="material-symbols-outlined">add</span>Új Tranzakció</button>
                <button className="button button-secondary" onClick={onOpenBudgetModal}><span className="material-symbols-outlined">add_box</span>Új Költségvetés</button>
                <button className="button button-secondary" onClick={onOpenAiBudgetModal}><span className="material-symbols-outlined">auto_awesome</span>AI Javaslatok</button>
                <button className="button button-primary" onClick={onOpenAiAnalysisModal}><span className="material-symbols-outlined">query_stats</span>Pénzügyi Elemzés AI-val</button>
            </>}>
            <div className="finances-view-layout">
                <div className="card summary-cards">
                    <div className="summary-card income"><h4>Bevétel</h4><p>{new Intl.NumberFormat('hu-HU').format(income)} Ft</p></div>
                    <div className="summary-card expense"><h4>Kiadás</h4><p>{new Intl.NumberFormat('hu-HU').format(expense)} Ft</p></div>
                    <div className="summary-card balance"><h4>Egyenleg</h4><p>{new Intl.NumberFormat('hu-HU').format(balance)} Ft</p></div>
                </div>
                <div className="card budgets-widget-card">
                    <h4>Költségvetések</h4>
                    <div className="budget-items-container">
                        {budgets.length > 0 ? budgets.map(budget => {
                            const spent = transactions.filter(t => t.type === 'expense' && t.category === budget.category).reduce((sum, t) => sum + t.amount, 0);
                            const percentage = (spent / budget.amount) * 100;
                            const progressColor = percentage > 90 ? 'red' : percentage > 70 ? 'yellow' : 'green';
                            return (<div key={budget.id} className="budget-item">
                                <div className="budget-item-header"><span>{budget.category}</span><span>{new Intl.NumberFormat('hu-HU').format(spent)} / {new Intl.NumberFormat('hu-HU').format(budget.amount)} Ft</span></div>
                                <div className="progress-bar-budget"><div className={`progress-bar-budget-fill ${progressColor}`} style={{width: `${Math.min(percentage, 100)}%`}}></div></div>
                            </div>)
                        }) : <p>Nincsenek beállított költségvetések.</p>}
                    </div>
                </div>
                <div className="card transaction-list-card">
                    <h4>Legutóbbi Tranzakciók</h4>
                    <ul>
                        {transactions.slice(0, 10).map(t => <li key={t.id} className="transaction-item">
                            <span className={`type-indicator ${t.type}`}></span>
                            <span className="title">{t.title}</span>
                            <span className="category" style={{background: getCategoryColor(t.category)}}>{t.category}</span>
                            <span className="date">{formatDate(t.date)}</span>
                            <span className={`amount ${t.type}`}>{t.type === 'expense' ? '-' : '+'}{new Intl.NumberFormat('hu-HU').format(t.amount)} Ft</span>
                        </li>)}
                    </ul>
                </div>
            </div>
        </View>
    );
};

const BudgetModal = ({ isOpen, onClose, onSave }) => {
    const [category, setCategory] = useState<FinancialCategory>('Élelmiszer');
    const [amount, setAmount] = useState('');
    if (!isOpen) return null;
    const handleSubmit = e => { e.preventDefault(); onSave({ category, amount: parseFloat(amount) }); };
    return <div className="modal-overlay" onClick={onClose}><div className="modal-content card" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Új Költségvetés</h3><button onClick={onClose} className="button-icon-close">&times;</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group"><label>Kategória</label><select value={category} onChange={e => setCategory(e.target.value as FinancialCategory)}>{['Élelmiszer', 'Rezsi', 'Utazás', 'Szórakozás', 'Egyéb kiadás'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="form-group"><label>Havi keret (Ft)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Mégse</button><button type="submit" className="button button-primary">Mentés</button></div>
        </form>
    </div></div>;
};

const AiBudgetSuggestionModal = ({ isOpen, onClose, transactions, ai, onAddBudgets, onAddNotification }) => {
    const [step, setStep] = useState('loading');
    const [suggestions, setSuggestions] = useState([]);
    useEffect(() => {
        if (!isOpen) return;
        const generateSuggestions = async () => {
            setStep('loading'); setSuggestions([]);
            const schema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { category: { type: Type.STRING, enum: ['Élelmiszer', 'Rezsi', 'Utazás', 'Szórakozás', 'Egyéb kiadás'] }, amount: { type: Type.NUMBER }, reasoning: { type: Type.STRING } }, required: ['category', 'amount', 'reasoning'] } };
            const prompt = `Te egy pénzügyi tanácsadó vagy. Elemezd a felhasználó elmúlt havi tranzakcióit, és javasolj reális havi költségvetési kereteket a főbb kiadási kategóriákra. Minden javaslathoz adj egy rövid, adatokon alapuló indoklást. A válaszod JSON formátumú legyen a megadott séma szerint.\n\nTranzakciók:\n${JSON.stringify(transactions.filter(t=>t.type==='expense'))}`;
            try {
                const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt, config: { responseMimeType: "application/json", responseSchema: schema } });
                const parsedSuggestions = JSON.parse(response.text.trim()).map(s => ({ ...s, checked: true }));
                setSuggestions(parsedSuggestions);
                setStep('review');
            } catch (err) { console.error("AI Budget Error:", err); onAddNotification({ message: 'Hiba a javaslatok generálása közben.', type: 'error' }); onClose(); }
        };
        generateSuggestions();
    }, [isOpen, transactions, ai, onAddNotification, onClose]);

    const handleToggle = (category) => setSuggestions(prev => prev.map(s => s.category === category ? { ...s, checked: !s.checked } : s));
    const handleApply = () => { onAddBudgets(suggestions.filter(s => s.checked)); onClose(); };

    if (!isOpen) return null;
    return <div className="modal-overlay" onClick={onClose}><div className="modal-content card" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>AI Költségvetési Javaslatok</h3><button onClick={onClose} className="button-icon-close">&times;</button></div>
        {step === 'loading' ? <SkeletonLoader lines={4} /> : (
            <div className="ai-budget-suggestion-list">
                {suggestions.map(s => (<div key={s.category} className="suggestion-item">
                    <input type="checkbox" checked={s.checked} onChange={() => handleToggle(s.category)} />
                    <div className="suggestion-details"><strong>{s.category}: {new Intl.NumberFormat('hu-HU').format(s.amount)} Ft</strong><p>{s.reasoning}</p></div>
                </div>))}
            </div>
        )}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Mégse</button><button type="button" className="button button-primary" onClick={handleApply}>Kijelöltek Alkalmazása</button></div>
    </div></div>;
};

const AiFinancialAnalysisModal = ({ isOpen, onClose, transactions, ai, onAddNotification }) => {
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    useEffect(() => {
        if (!isOpen) return;
        const generateAnalysis = async () => {
            setIsLoading(true); setAnalysis('');
            const prompt = `Te egy pénzügyi tanácsadó vagy. Elemezd a felhasználó elmúlt havi tranzakcióit. Készíts egy rövid, markdown formátumú elemzést a költési szokásairól. Emeld ki a top 3 kiadási kategóriát, és adj 2-3 konkrét, megvalósítható spórolási tippet az adatok alapján. Legyen barátságos a hangvétel.\n\nTranzakciók:\n${JSON.stringify(transactions)}`;
            try {
                const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
                setAnalysis(response.text);
            } catch (err) { console.error("AI Analysis Error:", err); onAddNotification({ message: 'Hiba az elemzés generálása közben.', type: 'error' }); onClose(); } finally { setIsLoading(false); }
        };
        generateAnalysis();
    }, [isOpen, transactions, ai, onAddNotification, onClose]);

    if (!isOpen) return null;
    return <div className="modal-overlay" onClick={onClose}><div className="modal-content card ai-financial-analysis-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>AI Pénzügyi Elemzés</h3><button onClick={onClose} className="button-icon-close">&times;</button></div>
        {isLoading ? <SkeletonLoader lines={5} /> : <div className="analysis-report-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown></div>}
    </div></div>;
};


const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
