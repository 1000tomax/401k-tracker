const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365 // 1 year
};

function serializeOptionValue(value) {
  if (value === true) return '';
  if (value === false || value == null) return null;
  return value;
}

export function serializeCookie(name, value, options = {}) {
  const pieces = [`${name}=${value}`];
  const opts = { ...DEFAULT_COOKIE_OPTIONS, ...options };

  if (opts.maxAge != null) {
    pieces.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  }
  if (opts.expires) {
    pieces.push(`Expires=${opts.expires.toUTCString()}`);
  }
  if (opts.httpOnly) {
    pieces.push('HttpOnly');
  }
  if (opts.secure) {
    pieces.push('Secure');
  }
  if (opts.sameSite) {
    pieces.push(`SameSite=${typeof opts.sameSite === 'string' ? opts.sameSite : 'Lax'}`);
  }
  if (opts.path) {
    pieces.push(`Path=${opts.path}`);
  }

  if (opts.domain) {
    pieces.push(`Domain=${opts.domain}`);
  }

  return pieces.join('; ');
}

export function appendSetCookie(res, cookieString) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', [cookieString]);
  } else if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookieString]);
  } else {
    res.setHeader('Set-Cookie', [current, cookieString]);
  }
}

export function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};

  return header.split(';').reduce((acc, pair) => {
    const [rawName, ...rest] = pair.split('=');
    if (!rawName) return acc;
    const name = rawName.trim();
    const value = rest.join('=').trim();
    acc[name] = decodeURIComponent(value || '');
    return acc;
  }, {});
}
