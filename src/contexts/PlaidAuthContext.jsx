import React, { createContext, useContext, useState, useEffect } from 'react';
import PlaidStorageService from '../services/PlaidStorageService';

const PlaidAuthContext = createContext();

const STORAGE_KEY = 'plaid_auth_session';
const EXPECTED_PASSWORD = import.meta.env.VITE_PLAID_ACCESS_PASSWORD;

export const PlaidAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState(null);
  const [savedConnections, setSavedConnections] = useState([]);
  const [hasSavedConnections, setHasSavedConnections] = useState(false);

  useEffect(() => {
    const checkExistingSession = () => {
      try {
        // Check for saved connections
        setHasSavedConnections(PlaidStorageService.hasSavedConnection());

        // Check authentication session
        const sessionData = sessionStorage.getItem(STORAGE_KEY);
        if (sessionData) {
          const { authenticated, timestamp, password } = JSON.parse(sessionData);
          const now = Date.now();
          const sessionAge = now - timestamp;

          // Session expires after 8 hours
          if (authenticated && sessionAge < 8 * 60 * 60 * 1000) {
            setIsAuthenticated(true);
            setCurrentPassword(password); // Store password for loading saved connections
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
        timestamp: Date.now(),
        password: password // Store for decryption
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
      setIsAuthenticated(true);
      setCurrentPassword(password);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIsAuthenticated(false);
    setCurrentPassword(null);
    setSavedConnections([]);
  };

  // Save a new Plaid connection
  const saveConnection = async (connectionData) => {
    if (!currentPassword) {
      console.error('No password available for saving connection');
      return false;
    }

    const success = await PlaidStorageService.saveConnection(connectionData, currentPassword);
    if (success) {
      setHasSavedConnections(true);
      // You could load and update the savedConnections state here
    }
    return success;
  };

  // Load saved connections
  const loadSavedConnections = async () => {
    if (!currentPassword) {
      console.error('No password available for loading connections');
      return null;
    }

    try {
      const connectionData = await PlaidStorageService.loadConnection(currentPassword);
      if (connectionData) {
        setSavedConnections([connectionData]); // For now, supporting one connection
        return connectionData;
      }
      return null;
    } catch (error) {
      console.error('Failed to load saved connections:', error);
      return null;
    }
  };

  // Clear all saved connections
  const clearSavedConnections = () => {
    PlaidStorageService.clearConnection();
    setSavedConnections([]);
    setHasSavedConnections(false);
  };

  // Clear all data (for development/testing)
  const clearAllData = () => {
    console.log('🗑️ Clearing all local data for testing...');

    // Clear Plaid connections
    clearSavedConnections();

    // Clear session storage
    sessionStorage.clear();

    // Clear local storage (but be selective to avoid breaking other apps)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('plaid_') || key.startsWith('401k_') || key.includes('tracker'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Reset auth state
    setIsAuthenticated(false);
    setCurrentPassword(null);

    console.log('✅ All local data cleared. Refresh page to reset completely.');
  };

  const value = {
    isAuthenticated,
    isLoading,
    login,
    logout,
    hasSavedConnections,
    savedConnections,
    saveConnection,
    loadSavedConnections,
    clearSavedConnections,
    clearAllData,
    currentPassword
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