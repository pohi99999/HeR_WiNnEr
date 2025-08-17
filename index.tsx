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
    date: string;
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
type TaskCategory = 'Munka' | 'Személyes' | 'Projekt' | 'Tanulás' | 'Ügyfél' | 'Email' | 'Pályázat';

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

const mockEmails: EmailMessage[] = [
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
    { id: 'prop-1', title: 'Innovációs Technológiai Fejlesztés 2024', funder: 'Nemzeti Kutatási, Fejlesztési és Innovációs Hivatal', status: 'Készül', submissionDeadline: '2024-09-15', amount: 15000000, summary: 'A P-Day Light V7 AI-képességeinek továbbfejlesztése, különös tekintettel a prediktív analitikára és a természetes nyelvfeldolgozásra.', relatedProjectId: 'proj-1' },
    { id: 'prop-2', title: 'Digitális Megjelenés Támogatása KKV-knak', funder: 'Magyar Kereskedelmi és Iparkamara', status: 'Beadva', submissionDeadline: '2024-07-20', amount: 5000000, summary: 'Új marketing kampány és weboldal fejlesztés a célpiac elérésére.', relatedProjectId: 'proj-2' },
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

const mockPlannerEvents: PlannerEvent[] = mockTasks
    .filter(task => task.dueDate)
    .map(task => ({
        id: `event-from-${task.id}`,
        title: task.title,
        date: task.dueDate!,
        type: ((): PlannerEventType => {
            switch(task.category) {
                case 'Munka': case 'Projekt': return 'work';
                case 'Pályázat': return 'declaration_deadline';
                case 'Személyes': return 'personal';
                default: return 'deadline';
            }
        })(),
        source: task.id,
    }));
mockProposals.forEach(proposal => {
    mockPlannerEvents.push({
        id: `event-from-${proposal.id}`,
        title: `Pályázat: ${proposal.title}`,
        date: proposal.submissionDeadline,
        type: 'proposal_deadline',
        source: proposal.id
    });
});
mockPlannerEvents.push(
    { id: 'event-1', title: 'Heti szinkron', date: '2024-08-05', time: '10:00', type: 'meeting', location: 'Google Meet' },
    { id: 'event-2', title: 'Fogorvos', date: '2024-08-12', time: '14:30', type: 'personal' },
    { id: 'event-3', title: 'P-Day Light V6 Tervezés', date: '2024-08-20', time: '09:00', type: 'work', description: 'Új funkciók specifikálása' },
);

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

const navigationData: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'reports', label: 'Riportok', icon: 'bar_chart' },
    { id: 'personal', label: 'Saját Ügyek', icon: 'person', subItems: [ { id: 'planner', label: 'Naptár', icon: 'calendar_month' }, { id: 'tasks', label: 'Feladatok', icon: 'task_alt' }, { id: 'finances', label: 'Pénzügyek', icon: 'account_balance_wallet' }, { id: 'docs', label: 'Dokumentumok', icon: 'folder' }, ], },
    { id: 'work', label: 'Munka', icon: 'work', subItems: [ { id: 'email', label: 'Email', icon: 'mail' }, { id: 'projects', label: 'Projektek', icon: 'schema' }, { id: 'proposals', label: 'Pályázatok', icon: 'description' }, { id: 'contacts', label: 'Kapcsolatok', icon: 'contacts' }, { id: 'training', label: 'Képzések', icon: 'school' }, ], },
    { id: 'ai', label: 'Gemini Asszisztens', icon: 'smart_toy', subItems: [ { id: 'ai-chat', label: 'Általános Chat', icon: 'chat' }, { id: 'ai-creative', label: 'Kreatív Eszközök', icon: 'brush' }, ], },
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

// --- GLOBAL COMPONENTS ---
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
const QuickActions = ({ onOpenTaskModal }) => ( <div className="quick-actions"> <button className="button button-primary" onClick={() => onOpenTaskModal()}><span className="material-symbols-outlined">add_task</span> Új feladat</button> <button className="button button-secondary"><span className="material-symbols-outlined">edit_calendar</span> Új esemény</button> <button className="button button-secondary"><span className="material-symbols-outlined">post_add</span> Új dokumentum</button> <button className="button button-secondary"><span className="material-symbols-outlined">edit</span> Email írása</button> </div>);

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
        const prompt = `Te egy személyi asszisztens vagy a P-Day Light alkalmazásban. A feladatod, hogy egy rövid, barátságos és motiváló napi összefoglalót készíts a felhasználó számára a megadott adatok alapján. Emeld ki a legfontosabbakat. A válaszod legyen tömör, markdown formátumban, például egy rövid bevezető mondat után egy 3-4 pontos lista. A válaszodat magyarul add meg.\n\nMai dátum: ${new Date().toLocaleDateString('hu-HU')}\n\n**Közelgő feladatok:**\n${upcomingTasks || "Nincsenek kiemelt feladataid."}\n\n**Közelgő pályázati határidők:**\n${upcomingProposals || "Nincsenek közelgő pályázati határidők."}\n\n**Mai események:**\n${todaysEvents || "Nincsenek mai eseményeid."}\n\n**Fontos Emailek:**\n${importantEmails || "Nincsenek olvasatlan/fontos emailjeid."}\n\nKezdd egy barátságos üdvözléssel, pl. "Szia! Lássuk, mi vár rád ma:"`;
        try { const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt }); const summaryText = response.text; setSummary(summaryText); } catch (err) { console.error("Briefing generation error:", err); setError("Hiba történt az összefoglaló generálása közben."); } finally { setIsLoading(false); }
    }, [tasks, events, emails, proposals, ai]);
    useEffect(() => { generateBriefing(); }, [generateBriefing]);
    return ( <div className="card dashboard-widget daily-briefing-widget"> <div className="daily-briefing-header"> <h3><span className="material-symbols-outlined">tips_and_updates</span>Napi Összefoglaló</h3> <button onClick={generateBriefing} disabled={isLoading} className="button button-icon-only" aria-label="Összefoglaló frissítése"> <span className={`material-symbols-outlined ${isLoading ? 'progress_activity' : ''}`}>{isLoading ? 'progress_activity' : 'refresh'}</span> </button> </div> <div className="widget-content"> {isLoading && <div className="widget-placeholder"><span className="material-symbols-outlined progress_activity">progress_activity</span><p>Összefoglaló generálása...</p></div>} {error && <div className="error-message">{error}</div>} {!isLoading && !error && summary && <div className="briefing-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown></div>} </div> </div> );
};

const UpcomingTasksWidget = ({ tasks }: { tasks: TaskItem[] }) => {
    const upcoming = tasks.filter(t => t.status !== 'Kész').sort((a, b) => {
        const timeA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const timeB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (timeA === timeB) return 0;
        return timeA < timeB ? -1 : 1;
    }).slice(0, 4);
    return ( <div className="card dashboard-widget"> <h3><span className="material-symbols-outlined">list_alt</span>Közelgő Feladatok</h3> <ul className="widget-list"> {upcoming.map(task => ( <li key={task.id} className="widget-list-item"> <div className="task-item-info"> <span className="task-item-title">{task.title}</span> <span className="task-item-due-date">{formatDate(task.dueDate)}</span> </div> <span className={`priority-pill ${getPriorityClass(task.priority)}`}>{task.priority}</span> </li> ))} </ul> </div> );
};

const ImportantEmailsWidget = ({ emails }: { emails: EmailMessage[] }) => {
    const importantEmails = emails.filter(e => !e.read || e.important).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 4);
    return ( <div className="card dashboard-widget"> <h3><span className="material-symbols-outlined">mark_email_unread</span>Fontos Emailek</h3> <ul className="widget-list"> {importantEmails.map(email => ( <li key={email.id} className="widget-list-item"> <div className="email-item-info"> <span className="sender">{email.sender}</span> <span className="subject" title={email.subject}>{email.subject}</span> </div> {!email.read && <div className="unread-dot"></div>} </li> ))} </ul> </div> );
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

const DashboardView = ({ tasks, events, emails, proposals, ai, onOpenTaskModal }: { tasks: TaskItem[], events: PlannerEvent[], emails: EmailMessage[], proposals: Proposal[], ai: GoogleGenAI, onOpenTaskModal: () => void }) => (
    <View title="Dashboard" subtitle="Üdvözöljük a P-Day Light alkalmazásban!">
        <div className="dashboard-layout">
            <QuickActions onOpenTaskModal={onOpenTaskModal}/>
            <div className="dashboard-grid">
                <DailyBriefingWidget tasks={tasks} events={events} emails={emails} proposals={proposals} ai={ai} />
                <UpcomingTasksWidget tasks={tasks} />
                <ImportantEmailsWidget emails={emails} />
                <div className="card dashboard-widget"> <h3><span className="material-symbols-outlined">calendar_today</span>Heti Terv</h3> <div className="widget-placeholder">A naptár integráció hamarosan érkezik.</div> </div>
            </div>
        </div>
    </View>
);
// --- PLANNER / CALENDAR VIEW ---
const PlannerView = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const handlePrevMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    const handleGoToToday = () => setCurrentDate(new Date());
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
    const weekDays = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']; const today = new Date();
    return ( <View title="Naptár" subtitle="Személyes és munkahelyi események áttekintése."> <div className="planner-view-container"> <div className="calendar-header card"> <div className="calendar-title">{currentDate.toLocaleDateString('hu-HU', { month: 'long', year: 'numeric' })}</div> <div className="calendar-controls"> <button onClick={handlePrevMonth} className="button button-icon-only" aria-label="Előző hónap"><span className="material-symbols-outlined">chevron_left</span></button> <button onClick={handleGoToToday} className="button button-secondary">Ma</button> <button onClick={handleNextMonth} className="button button-icon-only" aria-label="Következő hónap"><span className="material-symbols-outlined">chevron_right</span></button> </div> </div> <div className="calendar-body card"> <div className="calendar-day-names">{weekDays.map(day => <div key={day} className="calendar-day-name">{day}</div>)}</div> <div className="calendar-grid">{calendarDays.map((day, index) => { const dayString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; const eventsForDay = mockPlannerEvents.filter(event => event.date === dayString); const isToday = day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate(); const isOtherMonth = day.getMonth() !== currentDate.getMonth(); return ( <div key={index} className={`day-cell ${isToday ? 'today' : ''} ${isOtherMonth ? 'other-month' : ''}`}> <div className="day-number">{day.getDate()}</div> <div className="events-list">{eventsForDay.map(event => ( <div key={event.id} className={`event-pill ${getEventTypeClass(event.type)}`} title={event.title}> {event.time && <span className="event-time">{event.time}</span>} <span className="event-title">{event.title}</span> </div> ))}</div> </div> ); })}</div> </div> </div> </View> );
};

