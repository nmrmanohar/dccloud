/**
 * storage.js – GitHub API wrapper
 *
 * Architecture:
 *   config.json  (public app repo, committed to git)
 *     → dataOwner, dataRepo, readToken
 *     → fetched via GitHub Pages URL — always available, no auth needed
 *
 *   data/users.json  (private data repo)
 *     → users array with hashed passwords & encrypted tokens
 *     → fetched with readToken (viewers) or write token (admin/editor)
 *     → kept in private repo so the write token that already works there
 *       is the only token needed — no PAT for the public app repo required
 *
 *   data/trainings.json, vendors.json, trainers.json  (private data repo)
 *     → training records
 */
class GitHubStorage {
  constructor() {
    this.settings      = this._load();
    this._remoteConfig = null;
    this._users        = null;
  }

  _load() {
    try { return JSON.parse(localStorage.getItem('dccloud_cfg') || '{}'); }
    catch { return {}; }
  }

  /** Persist connection settings (used during first-time setup) */
  saveSettings(s) {
    localStorage.setItem('dccloud_cfg', JSON.stringify(s));
    this.settings = s;
  }

  // ── Remote config (config.json served by GitHub Pages) ───────────────
  async loadRemoteConfig() {
    try {
      const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
      const resp = await fetch(`${base}config.json?t=${Date.now()}`);
      if (!resp.ok) return;
      this._remoteConfig = await resp.json();
      if (this._remoteConfig.dataOwner) this.settings.dataOwner = this._remoteConfig.dataOwner;
      if (this._remoteConfig.dataRepo)  this.settings.dataRepo  = this._remoteConfig.dataRepo;
    } catch { /* config.json missing — first-time setup */ }
  }

  /** Load users from data/users.json in the private data repo */
  async loadConfigUsers() {
    this._users = [];
    if (!this.settings.dataOwner || !this.settings.dataRepo) return;
    // Use readToken (for viewers), or the setup/session token
    const token = this.readToken || this.settings.token;
    if (!token) return;
    try {
      const resp = await fetch(this._url('data/users.json'), {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!resp.ok) return; // 404 = first-time setup, no users yet
      const file = await resp.json();
      this._users = this._decode(file.content);
    } catch { /* network error or invalid token */ }
  }

  /** Save users to data/users.json in the private data repo */
  async saveUsers(users) {
    const path = 'data/users.json';
    const existing = await this._get(path);
    await this._put(path, users, existing?.sha || null, 'Update users');
    this._users = [...users];
  }

  get remoteConfig() { return this._remoteConfig || {}; }
  get configUsers()  { return this._users || []; }
  get readToken()    { return this._remoteConfig?.readToken || null; }

  get isConfigured() {
    return !!(this.settings.dataOwner && this.settings.dataRepo &&
              (auth.token || this.settings.token));
  }

  // ── Internal helpers ──────────────────────────────────────────────────
  _token() {
    return auth.isLoggedIn ? auth.token : this.settings.token;
  }

  _headers() {
    return {
      'Authorization': `token ${this._token()}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  }

  _url(path) {
    const { dataOwner, dataRepo } = this.settings;
    return `https://api.github.com/repos/${dataOwner}/${dataRepo}/contents/${path}`;
  }

  _encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
  }

  _decode(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
  }

  async _get(path) {
    const resp = await fetch(this._url(path), { headers: this._headers() });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || `GitHub API error ${resp.status}`);
    }
    const file = await resp.json();
    return { data: this._decode(file.content), sha: file.sha };
  }

  async _put(path, data, sha, message) {
    const body = {
      message: message || `Update ${path}`,
      content: this._encode(data),
      ...(sha ? { sha } : {})
    };
    const resp = await fetch(this._url(path), {
      method: 'PUT', headers: this._headers(), body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || `GitHub API error ${resp.status}`);
    }
    return resp.json();
  }

  // ── Data API ──────────────────────────────────────────────────────────
  async getAll(entity) {
    const result = await this._get(`data/${entity}.json`);
    return result ? result.data : [];
  }

  async saveAll(entity, records, message) {
    if (!auth.canWrite) throw new Error('You do not have permission to save.');
    const path = `data/${entity}.json`;
    const existing = await this._get(path);
    await this._put(path, records, existing?.sha || null, message || `Update ${entity}`);
  }

  async initialize() {
    for (const entity of ['trainings', 'vendors', 'trainers', 'users']) {
      const path = `data/${entity}.json`;
      const existing = await this._get(path);
      if (!existing) await this._put(path, [], null, `Initialize ${entity}`);
    }
  }

  async testConnection() {
    const resp = await fetch('https://api.github.com/user', { headers: this._headers() });
    if (!resp.ok) throw new Error('Invalid token or no network access');
    return (await resp.json()).login;
  }

  // ── Save config.json to the public app repo ───────────────────────────
  /** Writes connection config to nmrmanohar/dccloud (the Pages repo).
   *  Users are NOT stored here — they live in data/users.json. */
  async saveRemoteConfig(cfg) {
    // Strip users if accidentally included — they belong in data/users.json
    const { users: _u, ...configOnly } = cfg;
    const owner = this.settings.dataOwner || 'nmrmanohar';
    const url   = `https://api.github.com/repos/${owner}/dccloud/contents/config.json`;
    const hdrs  = { 'Authorization': `token ${this._token()}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
    const get   = await fetch(url, { headers: hdrs });
    const sha   = get.ok ? (await get.json()).sha : null;
    const put   = await fetch(url, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify({
        message: 'Update app config',
        content: this._encode(configOnly),
        ...(sha ? { sha } : {})
      })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || `HTTP ${put.status}`);
    }
    this._remoteConfig = configOnly;
  }
}

const storage = new GitHubStorage();
