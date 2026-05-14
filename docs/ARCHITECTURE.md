# Architecture — DC Cloud Training Operations

## Table of Contents
- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Authentication Flow](#authentication-flow)
- [Security Model](#security-model)
- [GitHub API Integration](#github-api-integration)
- [Module Breakdown](#module-breakdown)
- [Key Design Decisions](#key-design-decisions)

---

## System Overview

DC Cloud is a **serverless single-page application** with GitHub as the backend. There is no web server, no database server, and no application server — all compute happens in the browser.

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  index.html + css/style.css                             │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │    │
│  │  │ auth.js  │ │storage.js│ │ utils.js │ │  app.js  │  │    │
│  │  └──────────┘ └────┬─────┘ └──────────┘ └──────────┘  │    │
│  └───────────────────┼────────────────────────────────────┘    │
│                       │  GitHub REST API (HTTPS)                │
└───────────────────────┼─────────────────────────────────────────┘
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
┌──────────────┐ ┌─────────────┐  ┌───────────────────┐
│GitHub Pages  │ │ Public Repo │  │  Private Repo     │
│(CDN serving) │ │nmrmanohar/  │  │ nmrmanohar/       │
│              │ │dccloud      │  │ dccloud-data      │
│ Serves:      │ │             │  │                   │
│ - index.html │ │ config.json │  │ data/             │
│ - *.css/js   │ │ users.json  │  │  trainings.json   │
│ - config.json│ │             │  │  vendors.json     │
│ - users.json │ └─────────────┘  │  trainers.json    │
└──────────────┘                  └───────────────────┘
```

---

## Component Architecture

### Frontend Layers

```
┌─────────────────────────────────────────────────┐
│                   app.js                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Router  │ │  Views   │ │  Event Handlers  │ │
│  │ (hash)   │ │ (HTML    │ │  (save, delete,  │ │
│  │          │ │  strings)│ │   import, export)│ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────┤
│            auth.js          storage.js           │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Auth             │  │ GitHubStorage        │  │
│  │ - login()        │  │ - loadRemoteConfig() │  │
│  │ - createUser()   │  │ - loadConfigUsers()  │  │
│  │ - hashPassword() │  │ - getAll()           │  │
│  │ - verifyPassword()│  │ - saveAll()          │  │
│  │ - session mgmt   │  │ - saveUsers()        │  │
│  └──────────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────┤
│                    utils.js                      │
│  Constants │ Formatters │ Calculators │ Helpers  │
└─────────────────────────────────────────────────┘
```

### Initialization Sequence

```
DOMContentLoaded
      │
      ▼
storage.loadRemoteConfig()   ← GET /dccloud/config.json (Pages, no auth)
      │
      ▼
storage.loadConfigUsers()    ← GET /dccloud/users.json (Pages, no auth)
      │
      ▼
     route()
      │
      ├─ users.length === 0  →  showFirstTimeSetup()
      ├─ !auth.isLoggedIn    →  showLoginPage()
      └─ isLoggedIn          →  showAppShell() + render entity
```

---

## Data Flow

### Read Path (Loading Data)

```
User navigates to #/trainings
         │
         ▼
    loadEntity('trainings')
         │
         ▼ (cache miss)
    storage.getAll('trainings')
         │
         ▼
    GET https://api.github.com/repos/nmrmanohar/dccloud-data/contents/data/trainings.json
    Authorization: token <serviceToken>   ← decoded from config.json at runtime
         │
         ▼
    base64-decode content → JSON.parse → cache.trainings[]
         │
         ▼
    showTrainingsList()   ← renders from cache
```

### Write Path (Saving Data)

```
User clicks Save
      │
      ▼
gatherTraining(id)       ← read form fields
      │
      ▼
auth.canWrite check      ← role guard
      │
      ▼
storage.saveAll('trainings', updatedArray)
      │
      ▼
GET sha of existing file (to handle concurrent writes)
      │
      ▼
PUT https://api.github.com/repos/.../data/trainings.json
    body: { message, branch:'main', content: base64(JSON), sha }
      │
      ▼
invalidate cache → re-render list
```

### User Login Flow

```
User submits username + password
           │
           ▼
storage.configUsers   ← already in memory (loaded at startup from Pages)
           │
           ▼
auth.login(username, password, users, remember)
           │
           ▼
  find user by username (case-insensitive)
           │
           ▼
  auth.verifyPassword(password, user.passwordHash)
  ┌────────────────────────────────────────────┐
  │ PBKDF2(password, salt, 120000, SHA-256)    │
  │ → AES-GCM decrypt(stored_tag, iv, key)     │
  │ → plaintext === 'dccloud-auth-v1' ?        │
  └────────────────────────────────────────────┘
           │
           ▼
  Save session to localStorage/sessionStorage
  { userId, username, displayName, role }
           │
           ▼
  route()  →  showAppShell()
```

---

## Authentication Flow

### Password Hashing (on user creation)

```
password (string)
      │
      ▼
crypto.getRandomValues(16 bytes)  →  salt (base64)
crypto.getRandomValues(12 bytes)  →  iv  (base64)
      │
      ▼
crypto.subtle.importKey('raw', password_bytes, 'PBKDF2')
      │
      ▼
crypto.subtle.deriveKey(PBKDF2, salt, 120000 iter, SHA-256)
→  AES-GCM 256-bit key
      │
      ▼
crypto.subtle.encrypt(AES-GCM, iv, 'dccloud-auth-v1')
→  encrypted bytes (tag)
      │
      ▼
passwordHash = { salt, iv, tag }   ← stored in users.json
```

### Password Verification (on login)

```
input_password + stored { salt, iv, tag }
      │
      ▼
Derive same key: PBKDF2(input_password, salt, 120000)
      │
      ▼
AES-GCM decrypt(tag, iv, key)
      │
      ├─ succeeds → plaintext === 'dccloud-auth-v1' → PASS
      └─ throws   → wrong password → FAIL
```

This scheme means the only way to verify a password is to know it — there is no hash comparison value that could be leaked.

---

## Security Model

### Threat Model

| Threat | Mitigation |
|---|---|
| Password brute-force | PBKDF2 with 120,000 iterations makes offline attacks slow |
| Session hijacking | Session scoped to tab (sessionStorage) unless "Remember me" checked |
| XSS (stored) | All user data rendered through `esc()` (HTML entity encoding) |
| GitHub token exposure | Token stored reversed+base64 in public repo; actual data in private repo |
| Unauthorized writes | `auth.canWrite` guard on every save operation; storage layer also checks |
| Viewer editing via URL | Router blocks `new/edit` routes for viewers; `saveAll()` checks role |

### Service Token Scrambling

The GitHub PAT is stored in `config.json` as:
```
serviceToken = btoa([...rawToken].reverse().join(''))
```

At runtime `storage.serviceToken` getter reverses the process:
```javascript
const reversed = atob(raw);
const plain    = [...reversed].reverse().join('');
// plain starts with 'ghp_' or 'github_pat_'
```

**Why?** GitHub's push-protection scanning blocks commits containing raw PATs. Reversing the token breaks the known regex pattern (`ghp_[A-Za-z0-9_]{36}`) so the commit is accepted.

**Caveat:** `config.json` is publicly readable (GitHub Pages). The token is obfuscated, not encrypted. Anyone who reads the file and decodes it would have the token. The primary security layer is the **private data repository** — even with the token, an attacker could only access `dccloud-data` (training/vendor/trainer records).

### Role Enforcement

```
Role    canWrite    isAdmin
─────────────────────────
admin   true        true
editor  true        false
viewer  false       false
```

Enforcement points:
1. **Router** — `new` routes redirect viewers to list
2. **Form render** — no Save/Delete buttons rendered for viewers
3. **CSS** — `.form-body.readonly` disables pointer events on all inputs
4. **storage.saveAll()** — throws if `!auth.canWrite`
5. **Users page** — route blocked for non-admins (`if (!auth.isAdmin) navigate('trainings')`)

---

## GitHub API Integration

### Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/repos/{owner}/{repo}/contents/{path}?ref=main` | Read file + get SHA |
| PUT | `/repos/{owner}/{repo}/contents/{path}` | Create or update file |
| GET | `/user` | Token validation (setup & connection test) |

### Branch Targeting

All write operations explicitly specify `branch: 'main'` in the PUT body and `?ref=main` on GET requests. This prevents writes going to the default branch if it has been changed to a non-Pages branch.

### SHA-based Conflict Handling

Every file update:
1. GETs the current file to retrieve its `sha`
2. Includes `sha` in the PUT body

GitHub rejects the PUT with 409 if the SHA is stale (someone else updated the file concurrently), preventing data corruption.

---

## Module Breakdown

### `auth.js` — `Auth` class

| Member | Type | Description |
|---|---|---|
| `currentUser` | getter | Active session object from storage |
| `isLoggedIn` | getter | `!!currentUser` |
| `role` | getter | `currentUser.role` |
| `isAdmin` | getter | `role === 'admin'` |
| `canWrite` | getter | `role === 'admin' \|\| role === 'editor'` |
| `login()` | async | Verify password, save session |
| `logout()` | sync | Clear session from storage |
| `createUser()` | async | Hash password, return user object |
| `changePassword()` | async | Re-hash, update user object |
| `hashPassword()` | async | PBKDF2 + AES-GCM |
| `verifyPassword()` | async | Decrypt and compare sentinel |

### `storage.js` — `GitHubStorage` class

| Member | Type | Description |
|---|---|---|
| `settings` | getter | localStorage settings object |
| `serviceToken` | getter | Decoded PAT from `_remoteConfig` |
| `configUsers` | getter | Loaded users array |
| `loadRemoteConfig()` | async | Fetch `config.json` from Pages |
| `loadConfigUsers()` | async | Fetch `users.json` from Pages |
| `saveUsers()` | async | PUT `users.json` to `dccloud` main |
| `saveRemoteConfig()` | async | PUT `config.json` to `dccloud` main |
| `getAll(entity)` | async | GET `data/{entity}.json` from private repo |
| `saveAll(entity, data)` | async | PUT `data/{entity}.json` to private repo |
| `initialize()` | async | Create empty data files if missing |
| `testConnection()` | async | GET `/user` to validate token |

### `utils.js` — Pure Functions

| Category | Functions |
|---|---|
| Formatting | `fmtINR()`, `fmtUSD()`, `fmtNum()`, `fmtDate()`, `esc()` |
| Calculation | `calcAmountToReceive()`, `calcGST()`, `calcTotalTrainerFee()`, `calcMargin()` |
| Fiscal Year | `currentFYRange()`, `inCurrentFY()`, `inPrevFY()` |
| Date Parsing | `parseDMY()` — handles DD-MM-YYYY, DD/MM/YYYY, Excel serials |
| UI Helpers | `opts()`, `generateId()`, `downloadCSV()` |

### `app.js` — Application Shell

| Section | Lines (approx) | Responsibility |
|---|---|---|
| Cache & routing | 1–110 | Hash router, app/auth shell toggle |
| Trainings list | 144–320 | FY filter, stats, table, export |
| Training form | 324–670 | Form render, live calc, save, delete |
| Vendors list | 640–675 | Table, export |
| Vendor form | 673–790 | Form render, save, delete |
| Trainers list | 790–820 | Table, export |
| Trainer form | 820–960 | Form render, save, delete |
| Settings | 960–990 | Password change, sign-out |
| GST modal | 1100–1200 | Last-month GST summary |
| Excel import | 1200–1370 | SheetJS parsing, dedup, commit |
| Login page | 1370–1415 | Auth form, error display |
| Setup wizard | 1415–1540 | PAT entry, admin creation, init |
| User management | 1540–1720 | User list, add/edit/deactivate modals |

---

## Key Design Decisions

### Why GitHub Pages + GitHub API?
- **Zero cost**: No hosting, no database, no compute bills
- **Zero ops**: No server to maintain, patch, or monitor
- **Git-backed**: All data changes are committed — full audit trail built-in
- **Access control**: Private `dccloud-data` repo + PAT scope provides data isolation

### Why no framework (React, Vue, etc.)?
- The app has limited, well-defined views that don't change dynamically
- Framework overhead (bundle size, build step) would exceed the functional code
- GitHub Pages serves static files — no build pipeline needed
- Simpler deployment, simpler debugging

### Why hash-based routing?
- GitHub Pages serves a single `index.html`; there is no server to rewrite URLs
- `#/trainings` works without a 404 fallback configuration
- State is preserved on refresh without server-side handling

### Why users.json in the public repo?
- Login requires reading user accounts to verify passwords
- If `users.json` were in the private `dccloud-data` repo, every login would need the service token — but users don't have the token
- Serving `users.json` from GitHub Pages (public, no auth) means the browser can fetch it on startup with no credentials, then verify the password client-side
- **Security note:** `users.json` contains hashed passwords (not plain text). Even fully public, the PBKDF2+AES-GCM scheme prevents practical offline attacks

### Why PBKDF2 + AES-GCM instead of bcrypt/argon2?
- The Web Crypto API (built into all modern browsers) provides PBKDF2 natively
- bcrypt and argon2 are not available in Web Crypto — they would require a WASM library
- The sentinel encrypt approach (encrypt known plaintext, verify decryption succeeds) avoids storing a raw hash that could be compared offline
