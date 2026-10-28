import PropTypes from 'prop-types';
import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, logOut } from '../config/firebase';
import { isEmailAllowed } from '../utils/emailValidation';
import http from '../utils/http';
import useForegroundRefresh from '../hooks/useForegroundRefresh';

const AuthContext = createContext();

// This context hook is deliberately colocated with its provider.
// eslint-disable-next-line react-refresh/only-export-components
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
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [accessVersion, setAccessVersion] = useState(0);
  const acceptAccess = useCallback(data => { setAccess(data); setAccessError(''); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setAccess(null);
    setAccessError('');
    if (user?.id) http.get('/me', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setAccess(data); }).catch(error => {
      if (!controller.signal.aborted) setAccessError(error.response?.data?.message || 'Could not load workspace access. Please retry.');
    });
    return () => controller.abort();
  }, [user?.id, accessVersion]);

  useForegroundRefresh(() => { if (user?.id) setAccessVersion(value => value + 1); });

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
    access,
    accessError,
    acceptAccess,
    refreshAccess: () => setAccessVersion(value => value + 1),
    isAuthenticated: user?.isAuthenticated || false
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = { children: PropTypes.node };
