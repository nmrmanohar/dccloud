# Data Model — DC Cloud Training Operations

## Table of Contents
- [Storage Layout](#storage-layout)
- [Training](#training)
- [Vendor (Account)](#vendor-account)
- [Trainer](#trainer)
- [User](#user)
- [Config](#config)
- [Relationships](#relationships)
- [Calculated Fields](#calculated-fields)
- [Enumerated Values](#enumerated-values)

---

## Storage Layout

```
nmrmanohar/dccloud  (public repo — GitHub Pages)
├── config.json          Single object
└── users.json           Array of User objects

nmrmanohar/dccloud-data  (private repo — GitHub API)
└── data/
    ├── trainings.json   Array of Training objects
    ├── vendors.json     Array of Vendor objects
    └── trainers.json    Array of Trainer objects
```

All files are stored as **pretty-printed JSON** (2-space indent) and base64-encoded when written via the GitHub Contents API.

---

## Training

**File:** `dccloud-data/data/trainings.json`
**Schema version:** 1 (no explicit version field — schema is stable)

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique identifier. Format: `timestamp36 + random5` e.g. `lp1ka003xr2` |
| `invoice_number` | string | ✅ | Invoice number. Must be unique across all training records |
| `invoice_date` | string | — | Invoice issue date. Format: `DD-MM-YYYY` |
| `vendor_id` | string | — | FK → Vendor.id — the company delivering the training |
| `customer_id` | string | — | FK → Vendor.id — the company being billed (may differ from vendor) |
| `course_name` | string | — | Name of the training course / program |
| `course_date` | string | — | When the training was conducted. Format: `DD-MM-YYYY` |
| `delivery_mode` | string | — | `In-person` / `Virtual` / `Hybrid` |
| `currency` | string | — | `INR` (default) or `USD` |
| `exchange_rate` | number | — | USD to INR exchange rate (used only when `currency === 'USD'`) |
| `per_day_fee` | number | — | Vendor's daily fee in the selected currency |
| `days` | number | — | Number of training days |
| `gst_required` | string | — | `Yes` / `No` — applies only to INR invoices |
| `invoice_value` | number | — | **Calculated**: see [Calculated Fields](#calculated-fields) |
| `gst_amount` | number | — | **Calculated**: 18% GST if `gst_required === 'Yes'` and `currency === 'INR'` |
| `gst_credited` | string | — | `Yes` / `No` / `NA` — GST input credit status |
| `payment_status` | string | — | `Not Paid` / `Partial` / `Paid` |
| `received_amount` | number | — | Actual amount received in INR |
| `paid_date` | string | — | Date payment was received. Format: `DD-MM-YYYY` |
| `trainer_id` | string | — | FK → Trainer.id |
| `trainer_fee_per_day` | number | — | Trainer's daily fee in INR |
| `total_trainer_fee` | number | — | **Calculated**: `trainer_fee_per_day × days` |
| `trainer_fee_paid` | string | — | `Yes` / `No` / `NA` |
| `trainer_tds_credited` | string | — | `Yes` / `No` / `NA` — TDS credit status |
| `margin` | number | — | **Calculated**: `received_amount − total_trainer_fee` |

### Sample Record

```json
{
  "id": "lp1ka003xr2",
  "invoice_number": "DC/2024-25/001",
  "invoice_date": "15-04-2024",
  "vendor_id": "lp0xb117mn9",
  "customer_id": "lp0xc228pq4",
  "course_name": "Microsoft Copilot Studio Fundamentals",
  "course_date": "10-04-2024",
  "delivery_mode": "Virtual",
  "currency": "INR",
  "exchange_rate": null,
  "per_day_fee": 50000,
  "days": 2,
  "gst_required": "Yes",
  "invoice_value": 100000,
  "gst_amount": 18000,
  "gst_credited": "Yes",
  "payment_status": "Paid",
  "received_amount": 118000,
  "paid_date": "30-04-2024",
  "trainer_id": "lp0ya331kw7",
  "trainer_fee_per_day": 15000,
  "total_trainer_fee": 30000,
  "trainer_fee_paid": "Yes",
  "trainer_tds_credited": "NA",
  "margin": 88000
}
```

---

## Vendor (Account)

**File:** `dccloud-data/data/vendors.json`

Represents both **vendors** (companies who deliver training) and **customers** (companies being invoiced). A single company can be both.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique identifier |
| `account_name` | string | ✅ | Full legal company name |
| `account_type` | string | — | `Vendor` / `Customer` / `Both` |
| `phone` | string | — | Company phone number |
| `email` | string | — | Company email address |
| `website` | string | — | Company website URL |
| `parent_account` | string | — | FK → Vendor.id — parent company for subsidiaries |
| `gst_number` | string | — | Company GSTIN (15-character format) |
| `pan_number` | string | — | Company PAN (10-character format) |
| `address_street1` | string | — | Address line 1 |
| `address_street2` | string | — | Address line 2 |
| `address_street3` | string | — | Address line 3 |
| `address_city` | string | — | City |
| `address_state` | string | — | State / Province |
| `address_zip` | string | — | ZIP / Postal Code |
| `address_country` | string | — | Country (default: `India`) |

### Sample Record

```json
{
  "id": "lp0xb117mn9",
  "account_name": "Contoso Technologies Pvt Ltd",
  "account_type": "Customer",
  "phone": "+91 98765 43210",
  "email": "training@contoso.in",
  "website": "https://contoso.in",
  "parent_account": "",
  "gst_number": "29AABCT1234A1ZV",
  "pan_number": "AABCT1234A",
  "address_street1": "Tower 2, Embassy Tech Village",
  "address_street2": "Outer Ring Road",
  "address_street3": "",
  "address_city": "Bengaluru",
  "address_state": "Karnataka",
  "address_zip": "560103",
  "address_country": "India"
}
```

---

## Trainer

**File:** `dccloud-data/data/trainers.json`

Represents individual trainers who conduct training sessions.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique identifier |
| `first_name` | string | ✅ | First name |
| `middle_name` | string | — | Middle name |
| `last_name` | string | ✅ | Last name |
| `job_title` | string | — | Professional title |
| `email` | string | — | Email address |
| `business_phone` | string | — | Office phone |
| `mobile_phone` | string | — | Mobile phone |
| `preferred_contact` | string | — | `Email` / `Business Phone` / `Mobile Phone` / `Any` |
| `gst_number` | string | — | Trainer's GSTIN (if GST registered) |
| `pan_number` | string | — | Trainer's PAN |
| `spouse_name` | string | — | Spouse or partner name |
| `address_street1` | string | — | Address line 1 |
| `address_street2` | string | — | Address line 2 |
| `address_street3` | string | — | Address line 3 |
| `address_city` | string | — | City |
| `address_state` | string | — | State / Province |
| `address_zip` | string | — | ZIP / Postal Code |
| `address_country` | string | — | Country |

### Sample Record

```json
{
  "id": "lp0ya331kw7",
  "first_name": "Ravi",
  "middle_name": "",
  "last_name": "Kumar",
  "job_title": "Microsoft Certified Trainer",
  "email": "ravi.kumar@trainer.com",
  "business_phone": "",
  "mobile_phone": "+91 99887 76655",
  "preferred_contact": "Mobile Phone",
  "gst_number": "",
  "pan_number": "ABCPK1234D",
  "spouse_name": "",
  "address_street1": "12, MG Road",
  "address_street2": "",
  "address_street3": "",
  "address_city": "Hyderabad",
  "address_state": "Telangana",
  "address_zip": "500001",
  "address_country": "India"
}
```

---

## User

**File:** `dccloud/users.json` (public repo, served via GitHub Pages)

User accounts for application authentication.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | ✅ | Unique identifier. Same format as other entities |
| `username` | string | ✅ | Login name. Case-insensitive on login |
| `displayName` | string | ✅ | Shown in UI, user pill, and audit labels |
| `passwordHash` | object | ✅ | PBKDF2+AES-GCM hash (see below) |
| `passwordHash.salt` | string | ✅ | 16 random bytes, base64-encoded |
| `passwordHash.iv` | string | ✅ | 12 random bytes (AES-GCM IV), base64-encoded |
| `passwordHash.tag` | string | ✅ | AES-GCM ciphertext of sentinel `dccloud-auth-v1`, base64-encoded |
| `role` | string | ✅ | `admin` / `editor` / `viewer` |
| `active` | boolean | ✅ | `true` = can log in; `false` = deactivated |

### Sample Record

```json
{
  "id": "mo1jv067w9f",
  "username": "nmrmanohar",
  "displayName": "Manohar Reddy N",
  "passwordHash": {
    "salt": "3k9mXqP2nR7vL4wA",
    "iv": "yT8hBz5qW1mE",
    "tag": "Xk3mRp7vL9qT2nB4wA8hBz5qW1mEyT..."
  },
  "role": "admin",
  "active": true
}
```

---

## Config

**File:** `dccloud/config.json` (public repo, served via GitHub Pages)

Application runtime configuration. Read at startup before users are loaded.

### Fields

| Field | Type | Description |
|---|---|---|
| `dataOwner` | string | GitHub username owning the data repository |
| `dataRepo` | string | Name of the private data repository |
| `serviceToken` | string | GitHub PAT, stored as `btoa([...token].reverse().join(''))` |

### Sample Record

```json
{
  "dataOwner": "nmrmanohar",
  "dataRepo": "dccloud-data",
  "serviceToken": "RGRLTGc0dEpSMHZIOFk2UFBmNGVQa1lpT2ZiNnVXTEpWaTh4X3BoZw=="
}
```

> The `serviceToken` value shown above is scrambled. The real token is decoded at runtime by `storage.serviceToken` getter.

---

## Relationships

```
Training ──── vendor_id ────► Vendor (Account)
Training ──── customer_id ──► Vendor (Account)
Training ──── trainer_id ───► Trainer

Vendor ─────── parent_account ─► Vendor (self-reference)
```

All foreign keys are stored as the `id` string of the referenced entity. There is no referential integrity enforcement — if a vendor or trainer is deleted, existing training records retain the old `id` which will no longer resolve to a name (shown as blank or unknown in the UI).

**Best practice:** Do not delete vendors or trainers that are referenced by training records. Deactivating accounts is not currently a feature for vendors/trainers (only for users).

---

## Calculated Fields

These fields are computed at save time and stored in the JSON for export/query convenience. They are also recalculated live in the form UI.

### Invoice Value (INR)

```
if currency === 'INR':
    invoice_value = per_day_fee × days

if currency === 'USD':
    invoice_value = per_day_fee × days × exchange_rate
```

### GST Amount (INR)

```
if gst_required === 'Yes' AND currency === 'INR':
    gst_amount = invoice_value × 0.18
else:
    gst_amount = 0
```

GST rate is fixed at **18%** (standard GST for training/consulting services in India).

### Total Trainer Fee (INR)

```
total_trainer_fee = trainer_fee_per_day × days
```

### Margin (INR)

```
margin = received_amount − total_trainer_fee
```

Note: Margin uses `received_amount` (actual payment received), not `invoice_value`. If payment is pending, margin will be negative or zero.

---

## Enumerated Values

### `training.delivery_mode`
- `In-person`
- `Virtual`
- `Hybrid`

### `training.currency`
- `INR`
- `USD`

### `training.gst_required`
- `Yes`
- `No`

### `training.gst_credited` / `training.trainer_fee_paid` / `training.trainer_tds_credited`
- `Yes`
- `No`
- `NA` (not applicable)

### `training.payment_status`
- `Not Paid`
- `Partial`
- `Paid`

### `vendor.account_type`
- `Vendor`
- `Customer`
- `Both`

### `trainer.preferred_contact`
- `Email`
- `Business Phone`
- `Mobile Phone`
- `Any`

### `user.role`
- `admin`
- `editor`
- `viewer`

---

## ID Format

All entity IDs are generated by `generateId()` in `utils.js`:

```javascript
function generateId() {
  return Date.now().toString(36) +
         Math.random().toString(36).slice(2, 7);
}
```

This produces an 11–12 character alphanumeric string (e.g. `lp1ka003xr2`) that is:
- Roughly time-ordered (base-36 timestamp prefix)
- Unique enough for a single-user or small-team app
- URL-safe (no special characters)
