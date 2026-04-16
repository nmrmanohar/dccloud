/**
 * auth.js – Client-side authentication
 *
 * Simple model:
 *   - One shared service token stored in config.json (used for all GitHub API calls)
 *   - Users stored in users.json (served publicly via GitHub Pages)
 *   - Passwords hashed with PBKDF2 + AES-GCM (Web Crypto API) — safe to store publicly
 *   - No per-user token encryption needed
 *
 * Roles:
 *   admin  → full access + user management
 *   editor → create / edit records (no user management, no delete)
 *   viewer → read-only, export — defaults to Audit Info view
 */
class Auth {
  constructor() {
    this._session = this._loadSession();
  }

  // ── Session ───────────────────────────────────────────────────────────
  _loadSession() {
    try {
      return JSON.parse(
        localStorage.getItem('dccloud_session') ||
        sessionStorage.getItem('dccloud_session') ||
        'null'
      );
    } catch { return null; }
  }

  _saveSession(s, remember) {
    const store = remember ? localStorage : sessionStorage;
    store.setItem('dccloud_session', JSON.stringify(s));
    if (remember) sessionStorage.removeItem('dccloud_session');
    else          localStorage.removeItem('dccloud_session');
    this._session = s;
  }

  logout() {
    localStorage.removeItem('dccloud_session');
    sessionStorage.removeItem('dccloud_session');
    this._session = null;
  }

  get isLoggedIn()  { return !!this._session; }
  get currentUser() { return this._session; }
  get role()        { return this._session?.role || null; }
  get canWrite()    { return this.role === 'admin' || this.role === 'editor'; }
  get isAdmin()     { return this.role === 'admin'; }
  get displayName() { return this._session?.displayName || ''; }

  // ── Web Crypto helpers ────────────────────────────────────────────────
  _b64(buf)  { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  _ub64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

  async _deriveKey(password, saltB64) {
    const raw = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this._ub64(saltB64), iterations: 120000, hash: 'SHA-256' },
      raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  /** Hash a password → { salt, iv, tag } — safe to store publicly */
  async hashPassword(password) {
    const salt = this._b64(crypto.getRandomValues(new Uint8Array(16)));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await this._deriveKey(password, salt);
    const enc  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, new TextEncoder().encode('dccloud-auth-v1')
    );
    return { salt, iv: this._b64(iv), tag: this._b64(enc) };
  }

  /** Returns true if password matches stored hash */
  async verifyPassword(password, hash) {
    try {
      const key = await this._deriveKey(password, hash.salt);
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this._ub64(hash.iv) }, key, this._ub64(hash.tag)
      );
      return new TextDecoder().decode(dec) === 'dccloud-auth-v1';
    } catch { return false; }
  }

  // ── Login ─────────────────────────────────────────────────────────────
  async login(username, password, users, remember) {
    const user = users.find(u =>
      u.username.toLowerCase() === username.toLowerCase().trim() && u.active !== false
    );
    if (!user) throw new Error('User not found or account inactive.');
    const ok = await this.verifyPassword(password, user.passwordHash);
    if (!ok) throw new Error('Incorrect password.');
    const session = {
      userId: user.id, username: user.username,
      displayName: user.displayName, role: user.role
    };
    this._saveSession(session, !!remember);
    return session;
  }

  // ── User management ───────────────────────────────────────────────────
  async createUser(username, displayName, password, role) {
    const hash = await this.hashPassword(password);
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      username: username.trim(),
      displayName: displayName.trim(),
      passwordHash: hash,
      role,
      active: true
    };
  }

  async changePassword(user, newPassword) {
    user.passwordHash = await this.hashPassword(newPassword);
    return user;
  }
}

const auth = new Auth();
