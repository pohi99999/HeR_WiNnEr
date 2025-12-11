import React, { useState, useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";

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
  type: "income" | "expense";
  category: string;
  date: string;
};

type ProjectTask = {
  id: string;
  title: string;
  description: string;
  tag: string;
  status: "planning" | "development" | "done";
};

type ChatMessage = {
  id: string;
  role: "user" | "model";
  text: string;
};

// Mock Data
const MOCK_EVENTS = [
  {
    id: "1",
    date: new Date().toISOString().split("T")[0],
    time: "09:00",
    title: "Team Standup",
    type: "work",
    status: "completed",
  },
  {
    id: "2",
    date: new Date().toISOString().split("T")[0],
    time: "14:30",
    title: "Client Call",
    type: "meeting",
    status: "in-progress",
  },
  {
    id: "3",
    date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    time: "10:00",
    title: "Design Review",
    type: "work",
    status: "todo",
  },
];

const MOCK_EMAILS: EmailItem[] = [
  {
    id: "1",
    sender: "Alice Johnson",
    subject: "Project Timeline Update",
    time: "10:15 AM",
    body: "Hi team, the timeline has been updated. Please check the attachment.",
  },
  {
    id: "2",
    sender: "Bob Smith",
    subject: "Lunch?",
    time: "12:30 PM",
    body: "Hey, do you want to grab lunch at the usual place?",
  },
  {
    id: "3",
    sender: "Support",
    subject: "Ticket #1234 Resolved",
    time: "Yesterday",
    body: "Your support ticket has been marked as resolved.",
  },
];

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "1",
    title: "Fizetés",
    amount: 450000,
    type: "income",
    category: "Bevétel",
    date: new Date().toISOString().split("T")[0],
  },
  {
    id: "2",
    title: "Nagybevásárlás",
    amount: 25000,
    type: "expense",
    category: "Élelmiszer",
    date: new Date().toISOString().split("T")[0],
  },
  {
    id: "3",
    title: "Benzin",
    amount: 18000,
    type: "expense",
    category: "Utazás",
    date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
  },
  {
    id: "4",
    title: "Netflix",
    amount: 4500,
    type: "expense",
    category: "Szórakozás",
    date: new Date(Date.now() - 172800000).toISOString().split("T")[0],
  },
  {
    id: "5",
    title: "Villanyszámla",
    amount: 12000,
    type: "expense",
    category: "Rezsi",
    date: new Date(Date.now() - 259200000).toISOString().split("T")[0],
  },
  {
    id: "6",
    title: "Kávézó",
    amount: 3500,
    type: "expense",
    category: "Élelmiszer",
    date: new Date().toISOString().split("T")[0],
  },
];

const INITIAL_PROJECTS: ProjectTask[] = [
  {
    id: "1",
    title: "Weboldal Redesign",
    description: "Új UI kit implementálása",
    tag: "Frontend",
    status: "development",
  },
  {
    id: "2",
    title: "Adatbázis Migráció",
    description: "Átállás új struktúrára",
    tag: "Backend",
    status: "planning",
  },
  {
    id: "3",
    title: "Marketing Kampány",
    description: "Q4 hirdetések előkészítése",
    tag: "Marketing",
    status: "done",
  },
  {
    id: "4",
    title: "Mobil App MVP",
    description: "Alapfunkciók tesztelése",
    tag: "Mobile",
    status: "planning",
  },
];

// Helper Components
const Icon = ({
  name,
  style,
  className,
}: {
  name: string;
  style?: React.CSSProperties;
  className?: string;
}) => {
  // Simple text icons or emoji fallback with mapping for Google Fonts Material Symbols
  // If the name is a Material Symbol name, we render it as text inside the span with the correct class
  const isMaterial = className?.includes("material-symbols-outlined");

  if (isMaterial) {
    return (
      <span className={className} style={style}>
        {name}
      </span>
    );
  }

  const iconMap: Record<string, string> = {
    mail: "📧",
    calendar: "📅",
    finance: "💰",
    chart: "📊",
    trending_up: "📈",
    trending_down: "📉",
    category: "🏷️",
    send: "➤",
    smart_toy: "🤖",
    view_kanban: "📋",
  };
  return (
    <span className={className} style={style}>
      {iconMap[name] || "•"}
    </span>
  );
};

