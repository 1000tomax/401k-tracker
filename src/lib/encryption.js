/**
 * @file encryption.js
 * @description Web Crypto API implementation for encrypting/decrypting sensitive data.
 * Uses AES-256-GCM for authenticated encryption. Compatible with both browsers and Cloudflare Workers.
 *
 * Used primarily for encrypting Plaid access tokens before storing them in the database.
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // GCM recommended IV length

/**
 * Converts a base64-encoded string to a Uint8Array.
 * @param {string} base64 - Base64-encoded string
 * @returns {Uint8Array} Decoded bytes
 */
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a base64-encoded string.
 * @param {Uint8Array} bytes - Byte array to encode
 * @returns {string} Base64-encoded string
 */
function uint8ArrayToBase64(bytes) {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Retrieves and imports the encryption key from environment variables.
 * The key must be 32 bytes (256 bits) for AES-256-GCM, base64-encoded.
 * @param {object} env - Environment object containing PLAID_TOKEN_ENCRYPTION_KEY
 * @returns {Promise<CryptoKey>} Imported cryptographic key ready for use
 * @throws {Error} If key is missing or has incorrect length
 */
async function getKey(env) {
  const rawKey = env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY environment variable is required');
  }

  const keyBuffer = base64ToUint8Array(rawKey);
  if (keyBuffer.length !== 32) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 encoded) to use aes-256-gcm');
  }

  // Import the key for use with Web Crypto API
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a JSON payload using AES-256-GCM.
 * Generates a random IV for each encryption and prepends it to the ciphertext.
 * @param {object} payload - JavaScript object to encrypt (will be JSON stringified)
 * @param {object} env - Environment object containing encryption key
 * @returns {Promise<string>} Base64-encoded string containing IV + ciphertext + auth tag
 */
export async function encryptJson(payload, env) {
  const key = await getKey(env);

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Convert JSON to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    data
  );

  // Combine IV + encrypted data (which includes auth tag in GCM mode)
  const encryptedBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  return uint8ArrayToBase64(combined);
}

/**
 * Decrypts a base64-encoded encrypted payload back to a JSON object.
 * Extracts the IV from the beginning of the token and uses it for decryption.
 * @param {string} token - Base64-encoded string containing IV + ciphertext + auth tag
 * @param {object} env - Environment object containing encryption key
 * @returns {Promise<object>} Decrypted and parsed JavaScript object
 * @throws {Error} If token is empty or decryption fails (wrong key, tampered data, etc.)
 */
export async function decryptJson(token, env) {
  if (!token) {
    throw new Error('Cannot decrypt empty token');
  }

  const key = await getKey(env);

  // Decode base64 token
  const combined = base64ToUint8Array(token);

  // Extract IV and encrypted data
  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    encrypted
  );

  // Convert back to string and parse JSON
  const decoder = new TextDecoder();
  const json = decoder.decode(decrypted);
  return JSON.parse(json);
}

/**
 * Attempts to decrypt a token, returning null on failure instead of throwing.
 * Useful for gracefully handling invalid or corrupted tokens.
 * @param {string} token - Base64-encoded encrypted token
 * @param {object} env - Environment object containing encryption key
 * @returns {Promise<object|null>} Decrypted object or null if decryption failed
 */
export async function tryDecryptJson(token, env) {
  try {
    return await decryptJson(token, env);
  } catch (error) {
    console.warn('Failed to decrypt token', error);
    return null;
  }
}
