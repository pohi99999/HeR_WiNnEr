// API Service for HeR WiNnEr App
// Firebase Firestore Integration

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getUserId } from "./authService";

// Types
export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  userId?: string;
}

export interface Event {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
  status: string;
  userId?: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  tag: string;
  status: "planning" | "development" | "done";
  userId?: string;
}

// Transaction API with Firestore
export const transactionAPI = {
  getAll: async (): Promise<Transaction[]> => {
    try {
      const userId = getUserId();
      if (!userId) throw new Error("User not authenticated");

      const q = query(
        collection(db, "transactions"),
        where("userId", "==", userId),
        orderBy("date", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Transaction[];
    } catch (error) {
      console.error("Error fetching transactions:", error);
      throw error;
    }
  }, with Firestore
export const eventAPI = {
  getAll: async (): Promise<Event[]> => {
    try {
      const userId = getUserId();
      if (!userId) throw new Error("User not authenticated");

      const q = query(
        collection(db, "events"),
        where("userId", "==", userId),
        orderBy("date", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[];
    } catch (error) {
      console.error("Error fetching events:", error);
      throw error;
    }
  },

  create: async (data: Omit<Event, "id" | "userId">): Promise<Event> => {
    try {
      const userId = getUserId();
      if (!userId) throw new Error("User not authenticated");

      const docRef = await addDoc(collection(db, "events"), {
        ...data,
        userId,
        createdAt: Timestamp.now(),
      });

      return {
        id: docRef.id,
        ...data,
        userId,
      };
    } catch (error) {
      console.error("Error creating event:", error);
      throw error;
    }
  },

  update: async (id: string, data: Partial<Event>): Promise<Event> => {
    try {
      const docRef = doc(db, "events", id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
      });

      const docSnap = await getDoc(docRef);
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Event;
    } catch (error) {
      console.error("Error updating event:", error);
      throw error;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "events", id));
    } catch (error) {
      console.error("Error deleting event:", error);
      throw error;
    }
  }console.error("Error creating transaction:", error);
      throw error;
    }
  }, with Firestore
export const projectAPI = {
  getAll: async (): Promise<ProjectTask[]> => {
    try {
      const userId = getUserId();
      if (!userId) throw new Error("User not authenticated");

      const q = query(
        collection(db, "projects"),
        where("userId", "==", userId)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ProjectTask[];
    } catch (error) {
      console.error("Error fetching projects:", error);
      throw error;
    }
  },

  create: async (data: Omit<ProjectTask, "id" | "userId">): Promise<ProjectTask> => {
    try {
      const userId = getUserId();
      if (!userId) throw new Error("User not authenticated");

      const docRef = await addDoc(collection(db, "projects"), {
        ...data,
        userId,
        createdAt: Timestamp.now(),
      });

      return {
        id: docRef.id,
        ...data,
        userId,
      };
    } catch (error) {
      console.error("Error creating project:", error);
      throw error;
    }
  },

  update: async (id: string, data: Partial<ProjectTask>): Promise<ProjectTask> => {
    try {
      const docRef = doc(db, "projects", id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
      });

      const docSnap = await getDoc(docRef);
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as ProjectTask;
    } catch (error) {
      console.error("Error updating project:", error);
      throw error;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "projects", id));
    } catch (error) {
      console.error("Error deleting project:", error);
      throw error;
    }
  },

// Event API
export const eventAPI = {
  getAll: () => apiCall<Event[]>("/events", { method: "GET" }),

  create: (data: Omit<Event, "id" | "userId">) =>
    apiCall<Event>("/events", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Event>) =>
    apiCall<Event>(`/events/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiCall<void>(`/events/${id}`, {
      method: "DELETE",
    }),
};

// Project API
export const projectAPI = {
  getAll: () => apiCall<ProjectTask[]>("/projects", { method: "GET" }),

  create: (data: Omit<ProjectTask, "id" | "userId">) =>
    apiCall<ProjectTask>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<ProjectTask>) =>
    apiCall<ProjectTask>(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiCall<void>(`/projects/${id}`, {
      method: "DELETE",
    }),
};

// Utility: Set user ID for session
export const setUserId = (userId: string) => {
  localStorage.setItem("userId", userId);
};

// Utility: Get current user ID
export const getUserId = () => {
  return localStorage.getItem("userId") || "default-user";
};
