# User Guide — DC Cloud Training Operations

## Table of Contents
- [Getting Started](#getting-started)
- [Navigation](#navigation)
- [Trainings](#trainings)
- [Vendors (Accounts)](#vendors-accounts)
- [Trainers](#trainers)
- [Reports & Export](#reports--export)
- [User Management (Admin)](#user-management-admin)
- [Settings](#settings)
- [Role Quick Reference](#role-quick-reference)

---

## Getting Started

### Logging In

1. Open **https://nmrmanohar.github.io/dccloud/** in any browser
2. Enter your **Username** and **Password** (provided by your administrator)
3. Check **Remember me** to stay logged in across browser sessions; leave unchecked to log out when you close the tab
4. Click **Sign In**

You do **not** need a GitHub account.

### Your Role

Your role determines what you can do:

| Role | What you can do |
|---|---|
| **Viewer** | Browse and export all records. Cannot create, edit, or delete. |
| **Editor** | Create and edit records, import data. Cannot delete or manage users. |
| **Admin** | Full access including delete, user management, and settings. |

The current role is shown in your **user pill** (top-right corner of every page).

---

## Navigation

The **left sidebar** contains all navigation links:

| Section | Link | Who can see it |
|---|---|---|
| Training | Trainings List | Everyone |
| Related | Accounts | Everyone |
| Related | Trainers | Everyone |
| Admin | Users & Roles | Admin only |
| Bottom | Settings | Everyone |

Click **☰** (top-left) to collapse the sidebar and gain more screen space.

Your **user pill** (top-right) shows your display name, initials avatar (colour-coded by role), and role tag.

---

## Trainings

The Trainings module is the core of the application. Each record represents one training engagement with all associated financial details.

### Viewing the Trainings List

Navigate to **Trainings List** in the sidebar.

#### Fiscal Year Filters

Use the **FY filter** dropdown to select a period:

| Option | What it shows |
|---|---|
| This FY | April 1 of current year to March 31 of next year |
| Previous FY | The full fiscal year before the current one |
| Audit Info | Last complete calendar month (default for Viewer role) |
| All Time | Every record regardless of date |
| Custom | Pick a specific financial year by year number |

#### Search

Use the **Search** box (top-right of filter bar) to search across:
- Invoice Number
- Course Name
- Vendor name

The list filters in real-time as you type.

#### Stats Bar

Above the list, the **Stats Bar** shows totals for the current filter:

| Stat | Description |
|---|---|
| Trainings | Count of records in the filtered view |
| Total Invoiced | Sum of invoice values (INR) |
| Received | Sum of amounts actually received |
| GST Collected | Total GST billed |
| Trainer Cost | Total trainer fees paid |
| Margin | Received – GST Amount |

#### Payment Status Badges

Each row shows a colour-coded payment badge:

| Badge | Meaning |
|---|---|
| 🟢 Paid | Full amount received |
| 🟡 Partial | Partial payment received |
| 🔴 Not Paid | No payment received yet |

#### Opening a Record

Click the **Invoice Number** (blue link) in any row to open the full record.

---

### Creating a New Training

1. Click **+ New** (top-right of toolbar) — only visible to Editors and Admins
2. Fill in the form fields across three sections:
   - **General** — vendor, customer, course details, currency
   - **Payment Info** — invoice dates, amounts, payment status
   - **Trainer Info** — trainer, fees, TDS, margin
3. Click **💾 Save** or **Save & Close**

---

### Training Form — Field Reference

#### General Section

| Field | Required | Description |
|---|---|---|
| Invoice Number | Yes | Unique invoice identifier |
| Invoice Date | — | Date of invoice issue (DD-MM-YYYY) |
| Vendor | Yes | The company delivering the training |
| Customer | — | The company being invoiced (if different from vendor) |
| Course Name | — | Name of the training course |
| Course Date | — | When the training was conducted |
| Delivery Mode | — | In-person / Virtual / Hybrid |
| Currency | — | INR (default) or USD |
| Exchange Rate | — | USD to INR rate (only shown for USD) |
| Per Day Fee | — | Vendor's daily fee in selected currency |
| Days | — | Number of training days |
| GST Required | — | Yes / No (INR only; auto-set to No for USD) |

#### Payment Info Section

| Field | Description |
|---|---|
| Invoice Value (INR) | **Auto-calculated**: perDay × days × exchangeRate |
| GST Amount (INR) | **Auto-calculated**: 18% of invoice value (if GST Required = Yes, INR) |
| GST Credited | Yes / No / NA — whether GST input credit has been claimed |
| Payment Status | Not Paid / Partial / Paid |
| Received Amount (INR) | Actual payment received |
| Paid Date | Date payment was received |

#### Trainer Info Section

| Field | Description |
|---|---|
| Trainer | Select from trainer directory |
| Trainer Fee / Day (INR) | Daily fee paid to trainer |
| Total Trainer Fee (INR) | **Auto-calculated**: trainerFee × days |
| Trainer Fee Paid | Yes / No / NA |
| Trainer TDS Credited | Yes / No / NA |
| Margin (INR) | **Auto-calculated**: receivedAmount − gstAmount |

> **Calculated fields** update in real-time as you change related inputs. You cannot type into them directly.

---

### Editing a Training

1. Click the **Invoice Number** link in the list to open the record
2. Modify any fields
3. Click **💾 Save** or **Save & Close**

> **Viewers** can open records but will see a 🔒 Read-only badge and cannot modify fields.

---

### Deleting a Training

1. Open the training record
2. Click **🗑 Delete** (Admin only)
3. Confirm in the dialog

> Deletion is permanent and cannot be undone.

---

### Importing Trainings from Excel

1. Click **⬆ Import Excel** in the Trainings toolbar (Editors and Admins)
2. Select an `.xlsx` or `.csv` file
3. Review the preview — it shows:
   - How many records will be created (new invoice numbers)
   - How many already exist (will be skipped / updated)
   - Any validation warnings
4. Click **Confirm Import**

**Expected columns in the Excel file:**

| Column | Notes |
|---|---|
| Invoice Number | Must be unique; existing records are skipped |
| Invoice Date | DD-MM-YYYY or DD/MM/YYYY |
| Vendor | Must match an existing Account Name exactly |
| Customer | Optional; must match Account Name if provided |
| Course Name | Free text |
| Course Date | DD-MM-YYYY |
| Delivery Mode | In-person / Virtual / Hybrid |
| Currency | INR or USD |
| Exchange Rate | Numeric |
| Per Day Fee | Numeric (in selected currency) |
| Days | Numeric |
| GST Required | Yes / No |
| Payment Status | Not Paid / Partial / Paid |
| Received Amount | Numeric (INR) |
| Paid Date | DD-MM-YYYY |
| Trainer | Must match existing trainer first+last name |
| Trainer Fee/Day | Numeric (INR) |
| Trainer Fee Paid | Yes / No / NA |
| Trainer TDS Credited | Yes / No / NA |
| GST Credited | Yes / No / NA |

---

## Vendors (Accounts)

The Accounts module stores information about the companies you work with — both training vendors and customers.

### Viewing Accounts

Click **Accounts** in the sidebar. All accounts are listed alphabetically.

Use the **Search** box to filter by account name.

### Creating an Account

1. Click **+ New**
2. Fill in the details:

| Field | Description |
|---|---|
| Account Name | Required. The company's full legal name |
| Account Type | Vendor / Customer / Both |
| Phone | Contact phone number |
| Email | Contact email address |
| Website | Company website URL |
| Parent Account | Link to another account if this is a subsidiary |
| GST Number | Company's GSTIN |
| PAN Number | Company's PAN |
| Address | Street lines 1–3, City, State, ZIP, Country |

3. Click **💾 Save**

### Importing Accounts from Excel

Expected columns: `Account Name`, `Account Type`, `Phone`, `Email`, `Website`, `Parent Account`, `GST Number`, `PAN Number`, `Street 1–3`, `City`, `State`, `ZIP`, `Country`.

Existing accounts (matched by Account Name) are skipped during import.

---

## Trainers

The Trainers module stores profiles of individuals who deliver training.

### Creating a Trainer

1. Click **Trainers** → **+ New**
2. Fill in:

| Field | Description |
|---|---|
| First Name | Required |
| Middle Name | Optional |
| Last Name | Required |
| Job Title | Professional title |
| Email | Contact email |
| Business Phone | Office phone |
| Mobile Phone | Personal phone |
| Preferred Contact | Email / Business Phone / Mobile / Any |
| GST Number | Trainer's GSTIN (if GST-registered) |
| PAN Number | Trainer's PAN |
| Spouse / Partner Name | Optional |
| Address | Full address with city, state, ZIP, country |

3. Click **💾 Save**

### Importing Trainers from Excel

Expected columns: `First Name`, `Middle Name`, `Last Name`, `Job Title`, `Email`, `Business Phone`, `Mobile Phone`, `Preferred Contact`, `GST Number`, `PAN Number`, `Spouse Name`, `Street 1–3`, `City`, `State`, `ZIP`, `Country`.

Existing trainers (matched by First Name + Last Name) are skipped.

---

## Reports & Export

### Training List CSV Export

1. Apply filters (FY, search) to scope the data
2. Click **⬇ Export CSV**
3. A CSV file downloads with **23 columns** covering all training fields including calculated values

The CSV includes a UTF-8 BOM for correct display in Excel.

### GST Summary (Last Month)

1. On the Trainings List, click **GST Summary**
2. A modal shows all INR invoices with GST Required = Yes from the last complete calendar month
3. Stats shown:
   - Number of invoices
   - Total taxable amount (invoice value ex-GST)
   - Total GST amount
   - GST already credited
   - GST pending credit
4. Click **⬇ Export CSV** to download the filtered list

---

## User Management (Admin)

Only administrators can manage users.

### Viewing Users

Click **Users & Roles** in the sidebar.

The user list shows: Display Name, Username, Role, Status (Active/Inactive), and action buttons.

### Adding a New User

1. Click **+ Add User**
2. Fill in:
   - **Username** — used to log in (case-insensitive)
   - **Display Name** — shown in the app
   - **Role** — viewer, editor, or admin
   - **Password** + confirmation (minimum 8 characters)
3. Click **Save**

The user can log in immediately at the app URL.

### Editing a User

Click **Edit** next to any user to:
- Change their **Display Name**
- Change their **Role**
- **Reset Password** — enter a new password (minimum 8 characters)

Click **Save**.

### Deactivating a User

Click **Deactivate** next to an active user. The user will no longer be able to log in, but their historical data is preserved.

Click **Activate** to re-enable a deactivated account.

> You cannot delete users, only deactivate them. This preserves audit history.

---

## Settings

Click **Settings** (⚙ bottom of sidebar).

### Change Password

1. Enter your **Current Password**
2. Enter a **New Password** (minimum 8 characters)
3. Confirm the new password
4. Click **Change Password**

### Sign Out

Click **Sign Out** to log out immediately. This clears your session from the browser.

### Data Repository (Admin Only)

Shows the connected private data repository and allows re-initialisation of data files if they become corrupted.

---

## Role Quick Reference

### Viewer

You see everything but cannot change anything.

- ✅ Browse trainings, vendors, trainers
- ✅ Default view is **Audit Info** (last calendar month)
- ✅ Change your own password
- ✅ Export CSV, GST Summary
- ❌ Cannot create, edit, or delete records
- ❌ Cannot import data
- ❌ Cannot manage users

### Editor

You can manage data but not users.

- ✅ Everything a Viewer can do
- ✅ Create, edit trainings, vendors, trainers
- ✅ Import from Excel
- ❌ Cannot delete records
- ❌ Cannot manage users or settings

### Admin

Full access.

- ✅ Everything an Editor can do
- ✅ Delete records
- ✅ Manage users (add, edit, deactivate, reset passwords)
- ✅ View Settings and data repository info
- ✅ Re-initialize data files