// --- MODALS ---
const TaskModal = ({ isOpen, onClose, onAddTask, initialData = null }) => {
    const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [dueDate, setDueDate] = useState(''); const [priority, setPriority] = useState<TaskPriority>('Közepes');
    useEffect(() => {
        if (isOpen) {
            if (initialData) { setTitle(initialData.title || ''); setDescription(initialData.description || ''); setDueDate(initialData.dueDate ? initialData.dueDate.split('T')[0] : ''); setPriority(initialData.priority || 'Közepes'); }
            else { setTitle(''); setDescription(''); setDueDate(''); setPriority('Közepes'); }
        }
    }, [initialData, isOpen]);
    if (!isOpen) return null;
    const handleSubmit = (e) => { e.preventDefault(); if (!title.trim()) return; onAddTask({ title: title.trim(), description: description.trim(), dueDate, priority, category: 'Személyes' }); onClose(); };
    return ( <div className="modal-overlay" onClick={() => onClose()}> <div className="modal-content card" onClick={e => e.stopPropagation()}> <div className="modal-header"> <h3>{initialData ? "Feladat Módosítása" : "Új Feladat Létrehozása"}</h3> <button onClick={() => onClose()} className="button-icon-close">&times;</button> </div> <form onSubmit={handleSubmit} className="modal-form"> <div className="form-group"><label htmlFor="task-title">Cím</label><input id="task-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required /></div> <div className="form-group"><label htmlFor="task-description">Leírás</label><textarea id="task-description" value={description} onChange={e => setDescription(e.target.value)} rows={3}></textarea></div> <div className="form-group-inline"> <div className="form-group"><label htmlFor="task-duedate">Határidő</label><input id="task-duedate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div> <div className="form-group"><label htmlFor="task-priority">Prioritás</label><select id="task-priority" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}><option value="Alacsony">Alacsony</option><option value="Közepes">Közepes</option><option value="Magas">Magas</option><option value="Kritikus">Kritikus</option></select></div></div> <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => onClose()}>Mégse</button><button type="submit" className="button button-primary">Feladat Mentése</button></div> </form> </div> </div> );
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
                tasks: plan.tasks.map((task, index) => ({ id: `new-task-${index}`, title: task.title, checked: true }))
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
                        <div className="widget-placeholder" style={{ background: 'transparent' }}>
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
const TasksView = ({ tasks, setTasks, onOpenTaskModal, onAddNotification }: { tasks: TaskItem[], setTasks: React.Dispatch<React.SetStateAction<TaskItem[]>>, onOpenTaskModal: (task?: TaskItem) => void, onAddNotification: (notification: Omit<Notification, 'id'>) => void }) => {
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
                                        {task.projectId && <span className="task-project"><strong>Projekt:</strong> {mockProjects.find(p => p.id === task.projectId)?.title}</span>} 
                                        {task.proposalId && <span className="task-proposal"><strong>Pályázat:</strong> {mockProposals.find(p => p.id === task.proposalId)?.title}</span>} 
                                        {task.trainingId && <span className="task-training"><strong>Képzés:</strong> {mockTrainings.find(t => t.id === task.trainingId)?.title}</span>} 
                                        {task.relatedTo && <span className="task-email"><strong>Kapcsolódó email:</strong> {mockEmails.find(e => e.id === task.relatedTo)?.subject}</span>} 
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
                             const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
                             const firstDayOfWeek = new Date(today.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)));
                             const lastDayOfWeek = new Date(firstDayOfWeek);
                             lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
                             filteredTasks = filteredTasks.filter(t => t.dueDate && new Date(t.dueDate) >= firstDayOfWeek && new Date(t.dueDate) <= lastDayOfWeek);
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

