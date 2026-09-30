'use strict';
// PIN authentication for the northbound API.
//
// daemon.auth:
//   pin: "2468"              # optional plaintext PIN in the YAML; a PIN set from the UI (stored hashed) wins
//   readPublic: false        # true lets OSCQuery clients read the tree/values without a PIN (writes still need one)
//   tokenDays: 30            # how long a logged-in iPad stays logged in
//
// A correct PIN yields a random token, sent back as an HttpOnly cookie (koine_token) and in the JSON
// body so REST clients can pass it as "Authorization: Bearer <token>" or "?token=". Tokens are stored
// hashed in the store so they survive restarts. Login attempts are rate limited per client address.
const crypto = require('crypto');

const COOKIE = 'koine_token';

class Auth {
  constructor({ config = {}, store, log }) {
    this.config = config;
    this.store = store;
    this.log = log;
    if (!this.store.data.auth) this.store.data.auth = { pinHash: null, salt: null, tokens: [] };
    this.attempts = new Map(); // ip -> { count, until }
    this.tokenDays = Number(config.tokenDays || 30);
    this.readPublic = !!config.readPublic;
  }

  /** Is a PIN configured at all (from YAML or store)? */
  enabled() { return !!(this.store.data.auth.pinHash || (this.config.pin !== undefined && this.config.pin !== null && String(this.config.pin) !== '')); }

  verifyPin(pin) {
    pin = String(pin || '');
    const a = this.store.data.auth;
    if (a.pinHash) return timingSafeEqual(hashPin(pin, a.salt), a.pinHash);
    if (this.config.pin !== undefined && this.config.pin !== null) return timingSafeEqual(String(this.config.pin), pin);
    return false;
  }

  /** Set (or clear with null) the PIN. Requires the current PIN when one exists. */
  setPin(current, next) {
    if (this.enabled() && !this.verifyPin(current)) throw new Error('current PIN is wrong');
    if (next === null || next === '') {
      this.store.data.auth.pinHash = null; this.store.data.auth.salt = null; this.store.data.auth.tokens = [];
    } else {
      next = String(next);
      if (!/^\d{4,12}$/.test(next)) throw new Error('PIN must be 4 to 12 digits');
      const salt = crypto.randomBytes(16).toString('hex');
      this.store.data.auth = { pinHash: hashPin(next, salt), salt, tokens: [] }; // changing the PIN logs everyone out
    }
    this.store.save();
  }

  /** Attempt a login from `ip`. Returns { ok, token? , retryInMs? } */
  login(pin, ip, label = '') {
    const now = Date.now();
    const at = this.attempts.get(ip) || { count: 0, until: 0 };
    if (at.until > now) return { ok: false, retryInMs: at.until - now, error: 'too many attempts, wait a minute' };
    if (!this.verifyPin(pin)) {
      at.count++;
      if (at.count >= 5) { at.until = now + 60000; at.count = 0; }
      this.attempts.set(ip, at);
      return { ok: false, error: 'wrong PIN' };
    }
    this.attempts.delete(ip);
    const token = crypto.randomBytes(24).toString('base64url');
    const exp = now + this.tokenDays * 86400000;
    this.store.data.auth.tokens = this.store.data.auth.tokens.filter((t) => t.exp > now).slice(-200);
    this.store.data.auth.tokens.push({ hash: hashToken(token), exp, label: String(label).slice(0, 60), since: now });
    this.store.save();
    return { ok: true, token, exp };
  }

  logout(token) {
    if (!token) return false;
    const h = hashToken(token);
    const before = this.store.data.auth.tokens.length;
    this.store.data.auth.tokens = this.store.data.auth.tokens.filter((t) => t.hash !== h);
    if (this.store.data.auth.tokens.length !== before) this.store.save();
    return true;
  }

  validToken(token) {
    if (!token) return false;
    const h = hashToken(token);
    const now = Date.now();
    return this.store.data.auth.tokens.some((t) => t.hash === h && t.exp > now);
  }

  /** Extract a token from an HTTP request: cookie, bearer header or ?token= */
  tokenFrom(req, query) {
    const auth = req.headers.authorization;
    if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    if (query && typeof query.token === 'string') return query.token;
    const cookie = req.headers.cookie || '';
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookie);
    return m ? decodeURIComponent(m[1]) : null;
  }

  isAuthed(req, query) { return !this.enabled() || this.validToken(this.tokenFrom(req, query)); }

  cookieHeader(token, exp) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((exp - Date.now()) / 1000)}`; }
  clearCookieHeader() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`; }

  status(req, query) {
    return { required: this.enabled(), authenticated: this.isAuthed(req, query), readPublic: this.readPublic, sessions: this.store.data.auth.tokens.filter((t) => t.exp > Date.now()).length };
  }
}

function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { Auth, COOKIE };
