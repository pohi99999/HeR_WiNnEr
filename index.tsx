import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { createPortal } from 'react-dom';
import { GoogleGenAI, Chat, GenerateContentResponse, Content, Part, Type, FunctionDeclaration, Tool, SendMessageParameters, Modality, LiveServerMessage } from "@google/genai";
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// FIX: Removed the conflicting global declaration for `window.aistudio`.
// The error "Subsequent property declarations must have the same type"
// indicates that this property is already declared elsewhere.

const API_KEY = process.env.API_KEY;

// --- AUDIO UTILS FOR LIVE API ---
const audioContextOptions = { sampleRate: 16000 }; // 16kHz for input
const outputSampleRate = 24000; // 24kHz for output

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

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
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


// --- DATA INTERFACES ---
interface User {
    name: string;
    email: string;
    avatarInitial: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    isAction?: boolean; // For tool call messages
    groundingMetadata?: any; // Store search/map results
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
    { id: 'doc-5', type: 'image', title: 'AI által generált kép', content: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQuImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNhZmU5ZWEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiM1NiJiOGI0Ii8+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZykiLz48L3N2Zz4=', createdAt: new Date('2024-08-01').toISOString() }
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

const mockGoogleCalendarEvents: PlannerEvent[] = [
    { id: 'gcal-event-1', title: '[GCal] Negyedéves Stratégiai Míting', date: '2024-08-06', time: '14:00', duration: 120, type: 'meeting', location: 'Google Meet', source: 'Google Calendar' },
    { id: 'gcal-event-2', title: '[GCal] Fogorvos', date: '2024-08-08', time: '11:30', duration: 45, type: 'personal', location: 'Rendelő', source: 'Google Calendar' },
    { id: 'gcal-event-3', title: '[GCal] P-Day Kft. - Heti Szinkron', date: '2024-08-12', time: '09:00', duration: 60, type: 'work', location: 'Google Meet', source: 'Google Calendar' },
    { id: 'gcal-event-4', title: '[GCal] Ebéd Annával', date: '2024-08-14', time: '12:30', duration: 90, type: 'personal', source: 'Google Calendar' },
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
            { id: 'live_chat', label: 'Live Chat', icon: 'graphic_eq' },
            { id: 'route_planner', label: 'Útvonaltervező', icon: 'map' },
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
            status: 'Teendő', // Default status
            createdAt: new Date().toISOString()
        };
        setData(prev => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
        return newTask;
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

const Icon = ({ name, filled, className, style }: { name: string, filled?: boolean, className?: string, style?: React.CSSProperties }) => <span className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className || ''}`} style={style}>{name}</span>;


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
                    <button onClick={onClose} className="btn btn-icon btn-secondary close-modal-btn"><Icon name="close" /></button>
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
                <span className="nav-link-label">{item.label}</span>
            </a>
        </li>
    );

    const NavSection: React.FC<{ item: NavItem }> = ({ item }) => {
        const isOpen = openSections[item.id] || false;
        return (
            <li>
                <button className={`nav-link nav-section-header ${isOpen ? 'open' : ''}`} onClick={() => setOpenSections(s => ({...s, [item.id]: !s[item.id]}))}>
                    <Icon name={item.icon} />
                    <span className="nav-link-label">{item.label}</span>
                    <Icon name="chevron_right" className="nav-section-indicator" />
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
                    {(!isCollapsed || isMobile) && <h2 className="app-title">P-Day Light</h2>}
                     {!isMobile && (
                        <button className="collapse-toggle" onClick={() => setCollapsed(!isCollapsed)} aria-label={isCollapsed ? "Sidebar kibontása" : "Sidebar összecsukása"}>
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

const GlobalHeader = ({ currentView, onMenuClick, user, onLogout }: { currentView: string, onMenuClick: () => void, user: User | null, onLogout: () => void }) => {
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const [isDropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentNavItem = navItems.flatMap(i => i.subItems || i).find(i => i.id === currentView);

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
             {isMobile && (
                <button className="mobile-menu-toggle btn btn-icon btn-secondary" onClick={onMenuClick} aria-label="Mobil menü megnyitása">
                    <Icon name="menu" />
                </button>
            )}
            <h3 className="view-title">{currentNavItem?.label || 'Irányítópult'}</h3>
            <div className="global-header-actions">
                {user && (
                    <div className="user-profile-container" ref={dropdownRef}>
                        <button className={`user-profile-button ${isDropdownOpen ? 'open' : ''}`} onClick={() => setDropdownOpen(!isDropdownOpen)}>
                            <div className="avatar-sm">{user.avatarInitial}</div>
                            {!isMobile && <span className="user-name">{user.name}</span>}
                             <Icon name="expand_more" />
                        </button>
                        {isDropdownOpen && (
                            <div className="profile-dropdown">
                                <div className="dropdown-user-info">
                                    <strong>{user.name}</strong>
                                    <span>{user.email}</span>
                                </div>
                                <button onClick={() => { onLogout(); setDropdownOpen(false); }} className="dropdown-item">
                                    <Icon name="logout" />
                                    <span>Kijentkezés</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

// --- AUTHENTICATION VIEW ---
const LoginView = ({ onLogin }: { onLogin: (user: User) => void }) => {
    const handleLoginClick = () => {
        // In a real app, this would trigger the Google OAuth flow.
        // Here, we simulate a successful login with mock user data.
        onLogin({
            name: 'Pohánka Péter',
            email: 'iam@peterpohanka.com',
            avatarInitial: 'P',
        });
    };

    return (
        <div className="login-view-container">
            <div className="aurora-background">
                <div className="aurora-shape aurora-shape1"></div>
                <div className="aurora-shape aurora-shape2"></div>
                <div className="aurora-shape aurora-shape3"></div>
            </div>
            <div className="login-box">
                <h2 className="app-title">P-Day Light</h2>
                <p className="login-subtitle">A személyes és munkahelyi asszisztensed. Jelentkezz be a Google-fiókoddal a funkciók teljes eléréséhez.</p>
                <button className="google-signin-btn" onClick={handleLoginClick}>
                    <svg className="google-logo" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                    <span>Bejelentkezés Google-fiókkal</span>
                </button>
            </div>
        </div>
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
                model: "gemini-2.5-flash-lite",
                contents: [{ parts: [{ text: prompt }] }],
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
                    <h4 className="card-title">Heti Feladat Összefoglaló</h4>
                    <span className="ai-badge">AI</span>
                </div>
            }>
                {isGeneratingSummary ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p className="loading-message">Heti összefoglaló generálása... Ez eltarthat egy percig.</p>
                    </div>
                ) : weeklySummary ? (
                    <>
                        <div className="summary-content-scrollable react-markdown-content">
                            {/* FIX: The className prop is not valid on ReactMarkdown. Moved it to the parent div. */}
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
                        <p className="empty-state-message">Kattintson az alábbi gombra a heti feladat-összefoglaló elkészítéséhez és a fókuszterületek javaslatához.</p>
                        <button className="btn btn-primary generate-summary-btn" onClick={handleGenerateWeeklySummary} aria-label="Heti összefoglaló generálása">
                            <Icon name="auto_awesome" />
                            <span>Összefoglaló Generálása</span>
                        </button>
                    </div>
                )}
            </Card>
            <Card className="stagger-item" style={{animationDelay: '100ms'}} header={<h4 className="card-title">Hamarosan lejáró feladatok</h4>}>
                <ul className="quick-list">
                    {tasks.filter(t => t.dueDate && t.status !== 'Kész').sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5).map(task => (
                        <li key={task.id}>
                            <span className="task-list-title">{task.title}</span>
                            <span className={`task-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                        </li>
                    ))}
                </ul>
            </Card>
            <Card className="stagger-item" style={{animationDelay: '200ms'}} header={<h4 className="card-title">Legutóbbi Emailek</h4>}>
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