// --- NEW CREATIVE VIEW ---
const AiCreativeView = ({ ai, onSaveToDocs, onAddNotification }) => {
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError('Kérjük, adjon meg egy leírást a képhez.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResults([]);

        try {
            const response = await ai.models.generateImages({
                model: 'imagen-3.0-generate-002',
                prompt: prompt,
                config: {
                    numberOfImages: 2,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: aspectRatio,
                },
            });
            setResults(response.generatedImages);
        } catch (err) {
            console.error("Image generation error:", err);
            setError("Hiba történt a kép generálása közben. Próbálja újra később.");
            onAddNotification({ message: 'Hiba a kép generálása közben.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSaveImage = (base64Image, imagePrompt) => {
        onSaveToDocs({
            type: 'image',
            title: `AI Kép: ${imagePrompt.substring(0, 30)}...`,
            content: base64Image,
        });
        onAddNotification({ message: 'Kép sikeresen a dokumentumokhoz mentve!', type: 'success' });
    };

    const aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];

    return (
        <View title="Kreatív Eszközök" subtitle="Hozzon létre egyedi képeket a Gemini segítségével.">
            <div className="creative-view-container">
                <div className="card generation-form-card">
                    <div className="form-group">
                        <label htmlFor="image-prompt">Kép Leírása</label>
                        <textarea
                            id="image-prompt"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Pl. egy cica szkafanderben a Holdon, olajfestmény stílusban"
                            rows={4}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="form-group">
                        <label>Képarány</label>
                        <div className="aspect-ratio-selector">
                            {aspectRatios.map(ratio => (
                                <label key={ratio} className="aspect-ratio-option">
                                    <input
                                        type="radio"
                                        name="aspect-ratio"
                                        value={ratio}
                                        checked={aspectRatio === ratio}
                                        onChange={e => setAspectRatio(e.target.value)}
                                        disabled={isLoading}
                                    />
                                    <div className="aspect-ratio-visual" data-ratio={ratio} title={ratio}>
                                        <span>{ratio}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                     {error && <p className="error-message" style={{textAlign: 'left', marginBottom: 'var(--spacing-md)'}}>{error}</p>}
                    <button onClick={handleGenerate} disabled={isLoading} className="button button-primary generate-button">
                        {isLoading ? (
                            <>
                                <span className="material-symbols-outlined progress_activity">progress_activity</span>
                                <span>Generálás...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">auto_awesome</span>
                                <span>Kép Létrehozása</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="card image-results-card">
                     <div className="results-header">
                        <h3>Eredmények</h3>
                    </div>
                    {isLoading && (
                         <div className="widget-placeholder" style={{ background: 'transparent' }}>
                            <span className="material-symbols-outlined progress_activity">progress_activity</span>
                            <p>Képek készítése...</p>
                        </div>
                    )}
                    {!isLoading && results.length > 0 && (
                        <div className="image-results-grid">
                            {results.map((img, index) => (
                                <div key={index} className="generated-image-container">
                                    <img src={`data:image/jpeg;base64,${img.image.imageBytes}`} alt={prompt} />
                                     <button className="button button-secondary button-save-to-docs" onClick={() => handleSaveImage(img.image.imageBytes, prompt)}>
                                        <span className="material-symbols-outlined">save</span>Mentés a dokumentumokba
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                     {!isLoading && results.length === 0 && !error && (
                        <div className="widget-placeholder">
                           <span className="material-symbols-outlined">image_search</span>
                           <p>A generált képek itt fognak megjelenni.</p>
                        </div>
                    )}
                </div>
            </div>
        </View>
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
    const [trainings, setTrainings] = useState<TrainingItem[]>(mockTrainings);
    const [contacts, setContacts] = useState<Contact[]>(mockContacts);

    const [activeView, setActiveView] = useState<{ id: string; params?: any }>({ id: 'dashboard' });
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobileNavOpen, setMobileNavOpen] = useState(false);
    
    const [isTaskModalOpen, setTaskModalOpen] = useState(false);
    const [taskToEdit, setTaskToEdit] = useState<TaskItem | null>(null);

    const [isTransactionModalOpen, setTransactionModalOpen] = useState(false);
    const [isProposalModalOpen, setProposalModalOpen] = useState(false);
    const [isProjectModalOpen, setProjectModalOpen] = useState(false);
    const [isAiProjectModalOpen, setAiProjectModalOpen] = useState(false);
    const [isSearchModalOpen, setSearchModalOpen] = useState(false);

    const [isTrainingModalOpen, setTrainingModalOpen] = useState(false);
    const [currentTraining, setCurrentTraining] = useState(null);

    const [isContactModalOpen, setContactModalOpen] = useState(false);
    const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);

    const [notifications, setNotifications] = useState<Notification[]>([]);
    
    const [activeDoc, setActiveDoc] = useState(null);
    const [isImageModalOpen, setImageModalOpen] = useState(false);
    const [imageModalSrc, setImageModalSrc] = useState('');
    
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

    const handleOpenTaskModal = (task = null) => {
        setTaskToEdit(task);
        setTaskModalOpen(true);
    };

    const handleAddTask = useCallback((taskData) => {
        const newTask: TaskItem = {
            id: `task-${Date.now()}`,
            title: taskData.title,
            description: taskData.description,
            dueDate: taskData.dueDate,
            priority: taskData.priority || 'Közepes',
            category: taskData.category || 'Személyes',
            status: 'Teendő',
            createdAt: new Date().toISOString(),
        };
        setTasks(prev => [newTask, ...prev]);
        handleAddNotification({ message: 'Feladat sikeresen létrehozva!', type: 'success' });
    }, [handleAddNotification]);
    
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
    
    const handleSaveTraining = (trainingData) => {
        if (trainingData.id) {
            setTrainings(prev => prev.map(t => t.id === trainingData.id ? {...t, ...trainingData} : t));
            handleAddNotification({ message: 'Képzés frissítve!', type: 'success' });
        } else {
            const newTraining = {
                id: `train-${Date.now()}`,
                ...trainingData,
                status: trainingData.progress === 100 ? 'Befejezett' : (trainingData.progress > 0 ? 'Folyamatban' : 'Nem elkezdett'),
            };
            setTrainings(prev => [newTraining, ...prev]);
            handleAddNotification({ message: 'Képzés létrehozva!', type: 'success' });
        }
        setCurrentTraining(null);
        setTrainingModalOpen(false);
    };

    const handleOpenTrainingModal = (training = null) => {
        setCurrentTraining(training);
        setTrainingModalOpen(true);
    };
    
    const handleOpenContactModal = (contact = null) => {
        setContactToEdit(contact);
        setContactModalOpen(true);
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

    const handleUpdateDoc = (docId, newTitle, newContent) => {
        setDocs(prevDocs => prevDocs.map(doc =>
            doc.id === docId ? { ...doc, title: newTitle, content: newContent } : doc
        ));
    };

    const handleNavigate = (viewId, params = {}) => {
        setActiveView({ id: viewId, params });
        if (size.width <= 1024) { setMobileNavOpen(false); }
    };
    
    const allData = { tasks, projects, docs, proposals, emails: mockEmails, trainings, transactions, contacts };

    const renderView = () => {
        switch (activeView.id) {
            case 'dashboard': return <DashboardView tasks={tasks} events={mockPlannerEvents} emails={mockEmails} proposals={proposals} ai={ai} onOpenTaskModal={handleOpenTaskModal}/>;
            case 'tasks': return <TasksView tasks={tasks} setTasks={setTasks} onOpenTaskModal={handleOpenTaskModal} onAddNotification={handleAddNotification} />;
            case 'planner': return <PlannerView />;
            case 'email': return <EmailView ai={ai} onAddTask={handleAddTask} onAddNotification={handleAddNotification} />;
            case 'projects': return <ProjectsView projects={projects} tasks={tasks} ai={ai} onAddNotification={handleAddNotification} onOpenProjectModal={() => setProjectModalOpen(true)} onOpenAiProjectModal={() => setAiProjectModalOpen(true)} />;
            case 'proposals': return <ProposalsView proposals={proposals} tasks={tasks} onOpenProposalModal={() => setProposalModalOpen(true)} />;
            case 'finances': return <FinancesView transactions={transactions} ai={ai} onOpenTransactionModal={() => setTransactionModalOpen(true)} />;
            case 'docs': return <DocsView docs={docs} onImageClick={(src) => { setImageModalSrc(src); setImageModalOpen(true); }} onNoteClick={(docId) => handleNavigate('doc-editor', { docId })} onAddNote={() => { const newDocId = `doc-${Date.now()}`; setDocs(prev => [{id: newDocId, type: 'note', title: 'Új jegyzet', content: '', createdAt: new Date().toISOString()}, ...prev]); handleNavigate('doc-editor', { docId: newDocId }); }} />;
            case 'doc-editor': {
                const docToEdit = docs.find(d => d.id === activeView.params.docId);
                return docToEdit ? <DocEditorView doc={docToEdit} onSave={handleUpdateDoc} onBack={() => handleNavigate('docs')} ai={ai} /> : <View title="Hiba" subtitle="A dokumentum nem található." />;
            }
            case 'training': return <TrainingView trainings={trainings} onOpenTrainingModal={handleOpenTrainingModal} onSaveTraining={handleSaveTraining} ai={ai} onAddNotification={handleAddNotification} />;
            case 'contacts': return <ContactsView contacts={contacts} projects={projects} proposals={proposals} emails={mockEmails} onOpenContactModal={handleOpenContactModal} ai={ai} onAddNotification={handleAddNotification} />;
            case 'reports': return <ReportsView tasks={tasks} transactions={transactions} projects={projects} trainings={trainings} ai={ai} />;
            case 'ai-chat': return <AiChatView ai={ai} tasks={tasks} onAddTask={handleAddTask} onAddNotification={handleAddNotification} />;
            case 'ai-creative': return <AiCreativeView ai={ai} onSaveToDocs={handleSaveImageToDocs} onAddNotification={handleAddNotification} />;
            default: return <DashboardView tasks={tasks} events={mockPlannerEvents} emails={mockEmails} proposals={proposals} ai={ai} onOpenTaskModal={handleOpenTaskModal} />;
        }
    };

    if (!ai) {
        return <div className="loading-screen"><span className="material-symbols-outlined progress_activity">progress_activity</span><p>P-Day Light betöltése...</p></div>;
    }

    return (
        <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileNavOpen ? 'mobile-nav-open' : ''}`}>
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
                onAddTask={handleAddTask}
                initialData={taskToEdit}
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
    const [openSections, setOpenSections] = useState(['personal', 'work', 'ai']);

    const handleToggleSection = (sectionId) => {
        setOpenSections(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
    };

    const renderNavItems = (items) => {
        return items.map(item => {
            if (item.subItems) {
                const isOpen = openSections.includes(item.id);
                return (
                    <li key={item.id} className="nav-item">
                        <a onClick={() => handleToggleSection(item.id)} className={`nav-link nav-section-header ${isOpen ? 'open' : ''}`}>
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span>{item.label}</span>
                            <span className="material-symbols-outlined chevron">chevron_right</span>
                        </a>
                        <ul className={`nav-sub-list ${isOpen ? 'open' : ''}`}>
                            {renderNavItems(item.subItems)}
                        </ul>
                    </li>
                );
            }
            return (
                <li key={item.id} className="nav-item">
                    <a onClick={() => onNavigate(item.id)} className={`nav-link ${activeViewId === item.id ? 'active' : ''}`}>
                        <span className="material-symbols-outlined">{item.icon}</span>
                        <span>{item.label}</span>
                    </a>
                </li>
            );
        });
    };

    const toggleHandler = isMobile ? onCloseMobileNav : onToggleCollapse;
    const toggleIcon = isMobile ? 'arrow_back_ios' : (isCollapsed ? 'arrow_forward_ios' : 'arrow_back_ios');
    const title = (!isMobile && isCollapsed) 
        ? <span className="material-symbols-outlined">api</span> 
        : <span>P-Day Light</span>;

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                {title}
                <a onClick={toggleHandler} className="nav-link collapse-toggle">
                    <span className="material-symbols-outlined">{toggleIcon}</span>
                </a>
            </div>
            <nav className="sidebar-nav">
                <ul className="nav-list">
                    {renderNavItems(navigationData)}
                </ul>
            </nav>
        </aside>
    );
};

const EmailView = ({ ai, onAddTask, onAddNotification }) => {
    const [emails] = useState(mockEmails);
    const [selectedCategory, setSelectedCategory] = useState<'inbox' | 'sent'>('inbox');
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const filteredEmails = emails.filter(e => e.category === selectedCategory);
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
                    <button className="button button-primary" style={{ width: '100%' }}>Új Email</button>
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
                                    <button className="button button-secondary"><span className="material-symbols-outlined">reply</span>Válasz</button>
                                    <button className="button button-secondary"><span className="material-symbols-outlined">delete</span>Törlés</button>
                                    <button className="button button-secondary" onClick={() => handleCreateTaskFromEmail(selectedEmail)} disabled={isLoading}>
                                        <span className={`material-symbols-outlined ${isLoading ? 'progress_activity' : ''}`}>{isLoading ? 'progress_activity' : 'add_task'}</span>
                                        Feladat létrehozása AI-val
                                    </button>
                                </div>
                            </div>
                            <div className="email-body">
                                {selectedEmail.body}
                            </div>
                        </>
                    ) : (
                        <div className="empty-pane-placeholder">
                            <span className="material-symbols-outlined">mark_email_read</span>
                            <p>Válasszon ki egy emailt a megtekintéshez.</p>
                        </div>
                    )}
                </div>
            </div>
        </View>
    );
};

const ProjectsView = ({ projects, tasks, ai, onAddNotification, onOpenProjectModal, onOpenAiProjectModal }) => {
    const statuses: ProjectStatus[] = ['Tervezés', 'Fejlesztés', 'Tesztelés', 'Kész'];
    const [projectForSummary, setProjectForSummary] = useState<Project | null>(null);
    const [summary, setSummary] = useState<string>('');
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);

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
    
    const handleGenerateSummary = async (project: Project) => {
        if (!project) return;
        setProjectForSummary(project);
        setIsLoadingSummary(true);
        setSummary('');

        const relatedTasks = tasks.filter(t => t.projectId === project.id);
        const taskSummary = relatedTasks.map(t => `- ${t.title} (Státusz: ${t.status}, Prioritás: ${t.priority})`).join('\n');
        
        const prompt = `Te egy tapasztalt projektmenedzser vagy. Adj egy rövid, egy-két bekezdéses, emberi hangvételű összefoglalót a projekt jelenlegi állásáról a megadott adatok alapján. Emeld ki a haladást, a lehetséges kockázatokat és a következő fontos lépéseket. A válaszodat magyarul add meg.\n\nProjekt: ${project.title}\nLeírás: ${project.description}\nStátusz: ${project.status}\nCsapattagok: ${project.team.join(', ')}\n\nFeladatok:\n${taskSummary || "Nincsenek még feladatok a projekthez."}`;
        
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setSummary(response.text);
        } catch (err) {
            console.error("AI Summary Error:", err);
            onAddNotification({ message: 'Hiba történt az összefoglaló generálása közben.', type: 'error' });
            setSummary("Hiba az összefoglaló generálása során.");
        } finally {
            setIsLoadingSummary(false);
        }
    };

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
                                        <div key={project.id} className="project-card card">
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
                                             <div className="project-ai-summary-container">
                                                <div className="project-ai-summary-header">
                                                    <h4><span className="material-symbols-outlined">psychology</span>AI Összefoglaló</h4>
                                                    <button 
                                                        className="button button-icon-only" 
                                                        onClick={() => handleGenerateSummary(project)}
                                                        disabled={isLoadingSummary && projectForSummary?.id === project.id}
                                                    >
                                                        <span className={`material-symbols-outlined ${isLoadingSummary && projectForSummary?.id === project.id ? 'progress_activity' : 'refresh'}`}>
                                                            {isLoadingSummary && projectForSummary?.id === project.id ? 'progress_activity' : 'refresh'}
                                                        </span>
                                                    </button>
                                                </div>
                                                {projectForSummary?.id === project.id && (isLoadingSummary || summary) && (
                                                    <div className="ai-summary-content">
                                                        {isLoadingSummary 
                                                            ? <div className="widget-placeholder" style={{padding: 'var(--spacing-sm)', background: 'transparent'}}><span className="material-symbols-outlined progress_activity">progress_activity</span><p>Elemzés...</p></div>
                                                            : <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                                                        }
                                                    </div>
                                                )}
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

const ProposalsView = ({ proposals, tasks, onOpenProposalModal }) => {
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

    const handleCloseModal = () => setSelectedProposal(null);

    const ProposalDetailModal = ({ proposal, onClose }) => {
        if (!proposal) return null;
        const relatedTasks = tasks.filter(t => t.proposalId === proposal.id);
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content card" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>{proposal.title}</h3>
                        <button onClick={onClose} className="button-icon-close">&times;</button>
                    </div>
                    <div className="proposal-modal-body">
                        <div className="proposal-details-grid">
                            <span><strong>Kiíró:</strong></span><span>{proposal.funder}</span>
                            <span><strong>Határidő:</strong></span><span>{formatDate(proposal.submissionDeadline)}</span>
                            <span><strong>Státusz:</strong></span><span className={`status-pill ${getProposalStatusClass(proposal.status)}`}>{proposal.status}</span>
                            <span><strong>Összeg:</strong></span><span>{proposal.amount.toLocaleString('hu-HU')} Ft</span>
                        </div>
                        <p className="proposal-description"><strong>Összefoglaló:</strong> {proposal.summary || "Nincs megadva."}</p>
                        
                        {relatedTasks.length > 0 &&
                            <div className="related-tasks-section">
                                <h4>Kapcsolódó feladatok</h4>
                                <div className="task-list">
                                    {relatedTasks.map(task => (
                                         <div key={task.id} className="task-item-title-container">
                                            <span className={`material-symbols-outlined ${task.status === 'Kész' ? 'check_circle' : 'radio_button_unchecked'}`}>{task.status === 'Kész' ? 'check_circle' : 'radio_button_unchecked'}</span>
                                            <span className={`task-item-title ${task.status === 'Kész' ? 'completed' : ''}`}>{task.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        }
                    </div>
                </div>
            </div>
        );
    };

    return (
        <View 
            title="Pályázatok" 
            subtitle="Pályázatok kezelése és nyomon követése."
            actions={<button className="button button-primary" onClick={onOpenProposalModal}><span className="material-symbols-outlined">add</span>Új pályázat</button>}
        >
            <div className="proposals-grid">
                {proposals.map(proposal => (
                    <div key={proposal.id} className="proposal-card card" onClick={() => setSelectedProposal(proposal)}>
                        <div className="proposal-card-header">
                            <h4>{proposal.title}</h4>
                            <span className={`status-pill ${getProposalStatusClass(proposal.status)}`}>{proposal.status}</span>
                        </div>
                        <div className="proposal-card-body">
                            <p className="funder">{proposal.funder}</p>
                            <p className="amount">{proposal.amount.toLocaleString('hu-HU')} Ft</p>
                        </div>
                    </div>
                ))}
            </div>
            {selectedProposal && <ProposalDetailModal proposal={selectedProposal} onClose={handleCloseModal} />}
        </View>
    );
};

const FinancesView = ({ transactions, ai, onOpenTransactionModal }) => {
    const [budgets] = useState<Budget[]>([
        { id: 'bud-1', category: 'Élelmiszer', amount: 80000, period: 'havi' },
        { id: 'bud-2', category: 'Szórakozás', amount: 30000, period: 'havi' },
        { id: 'bud-3', category: 'Rezsi', amount: 40000, period: 'havi' },
    ]);
    const [aiInsight, setAiInsight] = useState('');
    const [isInsightLoading, setIsInsightLoading] = useState(false);

    const summary = useMemo(() => {
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthlyTransactions = transactions.filter(t => {
            const date = new Date(t.date);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });
        const income = monthlyTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = monthlyTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const balance = income - expense;
        const expenseByCategory = monthlyTransactions.filter(t => t.type === 'expense').reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + t.amount;
            return acc;
        }, {} as Record<FinancialCategory, number>);
        return { income, expense, balance, expenseByCategory };
    }, [transactions]);
    
    const getBudgetUsage = (category: FinancialCategory) => {
        const budget = budgets.find(b => b.category === category);
        if (!budget) return { used: 0, total: 0, percentage: 0 };
        const used = summary.expenseByCategory[category] || 0;
        return { used, total: budget.amount, percentage: Math.min((used / budget.amount) * 100, 100) };
    };

    const getInsight = async () => {
        setIsInsightLoading(true); setAiInsight('');
        const prompt = `Te egy pénzügyi tanácsadó vagy. Elemezd a következő havi pénzügyi adatokat, és adj 2-3 rövid, konkrét, segítőkész tanácsot a felhasználónak magyarul. Kerüld a közhelyeket. A válasz legyen egy rövid, barátságos bekezdés. Tranzakciók: ${JSON.stringify(summary.expenseByCategory)}`;
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setAiInsight(response.text);
        } catch (err) {
            console.error("AI Insight Error:", err);
            setAiInsight("Hiba történt a tanácsok generálása közben.");
        } finally {
            setIsInsightLoading(false);
        }
    };
    
    const pieChartStyle = {
        background: `conic-gradient(${(Object.entries(summary.expenseByCategory) as [FinancialCategory, number][])
            .sort(([, a], [, b]) => b - a)
            .reduce((acc, [category, amount], _, arr) => {
                const total = arr.reduce((sum, [, val]) => sum + val, 0);
                if (total === 0) return acc;
                const percentage = (amount / total) * 100;
                const end = acc.start + percentage;
                acc.str += `${getCategoryColor(category as FinancialCategory)} ${acc.start}% ${end}%, `;
                acc.start = end;
                return acc;
            }, { str: '', start: 0 }).str.slice(0, -2)
        })`
    };

    return (
        <View title="Pénzügyek" subtitle="Bevételek és kiadások nyomon követése." actions={<button className="button button-primary" onClick={onOpenTransactionModal}><span className="material-symbols-outlined">add</span>Új Tranzakció</button>}>
            <div className="finances-view-container">
                <div className="finance-summary-grid">
                    <div className="card summary-card-finance"><h4>Havi bevétel</h4><p className="amount-income">{summary.income.toLocaleString('hu-HU')} Ft</p></div>
                    <div className="card summary-card-finance"><h4>Havi kiadás</h4><p className="amount-expense">{summary.expense.toLocaleString('hu-HU')} Ft</p></div>
                    <div className="card summary-card-finance"><h4>Egyenleg</h4><p className={summary.balance >= 0 ? 'amount-income' : 'amount-expense'}>{summary.balance.toLocaleString('hu-HU')} Ft</p></div>
                </div>
                
                <h3>Havi Költségvetés Követők</h3>
                <div className="budget-trackers-container">
                    {budgets.map(budget => {
                        const usage = getBudgetUsage(budget.category);
                        const progressClass = usage.percentage > 85 ? 'critical' : usage.percentage > 60 ? 'medium' : 'low';
                        return (
                            <div key={budget.id} className="card budget-card">
                                <div className="budget-card-header">
                                    <span>{budget.category}</span>
                                    <span>{usage.used.toLocaleString('hu-HU')} / {budget.amount.toLocaleString('hu-HU')} Ft</span>
                                </div>
                                <div className="budget-progress-bar-container">
                                    <div className={`budget-progress-bar ${progressClass}`} style={{width: `${usage.percentage}%`}}></div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="finance-details-grid">
                    <div className="card chart-card">
                        <h3>Kiadások Megoszlása</h3>
                        <div className="chart-area">
                            <div className="pie-chart-container">
                                <div className="pie-chart" style={pieChartStyle}></div>
                                <div className="pie-chart-inner-text">
                                    <span>Összes kiadás</span>
                                    <strong>{summary.expense.toLocaleString('hu-HU')} Ft</strong>
                                </div>
                            </div>
                            <div className="chart-legend">
                                {Object.entries(summary.expenseByCategory).sort(([, a], [, b]) => b - a).map(([category, amount]) => (
                                    <div key={category} className="legend-item">
                                        <div className="legend-color-box" style={{ backgroundColor: getCategoryColor(category as FinancialCategory) }}></div>
                                        <span className="legend-label">{category}</span>
                                        <span className="legend-value">{amount.toLocaleString('hu-HU')} Ft</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="card transactions-card">
                        <h3>Legutóbbi Tranzakciók</h3>
                        <ul className="recent-transactions-list">
                            {transactions.slice(0, 10).map(t => (
                                <li key={t.id} className="transaction-item">
                                    <div className="transaction-icon" style={{ backgroundColor: getCategoryColor(t.category) }}>
                                        <span className="material-symbols-outlined">{t.type === 'income' ? 'add' : 'remove'}</span>
                                    </div>
                                    <div className="transaction-details">
                                        <span className="transaction-title">{t.title}</span>
                                        <span className="transaction-category">{formatDate(t.date)}</span>
                                    </div>
                                    <span className={`transaction-amount ${t.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                                        {t.type === 'expense' ? '-' : ''}{t.amount.toLocaleString('hu-HU')} Ft
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                 <div className="card ai-financial-insight-widget">
                    <div className="ai-insight-header">
                        <h4><span className="material-symbols-outlined">psychology</span>AI Pénzügyi Elemző</h4>
                        <button className="button button-secondary" onClick={getInsight} disabled={isInsightLoading}>
                            {isInsightLoading ? <span className="material-symbols-outlined progress_activity">progress_activity</span> : "Elemzés"}
                        </button>
                    </div>
                    {isInsightLoading && <div className="widget-placeholder" style={{padding: 0, background: 'transparent'}}><p>Elemzés folyamatban...</p></div>}
                    {aiInsight && !isInsightLoading && <p className="ai-insight-content">{aiInsight}</p>}
                </div>
            </div>
        </View>
    );
};

const DocsView = ({ docs, onImageClick, onNoteClick, onAddNote }) => {
    const [filterType, setFilterType] = useState<'all' | DocType>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredDocs = useMemo(() => {
        return docs.filter(doc => {
            const typeMatch = filterType === 'all' || doc.type === filterType;
            const termMatch = searchTerm === '' || doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || doc.content.toLowerCase().includes(searchTerm.toLowerCase());
            return typeMatch && termMatch;
        }).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [docs, filterType, searchTerm]);

    const DocCard = ({ doc }) => {
        const handleClick = () => {
            if (doc.type === 'image') onImageClick(`data:image/jpeg;base64,${doc.content}`);
            if (doc.type === 'note') onNoteClick(doc.id);
        };

        const CardContent = () => {
            switch (doc.type) {
                case 'note': return <p>{doc.content.substring(0, 100)}...</p>;
                case 'link': return <a href={doc.content} target="_blank" rel="noopener noreferrer" className="doc-link-content">{doc.content}</a>;
                case 'image': return <img src={`data:image/jpeg;base64,${doc.content}`} alt={doc.title} />;
                default: return null;
            }
        };

        const icon = { 'note': 'article', 'link': 'link', 'image': 'image' }[doc.type];

        return (
            <div className={`card doc-card doc-card-${doc.type}`} onClick={handleClick}>
                <div className="doc-card-header">
                    <div className="doc-card-icon"><span className="material-symbols-outlined">{icon}</span></div>
                    <h4>{doc.title}</h4>
                </div>
                <div className="doc-card-content"><CardContent /></div>
                <div className="doc-card-footer">{new Date(doc.createdAt).toLocaleDateString('hu-HU')}</div>
            </div>
        );
    };

    return (
        <View title="Dokumentumok" subtitle="Jegyzetek, linkek és képek központi tárolója.">
            <div className="docs-view-container">
                <div className="docs-toolbar">
                    <div className="filter-group">
                        <div className="filter-tabs">
                            <button onClick={() => setFilterType('all')} className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}>Összes</button>
                            <button onClick={() => setFilterType('note')} className={`filter-tab ${filterType === 'note' ? 'active' : ''}`}>Jegyzetek</button>
                            <button onClick={() => setFilterType('image')} className={`filter-tab ${filterType === 'image' ? 'active' : ''}`}>Képek</button>
                            <button onClick={() => setFilterType('link')} className={`filter-tab ${filterType === 'link' ? 'active' : ''}`}>Linkek</button>
                        </div>
                    </div>
                    <input type="search" placeholder="Keresés a dokumentumokban..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    <button className="button button-primary" onClick={onAddNote}><span className="material-symbols-outlined">add</span>Új Jegyzet</button>
                </div>
                <div className="docs-grid">
                    {filteredDocs.map(doc => (
                        doc.type === 'link' ? 
                        <a key={doc.id} href={doc.content} target="_blank" rel="noopener noreferrer" className="doc-card-link"><DocCard doc={doc} /></a> :
                        <DocCard key={doc.id} doc={doc} />
                    ))}
                </div>
            </div>
        </View>
    );
};

const DocEditorView = ({ doc, onSave, onBack, ai }) => {
    const [title, setTitle] = useState(doc.title);
    const [content, setContent] = useState(doc.content);
    const editorRef = useRef(null);
    const [aiResult, setAiResult] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    const handleSave = () => {
        onSave(doc.id, title, content);
    };
    
    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
    };
    
    const handleAiAction = async (actionType: 'summarize' | 'expand' | 'fix') => {
        const currentContent = editorRef.current?.getValue();
        if (!currentContent) return;
        setIsAiLoading(true);
        setAiResult('');
        
        let prompt;
        switch(actionType) {
            case 'summarize': prompt = `Foglald össze röviden, 2-3 mondatban a következő szöveget magyarul:\n\n"${currentContent}"`; break;
            case 'expand': prompt = `Fejtsd ki bővebben, adj hozzá példákat vagy magyarázatokat a következő gondolathoz magyarul:\n\n"${currentContent}"`; break;
            case 'fix': prompt = `Javítsd ki a nyelvtani és helyesírási hibákat a következő szövegben, és add vissza a javított verziót magyarul:\n\n"${currentContent}"`; break;
        }

        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setAiResult(response.text);
            if(actionType !== 'summarize') {
                setContent(response.text);
            }
        } catch (err) {
            console.error("AI Doc Action Error:", err);
            setAiResult("Hiba történt az AI művelet során.");
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="doc-editor-view">
            <div className="doc-editor-header">
                <button className="button button-secondary" onClick={() => { handleSave(); onBack(); }}>
                    <span className="material-symbols-outlined">arrow_back</span> Vissza
                </button>
                <input
                    type="text"
                    className="doc-editor-title-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={handleSave}
                />
            </div>
            <div className="doc-editor-body">
                <div className="editor-pane card">
                    <Editor
                        height="100%"
                        language="markdown"
                        theme="vs-dark"
                        value={content}
                        onChange={(value) => setContent(value || '')}
                        onMount={handleEditorDidMount}
                        options={{ minimap: { enabled: false }, wordWrap: 'on', automaticLayout: true, scrollBeyondLastLine: false }}
                    />
                </div>
                <aside className="ai-assistant-panel card">
                    <h4><span className="material-symbols-outlined">psychology</span>AI Asszisztens</h4>
                    <div className="ai-assistant-actions">
                         <button className="button button-secondary" onClick={() => handleAiAction('summarize')} disabled={isAiLoading}>
                            <span className="material-symbols-outlined">compress</span>Összefoglalás
                        </button>
                        <button className="button button-secondary" onClick={() => handleAiAction('expand')} disabled={isAiLoading}>
                            <span className="material-symbols-outlined">expand_content</span>Bővítés
                        </button>
                        <button className="button button-secondary" onClick={() => handleAiAction('fix')} disabled={isAiLoading}>
                            <span className="material-symbols-outlined">spellcheck</span>Nyelvhelyesség javítása
                        </button>
                    </div>
                    {(isAiLoading || aiResult) && (
                         <div className="ai-assistant-result">
                            {isAiLoading 
                                ? <div className="widget-placeholder" style={{padding: 0, background: 'transparent'}}><span className="material-symbols-outlined progress_activity">progress_activity</span><p>Gondolkodom...</p></div>
                                : <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResult}</ReactMarkdown>
                            }
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

const TrainingModal = ({ isOpen, onClose, onSave, training }) => {
    const [title, setTitle] = useState('');
    const [provider, setProvider] = useState('');
    const [url, setUrl] = useState('');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (isOpen) {
            if (training) {
                setTitle(training.title || '');
                setProvider(training.provider || '');
                setUrl(training.url || '');
                setProgress(training.progress || 0);
            } else {
                setTitle(''); setProvider(''); setUrl(''); setProgress(0);
            }
        }
    }, [training, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({ id: training?.id, title: title.trim(), provider: provider.trim(), url: url.trim(), progress });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{training ? "Képzés Módosítása" : "Új Képzés"}</h3>
                    <button onClick={onClose} className="button-icon-close">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group"><label htmlFor="train-title">Képzés címe</label><input id="train-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required /></div>
                    <div className="form-group"><label htmlFor="train-provider">Szolgáltató</label><input id="train-provider" type="text" value={provider} onChange={e => setProvider(e.target.value)} /></div>
                    <div className="form-group"><label htmlFor="train-url">URL</label><input id="train-url" type="text" value={url} onChange={e => setUrl(e.target.value)} /></div>
                    <div className="form-group">
                        <label htmlFor="train-progress">Haladás: {progress}%</label>
                        <div className="progress-slider-container">
                            <input id="train-progress" type="range" min="0" max="100" step="5" value={progress} onChange={e => setProgress(Number(e.target.value))} />
                        </div>
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

const AiLearningPlanGenerator = ({ ai, onAddPlan, onAddNotification }) => {
    const [goal, setGoal] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [plan, setPlan] = useState(null);

    const handleGenerate = async () => {
        if (!goal.trim()) return;
        setIsLoading(true);
        setPlan(null);

        const schema = {
            type: Type.OBJECT,
            properties: {
                planTitle: { type: Type.STRING, description: "A teljes tanulási terv összefoglaló címe." },
                steps: {
                    type: Type.ARRAY,
                    description: "A tanulási terv konkrét, végrehajtható lépései, 3-5 elemre bontva.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "A lépés címe." },
                            provider: { type: Type.STRING, description: "Javasolt szolgáltató vagy platform (pl. 'YouTube', 'Dokumentáció', 'Gyakorló projekt')." },
                        },
                        required: ['title', 'provider']
                    }
                }
            },
            required: ['planTitle', 'steps']
        };

        const prompt = `Te egy tanulási tanácsadó vagy. A felhasználó megadja, mit szeretne megtanulni. Készíts egy egyszerű, 3-5 lépéses tanulási tervet a megadott JSON séma alapján. A lépések legyenek logikusak és gyakorlatiasak.\n\nTanulási cél: "${goal}"`;

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", contents: prompt,
                config: { responseMimeType: "application/json", responseSchema: schema }
            });
            setPlan(JSON.parse(response.text.trim()));
        } catch (err) {
            console.error("AI Plan Error:", err);
            onAddNotification({ message: 'Hiba a terv generálása közben.', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAddClick = () => {
        if(!plan || !plan.steps) return;
        onAddPlan(plan.steps);
        setPlan(null);
        setGoal('');
    };

    return (
        <div className="ai-learning-plan-generator card">
            <h4><span className="material-symbols-outlined">auto_awesome</span>AI Tanulási Terv Generátor</h4>
            <p>Nem tudja, hol kezdje? Írja le a célját, és a Gemini segít megtervezni a lépéseket!</p>
            <div className="form-group">
                <textarea value={goal} onChange={e => setGoal(e.target.value)} placeholder="Pl. Szeretném megérteni a React state managementet" rows={2} disabled={isLoading} />
            </div>
            <button onClick={handleGenerate} disabled={isLoading || !goal.trim()} className="button button-secondary">
                {isLoading ? <span className="material-symbols-outlined progress_activity">progress_activity</span> : "Terv generálása"}
            </button>
            {plan && (
                <div className="ai-summary-content">
                    <h5>Javasolt Terv: {plan.planTitle}</h5>
                    <ul>{plan.steps.map((step, i) => <li key={i}><strong>{step.title}</strong> ({step.provider})</li>)}</ul>
                    <button onClick={handleAddClick} className="button button-primary" style={{width: '100%', marginTop: 'var(--spacing-md)'}}>Terv Hozzáadása</button>
                </div>
            )}
        </div>
    );
};

const TrainingView = ({ trainings, onOpenTrainingModal, onSaveTraining, ai, onAddNotification }) => {
    const handleAddPlanAsTrainings = (steps) => {
        steps.forEach(step => {
            onSaveTraining({
                title: step.title,
                provider: step.provider,
                progress: 0,
            });
        });
         onAddNotification({ message: 'Tanulási terv sikeresen hozzáadva a képzésekhez!', type: 'success' });
    };

    return (
        <View 
            title="Képzések" 
            subtitle="Személyes és szakmai fejlődés követése."
            actions={<button className="button button-primary" onClick={() => onOpenTrainingModal()}><span className="material-symbols-outlined">add</span>Új Képzés</button>}
        >
            <AiLearningPlanGenerator ai={ai} onAddPlan={handleAddPlanAsTrainings} onAddNotification={onAddNotification} />
            <div className="training-grid">
                {trainings.map(training => (
                    <div key={training.id} className="training-card card" onClick={() => onOpenTrainingModal(training)}>
                        <div className="proposal-card-header">
                            <h4>{training.title}</h4>
                            <span className={`status-pill ${getTrainingStatusClass(training.status)}`}>{training.status}</span>
                        </div>
                        <div className="proposal-card-body">
                            <p className="funder">{training.provider}</p>
                            <div className="project-card-footer">
                                <span>Haladás</span>
                                <span>{training.progress}%</span>
                            </div>
                            <div className="progress-bar-container">
                                <div className="progress-bar-fill" style={{ width: `${training.progress}%`, backgroundColor: 'var(--color-primary)' }}></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </View>
    );
};

const ReportsView = ({ tasks, transactions, projects, trainings, ai }) => {
    // Weekly Task Report
    const [weekOffset, setWeekOffset] = useState(0);
    const [taskReport, setTaskReport] = useState('');
    const [isTaskReportLoading, setIsTaskReportLoading] = useState(false);

    const { weekStart, weekEnd, weekLabel } = useMemo(() => {
        const tempDate = new Date();
        tempDate.setHours(0, 0, 0, 0);
        // Move to the target week by applying the offset
        tempDate.setDate(tempDate.getDate() + (weekOffset * 7));

        // Find the Monday of that week. Day 0 is Sunday.
        const dayOfWeek = tempDate.getDay();
        const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
        tempDate.setDate(tempDate.getDate() + distanceToMonday);

        const start = new Date(tempDate); // This is now Monday at 00:00:00

        const end = new Date(start);
        end.setDate(start.getDate() + 6); // Add 6 days to get Sunday
        end.setHours(23, 59, 59, 999); // Set to the end of Sunday

        const label = `${start.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}`;
        return { weekStart: start, weekEnd: end, weekLabel: label };
    }, [weekOffset]);

    const weeklyTasks = useMemo(() => {
        return tasks.filter(task => {
            const completedDate = task.completedAt ? new Date(task.completedAt) : null;
            return completedDate && completedDate.getTime() >= weekStart.getTime() && completedDate.getTime() <= weekEnd.getTime();
        });
    }, [tasks, weekStart, weekEnd]);
    
    const generateTaskReport = async () => {
        setIsTaskReportLoading(true); setTaskReport('');
        const taskSummary = weeklyTasks.map(t => `- "${t.title}" (Prioritás: ${t.priority})`).join('\n');
        const prompt = `Te egy produktivitási coach vagy. Elemezd a felhasználó által a héten teljesített feladatokat. Írj egy rövid, 2-3 bekezdéses, motiváló és konstruktív heti értékelést. Emeld ki a sikereket, azonosítsd a mintákat (pl. sok magas prioritású feladat) és adj 1-2 tippet a következő hétre. Válaszodat magyarul add meg.\n\nHét: ${weekLabel}\n\nTeljesített feladatok:\n${taskSummary || 'Ezen a héten nem lett feladat teljesítve.'}`;
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setTaskReport(response.text);
        } catch (err) { console.error(err); setTaskReport('Hiba történt a riport generálása közben.'); } finally { setIsTaskReportLoading(false); }
    };
    
    // Monthly Financial Report
    const [monthOffset, setMonthOffset] = useState(0);
    const [financialReport, setFinancialReport] = useState('');
    const [isFinancialReportLoading, setIsFinancialReportLoading] = useState(false);

    const { monthStart, monthEnd, monthLabel } = useMemo(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const start = new Date(year, month + monthOffset, 1);
        const end = new Date(year, month + monthOffset + 1, 0);
        end.setHours(23, 59, 59, 999);
        const label = start.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });
        return { monthStart: start, monthEnd: end, monthLabel: label };
    }, [monthOffset]);
    
    const monthlyTransactions = useMemo(() => {
        return transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getTime() >= monthStart.getTime() && tDate.getTime() <= monthEnd.getTime();
        });
    }, [transactions, monthStart, monthEnd]);
    
    const monthlySummary = useMemo(() => {
        const income = monthlyTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = monthlyTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const expenseByCategory = monthlyTransactions.filter(t => t.type === 'expense').reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + t.amount;
            return acc;
        }, {} as Record<FinancialCategory, number>);
        return { income, expense, expenseByCategory };
    }, [monthlyTransactions]);

    const generateFinancialReport = async () => {
        setIsFinancialReportLoading(true); setFinancialReport('');
        const prompt = `Te egy pénzügyi elemző vagy. Elemezd a következő havi pénzügyi adatokat. Írj egy rövid, 2-3 bekezdéses összefoglalót a megadott JSON adatok alapján. Emeld ki a trendeket, a legnagyobb kiadási kategóriákat és adj 1-2 konkrét tippet a felhasználónak, hol tudna spórolni. A válaszodat magyarul add meg, és használj markdown formázást.\n\nHónap: ${monthLabel}\n\nHavi adatok:\nBevétel: ${monthlySummary.income.toLocaleString('hu-HU')} Ft\nKiadás: ${monthlySummary.expense.toLocaleString('hu-HU')} Ft\nKiadások kategóriánként: ${JSON.stringify(monthlySummary.expenseByCategory)}`;
        
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            setFinancialReport(response.text);
        } catch (err) { 
            console.error(err); 
            setFinancialReport('Hiba történt a riport generálása közben.'); 
        } finally { 
            setIsFinancialReportLoading(false); 
        }
    };

    const getProjectProgress = (projectId: string) => {
        const relatedTasks = tasks.filter(t => t.projectId === projectId);
        if (relatedTasks.length === 0) return 0;
        const completedTasks = relatedTasks.filter(t => t.status === 'Kész').length;
        return (completedTasks / relatedTasks.length) * 100;
    };
    
    return (
        <View title="Riportok" subtitle="AI-alapú elemzések a teljesítményedről és pénzügyeidről.">
            <div className="reports-view-container">
                <div className="card report-section">
                    <div className="report-header">
                        <h3>Heti Teljesítmény Riport</h3>
                        <div className="report-controls">
                            <button onClick={() => setWeekOffset(weekOffset - 1)} className="button button-icon-only" aria-label="Előző hét"><span className="material-symbols-outlined">chevron_left</span></button>
                            <span className="report-date-label">{weekLabel}</span>
                            <button onClick={() => setWeekOffset(weekOffset + 1)} className="button button-icon-only" aria-label="Következő hét" disabled={weekOffset >= 0}><span className="material-symbols-outlined">chevron_right</span></button>
                            <button onClick={generateTaskReport} className="button button-secondary" disabled={isTaskReportLoading}>
                                {isTaskReportLoading ? <span className="material-symbols-outlined progress_activity">progress_activity</span> : "Riport"}
                            </button>
                        </div>
                    </div>
                    <div className="report-content">
                        {isTaskReportLoading ? (
                            <div className="widget-placeholder"><span className="material-symbols-outlined progress_activity">progress_activity</span><p>Heti riport generálása...</p></div>
                        ) : taskReport ? (
                            <div className="ai-summary-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{taskReport}</ReactMarkdown></div>
                        ) : (
                            <div className="widget-placeholder"><span className="material-symbols-outlined">summarize</span><p>Generálj riportot a heti teljesítményedről.</p></div>
                        )}
                    </div>
                </div>

                <div className="card report-section">
                    <div className="report-header">
                        <h3>Havi Pénzügyi Riport</h3>
                        <div className="report-controls">
                             <button onClick={() => setMonthOffset(monthOffset - 1)} className="button button-icon-only" aria-label="Előző hónap"><span className="material-symbols-outlined">chevron_left</span></button>
                            <span className="report-date-label">{monthLabel}</span>
                            <button onClick={() => setMonthOffset(monthOffset + 1)} className="button button-icon-only" aria-label="Következő hónap" disabled={monthOffset >= 0}><span className="material-symbols-outlined">chevron_right</span></button>
                            <button onClick={generateFinancialReport} className="button button-secondary" disabled={isFinancialReportLoading}>
                                {isFinancialReportLoading ? <span className="material-symbols-outlined progress_activity">progress_activity</span> : "Riport"}
                            </button>
                        </div>
                    </div>
                     <div className="report-content">
                        {isFinancialReportLoading ? (
                             <div className="widget-placeholder"><span className="material-symbols-outlined progress_activity">progress_activity</span><p>Pénzügyi riport generálása...</p></div>
                        ) : financialReport ? (
                            <div className="ai-summary-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{financialReport}</ReactMarkdown></div>
                        ) : (
                             <div className="widget-placeholder"><span className="material-symbols-outlined">insights</span><p>Generálj riportot a havi pénzügyekről.</p></div>
                        )}
                    </div>
                </div>
            </div>
        </View>
    );
};

const ContactsView = ({ contacts, projects, proposals, emails, onOpenContactModal, ai, onAddNotification }) => {
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

    const findRelatedItems = (contact: Contact) => {
        const relatedProjects = projects.filter(p => contact.linkedProjectIds?.includes(p.id));
        const relatedProposals = proposals.filter(p => contact.linkedProposalIds?.includes(p.id));
        const relatedEmails = emails.filter(e => e.sender === contact.email || e.recipient === contact.email);
        return { relatedProjects, relatedProposals, relatedEmails };
    };

    return (
        <View 
            title="Kapcsolatok" 
            subtitle="Ügyfelek, partnerek és csapattagok kezelése."
            actions={<button className="button button-primary" onClick={() => onOpenContactModal()}><span className="material-symbols-outlined">add</span>Új Kapcsolat</button>}
        >
            <div className="contacts-view-layout">
                <div className="contact-list-pane">
                    {contacts.map(contact => (
                        <div key={contact.id} className={`contact-list-item card ${selectedContact?.id === contact.id ? 'active' : ''}`} onClick={() => setSelectedContact(contact)}>
                            <div className="avatar-sm" title={contact.name}>{contact.name.charAt(0)}</div>
                            <div className="contact-item-info">
                                <span className="contact-name">{contact.name}</span>
                                <span className="contact-company">{contact.company}</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="contact-detail-pane card">
                    {selectedContact ? (
                        <div className="contact-details">
                            <div className="contact-detail-header">
                                <div className="avatar-lg">{selectedContact.name.charAt(0)}</div>
                                <div className="contact-header-info">
                                    <h3>{selectedContact.name}</h3>
                                    <p>{selectedContact.role} at {selectedContact.company}</p>
                                </div>
                                <button className="button button-secondary" onClick={() => onOpenContactModal(selectedContact)}>
                                    <span className="material-symbols-outlined">edit</span> Módosítás
                                </button>
                            </div>
                            <div className="contact-info-grid">
                                {selectedContact.email && <div><span className="material-symbols-outlined">email</span><span>{selectedContact.email}</span></div>}
                                {selectedContact.phone && <div><span className="material-symbols-outlined">phone</span><span>{selectedContact.phone}</span></div>}
                            </div>
                            {selectedContact.notes && <div className="contact-notes"><h4>Jegyzetek</h4><p>{selectedContact.notes}</p></div>}
                            
                            <div className="related-items-section">
                                <h4>Kapcsolódó Elemek</h4>
                                {/* You can add more detailed lists here */}
                                <p>Projektek: {findRelatedItems(selectedContact).relatedProjects.length}</p>
                                <p>Pályázatok: {findRelatedItems(selectedContact).relatedProposals.length}</p>
                                <p>Emailek: {findRelatedItems(selectedContact).relatedEmails.length}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="widget-placeholder">
                            <span className="material-symbols-outlined">person_search</span>
                            <p>Válasszon ki egy kapcsolatot a részletek megtekintéséhez.</p>
                        </div>
                    )}
                </div>
            </div>
        </View>
    );
};

const GlobalHeader = ({ onToggleNav, onOpenSearch }) => (
    <header className="global-header">
        <button onClick={onToggleNav} className="button button-icon-only mobile-nav-toggle" aria-label="Navigáció">
            <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="search-bar-container" onClick={onOpenSearch}>
            <span className="material-symbols-outlined">search</span>
            <span className="search-bar-text">Keresés... (Ctrl+K)</span>
        </div>
        <div className="header-actions">
            <button className="button button-icon-only" aria-label="Értesítések">
                <span className="material-symbols-outlined">notifications</span>
            </button>
            <div className="user-profile">
                <div className="avatar-sm" title="Felhasználó">U</div>
            </div>
        </div>
    </header>
);

const GlobalSearchModal = ({ isOpen, onClose, ai, allData, onNavigate, onAddNotification }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [aiResponse, setAiResponse] = useState('');
    const [searchSources, setSearchSources] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            // Reset state when closing
            setTimeout(() => {
                 setSearchTerm('');
                 setResults([]);
                 setAiResponse('');
                 setSearchSources(null);
            }, 200); // delay to allow closing animation
        }
    }, [isOpen]);
    
    useEffect(() => {
        if (!searchTerm) {
            setResults([]);
            setAiResponse('');
            setSearchSources(null);
            return;
        }

        if (searchTerm.startsWith('/ai ')) {
            setResults([]);
            return;
        }

        // Local search logic
        const localResults = [];
        const lowerTerm = searchTerm.toLowerCase();

        if(allData.tasks) allData.tasks.filter(t => t.title.toLowerCase().includes(lowerTerm)).slice(0, 3).forEach(item => localResults.push({ type: 'Feladat', item, icon: 'task_alt', viewId: 'tasks' }));
        if(allData.projects) allData.projects.filter(p => p.title.toLowerCase().includes(lowerTerm)).slice(0, 2).forEach(item => localResults.push({ type: 'Projekt', item, icon: 'schema', viewId: 'projects' }));
        if(allData.docs) allData.docs.filter(d => d.title.toLowerCase().includes(lowerTerm)).slice(0, 3).forEach(item => localResults.push({ type: 'Dokumentum', item, icon: 'article', viewId: 'docs' }));
        if(allData.contacts) allData.contacts.filter(c => c.name.toLowerCase().includes(lowerTerm)).slice(0, 2).forEach(item => localResults.push({ type: 'Kapcsolat', item, icon: 'contacts', viewId: 'contacts' }));

        setResults(localResults);

    }, [searchTerm, allData]);

    const handleSearch = async (e) => {
        if (e.key === 'Enter' && searchTerm.startsWith('/ai ')) {
            e.preventDefault();
            const prompt = searchTerm.substring(4).trim();
            if (!prompt) return;

            setIsLoading(true);
            setResults([]);
            setAiResponse('');
            setSearchSources(null);

            try {
                const response = await ai.models.generateContent({
                   model: "gemini-2.5-flash",
                   contents: prompt,
                   config: {
                     tools: [{googleSearch: {}}],
                   },
                });

                setAiResponse(response.text);
                const metadata = response.candidates?.[0]?.groundingMetadata;
                if (metadata?.groundingMetadata) {
                    setSearchSources(metadata.groundingMetadata);
                }

            } catch (err) {
                console.error("AI Search Error:", err);
                setAiResponse("Hiba történt a keresés közben. Kérjük, próbálja újra később.");
                onAddNotification({ message: 'Hiba történt az AI keresés során.', type: 'error' });
            } finally {
                setIsLoading(false);
            }
        }
    };
    
    const handleResultClick = (result) => {
        if(result.viewId === 'docs' && result.item.type === 'note') {
            onNavigate('doc-editor', { docId: result.item.id });
        } else {
             onNavigate(result.viewId);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content card global-search-modal" onClick={e => e.stopPropagation()}>
                <div className="search-modal-input-container">
                    <span className="material-symbols-outlined">{searchTerm.startsWith('/ai ') ? 'travel_explore' : 'search'}</span>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Keress bárhol... vagy használd az /ai parancsot a Gemini kereséshez"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearch}
                    />
                </div>
                <div className="search-modal-results">
                    {isLoading ? (
                        <div className="widget-placeholder">
                            <span className="material-symbols-outlined progress_activity">progress_activity</span>
                            <p>Keresés az interneten...</p>
                        </div>
                    ) : aiResponse ? (
                        <div className="ai-search-response">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResponse}</ReactMarkdown>
                            {searchSources && searchSources.length > 0 && (
                                <div className="search-sources">
                                    <h4>Források</h4>
                                    <ul>
                                        {searchSources.map((source, index) => (
                                            <li key={index}>
                                                <a href={source.web.uri} target="_blank" rel="noopener noreferrer">{source.web.title || source.web.uri}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : results.length > 0 ? (
                        <ul className="search-results-list">
                            {results.map((result, index) => (
                                <li key={index} className="search-result-item" onClick={() => handleResultClick(result)}>
                                    <span className="material-symbols-outlined">{result.icon}</span>
                                    <div className="result-info">
                                        <span className="result-title">{result.item.title || result.item.name}</span>
                                        <span className="result-type">{result.type}</span>
                                    </div>
                                    <span className="material-symbols-outlined">north_west</span>
                                </li>
                            ))}
                        </ul>
                    ) : searchTerm ? (
                        <div className="widget-placeholder"><p>Nincs találat erre: "{searchTerm}"</p></div>
                    ) : (
                         <div className="widget-placeholder"><p>Keress feladatok, projektek, dokumentumok és egyebek között.</p></div>
                    )}
                </div>
            </div>
        </div>
    );
};


const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);