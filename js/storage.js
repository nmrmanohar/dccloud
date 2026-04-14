/**
 * storage.js – GitHub API wrapper
 *
 * Token priority (highest → lowest):
 *   1. auth.token  (from active user session — set after login)
 *   2. this.settings.token  (legacy fallback, kept for Settings page first-time setup)
 *
 * config.json (in the public app repo) holds:
 *   { dataOwner, dataRepo, readToken, users[] }
 *
 * config.json is fetched on every load so the app works in any browser
 * without per-browser PAT entry.
 */
class GitHubStorage {
  constructor() {
    this.settings    = this._load();
    this._remoteConfig = null;
  }

  _load() {
    try { return JSON.parse(localStorage.getItem('dccloud_cfg') || '{}'); }
    catch { return {}; }
  }

  /** Persist connection settings (used only during first-time setup) */
  saveSettings(s) {
    localStorage.setItem('dccloud_cfg', JSON.stringify(s));
    this.settings = s;
  }

  // ── Remote config (config.json in the public app repo) ───────────────
  async loadRemoteConfig() {
    try {
      const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
      const resp = await fetch(`${base}config.json?t=${Date.now()}`);
      if (!resp.ok) return;
      this._remoteConfig = await resp.json();
      // Pre-fill local settings from config so the API URLs are correct
      if (this._remoteConfig.dataOwner) this.settings.dataOwner = this._remoteConfig.dataOwner;
      if (this._remoteConfig.dataRepo)  this.settings.dataRepo  = this._remoteConfig.dataRepo;
    } catch { /* config.json not yet created — first-time setup */ }
  }

  get remoteConfig() { return this._remoteConfig || {}; }
  get configUsers()  { return this._remoteConfig?.users  || []; }
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

  // ── Save config.json to the public app repo ───────────────────────────
  /** Writes config.json to nmrmanohar/dccloud (the Pages repo) */
  async saveRemoteConfig(cfg) {
    const owner = this.settings.dataOwner || 'nmrmanohar';
    const url   = `https://api.github.com/repos/${owner}/dccloud/contents/config.json`;
    const hdrs  = { 'Authorization': `token ${this._token()}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
    const get   = await fetch(url, { headers: hdrs });
    const sha   = get.ok ? (await get.json()).sha : null;
    const put   = await fetch(url, {
      method: 'PUT', headers: hdrs,
      body: JSON.stringify({
        message: 'Update app config',
        content: this._encode(cfg),
        ...(sha ? { sha } : {})
      })
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      throw new Error(e.message || `HTTP ${put.status}`);
    }
    this._remoteConfig = cfg;
  }
}

const storage = new GitHubStorage();
