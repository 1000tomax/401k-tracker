import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended

function getKey(env) {
  const rawKey = env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY environment variable is required');
  }

  const keyBuffer = Buffer.from(rawKey, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 encoded) to use aes-256-gcm');
  }

  return keyBuffer;
}

export function encryptJson(payload, env) {
  const key = getKey(env);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptJson(token, env) {
  if (!token) {
    throw new Error('Cannot decrypt empty token');
  }

  const key = getKey(env);
  const buffer = Buffer.from(token, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buffer.subarray(IV_LENGTH + 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}

export function tryDecryptJson(token, env) {
  try {
    return decryptJson(token, env);
  } catch (error) {
    console.warn('Failed to decrypt token', error);
    return null;
  }
}
