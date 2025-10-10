import React, { createContext, useContext, useState, useEffect } from 'react';
import PlaidDatabaseService from '../services/PlaidDatabaseService';

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
    const checkExistingSession = async () => {
      try {
        // Check for existing session in storage
        const sessionData = sessionStorage.getItem(STORAGE_KEY);

        if (sessionData) {
          const parsed = JSON.parse(sessionData);
          if (parsed.authenticated) {
            setIsAuthenticated(true);
            setCurrentPassword(parsed.password);
          }
        }

        // Check for saved connections in database
        const hasConnections = await PlaidDatabaseService.hasSavedConnections();
        setHasSavedConnections(hasConnections);

        setIsLoading(false);
      } catch (error) {
        console.error('Error checking saved connections:', error);
        setIsLoading(false);
      }
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

  // Save a new Plaid connection to database
  const saveConnection = async (connectionData) => {
    try {
      const connection = await PlaidDatabaseService.saveConnection(connectionData);
      setHasSavedConnections(true);
      // Reload connections
      await loadSavedConnections();
      return connection;
    } catch (error) {
      console.error('Failed to save connection:', error);
      return null;
    }
  };

  // Load saved connections from database
  const loadSavedConnections = async () => {
    try {
      const connections = await PlaidDatabaseService.getConnections();
      setSavedConnections(connections);
      setHasSavedConnections(connections.length > 0);
      return connections;
    } catch (error) {
      console.error('Failed to load saved connections:', error);
      return [];
    }
  };

  // Clear all saved connections (database)
  const clearSavedConnections = async () => {
    // For now, just clear local state
    // TODO: Add API endpoint to delete connections if needed
    setSavedConnections([]);
    setHasSavedConnections(false);
  };

  // Clear all data (for development/testing)
  const clearAllData = async () => {
    console.log('🗑️ Clearing all data (database connections remain)...');

    // Clear local state
    await clearSavedConnections();

    // Clear session storage
    sessionStorage.clear();

    // Clear local storage (old data if any)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('plaid_') || key.startsWith('401k_') || key.includes('tracker'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    console.log('✅ Local data cleared. Database connections persist.');
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