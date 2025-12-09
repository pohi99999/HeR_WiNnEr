import React, { useState, useMemo } from 'react';

// Type definitions
type EmailItem = {
    id: string;
    sender: string;
    subject: string;
    time: string;
    body: string;
};

type Transaction = {
    id: string;
    title: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    date: string;
};

// Mock Data
const MOCK_EVENTS = [
    { id: '1', date: new Date().toISOString().split('T')[0], time: '09:00', title: 'Team Standup', type: 'work', status: 'completed' },
    { id: '2', date: new Date().toISOString().split('T')[0], time: '14:30', title: 'Client Call', type: 'meeting', status: 'in-progress' },
    { id: '3', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], time: '10:00', title: 'Design Review', type: 'work', status: 'todo' },
];

const MOCK_EMAILS: EmailItem[] = [
    { id: '1', sender: 'Alice Johnson', subject: 'Project Timeline Update', time: '10:15 AM', body: 'Hi team, the timeline has been updated. Please check the attachment.' },
    { id: '2', sender: 'Bob Smith', subject: 'Lunch?', time: '12:30 PM', body: 'Hey, do you want to grab lunch at the usual place?' },
    { id: '3', sender: 'Support', subject: 'Ticket #1234 Resolved', time: 'Yesterday', body: 'Your support ticket has been marked as resolved.' },
];

const MOCK_TRANSACTIONS: Transaction[] = [
    { id: '1', title: 'Fizetés', amount: 450000, type: 'income', category: 'Bevétel', date: new Date().toISOString().split('T')[0] },
    { id: '2', title: 'Nagybevásárlás', amount: 25000, type: 'expense', category: 'Élelmiszer', date: new Date().toISOString().split('T')[0] },
    { id: '3', title: 'Benzin', amount: 18000, type: 'expense', category: 'Utazás', date: new Date(Date.now() - 86400000).toISOString().split('T')[0] },
    { id: '4', title: 'Netflix', amount: 4500, type: 'expense', category: 'Szórakozás', date: new Date(Date.now() - 172800000).toISOString().split('T')[0] },
    { id: '5', title: 'Villanyszámla', amount: 12000, type: 'expense', category: 'Rezsi', date: new Date(Date.now() - 259200000).toISOString().split('T')[0] },
    { id: '6', title: 'Kávézó', amount: 3500, type: 'expense', category: 'Élelmiszer', date: new Date().toISOString().split('T')[0] },
];

// Helper Components
const Icon = ({ name, style, className }: { name: string; style?: React.CSSProperties, className?: string }) => {
    // Simple text icons or emoji fallback
    const iconMap: Record<string, string> = {
        mail: '📧',
        calendar: '📅',
        finance: '💰',
        chart: '📊',
        trending_up: '📈',
        trending_down: '📉',
        category: '🏷️'
    };
    return <span className={className} style={style}>{iconMap[name] || '•'}</span>;
};

const EmailDetailModal = ({ email, onClose }: { email: EmailItem; onClose: () => void }) => {
    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, 
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }} onClick={onClose}>
            <div className="modal-content glass-panel" style={{
                background: '#fff', padding: '20px', borderRadius: '8px', 
                maxWidth: '500px', width: '90%', color: '#333'
            }} onClick={e => e.stopPropagation()}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <h3>{email.subject}</h3>
                    <button onClick={onClose} style={{cursor: 'pointer', border: 'none', background: 'transparent', fontSize: '1.2rem'}}>×</button>
                </div>
                <div style={{marginBottom: '15px', fontSize: '0.9rem', color: '#666'}}>
                    <div><strong>From:</strong> {email.sender}</div>
                    <div><strong>Time:</strong> {email.time}</div>
                </div>
                <div className="email-body">
                    {email.body}
                </div>
            </div>
        </div>
    );
};

