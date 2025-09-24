import React, { createContext, useContext, useState, useEffect } from 'react';

const PlaidAuthContext = createContext();

const STORAGE_KEY = 'plaid_auth_session';
const EXPECTED_PASSWORD = import.meta.env.VITE_PLAID_ACCESS_PASSWORD;

export const PlaidAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkExistingSession = () => {
      try {
        const sessionData = sessionStorage.getItem(STORAGE_KEY);
        if (sessionData) {
          const { authenticated, timestamp } = JSON.parse(sessionData);
          const now = Date.now();
          const sessionAge = now - timestamp;
          
          // Session expires after 8 hours
          if (authenticated && sessionAge < 8 * 60 * 60 * 1000) {
            setIsAuthenticated(true);
          } else {
            sessionStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
        sessionStorage.removeItem(STORAGE_KEY);
      }
      setIsLoading(false);
    };

    checkExistingSession();
  }, []);

  const login = (password) => {
    if (!EXPECTED_PASSWORD) {
      console.warn('No password configured for Plaid access');
      return false;
    }

    if (password === EXPECTED_PASSWORD) {
      const sessionData = {
        authenticated: true,
        timestamp: Date.now()
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIsAuthenticated(false);
  };

  const value = {
    isAuthenticated,
    isLoading,
    login,
    logout
  };

  return (
    <PlaidAuthContext.Provider value={value}>
      {children}
    </PlaidAuthContext.Provider>
  );
};

export const usePlaidAuth = () => {
  const context = useContext(PlaidAuthContext);
  if (!context) {
    throw new Error('usePlaidAuth must be used within a PlaidAuthProvider');
  }
  return context;
};