/**
 * Secure local storage for Plaid connection data
 * Uses encrypted browser storage to persist connections between sessions
 */

class PlaidStorageService {
  constructor() {
    this.storageKey = 'plaid_connections_v1';
    this.encryptionKey = null;
  }

  /**
   * Simple encryption using built-in crypto (for demo purposes)
   * In production, you'd want a more robust encryption library
   */
  async generateEncryptionKey(password) {
    const encoder = new TextEncoder();
    const keyData = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const salt = encoder.encode('plaid-salt-401k-tracker'); // In production, use random salt
    const keyBits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyData,
      256
    );

    return await window.crypto.subtle.importKey(
      'raw',
      keyBits,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data before storing
   */
  async encrypt(data, password) {
    try {
      const key = await this.generateEncryptionKey(password);
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(JSON.stringify(data));

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encryptedData = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        dataBytes
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedData), iv.length);

      // Convert to base64 for storage
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('❌ PlaidStorageService: Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data after loading
   */
  async decrypt(encryptedData, password) {
    try {
      const key = await this.generateEncryptionKey(password);

      // Convert from base64
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(char => char.charCodeAt(0))
      );

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decryptedData = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedData));
    } catch (error) {
      console.error('❌ PlaidStorageService: Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Save Plaid connection data securely
   */
  async saveConnection(connectionData, password) {
    try {
      console.log('🔐 PlaidStorageService: Saving connection data');

      const dataToStore = {
        accessToken: connectionData.accessToken,
        itemId: connectionData.itemId,
        institution: connectionData.institution,
        accounts: connectionData.accounts,
        savedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      };

      const encryptedData = await this.encrypt(dataToStore, password);
      localStorage.setItem(this.storageKey, encryptedData);

      console.log('✅ PlaidStorageService: Connection saved successfully');
      return true;
    } catch (error) {
      console.error('❌ PlaidStorageService: Failed to save connection:', error);
      return false;
    }
  }

  /**
   * Load Plaid connection data securely
   */
  async loadConnection(password) {
    try {
      const encryptedData = localStorage.getItem(this.storageKey);
      if (!encryptedData) {
        console.log('📭 PlaidStorageService: No saved connection found');
        return null;
      }

      console.log('🔓 PlaidStorageService: Loading connection data');
      const connectionData = await this.decrypt(encryptedData, password);

      // Check if connection has expired
      const expiresAt = new Date(connectionData.expiresAt);
      if (expiresAt < new Date()) {
        console.log('⏰ PlaidStorageService: Connection expired, removing');
        this.clearConnection();
        return null;
      }

      console.log('✅ PlaidStorageService: Connection loaded successfully');
      return connectionData;
    } catch (error) {
      console.error('❌ PlaidStorageService: Failed to load connection:', error);
      // If decryption fails, clear the corrupted data
      this.clearConnection();
      return null;
    }
  }

  /**
   * Check if saved connection exists
   */
  hasSavedConnection() {
    return localStorage.getItem(this.storageKey) !== null;
  }

  /**
   * Clear saved connection
   */
  clearConnection() {
    localStorage.removeItem(this.storageKey);
    console.log('🗑️ PlaidStorageService: Connection data cleared');
  }

  /**
   * Get connection metadata without decrypting
   */
  getConnectionInfo() {
    const encryptedData = localStorage.getItem(this.storageKey);
    if (!encryptedData) return null;

    // We can't get details without decryption, but we can indicate it exists
    return {
      exists: true,
      storageKey: this.storageKey,
      dataSize: encryptedData.length
    };
  }
}

export default new PlaidStorageService();