const EmailDetailModal = ({
  email,
  onClose,
}: {
  email: EmailItem;
  onClose: () => void;
}) => {
  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
      onClick={onClose}
    >
      <div
        className="modal-content glass-panel"
        style={{
          background: "#fff",
          padding: "20px",
          borderRadius: "8px",
          maxWidth: "500px",
          width: "90%",
          color: "#333",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <h3>{email.subject}</h3>
          <button
            onClick={onClose}
            style={{
              cursor: "pointer",
              border: "none",
              background: "transparent",
              fontSize: "1.2rem",
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{ marginBottom: "15px", fontSize: "0.9rem", color: "#666" }}
        >
          <div>
            <strong>From:</strong> {email.sender}
          </div>
          <div>
            <strong>Time:</strong> {email.time}
          </div>
        </div>
        <div className="email-body">{email.body}</div>
      </div>
    </div>
  );
};

// --- AI ASSISTANT VIEW ---
interface AiAssistantViewProps {
  initialPrompt?: string | null;
  onPromptHandled?: () => void;
}

const AiAssistantView = ({
  initialPrompt,
  onPromptHandled,
}: AiAssistantViewProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "0",
      role: "model",
      text: "Szia! A HeR WiNnEr asszisztense vagyok. Miben segíthetek ma?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasHandledInitialPrompt = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('API kulcs nincs beállítva. Kérlek, állítsd be a VITE_GEMINI_API_KEY környezeti változót.');
      }

      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-2.0-flash-exp",
        config: {
          systemInstruction:
            "You are a helpful, concise, and friendly productivity assistant for the 'HeR WiNnEr' app. You speak Hungarian. You help the user with organizing tasks, explaining financial terms, and general advice. If you receive financial data, analyze it briefly and give 1-2 practical tips.",
        },
      });

      let fullResponseText = "";
      const resultStream = await chat.sendMessageStream({
        message: userMsg.text,
      });

      const aiMsgId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id: aiMsgId, role: "model", text: "" },
      ]);

      for await (const chunk of resultStream) {
        const textChunk = chunk.text;
        fullResponseText += textChunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, text: fullResponseText } : m
          )
        );
      }
    } catch (error) {
      console.error("AI Error:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Elnézést, hiba történt a válaszadás közben.";
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "model",
          text: `❌ ${errorMessage}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to handle initial prompt from other views
  useEffect(() => {
    if (initialPrompt && !hasHandledInitialPrompt.current) {
      hasHandledInitialPrompt.current = true;
      sendMessage(initialPrompt);
      if (onPromptHandled) onPromptHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, onPromptHandled]);

  // Reset the handled flag if the prompt is cleared (component unmount/remount usually resets state anyway, but safe to keep)
  useEffect(() => {
    if (!initialPrompt) {
      hasHandledInitialPrompt.current = false;
    }
  }, [initialPrompt]);

  return (
    <div className="view-container chat-view">
      <header className="view-header">
        <h2>AI Asszisztens</h2>
        <div className="status-indicator online">Online</div>
      </header>

      <div className="chat-messages custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="bubble-content">{msg.text}</div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-bubble model">
            <div className="bubble-content">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area glass-panel">
        <input
          type="text"
          placeholder="Írj egy üzenetet..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(inputText)}
          disabled={isLoading}
        />
        <button
          onClick={() => sendMessage(inputText)}
          disabled={isLoading || !inputText.trim()}
          className="send-btn"
          aria-label="Üzenet küldése"
          title="Üzenet küldése"
        >
          <Icon name="send" className="material-symbols-outlined" />
        </button>
      </div>
    </div>
  );
};

// --- PROJECTS VIEW (KANBAN) ---
const ProjectsView = () => {
  const [projects, setProjects] = useState<ProjectTask[]>(INITIAL_PROJECTS);

  // Simple drag simulation: click to move to next stage
  const cycleStatus = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.status === "planning") return { ...p, status: "development" as const };
        if (p.status === "development") return { ...p, status: "done" as const };
        if (p.status === "done") return { ...p, status: "planning" as const };
        return p;
      })
    );
  };

  const columns = [
    { id: "planning", label: "Tervezés", color: "var(--warning)" },
    { id: "development", label: "Folyamatban", color: "var(--secondary)" },
    { id: "done", label: "Kész", color: "var(--success)" },
  ];

  return (
    <div className="view-container projects-view">
      <header className="view-header">
        <h2>Projektek</h2>
        <button className="icon-btn" aria-label="Új projekt hozzáadása" title="Új projekt hozzáadása">
          <span style={{ fontSize: "20px" }}>+</span>
        </button>
      </header>

      <div className="kanban-board custom-scrollbar">
        {columns.map((col) => {
          const colProjects = projects.filter((p) => p.status === col.id);
          return (
            <div key={col.id} className="kanban-column glass-panel">
              <div
                className="column-header"
                style={{ borderBottomColor: col.color }}
              >
                <span>{col.label}</span>
                <span className="count-badge">{colProjects.length}</span>
              </div>
              <div className="column-content">
                {colProjects.map((p) => (
                  <div
                    key={p.id}
                    className="project-card"
                    onClick={() => cycleStatus(p.id)}
                  >
                    <div className="project-tag">{p.tag}</div>
                    <h4>{p.title}</h4>
                    <p>{p.description}</p>
                  </div>
                ))}
                {colProjects.length === 0 && (
                  <div className="empty-col">Üres</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- FINANCE VIEW ---
const FinanceView = ({
  onAnalyze,
}: {
  onAnalyze: (prompt: string) => void;
}) => {
  // Calculate Weekly Summary
  const weeklySummary = useMemo(() => {
    const income = MOCK_TRANSACTIONS.filter((t) => t.type === "income").reduce(
      (acc, curr) => acc + curr.amount,
      0
    );

    const expense = MOCK_TRANSACTIONS.filter(
      (t) => t.type === "expense"
    ).reduce((acc, curr) => acc + curr.amount, 0);

    // Group expenses by category
    const categories: Record<string, number> = {};
    MOCK_TRANSACTIONS.filter((t) => t.type === "expense").forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });

    const sortedCategories = Object.entries(categories)
      .sort(([, a], [, b]) => b - a)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: expense > 0 ? (amount / expense) * 100 : 0,
      }));

    return {
      income,
      expense,
      balance: income - expense,
      categories: sortedCategories,
    };
  }, []);

  const formatHUF = (amount: number) => {
    return new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency: "HUF",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleAnalysisClick = () => {
    const prompt = `Szia Gemini! Kérlek, elemezd a heti pénzügyeimet! Itt vannak az adatok:
        - Összes bevétel: ${formatHUF(weeklySummary.income)}
        - Összes kiadás: ${formatHUF(weeklySummary.expense)}
        - Egyenleg: ${formatHUF(weeklySummary.balance)}
        
        Kiadások kategóriánként:
        ${weeklySummary.categories
          .map((c) => `- ${c.name}: ${formatHUF(c.amount)}`)
          .join("\n")}
        
        Kérlek, adj egy rövid összefoglalót és egy-két hasznos spórolási tanácsot!`;

    onAnalyze(prompt);
  };

  return (
    <div className="view-container finance-view">
      <header className="view-header finance-header">
        <h2>Pénzügyek</h2>
        <button
          className="icon-btn"
          onClick={handleAnalysisClick}
          style={{
            width: "auto",
            padding: "0 12px",
            fontSize: "13px",
            gap: "6px",
            background: "rgba(139, 92, 246, 0.2)",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            color: "#fff",
          }}
        >
          <Icon
            name="smart_toy"
            className="material-symbols-outlined"
            style={{ fontSize: "18px" }}
          />
          AI Elemzés
        </button>
      </header>

      <div className="finance-content custom-scrollbar">
        {/* Total Balance Card */}
        <div className="glass-panel finance-summary-card">
          <div className="finance-summary">
            <h3>Heti Egyenleg</h3>
            <div
              className={`big-number ${
                weeklySummary.balance >= 0 ? "positive" : "negative"
              }`}
            >
              {formatHUF(weeklySummary.balance)}
            </div>
          </div>
        </div>

        {/* Income / Expense Split */}
        <div className="finance-grid" style={{ marginTop: "20px" }}>
          <div className="finance-card glass-panel">
            <div className="card-icon success-bg">
              <Icon name="trending_up" className="material-symbols-outlined" />
            </div>
            <div className="card-info">
              <span className="label">Bevétel</span>
              <span className="amount success-text">
                {formatHUF(weeklySummary.income)}
              </span>
            </div>
          </div>
          <div className="finance-card glass-panel">
            <div className="card-icon danger-bg">
              <Icon
                name="trending_down"
                className="material-symbols-outlined"
              />
            </div>
            <div className="card-info">
              <span className="label">Kiadás</span>
              <span className="amount danger-text">
                {formatHUF(weeklySummary.expense)}
              </span>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div
          className="section-title"
          style={{ marginTop: "30px", marginBottom: "15px" }}
        >
          <Icon
            name="chart"
            className="material-symbols-outlined"
            style={{ marginRight: "8px" }}
          />
          Kiadások Kategóriánként
        </div>

        <div className="glass-panel" style={{ padding: "20px" }}>
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
                      style={{
                        width: `${cat.percentage}%`,
                        backgroundColor: `hsl(${200 + idx * 40}, 70%, 60%)`,
                      }}
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
        <div
          className="section-title"
          style={{ marginTop: "30px", marginBottom: "15px" }}
        >
          <Icon
            name="category"
            className="material-symbols-outlined"
            style={{ marginRight: "8px" }}
          />
          Legutóbbi Tranzakciók
        </div>
        <div className="transactions-list" style={{ paddingBottom: "20px" }}>
          {MOCK_TRANSACTIONS.map((t) => (
            <div
              key={t.id}
              className="transaction-item glass-panel"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px",
                marginBottom: "8px",
              }}
            >
              <div
                className={`card-icon tiny ${
                  t.type === "income" ? "success-bg" : "danger-bg"
                }`}
                style={{
                  width: "32px",
                  height: "32px",
                  fontSize: "14px",
                  marginRight: "12px",
                }}
              >
                {t.type === "income" ? "+" : "-"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>
                  {t.title}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {t.category} • {t.date}
                </div>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "14px",
                  color:
                    t.type === "income" ? "var(--success)" : "var(--text-main)",
                }}
              >
                {t.type === "income" ? "+" : ""}
                {formatHUF(t.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- PLANNER VIEW ---
const PlannerView = () => {
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

  // Date Logic
  const getDays = () => {
    if (viewMode === "month") {
      const daysInMonth = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth() + 1,
        0
      ).getDate();
      return Array.from(
        { length: daysInMonth },
        (_, i) =>
          new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i + 1)
      );
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
    if (viewMode === "month") {
      // Show events for selectedDate
      const dateStr = selectedDate.toISOString().split("T")[0];
      return MOCK_EVENTS.filter((ev) => ev.date === dateStr);
    } else {
      // Show events for all displayed days (the week)
      const weekStr = days.map((d) => d.toISOString().split("T")[0]);
      return MOCK_EVENTS.filter((ev) => weekStr.includes(ev.date)).sort(
        (a, b) => a.date.localeCompare(b.date)
      );
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
        <div
          className="filter-tabs"
          style={{ marginBottom: 0, width: "160px" }}
        >
          <button
            className={viewMode === "month" ? "active" : ""}
            onClick={() => setViewMode("month")}
          >
            Havi
          </button>
          <button
            className={viewMode === "week" ? "active" : ""}
            onClick={() => setViewMode("week")}
          >
            Heti
          </button>
        </div>
      </header>

      <div className="calendar-strip">
        <div className="month-label">
          {selectedDate.toLocaleString("hu-HU", {
            month: "long",
            year: "numeric",
          })}
          {viewMode === "week" && " (Heti Nézet)"}
        </div>
        <div className="days-scroller hide-scrollbar">
          {days.map((d) => {
            const isSelected =
              d.getDate() === selectedDate.getDate() &&
              d.getMonth() === selectedDate.getMonth();
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div
                key={d.toISOString()}
                className={`day-chip ${isSelected ? "active" : ""} ${
                  isToday ? "today" : ""
                }`}
                onClick={() => handleDateSelect(d)}
              >
                <span className="day-name">
                  {d
                    .toLocaleDateString("hu-HU", { weekday: "short" })
                    .charAt(0)}
                </span>
                <span className="num">{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="planner-content custom-scrollbar">
        <div className="section-title">
          {viewMode === "month"
            ? `Teendők: ${selectedDate.toLocaleDateString("hu-HU", {
                month: "long",
                day: "numeric",
              })}`
            : "Heti Teendők Áttekintése"}
        </div>

        {displayEvents.length > 0 ? (
          displayEvents.map((ev: any) => (
            <div key={ev.id} className="event-card glass-panel">
              {viewMode === "week" && (
                <div className="weekly-group">
                  <span className="group-date">{ev.date}</span>
                </div>
              )}
              <div className={`event-strip ${ev.type}`}></div>
              <div className="event-time">{ev.time || "Egész nap"}</div>
              <div className="event-details">
                <h4
                  className={ev.status === "completed" ? "completed-task" : ""}
                >
                  {ev.title}
                </h4>
                <div className="event-meta-row">
                  <span className="tag">{ev.type}</span>
                  <span className={`status-pill ${ev.status || "todo"}`}>
                    {ev.status === "completed"
                      ? "Kész"
                      : ev.status === "in-progress"
                      ? "Folyamatban"
                      : "Teendő"}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state" style={{ padding: "20px" }}>
            <p style={{ margin: 0 }}>
              Nincs rögzített esemény erre az időszakra.
            </p>
          </div>
        )}

        <div className="section-title" style={{ marginTop: "24px" }}>
          <Icon
            name="mail"
            className="material-symbols-outlined"
            style={{ marginRight: "8px", fontSize: "18px" }}
          />
          Beérkezett Levelek (Gmail)
        </div>
        <div className="email-preview glass-panel">
          {MOCK_EMAILS.map((email) => (
            <div
              key={email.id}
              className="email-row clickable"
              onClick={() => setSelectedEmail(email)}
            >
              <div className="sender">{email.sender}</div>
              <div className="subject">{email.subject}</div>
              <div className="date">{email.time}</div>
            </div>
          ))}
        </div>
      </div>

      {selectedEmail && (
        <EmailDetailModal
          email={selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      )}
    </div>
  );
};

// --- MAIN APP SHELL ---
const App = () => {
  const [currentView, setCurrentView] = useState<
    "planner" | "finance" | "projects" | "ai"
  >("ai");
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);

  const handleAiAnalysis = (prompt: string) => {
    setPendingAiPrompt(prompt);
    setCurrentView("ai");
  };

  const renderView = () => {
    switch (currentView) {
      case "planner":
        return <PlannerView />;
      case "finance":
        return <FinanceView onAnalyze={handleAiAnalysis} />;
      case "projects":
        return <ProjectsView />;
      case "ai":
        return (
          <AiAssistantView
            initialPrompt={pendingAiPrompt}
            onPromptHandled={() => setPendingAiPrompt(null)}
          />
        );
      default:
        return <AiAssistantView />;
    }
  };

  return (
    <div className="app-shell">
      <div className="content-area">{renderView()}</div>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${currentView === "planner" ? "active" : ""}`}
          onClick={() => setCurrentView("planner")}
        >
          <Icon name="calendar_month" className="material-symbols-outlined" />
          <span>Naptár</span>
        </button>
        <button
          className={`nav-item ${currentView === "projects" ? "active" : ""}`}
          onClick={() => setCurrentView("projects")}
        >
          <Icon name="view_kanban" className="material-symbols-outlined" />
          <span>Projektek</span>
        </button>
        <button
          className={`nav-item ${currentView === "ai" ? "active" : ""}`}
          onClick={() => setCurrentView("ai")}
        >
          <Icon name="smart_toy" className="material-symbols-outlined" />
          <span>Gemini</span>
        </button>
        <button
          className={`nav-item ${currentView === "finance" ? "active" : ""}`}
          onClick={() => setCurrentView("finance")}
        >
          <Icon
            name="account_balance_wallet"
            className="material-symbols-outlined"
          />
          <span>Pénzügy</span>
        </button>
      </nav>
    </div>
  );
};

// Initialize React 19 app
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Root element not found!");
}

export default App;
