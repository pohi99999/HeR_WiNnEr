// Firebase Configuration and Initialization
import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase (only when configured)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;

const hasMinimumFirebaseConfig = () => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
};

if (hasMinimumFirebaseConfig()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();

    // Optional: Add scopes for Gmail and Calendar access
    googleProvider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    googleProvider.addScope("https://www.googleapis.com/auth/calendar.readonly");

    console.log("✅ Firebase initialized successfully");
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
    // Do not throw here: allow the UI to load and show a configuration warning.
    app = null;
    auth = null;
    db = null;
    googleProvider = null;
  }
} else {
  console.warn(
    "⚠️ Firebase nincs konfigurálva (.env / hosting env vars). Az app betölt, de a login és perzisztencia nem fog működni."
  );
}

// Export initialized instances (nullable when not configured)
export { app, auth, db, googleProvider };

// Helper to check if Firebase is configured
export const isFirebaseConfigured = () => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
};
