# Clinic Management Platform - Four Backends + Database

This package contains four role-specific Node.js + Express backends sharing one SQLite database:

- `apps/doctor-backend` - appointments, medical records, diagnoses, prescriptions.
- `apps/patient-backend` - registration, profile, appointment booking, medical history, prescriptions.
- `apps/secretary-backend` - scheduling/rescheduling, queue management, billing/invoices.
- `apps/admin-backend` - analytics, staff management, system activity logs.
- `database` - relational schema, initialization and seed scripts.
- `packages/common` - shared database connection, password hashing, signed token authentication, role middleware and auditing.

## Requirements

Node.js 22+ is required because the database uses the built-in `node:sqlite` API. The application dependencies are Express and CORS; environment variables are loaded with Node's built-in `.env` support.

## Setup

```bash
npm install
cp .env.example .env
npm run db:init
npm run db:seed
npm run audit
npm run syntax
```

Start services in separate terminals:

```bash
npm run start:doctor     # http://localhost:4001
npm run start:patient    # http://localhost:4002
npm run start:secretary  # http://localhost:4003
npm run start:admin      # http://localhost:4004
```

All services expose `/health` and `/api/auth/login`. Login returns a signed bearer token. Passwords are stored as salted `scrypt` hashes, never plaintext.

## Demo accounts

These are for local development only. Change them before any real deployment.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@clinic.local` | `Admin@12345` |
| Doctor | `doctor@clinic.local` | `Doctor@12345` |
| Secretary | `secretary@clinic.local` | `Secretary@12345` |
| Patient | `patient@clinic.local` | `Patient@12345` |

## Endpoint map

### Doctor backend - port 4001

- `GET /api/doctor/appointments`
- `POST /api/doctor/medical-records`
- `PUT /api/doctor/medical-records/:id`
- `POST /api/doctor/prescriptions`
- `GET /api/doctor/patients/:patientId/medical-history`

### Patient backend - port 4002

- `POST /api/patients/register`
- `GET /api/patients/me`
- `PUT /api/patients/me`
- `GET /api/patients/medical-history`
- `GET /api/patients/prescriptions`
- `POST /api/appointments/book`
- `GET /api/appointments`

### Secretary backend - port 4003

- `POST /api/secretary/patients/walk-in`
- `POST /api/secretary/appointments`
- `PUT /api/secretary/appointments/:id`
- `GET /api/secretary/queue`
- `PATCH /api/secretary/queue/:id/status`
- `POST /api/secretary/billing`
- `GET /api/secretary/billing/:id`

### Admin backend - port 4004

- `GET /api/admin/analytics`
- `GET /api/admin/staff`
- `POST /api/admin/staff`
- `PUT /api/admin/staff/:id`
- `DELETE /api/admin/staff/:id` (soft-deactivates staff to preserve history)
- `GET /api/admin/logs`
- `GET /api/admin/settings`
- `PUT /api/admin/settings`

## Database

The database implements the requested core tables:

`users`, `doctors`, `patients`, `appointments`, `medical_records`, `prescriptions`, `billing`

and adds `audit_logs` to support administrative monitoring/security requirements.

Foreign keys, indexes, status constraints, uniqueness checks and duplicate appointment-slot validation are included.

## Frontend integration

The APIs are JSON REST endpoints intended to be consumed by the provided pure HTML/CSS/JavaScript frontend with `fetch` and a bearer token in the `Authorization` header. CORS is configurable with `FRONTEND_ORIGIN` in `.env`.

Because the provided frontend archive is a RAR5 file and this build environment has no RAR5 extractor, the frontend source could not be unpacked and executed here. The backend package therefore includes the requested API contract and CORS configuration, but the existing frontend's browser-level integration could not be truthfully marked as verified.

## Verification

`npm run audit` performs a structural requirements check for the four backends, database tables, auth middleware, validation/error handling, README and repository hygiene.

`npm run syntax` runs `node --check` across every JavaScript source file.

See `docs/requirements-audit.md` for the latest generated audit report.
