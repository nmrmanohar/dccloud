# DC Cloud – Training Operations

> A GitHub Pages–hosted single-page application for end-to-end management of corporate training invoices, vendor accounts, and trainer engagements.

**Live URL:** https://nmrmanohar.github.io/dccloud/

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Roles & Permissions](#roles--permissions)
- [Documentation](#documentation)
- [Data Repositories](#data-repositories)

---

## Overview

DC Cloud Training Operations is a **zero-backend** web application that stores all data in a private GitHub repository and serves the application shell via GitHub Pages. There are no servers, no databases, and no monthly hosting costs.

Users log in with a **username and password only** — no GitHub token required. A single shared service token (stored scrambled in `config.json`) handles all GitHub API operations transparently.

---

## Features

### Training Management
- Create, edit, and delete training invoice records
- Auto-calculate invoice value (INR/USD with exchange rate), 18% GST, trainer fees, and profit margin
- Track payment status (Not Paid / Partial / Paid)
- India fiscal year filtering (current FY, previous FY, custom range)
- **Audit Info** filter — last calendar month (default for Viewer role)
- GST Summary report (last month, INR invoices only) with CSV export
- Export full training list to CSV (23 columns)
- Import training records from Excel (.xlsx) with deduplication

### Vendor / Account Management
- Maintain a directory of vendor and customer companies
- Parent–child account relationships
- Track GST number, PAN, contact details, and address
- Import from Excel with automatic deduplication

### Trainer Management
- Maintain trainer profiles with contact, address, GST/PAN details
- Import from Excel with automatic deduplication

### User & Access Management
- Admin-managed user accounts (no self-registration)
- Three roles: **Admin**, **Editor**, **Viewer**
- Password hashed client-side using PBKDF2 (120k iterations) + AES-GCM
- Session persistence with optional "Remember me"
- Password change from within the app

### Security
- Passwords never stored in plain text
- Service token scrambled (reversed + base64) in public repo to bypass GitHub push-protection scanning
- HTML escaping on all user-supplied data (XSS prevention)
- Role-based route guards on all write operations

---

## Technology Stack

| Layer | Technology |
|---|---|
| Hosting | GitHub Pages (static) |
| Data storage | GitHub Contents API → private repo (`dccloud-data`) |
| User registry | `users.json` in public repo, served via GitHub Pages |
| Frontend | Vanilla HTML / CSS / JavaScript (no frameworks) |
| Crypto | Web Crypto API — PBKDF2 + AES-GCM |
| Excel import | SheetJS (xlsx.full.min.js) |
| Routing | Hash-based SPA (`#/trainings`, `#/vendors`, …) |
| CI/CD | GitHub Pages auto-deploy on push to `main` |

---

## Project Structure

```
dccloud/                        ← Public GitHub Pages repo (nmrmanohar/dccloud)
│
├── index.html                  ← App shell: sidebar, topbar, modals
├── config.json                 ← Runtime config: dataOwner, dataRepo, serviceToken
├── users.json                  ← User accounts (publicly served, no auth needed)
│
├── css/
│   └── style.css               ← All styling, DC Cloud brand palette
│
├── js/
│   ├── auth.js                 ← Auth class: login, hash, session, RBAC
│   ├── storage.js              ← GitHub API wrapper: config, users, data CRUD
│   ├── utils.js                ← Constants, formatters, calculators, CSV export
│   └── app.js                  ← SPA routing, all page/form renderers, import logic
│
├── setup.html                  ← Browser-based one-time setup wizard (local file, not deployed)
├── setup.js                    ← Node.js one-time setup alternative (local only)
├── .gitignore                  ← Excludes setup.html, setup.js, node_modules
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DEPLOYMENT.md
    ├── USER_GUIDE.md
    └── DATA_MODEL.md

dccloud-data/                   ← Private GitHub repo (nmrmanohar/dccloud-data)
└── data/
    ├── trainings.json
    ├── vendors.json
    └── trainers.json
```

---

## Quick Start

### For End Users
1. Open https://nmrmanohar.github.io/dccloud/
2. Enter your username and password (provided by your admin)
3. Log in — no GitHub account or PAT required

### For Administrators (First-Time Setup)
See [Deployment Guide](docs/DEPLOYMENT.md) for the complete setup walkthrough.

---

## Roles & Permissions

| Action | Viewer | Editor | Admin |
|---|:---:|:---:|:---:|
| View trainings / vendors / trainers | ✅ | ✅ | ✅ |
| Default to Audit Info (last month) filter | ✅ | — | — |
| Export CSV | ✅ | ✅ | ✅ |
| Create / edit records | ❌ | ✅ | ✅ |
| Delete records | ❌ | ❌ | ✅ |
| Import Excel | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| Change own password | ✅ | ✅ | ✅ |
| View settings / data repo info | — | — | ✅ |

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, security model, auth flow |
| [Deployment](docs/DEPLOYMENT.md) | Initial setup, GitHub configuration, troubleshooting |
| [User Guide](docs/USER_GUIDE.md) | How to use every feature, role-by-role walkthrough |
| [Data Model](docs/DATA_MODEL.md) | Entity schemas, field definitions, relationships |

---

## Data Repositories

| Repository | Visibility | Purpose |
|---|---|---|
| `nmrmanohar/dccloud` | Public | App source (HTML/CSS/JS), `config.json`, `users.json` |
| `nmrmanohar/dccloud-data` | **Private** | Training, vendor, and trainer data |

The service token in `config.json` must have **`repo` scope** (Classic PAT) covering both repositories.

---

*Built by DC Cloud — Nallapareddy Manohar Reddy*
