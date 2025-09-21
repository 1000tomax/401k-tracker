import { encryptJson, tryDecryptJson } from './encryption.js';
import { parseCookies, serializeCookie, appendSetCookie } from './cookies.js';

const COOKIE_PREFIX = 'plaid_access_token_';

function cookieName(accountType) {
  return `${COOKIE_PREFIX}${accountType}`;
}

export function storeAccessToken(res, { accountType, accessToken, itemId }) {
  const payload = {
    accessToken,
    itemId,
    accountType,
    connectedAt: new Date().toISOString()
  };

  const value = encodeURIComponent(encryptJson(payload));
  const cookie = serializeCookie(cookieName(accountType), value);
  appendSetCookie(res, cookie);
}

export function clearAccessToken(res, accountType) {
  const cookie = serializeCookie(cookieName(accountType), '', {
    maxAge: 0,
    expires: new Date(0)
  });
  appendSetCookie(res, cookie);
}

export function getAccessToken(req, accountType) {
  const cookies = parseCookies(req);
  const token = cookies[cookieName(accountType)];
  if (!token) return null;
  return tryDecryptJson(token);
}

export function getAllStoredTokens(req) {
  const cookies = parseCookies(req);
  return Object.entries(cookies)
    .filter(([name]) => name.startsWith(COOKIE_PREFIX))
    .map(([name, value]) => {
      const decoded = tryDecryptJson(value);
      if (!decoded) return null;
      return decoded;
    })
    .filter(Boolean);
}
