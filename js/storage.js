/**
 * storage.js – GitHub API wrapper for reading/writing JSON data files
 * Data repo: {dataOwner}/{dataRepo}  (can be a private repo)
 * Files:  data/trainings.json | data/vendors.json | data/trainers.json
 */
class GitHubStorage {
  constructor() {
    this.settings = this._load();
  }

  _load() {
    try { return JSON.parse(localStorage.getItem('dccloud_cfg') || '{}'); }
    catch { return {}; }
  }

  saveSettings(s) {
    localStorage.setItem('dccloud_cfg', JSON.stringify(s));
    this.settings = s;
  }

  get isConfigured() {
    const { token, dataOwner, dataRepo } = this.settings;
    return !!(token && dataOwner && dataRepo);
  }

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

  /** Encode a JS object to base64 (UTF-8 safe) */
  _encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
  }

  /** Decode base64 string returned by GitHub (may contain line-breaks) */
  _decode(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
  }

  /** Fetch a file; returns { data, sha } or null if not found */
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

  /** Create or update a file */
  async _put(path, data, sha, message) {
    const body = {
      message: message || `Update ${path}`,
      content: this._encode(data),
      ...(sha ? { sha } : {})
    };
    const resp = await fetch(this._url(path), {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.message || `GitHub API error ${resp.status}`);
    }
    return resp.json();
  }

  /** Read all records for an entity */
  async getAll(entity) {
    const result = await this._get(`data/${entity}.json`);
    return result ? result.data : [];
  }

  /** Overwrite all records for an entity */
  async saveAll(entity, records, message) {
    const path = `data/${entity}.json`;
    const existing = await this._get(path);
    const sha = existing ? existing.sha : null;
    await this._put(path, records, sha, message || `Update ${entity}`);
  }

  /** Create the three data files in the repo if they don't exist yet */
  async initialize() {
    for (const entity of ['trainings', 'vendors', 'trainers']) {
      const path = `data/${entity}.json`;
      const existing = await this._get(path);
      if (!existing) {
        await this._put(path, [], null, `Initialize ${entity}`);
      }
    }
  }

  /** Quick connectivity check – returns GitHub user login */
  async testConnection() {
    const resp = await fetch('https://api.github.com/user', { headers: this._headers() });
    if (!resp.ok) throw new Error('Invalid token or no network access');
    const u = await resp.json();
    return u.login;
  }
}

const storage = new GitHubStorage();
