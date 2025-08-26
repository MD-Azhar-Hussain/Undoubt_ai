// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDipzY4cG03pJOv93qZlicTyWYlFwz1Bos",
  authDomain: "mydigitalgun1607.firebaseapp.com",
  projectId: "mydigitalgun1607",
  storageBucket: "mydigitalgun1607.firebasestorage.app",
  messagingSenderId: "309430512199",
  appId: "1:309430512199:web:30daf6fe7397ea795e5f62"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Configure Google provider to avoid CORS issues
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Auth functions
export const signInWithGoogle = () => {
  // Use popup for better UX, but with proper configuration to minimize CORS warnings
  return signInWithPopup(auth, googleProvider);
};

// Alternative method using redirect (no CORS issues)
export const signInWithGoogleRedirect = () => {
  return signInWithRedirect(auth, googleProvider);
};

// Get redirect result (call this on app initialization)
export const getGoogleRedirectResult = () => {
  return getRedirectResult(auth);
};



export const logOut = () => {
  return signOut(auth);
};

export default app;
