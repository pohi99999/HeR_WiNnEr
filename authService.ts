// Firebase Authentication Service
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";

// Sign in with Google
export const signInWithGoogle = async (): Promise<User> => {
  try {
    if (!auth || !googleProvider) {
      throw new Error(
        "Firebase nincs konfigurálva. Állítsd be a VITE_FIREBASE_* környezeti változókat, majd indítsd újra a szervert."
      );
    }
    const result = await signInWithPopup(auth, googleProvider);
    console.log("✅ User signed in:", result.user.email);
    return result.user;
  } catch (error) {
    console.error("❌ Sign in error:", error);
    throw error;
  }
};

// Sign out
export const signOut = async (): Promise<void> => {
  try {
    if (!auth) return;
    await firebaseSignOut(auth);
    console.log("✅ User signed out");
  } catch (error) {
    console.error("❌ Sign out error:", error);
    throw error;
  }
};

// Listen to auth state changes
export const onAuthChange = (callback: (user: User | null) => void) => {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

// Get current user
export const getCurrentUser = (): User | null => {
  return auth?.currentUser ?? null;
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!auth?.currentUser;
};

// Get user display name
export const getUserDisplayName = (): string => {
  return auth?.currentUser?.displayName || "Felhasználó";
};

// Get user email
export const getUserEmail = (): string => {
  return auth?.currentUser?.email || "";
};

// Get user photo URL
export const getUserPhotoURL = (): string | null => {
  return auth?.currentUser?.photoURL || null;
};

// Get user ID
export const getUserId = (): string => {
  return auth?.currentUser?.uid || "";
};