// FINANCE VIEW
const FinanceView = () => {
    // Calculate Weekly Summary
    const weeklySummary = useMemo(() => {
        const income = MOCK_TRANSACTIONS
            .filter(t => t.type === 'income')
            .reduce((acc, curr) => acc + curr.amount, 0);
            
        const expense = MOCK_TRANSACTIONS
            .filter(t => t.type === 'expense')
            .reduce((acc, curr) => acc + curr.amount, 0);

        // Group expenses by category
        const categories: Record<string, number> = {};
        MOCK_TRANSACTIONS
            .filter(t => t.type === 'expense')
            .forEach(t => {
                categories[t.category] = (categories[t.category] || 0) + t.amount;
            });

        const sortedCategories = Object.entries(categories)
            .sort(([, a], [, b]) => b - a)
            .map(([name, amount]) => ({
                name,
                amount,
                percentage: expense > 0 ? (amount / expense) * 100 : 0
            }));

        return {
            income,
            expense,
            balance: income - expense,
            categories: sortedCategories
        };
    }, []);

    const formatHUF = (amount: number) => {
        return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="view-container finance-view">
             <header className="view-header finance-header">
                <h2>Pénzügyek</h2>
                <span className="week-badge">Ezen a héten</span>
            </header>

            <div className="finance-content custom-scrollbar">
                {/* Total Balance Card */}
                <div className="glass-panel finance-summary-card">
                    <div className="finance-summary">
                        <h3>Heti Egyenleg</h3>
                        <div className={`big-number ${weeklySummary.balance >= 0 ? 'positive' : 'negative'}`}>
                            {formatHUF(weeklySummary.balance)}
                        </div>
                    </div>
                </div>

                {/* Income / Expense Split */}
                <div className="finance-grid" style={{marginTop: '20px'}}>
                    <div className="finance-card glass-panel">
                        <div className="card-icon success-bg">
                            <Icon name="trending_up" />
                        </div>
                        <div className="card-info">
                            <span className="label">Bevétel</span>
                            <span className="amount success-text">{formatHUF(weeklySummary.income)}</span>
                        </div>
                    </div>
                    <div className="finance-card glass-panel">
                        <div className="card-icon danger-bg">
                            <Icon name="trending_down" />
                        </div>
                        <div className="card-info">
                            <span className="label">Kiadás</span>
                            <span className="amount danger-text">{formatHUF(weeklySummary.expense)}</span>
                        </div>
                    </div>
                </div>

                {/* Category Breakdown */}
                <div className="section-title" style={{marginTop: '30px', marginBottom: '15px'}}>
                    <Icon name="chart" style={{marginRight:'8px'}}/> 
                    Kiadások Kategóriánként
                </div>
                
                <div className="glass-panel" style={{padding: '20px'}}>
                    {weeklySummary.categories.length > 0 ? (
                        <div className="category-list">
                            {weeklySummary.categories.map((cat, idx) => (
                                <div key={idx} className="cat-visual-row">
                                    <div className="cat-header">
                                        <span className="cat-name">{cat.name}</span>
                                        <span className="cat-amount">{formatHUF(cat.amount)}</span>
                                    </div>
                                    <div className="cat-bar-bg">
                                        <div 
                                            className="cat-bar-fill" 
                                            style={{width: `${cat.percentage}%`, backgroundColor: `hsl(${200 + (idx * 40)}, 70%, 60%)`}}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">Nincs kiadás ezen a héten.</div>
                    )}
                </div>

                {/* Recent Transactions List */}
                <div className="section-title" style={{marginTop: '30px', marginBottom: '15px'}}>
                    <Icon name="category" style={{marginRight:'8px'}}/> 
                    Legutóbbi Tranzakciók
                </div>
                <div className="transactions-list" style={{paddingBottom: '20px'}}>
                    {MOCK_TRANSACTIONS.map(t => (
                        <div key={t.id} className="transaction-item glass-panel" style={{display: 'flex', alignItems: 'center', padding: '12px', marginBottom: '8px'}}>
                             <div className={`card-icon tiny ${t.type === 'income' ? 'success-bg' : 'danger-bg'}`} style={{width: '32px', height: '32px', fontSize: '14px', marginRight: '12px'}}>
                                {t.type === 'income' ? '+' : '-'}
                            </div>
                            <div style={{flex: 1}}>
                                <div style={{fontWeight: 600, fontSize: '14px'}}>{t.title}</div>
                                <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>{t.category} • {t.date}</div>
                            </div>
                            <div style={{fontWeight: 700, fontSize: '14px', color: t.type === 'income' ? 'var(--success)' : 'var(--text-main)'}}>
                                {t.type === 'income' ? '+' : ''}{formatHUF(t.amount)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// PLANNER VIEW
const PlannerView = () => {
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

    // Date Logic
    const getDays = () => {
        if (viewMode === 'month') {
            const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
            return Array.from({ length: daysInMonth }, (_, i) => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i + 1));
        } else {
            // Week mode: show current week Mon-Sun
            const curr = new Date(selectedDate);
            const currentDay = curr.getDay();
            const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust when day is sunday
            const monday = new Date(curr.setDate(curr.getDate() + diff));
            
            return Array.from({ length: 7 }, (_, i) => {
                 const d = new Date(monday);
                 d.setDate(monday.getDate() + i);
                 return d;
            });
        }
    };
    
    const days = getDays();

    const getFilteredEvents = () => {
        if (viewMode === 'month') {
             // Show events for selectedDate
             const dateStr = selectedDate.toISOString().split('T')[0];
             return MOCK_EVENTS.filter(ev => ev.date === dateStr);
        } else {
            // Show events for all displayed days (the week)
            const weekStr = days.map(d => d.toISOString().split('T')[0]);
            return MOCK_EVENTS.filter(ev => weekStr.includes(ev.date)).sort((a,b) => a.date.localeCompare(b.date));
        }
    };

    const displayEvents = getFilteredEvents();

    const handleDateSelect = (d: Date) => {
        // Create new date to avoid mutation reference issues
        setSelectedDate(new Date(d));
    };

    return (
        <div className="view-container planner-view">
            <header className="view-header">
                <h2>Naptár & Gmail</h2>
                <div className="filter-tabs" style={{marginBottom: 0, width: '160px'}}>
                    <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>Havi</button>
                    <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>Heti</button>
                </div>
            </header>

            <div className="calendar-strip">
                <div className="month-label">
                    {selectedDate.toLocaleString('hu-HU', { month: 'long', year: 'numeric' })}
                    {viewMode === 'week' && ' (Heti Nézet)'}
                </div>
                <div className="days-scroller hide-scrollbar">
                    {days.map(d => {
                        const isSelected = d.getDate() === selectedDate.getDate() && d.getMonth() === selectedDate.getMonth();
                        const isToday = d.toDateString() === new Date().toDateString();
                        return (
                            <div 
                                key={d.toISOString()} 
                                className={`day-chip ${isSelected ? 'active' : ''} ${isToday ? 'today' : ''}`}
                                onClick={() => handleDateSelect(d)}
                            >
                                <span className="day-name">{d.toLocaleDateString('hu-HU', { weekday: 'short' }).charAt(0)}</span>
                                <span className="num">{d.getDate()}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="planner-content custom-scrollbar">
                <div className="section-title">
                    {viewMode === 'month' 
                        ? `Teendők: ${selectedDate.toLocaleDateString('hu-HU', {month: 'long', day: 'numeric'})}`
                        : "Heti Teendők Áttekintése"
                    }
                </div>
                
                {displayEvents.length > 0 ? (
                    displayEvents.map((ev: any) => (
                        <div key={ev.id} className="event-card glass-panel">
                            {viewMode === 'week' && (
                                <div className="weekly-group">
                                    <span className="group-date">{ev.date}</span>
                                </div>
                            )}
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
                    ))
                ) : (
                    <div className="empty-state" style={{padding: '20px'}}>
                        <p style={{margin:0}}>Nincs rögzített esemény erre az időszakra.</p>
                    </div>
                )}

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

// MAIN APP SHELL
const App = () => {
    const [currentView, setCurrentView] = useState<'planner' | 'finance'>('finance');

    return (
        <div className="app-shell">
            <div className="content-area">
                {currentView === 'planner' ? <PlannerView /> : <FinanceView />}
            </div>
            
            <nav className="bottom-nav">
                <button 
                    className={`nav-item ${currentView === 'planner' ? 'active' : ''}`}
                    onClick={() => setCurrentView('planner')}
                >
                    <Icon name="calendar" className="material-symbols-outlined" />
                    <span>Naptár</span>
                </button>
                <button 
                    className={`nav-item ${currentView === 'finance' ? 'active' : ''}`}
                    onClick={() => setCurrentView('finance')}
                >
                    <Icon name="finance" className="material-symbols-outlined" />
                    <span>Pénzügyek</span>
                </button>
            </nav>
        </div>
    );
};

export default App;