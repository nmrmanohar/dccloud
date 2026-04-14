/**
 * storage.js – GitHub API wrapper for reading/writing JSON data files
 * Data repo: {dataOwner}/{dataRepo}  (can be a private repo)
 * Files:  data/trainings.json | data/vendors.json | data/trainers.json
 *
 * Auth strategy:
 *  1. On startup, fetch config.json from the public app repo (no auth needed).
 *     config.json contains: dataOwner, dataRepo, readToken (read-only PAT).
 *  2. If the user has stored their own write token in localStorage, use that
 *     (full read/write access — owner mode).
 *  3. Otherwise fall back to readToken from config.json (read-only mode — auditor).
 *  4. If neither exists, show Settings for manual PAT entry.
 */
class GitHubStorage {
  constructor() {
    this.settings  = this._load();
    this._readOnly = false;   // true when using the shared read-only token
  }

  _load() {
    try { return JSON.parse(localStorage.getItem('dccloud_cfg') || '{}'); }
    catch { return {}; }
  }

  saveSettings(s) {
    localStorage.setItem('dccloud_cfg', JSON.stringify(s));
    this.settings  = s;
    this._readOnly = false;  // explicit save = owner mode
  }

  logout() {
    const s = { ...this.settings };
    delete s.token;
    localStorage.setItem('dccloud_cfg', JSON.stringify(s));
    this.settings  = s;
    this._readOnly = false;
  }

  get isConfigured() {
    const { token, dataOwner, dataRepo } = this.settings;
    return !!(token && dataOwner && dataRepo);
  }

  get isReadOnly() { return this._readOnly; }

  // ── Remote config (config.json in public app repo) ──────────────────
  /**
   * Fetch config.json from the public GitHub Pages repo.
   * Silently ignored if the file doesn't exist yet.
   * Populates dataOwner/dataRepo from config if not already in localStorage.
   * If no write token in localStorage, uses readToken from config (read-only mode).
   */
  async loadRemoteConfig() {
    try {
      // Use the Pages URL base — works both locally and on GitHub Pages
      const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
      const resp = await fetch(`${base}config.json?t=${Date.now()}`);
      if (!resp.ok) return;
      const cfg = await resp.json();

      // Merge data repo settings (localStorage values take priority)
      if (!this.settings.dataOwner && cfg.dataOwner) this.settings.dataOwner = cfg.dataOwner;
      if (!this.settings.dataRepo   && cfg.dataRepo)  this.settings.dataRepo  = cfg.dataRepo;

      // If owner has a write token stored, use that — don't touch it
      if (this.settings.token) return;

      // No write token → use readToken as read-only fallback
      if (cfg.readToken) {
        this.settings.token = cfg.readToken;
        this._readOnly = true;
      }
    } catch { /* network issues, file missing — silently continue */ }
  }

  /**
   * Save config.json to the public app repo (nmrmanohar/dccloud).
   * Requires write access to the app repo (owner's full PAT).
   */
  async saveRemoteConfig(cfg) {
    const { token, dataOwner } = this.settings;
    const appOwner = dataOwner || 'nmrmanohar';
    const url = `https://api.github.com/repos/${appOwner}/dccloud/contents/config.json`;
    const hdrs = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
    const get = await fetch(url, { headers: hdrs });
    const sha = get.ok ? (await get.json()).sha : null;
    const body = {
      message: 'Update app config',
      content: btoa(unescape(encodeURIComponent(JSON.stringify(cfg, null, 2)))),
      ...(sha ? { sha } : {})
    };
    const put = await fetch(url, { method: 'PUT', headers: hdrs, body: JSON.stringify(body) });
    if (!put.ok) { const e = await put.json().catch(() => ({})); throw new Error(e.message || `HTTP ${put.status}`); }
  }

  // ── Internal helpers ─────────────────────────────────────────────────
  _headers() {
    return {
      'Authorization': `token ${this.settings.token}`,
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

  // ── Public data API ──────────────────────────────────────────────────
  async getAll(entity) {
    const result = await this._get(`data/${entity}.json`);
    return result ? result.data : [];
  }

  async saveAll(entity, records, message) {
    if (this._readOnly) throw new Error('Read-only mode — cannot save.');
    const path = `data/${entity}.json`;
    const existing = await this._get(path);
    await this._put(path, records, existing?.sha || null, message || `Update ${entity}`);
  }

  async initialize() {
    for (const entity of ['trainings', 'vendors', 'trainers']) {
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
}

const storage = new GitHubStorage();