const PlannerView = ({ events, isConnected, onConnectToggle }: { events: PlannerEvent[], isConnected: boolean, onConnectToggle: () => void }) => {
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
        <div className="view-fade-in planner-view">
            <Card header={
                <div className="view-header" style={{marginBottom: 0, flexWrap: 'nowrap'}}>
                    <h2 className="view-title">Tervező</h2>
                    <div className="planner-header-actions">
                         <button className={`btn ${isConnected ? 'btn-secondary' : 'btn-primary'}`} onClick={onConnectToggle}>
                            <svg className="google-logo" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                                <path fill="none" d="M0 0h48v48H0z"></path>
                            </svg>
                            <span>{isConnected ? 'Naptár Lecsatlakoztatva' : 'Google Naptárral'}</span>
                        </button>
                        <div className="calendar-controls">
                            <button className="btn btn-icon btn-secondary" onClick={() => changeMonth(-1)} aria-label="Previous month"><Icon name="chevron_left" /></button>
                             <h3 className="calendar-current-date">{`${year} ${monthName}`}</h3>
                            <button className="btn btn-icon btn-secondary" onClick={() => changeMonth(1)} aria-label="Next month"><Icon name="chevron_right" /></button>
                            <button className="btn btn-secondary" onClick={goToToday}>Ma</button>
                        </div>
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
                    <h2 className="view-title">Feladatok</h2>
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
                model: "gemini-2.5-flash-lite",
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
        <div className="view-fade-in email-view">
            <Card fullHeight className="email-view-card">
                 <div className="email-view-layout">
                    <div className="email-sidebar">
                        <div className="email-actions">
                            <button className="btn btn-primary new-email-btn">Új Email</button>
                        </div>
                        <ul className="email-folders">
                            <li className={activeCategory === 'inbox' ? 'active' : ''} onClick={() => setActiveCategory('inbox')}>
                                <Icon name="inbox" /> <span className="folder-name">Beérkezett</span>
                            </li>
                             <li className={activeCategory === 'sent' ? 'active' : ''} onClick={() => setActiveCategory('sent')}>
                                <Icon name="send" /> <span className="folder-name">Elküldött</span>
                            </li>
                        </ul>
                    </div>
                    <div className="email-list-panel custom-scrollbar">
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
                    <div className="email-content-panel custom-scrollbar">
                        {selectedEmail ? (
                             <>
                                <div className="email-content-header">
                                    <h3 className="email-content-subject">{selectedEmail.subject}</h3>
                                    <div className="email-content-actions">
                                        <button className="btn btn-secondary btn-icon-text create-task-btn" onClick={handleCreateTaskFromEmail} disabled={isProcessing}>
                                            <Icon name={isProcessing ? 'progress_activity' : 'auto_awesome'} />
                                            {isProcessing ? 'Feldolgozás...' : 'Feladat Létrehozása'}
                                        </button>
                                        <button className="btn btn-icon btn-secondary toggle-importance-btn" onClick={() => toggleImportance(selectedEmail.id)}>
                                            <Icon name="star" filled={selectedEmail.important} />
                                        </button>
                                    </div>
                                </div>
                                <div className="email-content-meta">
                                    <p><strong>Feladó:</strong> <span className="email-meta-value">{selectedEmail.sender}</span></p>
                                    <p><strong>Címzett:</strong> <span className="email-meta-value">{selectedEmail.recipient}</span></p>
                                    <p><strong>Dátum:</strong> <span className="email-meta-value">{new Date(selectedEmail.timestamp).toLocaleString()}</span></p>
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
            <h4 className="project-card-title">{project.title}</h4>
            <p className="project-card-description">{project.description}</p>
            <div className="project-team">
                {project.team.map((member, index) => (
                    <div key={index} className="avatar-sm" title={member}>{member.charAt(0)}</div>
                ))}
            </div>
            <div className="project-progress">
                <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
                <span className="progress-text">{Math.round(progress)}%</span>
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
                <h3 className="kanban-column-title">{status}</h3>
                <span className="task-count">{projects.length}</span>
            </div>
            <div className="kanban-column-body custom-scrollbar">
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
                    <h2 className="view-title">Projektek</h2>
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
            <Card header={<h4 className="card-title">Projektek Státusz Szerint</h4>} className="stagger-item">
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
            <Card header={<h4 className="card-title">Közelgő Határidők</h4>} className="stagger-item" style={{ animationDelay: '100ms' }}>
                <ul className="quick-list">
                    {upcomingDeadlines.map(p => {
                         const daysLeft = Math.ceil((new Date(p.dueDate!).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                        return (
                             <li key={p.id}>
                                <div>
                                    <Icon name="event" />
                                    <span className="list-item-text">{p.title}</span>
                                </div>
                                <span className="deadline-days">{p.dueDate} ({daysLeft} nap)</span>
                            </li>
                        )
                    })}
                </ul>
            </Card>
             <Card header={<h4 className="card-title">Kiemelt Feladatok</h4>} className="stagger-item" style={{ gridColumn: '1 / -1', animationDelay: '200ms' }}>
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
        <div className="view-fade-in proposals-view">
            <div className="view-header">
                <h2 className="view-title">Pályázatok</h2>
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
        <div className="view-fade-in trainings-view">
            <div className="view-header">
                <h2 className="view-title">Képzések</h2>
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
                        <a href={`mailto:${contact.email}`} className="contact-link">{contact.email}</a>
                    </div>
                )}
                {contact.phone && (
                    <div className="contact-detail-item">
                        <Icon name="phone" />
                        <span className="contact-phone">{contact.phone}</span>
                    </div>
                )}
                {contact.notes && (
                     <div className="contact-notes">
                        <p className="contact-notes-text">{contact.notes}</p>
                    </div>
                )}
            </div>
            <div className="contact-card-footer">
                {(contact.linkedProjectIds?.length! > 0 || contact.linkedProposalIds?.length! > 0) && ( // Use non-null assertion if lengths are checked
                     <div className="contact-links">
                        <Icon name="link" />
                        <span>
                            {contact.linkedProjectIds!.length > 0 && `${contact.linkedProjectIds!.length} projekt`}
                            {(contact.linkedProjectIds!.length > 0 && contact.linkedProposalIds!.length > 0) && ', '}
                            {contact.linkedProposalIds!.length > 0 && `${contact.linkedProposalIds!.length} pályázat`}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};


const ContactsView = ({ contacts }: { contacts: Contact[] }) => {
    return (
        <div className="view-fade-in contacts-view">
            <div className="view-header">
                <h2 className="view-title">Névjegyek</h2>
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
                <h4 className="card-title">Bevétel</h4>
                <p className="amount income">{income.toLocaleString('hu-HU')} Ft</p>
            </Card>
            <Card className="finance-summary-card stagger-item" style={{animationDelay: '100ms'}}>
                <h4 className="card-title">Kiadás</h4>
                <p className="amount expense">{Math.abs(expense).toLocaleString('hu-HU')} Ft</p>
            </Card>
            <Card className="finance-summary-card stagger-item" style={{animationDelay: '200ms'}}>
                <h4 className="card-title">Egyenleg</h4>
                <p className="amount">{balance.toLocaleString('hu-HU')} Ft</p>
            </Card>
            <Card className="stagger-item" style={{animationDelay: '300ms', gridColumn: '1 / -1'}} header={<h4 className="card-title">Költségvetés</h4>}>
                <div className="budget-list">
                    {budgets.map(b => {
                        const spent = Math.abs(thisMonthTransactions.filter(t => t.category === b.category).reduce((s, t) => s + t.amount, 0));
                        const percent = (spent / b.amount) * 100;
                        return (
                             <div key={b.id} className="budget-item">
                                <div className="budget-info">
                                    <span className="budget-category">{b.category}</span>
                                    <span className="budget-amounts">{spent.toLocaleString()} / {b.amount.toLocaleString()} Ft</span>
                                </div>
                                 <div className="progress-bar-container">
                                    <div className="progress-bar" style={{width: `${Math.min(percent, 100)}%`}}></div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Card>
             <Card className="stagger-item" style={{animationDelay: '400ms', gridColumn: '1 / -1'}} header={<h4 className="card-title">Legutóbbi Tranzakciók</h4>}>
                <ul className="transaction-list">
                    {transactions.slice(0, 5).map(t => (
                        <li key={t.id}>
                            <Icon name={t.type === 'income' ? 'arrow_upward' : 'arrow_downward'} className={`transaction-icon ${t.type}`} />
                            <span className="transaction-title">{t.title}</span>
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
            case 'link': return <div className="doc-card link-card"><Icon name="link"/><h4>{doc.title}</h4><a href={doc.content} target="_blank" rel="noopener noreferrer">{doc.content}</a></div>
            case 'image': return <div className="doc-card image-card"><h4>{doc.title}</h4><img src={doc.content} alt={doc.title}/></div>
            default: return null;
        }
    }

    return (
        <div className="view-fade-in docs-view-grid">
            <Card header={<h4 className="card-title">Új jegyzet</h4>} className="add-doc-card">
                <form onSubmit={handleSubmit} className="add-doc-form">
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Jegyzet címe..." className="form-input" />
                    <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Tartalom..." rows={5} className="form-textarea"></textarea>
                    <button type="submit" className="btn btn-primary">Mentés</button>
                </form>
            </Card>
            {initialDocs.map(doc => <DocCard key={doc.id} doc={doc} />)}
        </div>
    );
};

const GeminiChatView = ({ addTask, addNotification }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'init',
            role: 'model',
            text: "Szia! Én a P-Day Light asszisztensed vagyok. Hozzáadhatok új feladatokat, összefoglalhatom a projektjeidet, és válaszolhatok a kérdéseidre. Miben segíthetek?",
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const [input, setInput] = useState('');
    const [isThinkingMode, setIsThinkingMode] = useState(false);
    const chatRef = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const availableTools: Record<string, Function> = {
        addTask: (args: { title: string, description?: string, dueDate?: string, priority: TaskPriority }) => {
            // Ensure priority is one of the allowed types, default if not.
            const validPriorities: TaskPriority[] = ['Alacsony', 'Közepes', 'Magas', 'Kritikus'];
            const priority = validPriorities.includes(args.priority) ? args.priority : 'Közepes';
            
            const newTask = addTask({
                ...args,
                priority: priority,
                status: 'Teendő',
                category: 'Munka'
            });
            addNotification({ message: `Feladat létrehozva: "${newTask.title}"`, type: 'success' });
            return { success: true, taskId: newTask.id, title: newTask.title };
        }
    };

    useEffect(() => {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const addTaskTool: FunctionDeclaration = {
            name: "addTask",
            description: "Új feladatot hoz létre a felhasználó teendőlistáján. A prioritás lehet 'Alacsony', 'Közepes', 'Magas', vagy 'Kritikus'.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "A feladat címe." },
                    description: { type: Type.STRING, description: "A feladat részletes leírása (opcionális)." },
                    dueDate: { type: Type.STRING, description: "A feladat határideje YYYY-MM-DD formátumban (opcionális)." },
                    priority: { type: Type.STRING, description: "A feladat prioritása." },
                },
                required: ["title", "priority"]
            }
        };

        chatRef.current = ai.chats.create({
            model: 'gemini-3-pro-preview',
            config: {
                tools: [{ functionDeclarations: [addTaskTool] }, { googleSearch: {} }, { googleMaps: {} }],
                systemInstruction: "You are a helpful assistant for the P-Day Light application. Today's date is " + new Date().toLocaleDateString('hu-HU') + ". When a user asks to add a task, use the addTask tool. Always confirm the action after the tool has been used successfully."
            }
        });
    }, [addTask, addNotification]);
    
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: generateId(),
            role: 'user',
            text: input,
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            if (!chatRef.current) throw new Error("Chat not initialized.");

            // Thinking config
            const config = isThinkingMode ? { thinkingConfig: { thinkingBudget: 32768 } } : {};

            let stream = await chatRef.current.sendMessageStream({
                message: userMessage.text,
                config: {
                    ...config
                }
            });

            let text = '';
            let functionCalls: any[] = [];
            let groundingChunks: any[] = [];

            for await (const chunk of stream) {
                 if (chunk.functionCalls) {
                    functionCalls.push(...chunk.functionCalls);
                }
                if (chunk.text) {
                    text += chunk.text;
                }
                if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                    groundingChunks.push(...chunk.candidates[0].groundingMetadata.groundingChunks);
                }
            }
            
            if (functionCalls.length > 0) {
                 const actionMessage: ChatMessage = {
                    id: generateId(),
                    role: 'model',
                    text: `Eszköz használata: \`${functionCalls[0].name}\`...`,
                    isAction: true,
                };
                setMessages(prev => [...prev, actionMessage]);

                const tool = availableTools[functionCalls[0].name];
                if (tool) {
                    const result = tool(functionCalls[0].args);
                    const responseStream = await chatRef.current.sendMessageStream({
                        message: [{ functionResponse: { name: functionCalls[0].name, response: result } }]
                    });

                    let confirmationText = '';
                    for await (const chunk of responseStream) {
                        confirmationText += chunk.text;
                    }
                     setMessages(prev => prev.map(msg => msg.id === actionMessage.id ? { ...msg, text: confirmationText, isAction: false } : msg));

                } else {
                     throw new Error(`Tool ${functionCalls[0].name} not found.`);
                }
            } else {
                const modelMessage: ChatMessage = {
                    id: generateId(),
                    role: 'model',
                    text: text,
                    groundingMetadata: groundingChunks.length > 0 ? groundingChunks : undefined
                };
                setMessages(prev => [...prev, modelMessage]);
            }

        } catch (error: any) {
            console.error("Error during chat:", error);
            addNotification({ message: `Hiba a válasszal: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
            const errorMessage: ChatMessage = {
                id: generateId(),
                role: 'model',
                text: "Sajnálom, hiba történt a válasz feldolgozása közben.",
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="view-fade-in gemini-chat-view">
            <Card fullHeight header={
                <div className="chat-header-flex">
                    <h2 className="view-title">Gemini Chat</h2>
                    <div className="thinking-toggle">
                        <label className="toggle-switch">
                            <input type="checkbox" checked={isThinkingMode} onChange={(e) => setIsThinkingMode(e.target.checked)} />
                            <span className="slider round"></span>
                        </label>
                        <span className="toggle-label">Gondolkodó mód</span>
                    </div>
                </div>
            }>
                <div className="chat-window">
                    <div className="message-list custom-scrollbar">
                        {messages.map(msg => (
                            <div key={msg.id} className={`message-bubble-wrapper role-${msg.role}`}>
                                <div className="message-bubble">
                                    {msg.isAction ? (
                                        <div className="action-call-content">
                                            <div className="spinner-small"></div> <span>{msg.text}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.text}
                                            </ReactMarkdown>
                                            {msg.groundingMetadata && (
                                                <div className="grounding-citations">
                                                    <h4>Források:</h4>
                                                    <ul>
                                                        {msg.groundingMetadata.map((chunk: any, idx: number) => {
                                                            if (chunk.web?.uri) {
                                                                return <li key={idx}><a href={chunk.web.uri} target="_blank" rel="noopener noreferrer">{chunk.web.title || chunk.web.uri}</a></li>
                                                            }
                                                            return null;
                                                        })}
                                                    </ul>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                         {isLoading && !messages[messages.length - 1].isAction && (
                            <div className="message-bubble-wrapper role-model">
                                <div className="message-bubble is-thinking">
                                    <div className="typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                    <form className="chat-input-form" onSubmit={handleSendMessage}>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage(e as any);
                                }
                            }}
                            placeholder="Írjon üzenetet..."
                            className="chat-input"
                            rows={1}
                            disabled={isLoading}
                        />
                        <button type="submit" className="btn btn-primary btn-icon" disabled={isLoading || !input.trim()}>
                            <Icon name="send" />
                        </button>
                    </form>
                </div>
            </Card>
        </div>
    );
};

const LiveView = () => {
    const [isActive, setIsActive] = useState(false);
    const [statusMessage, setStatusMessage] = useState("Kattints a start gombra a beszélgetéshez");
    
    // Audio Context Refs
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const sessionRef = useRef<any>(null); // To store session object if needed for cleanup
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    const stopSession = () => {
        setIsActive(false);
        setStatusMessage("Kapcsolat bontva");
        
        // Close session if possible
        if (sessionRef.current) {
             // Assuming session object might have close, or we just stop handling events
             // sessionRef.current.close(); 
        }

        // Close Audio Contexts
        if (inputAudioContextRef.current) {
            inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }
        if (outputAudioContextRef.current) {
            outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }
        
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    };

    const startSession = async () => {
        try {
            setIsActive(true);
            setStatusMessage("Kapcsolódás...");

            const ai = new GoogleGenAI({ apiKey: API_KEY });
            
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            inputAudioContextRef.current = inputAudioContext;
            outputAudioContextRef.current = outputAudioContext;
            
            const outputNode = outputAudioContext.createGain();
            outputNode.connect(outputAudioContext.destination);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Connect to Live API
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setStatusMessage("Kapcsolódva! Beszélhet.");
                        // Stream audio from microphone
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            
                            // Create PCM Blob
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };

                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                         const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                         if (base64EncodedAudioString) {
                            nextStartTimeRef.current = Math.max(
                                nextStartTimeRef.current,
                                outputAudioContext.currentTime
                            );
                            
                            const audioBuffer = await decodeAudioData(
                                decode(base64EncodedAudioString),
                                outputAudioContext,
                                24000,
                                1
                            );
                            
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputNode);
                            source.addEventListener('ended', () => {
                                sourcesRef.current.delete(source);
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                         }
                         
                         if (message.serverContent?.interrupted) {
                             sourcesRef.current.forEach(source => {
                                 source.stop();
                                 sourcesRef.current.delete(source);
                             });
                             nextStartTimeRef.current = 0;
                         }
                    },
                    onclose: () => {
                        setStatusMessage("Kapcsolat lezárva.");
                        setIsActive(false);
                    },
                    onerror: (e) => {
                        console.error("Live API Error", e);
                        setStatusMessage("Hiba történt.");
                        setIsActive(false);
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                    }
                }
            });
            
            sessionPromise.then(sess => {
                sessionRef.current = sess;
            });

        } catch (error) {
            console.error("Failed to start session", error);
            setStatusMessage("Nem sikerült elindítani a munkamenetet.");
            setIsActive(false);
        }
    };

    return (
        <div className="view-fade-in live-view">
            <Card fullHeight header={<h2 className="view-title">Live Chat</h2>}>
                <div className="live-container">
                    <div className={`visualizer-orb ${isActive ? 'active' : ''}`}>
                         <div className="orb-ring ring-1"></div>
                         <div className="orb-ring ring-2"></div>
                         <div className="orb-ring ring-3"></div>
                         <div className="orb-core">
                            <Icon name="mic" className="orb-icon" />
                         </div>
                    </div>
                    <div className="live-status">{statusMessage}</div>
                    <div className="live-controls">
                        {!isActive ? (
                            <button className="btn btn-primary btn-large" onClick={startSession}>
                                <Icon name="play_arrow" /> Indítás
                            </button>
                        ) : (
                            <button className="btn btn-warning btn-large" onClick={stopSession}>
                                <Icon name="stop" /> Leállítás
                            </button>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};

const RoutePlannerView = ({ addNotification }: { addNotification: (n: Omit<Notification, 'id'>) => void }) => {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [mode, setMode] = useState('driving');
    const [result, setResult] = useState('');
    const [groundingMetadata, setGroundingMetadata] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handlePlanRoute = async () => {
        if (!origin || !destination) {
            addNotification({ message: 'Kérem adja meg az indulási és érkezési helyet!', type: 'error' });
            return;
        }

        setIsLoading(true);
        setResult('');
        setGroundingMetadata(null);

        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const prompt = `Plan a route from ${origin} to ${destination} using ${mode} mode. Provide distance, duration, and detailed step-by-step instructions.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleMaps: {} }],
                }
            });

            setResult(response.text);
            if (response.candidates?.[0]?.groundingMetadata) {
                setGroundingMetadata(response.candidates[0].groundingMetadata);
            }

        } catch (error: any) {
            console.error("Route planning error:", error);
            addNotification({ message: `Hiba az útvonaltervezés során: ${error.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="view-fade-in route-planner-view">
            <div className="route-planner-grid">
                <Card header={<h2 className="view-title">Útvonaltervező</h2>} className="planner-input-card">
                    <div className="form-group">
                        <label>Honnan:</label>
                        <input type="text" className="form-input" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Indulási hely..." />
                    </div>
                    <div className="form-group">
                        <label>Hova:</label>
                        <input type="text" className="form-input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Érkezési hely..." />
                    </div>
                    <div className="form-group">
                        <label>Mód:</label>
                        <div className="option-buttons">
                            <button className={`btn btn-secondary ${mode === 'driving' ? 'active' : ''}`} onClick={() => setMode('driving')}><Icon name="directions_car" /> Autó</button>
                            <button className={`btn btn-secondary ${mode === 'walking' ? 'active' : ''}`} onClick={() => setMode('walking')}><Icon name="directions_walk" /> Gyalog</button>
                            <button className={`btn btn-secondary ${mode === 'bicycling' ? 'active' : ''}`} onClick={() => setMode('bicycling')}><Icon name="directions_bike" /> Kerékpár</button>
                            <button className={`btn btn-secondary ${mode === 'transit' ? 'active' : ''}`} onClick={() => setMode('transit')}><Icon name="directions_bus" /> Tömegközlekedés</button>
                        </div>
                    </div>
                    <button className="btn btn-primary plan-route-btn" onClick={handlePlanRoute} disabled={isLoading}>
                        <Icon name={isLoading ? 'progress_activity' : 'map'} />
                        {isLoading ? 'Tervezés...' : 'Tervezés'}
                    </button>
                </Card>
                <Card header={<h2 className="view-title">Útvonal</h2>} className="planner-result-card" fullHeight>
                    {result ? (
                        <div className="route-result-content custom-scrollbar">
                             <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                             {groundingMetadata?.groundingChunks && (
                                <div className="grounding-citations">
                                    <h4>Térkép Linkek:</h4>
                                    <ul>
                                        {groundingMetadata.groundingChunks.map((chunk: any, idx: number) => {
                                             // Maps grounding chunks structure varies, checking for common uri patterns
                                            if (chunk.maps?.uri) {
                                                return <li key={idx}><a href={chunk.maps.uri} target="_blank" rel="noopener noreferrer">Megnyitás Google Térképen ({chunk.maps.title || 'Térkép'})</a></li>
                                            }
                                             // Also check generic web uri if maps specific one is missing but web one exists for location
                                            if (chunk.web?.uri && chunk.web.uri.includes('google.com/maps')) {
                                                 return <li key={idx}><a href={chunk.web.uri} target="_blank" rel="noopener noreferrer">{chunk.web.title || 'Google Térkép'}</a></li>
                                            }
                                            return null;
                                        })}
                                    </ul>
                                </div>
                             )}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <Icon name="place" className="empty-state-icon" />
                            <p>Adja meg az adatokat az útvonaltervezéshez.</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

const MeetingAssistantView = () => <Card header={<h2 className="view-title">Meeting Asszisztens</h2>}><p>Meeting Asszisztens helyőrző</p></Card>;

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
    const [imageResolution, setImageResolution] = useState<'1K' | '2K' | '4K'>('1K');
    const [hasApiKey, setHasApiKey] = useState(false); // Unified key check for paid features

    useEffect(() => {
        checkApiKey();
    }, []);

    const checkApiKey = async () => {
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            setHasApiKey(hasKey);
        }
    };

    const handleSelectApiKey = async () => {
        if (window.aistudio && window.aistudio.openSelectKey) {
            await window.aistudio.openSelectKey();
            setHasApiKey(true);
            addNotification({ message: 'API kulcs kiválasztva.', type: 'info' });
        }
    };

    const resetToolStates = () => {
        setPrompt('');
        setGeneratedImageUrl(null);
        setGeneratedVideoUrl(null);
        setEditedImageUrl(null);
        setEditedVideoUrl(null);
        setImageFile(null);
        setVideoFile(null);
        setIsGenerating(false);
        setLoadingMessage('');
    };

    const handleGenerateImage = async () => {
        if (!prompt) {
            addNotification({ message: 'Kérjük, adjon meg egy leírást a kép generálásához.', type: 'error' });
            return;
        }
        if (!hasApiKey) {
             addNotification({ message: 'Ez a funkció saját API kulcsot igényel.', type: 'error' });
             return;
        }
        
        setIsGenerating(true);
        setLoadingMessage('Kép generálása (Pro)...');
        setGeneratedImageUrl(null);
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY }); 
            // Using gemini-3-pro-image-preview for high quality generation
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: { parts: [{ text: prompt }] },
                config: {
                    imageConfig: {
                        imageSize: imageResolution,
                        aspectRatio: "1:1"
                    }
                }
            });

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64EncodeString: string = part.inlineData.data;
                        const imageUrl = `data:image/png;base64,${base64EncodeString}`;
                        setGeneratedImageUrl(imageUrl);
                        addNotification({ message: 'Kép sikeresen generálva!', type: 'success' });
                        addDoc({ id: generateId(), type: 'image', title: `Generált Kép (${imageResolution}): ${prompt.substring(0, 30)}`, content: imageUrl, createdAt: new Date().toISOString() });
                        break;
                    }
                }
            } else {
                addNotification({ message: 'A kép generálása sikertelen.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error generating image:", error);
            if (error.message && error.message.includes("Requested entity was not found.")) {
                 addNotification({ message: 'Hiba. Kérjük, válassza ki újra az API kulcsot.', type: 'error' });
                 setHasApiKey(false); 
            } else {
                 addNotification({ message: `Hiba: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
            }
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
        if (!hasApiKey) {
            addNotification({ message: 'Ez a funkció saját API kulcsot igényel.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        setLoadingMessage('Videó generálása (ez eltarthat néhány percig)...');
        setGeneratedVideoUrl(null);

        let operation = null;
        try {
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            
            // Construct payload. Add image if present for Image-to-Video
            let imagePayload = undefined;
            if (imageFile) {
                const base64Data = await fileToBase64(imageFile);
                imagePayload = {
                    imageBytes: base64Data,
                    mimeType: imageFile.type
                };
            }

            operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: prompt,
                image: imagePayload, // Optional image input for Veo
                config: {
                    numberOfVideos: 1,
                    resolution: videoResolution,
                    aspectRatio: videoAspectRatio
                }
            });

            while (!operation.done) {
                setLoadingMessage('Videó generálása (még dolgozunk rajta)...');
                await new Promise(resolve => setTimeout(resolve, 10000)); 
                operation = await ai.operations.getVideosOperation({ operation: operation });
            }

            if (operation.response?.generatedVideos?.[0]?.video?.uri) {
                const downloadLink = operation.response.generatedVideos[0].video.uri;
                const videoUrl = `${downloadLink}&key=${API_KEY}`;
                setGeneratedVideoUrl(videoUrl);
                addNotification({ message: 'Videó sikeresen generálva!', type: 'success' });
                addDoc({ id: generateId(), type: 'link', title: `Generált Videó: ${prompt.substring(0, 30)}`, content: videoUrl, createdAt: new Date().toISOString() });
            } else {
                addNotification({ message: 'A videó generálása sikertelen.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error generating video:", error);
            if (error.message && error.message.includes("Requested entity was not found.")) {
                 addNotification({ message: 'Hiba. Kérjük, válassza ki újra az API kulcsot.', type: 'error' });
                 setHasApiKey(false); 
            } else {
                addNotification({ message: `Hiba: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
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
            const ai = new GoogleGenAI({ apiKey: API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image', // Prompt says use 2.5 flash image for editing
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
                addNotification({ message: 'A kép szerkesztése sikertelen.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Error editing image:", error);
            addNotification({ message: `Hiba: ${error.message || 'Ismeretlen hiba'}`, type: 'error' });
        } finally {
            setIsGenerating(false);
            setLoadingMessage('');
        }
    };

    // Note: Edit Video (Extend) was removed or kept minimal as Veo editing (extend) logic is complex and partially covered. 
    // Focusing on Image-to-Video as requested. The UI for Edit Video remains but logic was mostly placeholder in previous file.

    const renderContent = () => {
        switch (activeTool) {
            case 'generate_image':
                return (
                    <>
                        {!hasApiKey && (
                            <div className="api-key-warning">
                                <p className="warning-message">A Pro kép generálás prémium szolgáltatás. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="warning-link">Számlázási információk</a></p>
                                <button className="btn btn-warning select-api-key-btn" onClick={handleSelectApiKey}>
                                    <Icon name="key" /> API Kulcs
                                </button>
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="imagePrompt">Kép leírása:</label>
                            <textarea id="imagePrompt" className="creative-prompt-textarea form-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le a generálni kívánt képet..." rows={3}></textarea>
                        </div>
                        <div className="form-group">
                            <label>Felbontás:</label>
                            <div className="option-buttons">
                                <button className={`btn btn-secondary ${imageResolution === '1K' ? 'active' : ''}`} onClick={() => setImageResolution('1K')}>1K</button>
                                <button className={`btn btn-secondary ${imageResolution === '2K' ? 'active' : ''}`} onClick={() => setImageResolution('2K')}>2K</button>
                                <button className={`btn btn-secondary ${imageResolution === '4K' ? 'active' : ''}`} onClick={() => setImageResolution('4K')}>4K</button>
                            </div>
                        </div>
                        <button className="btn btn-primary generate-image-btn" onClick={handleGenerateImage} disabled={isGenerating || !hasApiKey}>
                            <Icon name={isGenerating ? 'progress_activity' : 'auto_awesome'} />
                            {isGenerating ? loadingMessage : 'Kép Generálása'}
                        </button>
                        {generatedImageUrl && (
                            <div className="generated-content-output image-output">
                                <h4 className="output-title">Generált Kép:</h4>
                                <img src={generatedImageUrl} alt="Generated" className="generated-media" />
                            </div>
                        )}
                    </>
                );
            case 'generate_video':
                return (
                    <>
                        {!hasApiKey && (
                            <div className="api-key-warning">
                                <p className="warning-message">A videógenerálás prémium szolgáltatás. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="warning-link">Számlázási információk</a></p>
                                <button className="btn btn-warning select-api-key-btn" onClick={handleSelectApiKey}>
                                    <Icon name="key" /> API Kulcs
                                </button>
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="videoPrompt">Videó leírása:</label>
                            <textarea id="videoPrompt" className="creative-prompt-textarea form-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le a generálni kívánt videót..." rows={3}></textarea>
                        </div>
                         <div className="form-group">
                            <label htmlFor="videoImageUpload" className="file-upload-label">Kezdő Kép (Opcionális):</label>
                            <input type="file" id="videoImageUpload" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} className="form-input-file" />
                            {imageFile && <p className="file-name">Feltöltve: {imageFile.name}</p>}
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
                        <button className="btn btn-primary generate-video-btn" onClick={handleGenerateVideo} disabled={isGenerating || !hasApiKey}>
                            <Icon name={isGenerating ? 'progress_activity' : 'movie_creation'} />
                            {isGenerating ? loadingMessage : 'Videó Generálása'}
                        </button>
                        {generatedVideoUrl && (
                            <div className="generated-content-output video-output">
                                <h4 className="output-title">Generált Videó:</h4>
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
                            <label htmlFor="imageUpload" className="file-upload-label">Kép feltöltése:</label>
                            <input type="file" id="imageUpload" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} className="form-input-file" />
                            {imageFile && <p className="file-name">Feltöltött fájl: {imageFile.name}</p>}
                        </div>
                        <div className="form-group">
                            <label htmlFor="editImagePrompt">Szerkesztési leírás:</label>
                            <textarea id="editImagePrompt" className="creative-prompt-textarea form-textarea" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Írja le a szerkesztést (pl. 'Add a retro filter', 'Remove person')..." rows={3}></textarea>
                        </div>
                        <button className="btn btn-primary edit-image-btn" onClick={handleEditImage} disabled={isGenerating || !imageFile}>
                            <Icon name={isGenerating ? 'progress_activity' : 'edit'} />
                            {isGenerating ? loadingMessage : 'Kép Szerkesztése'}
                        </button>
                        {editedImageUrl && (
                            <div className="generated-content-output image-output">
                                <h4 className="output-title">Szerkesztett Kép:</h4>
                                <img src={editedImageUrl} alt="Edited" className="generated-media" />
                            </div>
                        )}
                    </>
                );
             // Removed edit_video to simplify and focus on requested features
            default: return null;
        }
    };

    return (
        <div className="view-fade-in creative-tools-view">
            <Card fullHeight header={<h2 className="view-title">Kreatív Eszközök</h2>}>
                <div className="creative-tools-nav">
                    <button className={`btn btn-segment ${activeTool === 'generate_image' ? 'active' : ''}`} onClick={() => { setActiveTool('generate_image'); resetToolStates(); }}>
                        <Icon name="image" /> <span className="segment-label">Kép Generálása</span>
                    </button>
                    <button className={`btn btn-segment ${activeTool === 'generate_video' ? 'active' : ''}`} onClick={() => { setActiveTool('generate_video'); resetToolStates(); }}>
                        <Icon name="movie" /> <span className="segment-label">Videó Generálása</span>
                    </button>
                     <button className={`btn btn-segment ${activeTool === 'edit_image' ? 'active' : ''}`} onClick={() => { setActiveTool('edit_image'); resetToolStates(); }}>
                        <Icon name="edit" /> <span className="segment-label">Kép Szerkesztése</span>
                    </button>
                </div>
                <div className="creative-tools-content custom-scrollbar">
                    {isGenerating && <div className="loading-overlay"><div className="spinner"></div><p className="loading-message">{loadingMessage}</p></div>}
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
            <div 
                ref={nodeRef} 
                className={`mind-map-node-content color-${node.color || 'primary'}`} 
                onClick={() => setExpanded(!isExpanded)}
            >
                {hasChildren && <Icon name={isExpanded ? 'remove' : 'add'} style={{ fontSize: '16px' }} />}
                <span>{node.label}</span>
            </div>
            {hasChildren && isExpanded && (
                <ul className="mind-map-children">
                    {node.children!.map(child => (
                        <MindMapNodeComponent key={child.id} node={child} onUpdatePosition={onUpdatePosition} />
                    ))}
                </ul>
            )}
        </li>
    );
};

const MindMapCanvas = ({ data }: { data: MindMapNode }) => {
    const [positions, setPositions] = useState<Record<string, any>>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const updatePosition = useCallback((id: string, rect: any) => {
        setPositions(prev => {
             // Only update if position actually changed significantly to avoid loops
             if (prev[id] && Math.abs(prev[id].x - rect.x) < 2 && Math.abs(prev[id].y - rect.y) < 2) return prev;
             return { ...prev, [id]: rect };
        });
    }, []);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const newScale = Math.max(0.5, Math.min(2, scale - e.deltaY * 0.001));
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const renderConnectors = () => {
        if (!containerRef.current) return null;
        
        const connectors = [];
        const containerRect = containerRef.current.getBoundingClientRect();
        
        const traverse = (node: MindMapNode) => {
            if (node.children) {
                const parentPos = positions[node.id];
                if (parentPos) {
                    node.children.forEach(child => {
                        const childPos = positions[child.id];
                        if (childPos) {
                            // Calculate relative coordinates
                            const x1 = (parentPos.x - containerRect.x - position.x) / scale + parentPos.width / (2 * scale) + 50; // offset adjustment
                            const y1 = (parentPos.y - containerRect.y - position.y) / scale + parentPos.height / (2 * scale) + 50;
                            const x2 = (childPos.x - containerRect.x - position.x) / scale + childPos.width / (2 * scale) - childPos.width/(2*scale); // anchor left
                            const y2 = (childPos.y - containerRect.y - position.y) / scale + childPos.height / (2 * scale) + 50;
                            
                             // Simplified connector logic for demo
                             // In a real app, this needs robust coordinate mapping within the scaled context
                        }
                        traverse(child);
                    });
                }
            }
        };
        traverse(data);
        return connectors;
    };
    
    // Note: SVG Connectors implementation is simplified/omitted for brevity in this specific update as main focus is on UI structure.
    // The previous implementation had basic connector logic which was tricky with HTML/CSS layout.
    
    return (
        <div 
            className="mind-map-canvas" 
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
             <div className="mind-map-content" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}>
                <ul className="mind-map-tree">
                    <MindMapNodeComponent node={data} onUpdatePosition={updatePosition} />
                </ul>
            </div>
            
            <div className="mind-map-controls">
                <button className="btn btn-icon" onClick={() => setScale(scale + 0.1)}><Icon name="add" /></button>
                <button className="btn btn-icon" onClick={() => setScale(scale - 0.1)}><Icon name="remove" /></button>
                <button className="btn btn-icon" onClick={() => {setScale(1); setPosition({x:0, y:0})}}><Icon name="center_focus_strong" /></button>
            </div>
        </div>
    );
}

const MindMapView = ({ data }: { data: MindMapNode }) => {
    return (
        <div className="view-fade-in mind-map-view-container">
            <Card fullHeight header={<h2 className="view-title">Stratégia Térkép</h2>}>
                <MindMapCanvas data={data} />
            </Card>
        </div>
    );
};

// --- APP COMPONENT ---
const App = () => {
    const [user, setUser] = useState<User | null>(null);
    const [currentView, setCurrentView] = useState('dashboard');
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isMobile = useMediaQuery('(max-width: 1024px)');

    const { 
        contacts, docs, proposals, trainings, projects, transactions, budgets, tasks, plannerEvents, emails, mindMap,
        updateTaskStatus, addDoc, updateProjectStatus, addTask 
    } = useMockData();

    const addNotification = (notification: Omit<Notification, 'id'>) => {
        const id = generateId();
        setNotifications(prev => [...prev, { ...notification, id }]);
    };

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const renderView = () => {
        switch (currentView) {
            case 'dashboard': return <DashboardView tasks={tasks} emails={emails} addNotification={addNotification} />;
            case 'planner': return <PlannerView events={plannerEvents} isConnected={false} onConnectToggle={() => addNotification({message: 'Naptár szinkronizáció szimulálva', type: 'success'})} />;
            case 'tasks': return <TasksView tasks={tasks} updateTaskStatus={updateTaskStatus} />;
            case 'email': return <EmailView emails={emails} addTask={addTask} addNotification={addNotification} />;
            case 'projects_kanban': return <ProjectsKanbanView projects={projects} tasks={tasks} updateProjectStatus={updateProjectStatus} />;
            case 'project_overview': return <ProjectOverviewView projects={projects} tasks={tasks} />;
            case 'proposals': return <ProposalsView proposals={proposals} />;
            case 'trainings': return <TrainingsView trainings={trainings} />;
            case 'contacts': return <ContactsView contacts={contacts} />;
            case 'finances': return <FinancesView transactions={transactions} budgets={budgets} />;
            case 'docs': return <DocsView docs={docs} addDoc={addDoc} />;
            case 'gemini_chat': return <GeminiChatView addTask={addTask} addNotification={addNotification} />;
            case 'live_chat': return <LiveView />;
            case 'route_planner': return <RoutePlannerView addNotification={addNotification} />;
            case 'creative_tools': return <CreativeToolsView addDoc={addDoc} addNotification={addNotification} />;
            case 'mind_map': return <MindMapView data={mindMap} />;
            case 'meeting_assistant': return <MeetingAssistantView />;
            default: return <DashboardView tasks={tasks} emails={emails} addNotification={addNotification} />;
        }
    };

    if (!user) {
        return <LoginView onLogin={setUser} />;
    }

    return (
        <div className="app-container">
             <div className="aurora-background">
                <div className="aurora-shape aurora-shape1"></div>
                <div className="aurora-shape aurora-shape2"></div>
                <div className="aurora-shape aurora-shape3"></div>
            </div>
            
            <Sidebar 
                currentView={currentView} 
                setView={setCurrentView} 
                isCollapsed={isSidebarCollapsed} 
                setCollapsed={setSidebarCollapsed}
                isMobile={isMobile}
                isMobileMenuOpen={isMobileMenuOpen}
                setMobileMenuOpen={setMobileMenuOpen}
            />
            
            <div className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>

            <div className="main-content">
                <GlobalHeader 
                    currentView={currentView} 
                    onMenuClick={() => setMobileMenuOpen(true)}
                    user={user}
                    onLogout={() => setUser(null)}
                />
                <main className="view-content">
                    {renderView()}
                </main>
            </div>

            <div className="notification-container">
                {notifications.map(n => (
                    <NotificationComponent key={n.id} notification={n} onDismiss={removeNotification} />
                ))}
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);