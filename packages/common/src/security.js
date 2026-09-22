const crypto = require('node:crypto');

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function base64urlDecode(input) {
  const normalized = input.replace(/-/g,'+').replace(/_/g,'/');
  return Buffer.from(normalized + '='.repeat((4 - normalized.length % 4) % 4), 'base64');
}

function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must be at least 8 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384, r = 8, p = 1, keylen = 64;
  const derived = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!password || !stored) return false;
  const [scheme, N, r, p, salt, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !N || !r || !p || !salt || !hashHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, Buffer.from(hashHex, 'hex').length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 128 * Number(N) * Number(r) * 2
    });
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
  } catch { return false; }
}

function signToken(payload, secret = process.env.JWT_SECRET || 'change-this-development-secret') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + TOKEN_TTL_SECONDS };
  const encoded = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyToken(token, secret = process.env.JWT_SECRET || 'change-this-development-secret') {
  const [part1, part2, signature] = String(token || '').split('.');
  if (!part1 || !part2 || !signature) throw new Error('Invalid authentication token.');
  const encoded = `${part1}.${part2}`;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid authentication token.');
  const payload = JSON.parse(base64urlDecode(part2).toString('utf8'));
  if (!payload.exp || payload.exp < Math.floor(Date.now()/1000)) throw new Error('Authentication token expired.');
  return payload;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
