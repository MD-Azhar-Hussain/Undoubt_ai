import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, logOut } from '../config/firebase';
import { isEmailAllowed } from '../utils/emailValidation';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Check if user's email is allowed
        if (!isEmailAllowed(firebaseUser.email)) {
          // Sign out user with unauthorized email
          await logOut();
          setUser(null);
          setLoading(false);
          // Redirect will be handled by the login page
          window.location.href = '/access-denied';
          return;
        }

        // Create a user object that matches our app's expected structure
        const userData = {
          id: firebaseUser.uid,
          firstName: firebaseUser.displayName?.split(' ')[0] || 'User',
          lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
          emailAddresses: [{ emailAddress: firebaseUser.email }],
          photoURL: firebaseUser.photoURL,
          isAuthenticated: true
        };
        setUser(userData);
      } else {
        // No user authenticated
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: user?.isAuthenticated || false
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
