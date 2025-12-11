import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

// Types
interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  userId?: string;
}

interface Event {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  status: string;
  userId?: string;
}

interface ProjectTask {
  id: string;
  title: string;
  description: string;
  tag: string;
  status: "planning" | "development" | "done";
  userId?: string;
}

// In-memory storage (replace with real database in production)
const storage: {
  transactions: Transaction[];
  events: Event[];
  projects: ProjectTask[];
} = {
  transactions: [],
  events: [],
  projects: [],
};

// Helper to get user ID from auth (placeholder)
const getUserId = (event: HandlerEvent): string => {
  // In production, extract from JWT token or session
  return event.headers["x-user-id"] || "default-user";
};

// CORS headers
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-user-id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  const userId = getUserId(event);
  const path = event.path.replace("/.netlify/functions/api", "");
  const method = event.httpMethod;

  try {
    // TRANSACTIONS endpoints
    if (path === "/transactions") {
      if (method === "GET") {
        const userTransactions = storage.transactions.filter(
          (t) => t.userId === userId
        );
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(userTransactions),
        };
      }

      if (method === "POST") {
        const newTransaction: Transaction = {
          ...JSON.parse(event.body || "{}"),
          id: Date.now().toString(),
          userId,
        };
        storage.transactions.push(newTransaction);
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify(newTransaction),
        };
      }
    }

    if (path.startsWith("/transactions/")) {
      const id = path.split("/")[2];

      if (method === "PUT") {
        const index = storage.transactions.findIndex(
          (t) => t.id === id && t.userId === userId
        );
        if (index === -1) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: "Transaction not found" }),
          };
        }
        const updated = { ...storage.transactions[index], ...JSON.parse(event.body || "{}") };
        storage.transactions[index] = updated;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(updated),
        };
      }

      if (method === "DELETE") {
        storage.transactions = storage.transactions.filter(
          (t) => !(t.id === id && t.userId === userId)
        );
        return {
          statusCode: 204,
          headers,
          body: "",
        };
      }
    }

    // EVENTS endpoints
    if (path === "/events") {
      if (method === "GET") {
        const userEvents = storage.events.filter((e) => e.userId === userId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(userEvents),
        };
      }

      if (method === "POST") {
        const newEvent: Event = {
          ...JSON.parse(event.body || "{}"),
          id: Date.now().toString(),
          userId,
        };
        storage.events.push(newEvent);
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify(newEvent),
        };
      }
    }

    if (path.startsWith("/events/")) {
      const id = path.split("/")[2];

      if (method === "PUT") {
        const index = storage.events.findIndex(
          (e) => e.id === id && e.userId === userId
        );
        if (index === -1) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: "Event not found" }),
          };
        }
        const updated = { ...storage.events[index], ...JSON.parse(event.body || "{}") };
        storage.events[index] = updated;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(updated),
        };
      }

      if (method === "DELETE") {
        storage.events = storage.events.filter(
          (e) => !(e.id === id && e.userId === userId)
        );
        return {
          statusCode: 204,
          headers,
          body: "",
        };
      }
    }

    // PROJECTS endpoints
    if (path === "/projects") {
      if (method === "GET") {
        const userProjects = storage.projects.filter(
          (p) => p.userId === userId
        );
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(userProjects),
        };
      }

      if (method === "POST") {
        const newProject: ProjectTask = {
          ...JSON.parse(event.body || "{}"),
          id: Date.now().toString(),
          userId,
        };
        storage.projects.push(newProject);
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify(newProject),
        };
      }
    }

    if (path.startsWith("/projects/")) {
      const id = path.split("/")[2];

      if (method === "PUT") {
        const index = storage.projects.findIndex(
          (p) => p.id === id && p.userId === userId
        );
        if (index === -1) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: "Project not found" }),
          };
        }
        const updated = { ...storage.projects[index], ...JSON.parse(event.body || "{}") };
        storage.projects[index] = updated;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(updated),
        };
      }

      if (method === "DELETE") {
        storage.projects = storage.projects.filter(
          (p) => !(p.id === id && p.userId === userId)
        );
        return {
          statusCode: 204,
          headers,
          body: "",
        };
      }
    }

    // Not found
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: "Endpoint not found" }),
    };
  } catch (error) {
    console.error("API Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

export { handler };
