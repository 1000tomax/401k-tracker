// Web Crypto API implementation for browser and Cloudflare Workers compatibility
const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // GCM recommended

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes) {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

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

export async function tryDecryptJson(token, env) {
  try {
    return await decryptJson(token, env);
  } catch (error) {
    console.warn('Failed to decrypt token', error);
    return null;
  }
}
