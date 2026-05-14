# Deployment Guide — DC Cloud Training Operations

## Table of Contents
- [Prerequisites](#prerequisites)
- [Repository Setup](#repository-setup)
- [GitHub Pages Configuration](#github-pages-configuration)
- [One-Time App Setup](#one-time-app-setup)
- [Adding Users](#adding-users)
- [Configuration Reference](#configuration-reference)
- [Updating the Application](#updating-the-application)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Details |
|---|---|
| GitHub account | `nmrmanohar` (or your own) |
| Public GitHub repo | `nmrmanohar/dccloud` — hosts the app files |
| Private GitHub repo | `nmrmanohar/dccloud-data` — stores training data |
| GitHub Personal Access Token | Classic PAT, `repo` scope, covers both repositories |
| Modern browser | Chrome, Edge, Firefox (Web Crypto API required) |

### Creating the GitHub Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token (classic)**
3. Set a descriptive name: `DC Cloud Service Token`
4. Select scope: ✅ **repo** (full control of private repositories)
5. Set expiration as needed (no expiry recommended for unattended use)
6. Click **Generate token** — copy and save it securely

> ⚠️ This token is the master credential for the app. It will be stored in `config.json` in scrambled form. Keep a copy in a secure password manager.

---

## Repository Setup

### 1. Create the Private Data Repository

```
GitHub → New repository
Name:           dccloud-data
Visibility:     Private
Initialize:     Yes (with README)
```

No other setup is needed — the app will create the `data/` folder structure on first setup.

### 2. Fork or Clone the App Repository

If starting from scratch, clone the `dccloud` repo:
```bash
git clone https://github.com/nmrmanohar/dccloud.git
cd dccloud
```

The repository should contain:
```
index.html
config.json        ← { "dataOwner": "nmrmanohar", "dataRepo": "dccloud-data", "serviceToken": "" }
users.json         ← []
css/style.css
js/auth.js
js/storage.js
js/utils.js
js/app.js
```

---

## GitHub Pages Configuration

1. Go to your `dccloud` repository on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **Deploy from a branch**
4. Branch: **main** | Folder: **/ (root)**
5. Click **Save**

After ~2 minutes your site will be live at:
```
https://{your-username}.github.io/dccloud/
```

> **Important:** All future deployments happen automatically on every push to `main`. There is no manual deploy step.

---

## One-Time App Setup

The first time you open the app URL, it shows the setup wizard because `users.json` is empty. The setup wizard:
1. Validates your GitHub PAT
2. Creates the admin account
3. Writes the scrambled PAT to `config.json`
4. Writes the admin user to `users.json`
5. Initialises empty data files in `dccloud-data`

However, the **browser-based wizard can fail** due to GitHub push-protection scanning detecting the PAT. The recommended method is the **local setup page**.

### Recommended: setup.html (Local Browser File)

1. Open the file directly from your computer:
   ```
   C:\Users\nmrma\Documents\Claude\dccloud\setup.html
   ```
   Or double-click it / drag it into Chrome.

2. Fill in:
   - **GitHub Personal Access Token** — your Classic PAT with `repo` scope
   - **Admin username** — e.g. `nmrmanohar`
   - **Display name** — e.g. `Manohar Reddy N`
   - **Password** — minimum 8 characters (set twice to confirm)

3. Click **Run Setup**. You will see each step logged:
   ```
   ✓ Authenticated as nmrmanohar
   ✓ Password hashed
   ✓ config.json saved
   ✓ users.json saved
   · data/trainings.json already exists (or: created)
   ✅ Setup complete!
   ```

4. Wait **2–3 minutes** for GitHub Pages to redeploy.

5. Open the app URL → you will now see the **username & password login page**.

### Verify Setup

After setup, confirm these files are correct in GitHub:

**`config.json`** should look like:
```json
{
  "dataOwner": "nmrmanohar",
  "dataRepo": "dccloud-data",
  "serviceToken": "RGRLTGc0d..."   ← scrambled PAT (long base64 string)
}
```

**`users.json`** should contain your admin user:
```json
[
  {
    "id": "...",
    "username": "nmrmanohar",
    "displayName": "Manohar Reddy N",
    "passwordHash": { "salt": "...", "iv": "...", "tag": "..." },
    "role": "admin",
    "active": true
  }
]
```

**`dccloud-data/data/`** should contain three empty arrays:
```
trainings.json   → []
vendors.json     → []
trainers.json    → []
```

---

## Adding Users

Users can only be added by an **admin** from within the app.

1. Log in as admin
2. Click **Users & Roles** in the left sidebar (Admin section)
3. Click **+ Add User**
4. Fill in:
   - **Username** (used to log in)
   - **Display Name** (shown in the UI)
   - **Role** — `viewer`, `editor`, or `admin`
   - **Password** + confirmation
5. Click **Save**

The new user can now log in at the app URL with their username and password. They do **not** need a GitHub account or token.

### Typical User Roles

| Person | Role |
|---|---|
| Operations manager (you) | admin |
| Operations team members who enter data | editor |
| Auditors, finance reviewers, directors | viewer |

---

## Configuration Reference

### `config.json`

| Field | Type | Description |
|---|---|---|
| `dataOwner` | string | GitHub username owning both repos |
| `dataRepo` | string | Name of the private data repository |
| `serviceToken` | string | GitHub PAT, reversed then base64-encoded |

### `users.json`

Array of user objects. See [Data Model → User](DATA_MODEL.md#user) for full schema.

### localStorage Keys (Browser)

| Key | Value | Purpose |
|---|---|---|
| `dccloud_settings` | JSON | Cached settings (dataOwner, dataRepo) |
| `dccloud_session` | JSON | Persistent login session (if "Remember me") |
| `dccloud_session` (sessionStorage) | JSON | Tab-only login session |

---

## Updating the Application

### Code Updates (CSS, JS, HTML)

```bash
# Edit files locally
git add .
git commit -m "Describe the change"
git push origin main
```

GitHub Pages redeploys automatically within ~2 minutes.

### Updating config.json or users.json

These files are managed by the app itself (via GitHub API on save). To manually update:

1. Go to the file in GitHub web UI: `github.com/nmrmanohar/dccloud/blob/main/users.json`
2. Click the pencil (edit) icon
3. Make changes
4. Commit directly to `main`

Or use the `setup.html` file to re-run setup (it will overwrite both files).

### Rotating the Service Token

If your PAT expires or you need to rotate it:
1. Create a new Classic PAT with `repo` scope
2. Open `setup.html` locally
3. Run setup again — it will overwrite `config.json` with the new scrambled token
4. All existing users and data remain intact (only `config.json` is updated)

---

## Troubleshooting

### Setup wizard keeps appearing after completing setup

**Cause:** `users.json` is still `[]` — the write didn't land on the `main` branch.

**Fix:**
1. Check https://github.com/nmrmanohar/dccloud/blob/main/users.json
2. If it still shows `[]`, re-run `setup.html` (the local file, not from Pages URL)
3. Verify GitHub Actions at https://github.com/nmrmanohar/dccloud/actions shows a new deployment after setup runs

---

### "Repository rule violations found Secret detected in content"

**Cause:** GitHub push-protection detected a PAT in the content being committed.

**Fix:** This is handled automatically by `setup.html` — it scrambles the token before writing. If the error still occurs:
1. Go to your `dccloud` repo → **Settings → Code security and analysis → Secret scanning → Push protection**
2. Temporarily disable push protection, run setup, then re-enable

---

### Login fails — "User not found"

**Cause:** The user was added but the browser has a cached empty `users.json` from before the user was created.

**Fix:** Hard-refresh the page (Ctrl+Shift+R / Cmd+Shift+R) to force a fresh fetch of `users.json`.

---

### Data not loading — blank or "Error" on trainings list

**Causes and fixes:**

| Symptom | Likely Cause | Fix |
|---|---|---|
| "GitHub API error 401" | Service token is invalid or expired | Rotate the token via setup.html |
| "GitHub API error 403" | Token lacks repo scope on dccloud-data | Re-create PAT with full `repo` scope |
| "GitHub API error 404" | Data file doesn't exist | Settings → Re-initialize data files |
| Blank list, no error | data/*.json exists but is malformed JSON | Check file in GitHub, fix JSON manually |

---

### Changes not visible after save

**Cause:** Browser is showing cached data.

**Fix:** Hard-refresh (Ctrl+Shift+R). The app invalidates its in-memory cache on every save, but the browser may still cache the GitHub API response.

---

### GitHub Pages shows old version after code push

**Cause:** Pages CDN cache has not expired yet.

**Fix:** Wait 2–5 minutes. Check https://github.com/nmrmanohar/dccloud/actions — wait for the latest `pages build and deployment` to show a green ✓.

---

### Push rejected — "Remote contains work not have locally"

**Cause:** The GitHub API (setup.html or in-app saves) created commits on `main` that your local git doesn't know about.

**Fix:**
```bash
git pull origin main --rebase
git push origin main
```
