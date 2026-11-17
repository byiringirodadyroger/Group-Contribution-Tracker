# Group Contribution Tracker API

Node.js, Express, MongoDB/Mongoose, and Socket.IO backend for an RWF contribution
group. It starts with six member profiles, and administrators can add more.
All API routes are under `/api`. This directory is
self-contained; the frontend should use the deployed API origin as its base URL.

## Requirements and configuration

- Node.js 20+
- A reachable MongoDB database. Set `MONGODB_URI` to its connection string.
  The service does not start without a working MongoDB connection.
- Copy `.env.example` to `.env` and set independent, randomly generated values
  for `JWT_SECRET` and `BOOTSTRAP_SETUP_SECRET` (at least 32 characters each).
- Set `CORS_ORIGINS` to the exact frontend origin(s), comma-separated, including
  scheme and any port. The Vite development default is
  `http://localhost:5173`. The API uses credentialed CORS; do not use `*`.
- Optional: set `ALLOWED_IPS` to a comma- or newline-separated allowlist of
  trusted client IPs. When set, the API rejects requests from any other IP after
  honoring `X-Forwarded-For` and `TRUST_PROXY` when enabled.
- For a frontend and API on different sites, configure HTTPS, set
  `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true`. Same-site local development
  defaults to `lax` and non-secure cookies. Set `COOKIE_DOMAIN` only when needed.
- `REGULAR_MEMBER_NAMES` optionally sets the five regular members. It must
  contain exactly five distinct names other than Roger. The defaults are
  `Jean Bosco`, `Ildebrand`, `Vivant`, `Shema`, and `Renne Shaffy`; Roger is
  the sixth member and administrator. Each seeded member has a fixed target of
  20,000 RWF.
- If TLS terminates at a trusted reverse proxy and rate limits should use the
  forwarded client IP, set `TRUST_PROXY=true` and configure the proxy to
  overwrite forwarded headers.

Install and run:

```sh
npm install
npm test
npm run lint
npm start
```

For local development, start MongoDB and use `npm run dev`. The server binds to
`PORT` (default `4000`). The health endpoint is `GET /api/health`.

## One-time initial setup

The database must be empty. Create Roger's administrator account and all six
member records with:

```sh
curl -X POST http://localhost:4000/api/auth/setup/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Setup-Secret: $BOOTSTRAP_SETUP_SECRET" \
  -d '{"username":"admin@example.com","adminPassword":"choose-a-unique-strong-password"}'
```

Set `username` to the administrator's email address to use it for sign-in (or
use a traditional username). The `adminPassword` is supplied by the operator
and is never stored in source code or returned. The endpoint requires the setup secret, is rate-limited, and can complete only
once; it also refuses to seed a non-empty database. Protect
the setup secret and remove it from the runtime environment after initialization.
There is no public admin signup or self-approval. Roger's seeded administrator
account is immediately active. Public applications can only claim an available
regular member profile. Administrators can add profiles from Account management;
new profiles are immediately available for registration and have a 20,000 RWF
target. Registration creates a `registered` account; the member
then signs in and calls `POST /api/auth/request-access`, changing the account
status to `pending`. Roger can approve only pending access requests.

## Authentication and account approval

Passwords are hashed with bcrypt. Successful login sets an HTTP-only,
SameSite-configurable JWT cookie. Browser clients must send credentials
(`credentials: "include"` / `withCredentials: true`) for login and subsequent
requests. Logout clears the cookie. Password changes invalidate existing tokens.
API clients may send credentials in the Authorization header instead of using the cookie.

Registered and pending accounts can sign in and use `/api/auth/me` to inspect
their status. They cannot access group, payment, admin, or Socket.IO features
until an administrator approves the pending request. Inactive accounts cannot
sign in. Names must match an available regular member. Both the username and
member ownership are unique.

## API

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | `{name, username, password, memberId}` or `memberName`; creates `registered` account |
| POST | `/api/auth/login` | Public | `{username, password}` where username may be an email address; sets auth cookie |
| POST | `/api/auth/logout` | Public | Clears auth cookie |
| GET | `/api/auth/me` | Signed in | Current account, including restricted status |
| POST | `/api/auth/request-access` | Signed in | Changes `registered` account to `pending` |
| POST | `/api/auth/change-password` | Signed in | `{currentPassword, newPassword}` |
| GET | `/api/auth/registration-options` | Public | Available regular members |
| GET | `/api/dashboard` | Approved user | Group and per-member contribution totals |
| GET | `/api/members` | Approved user | Active members with targets and totals |
| GET | `/api/members/:id` | Approved user | Member details and latest 50 payments |
| GET | `/api/payments` | Approved user | Filterable, paginated payment history |
| POST | `/api/payments` | Admin | Creates a payment |
| PATCH | `/api/payments/:id` | Admin | Updates a payment |
| DELETE | `/api/payments/:id` | Admin | Deletes a payment |
| GET | `/api/admin/accounts` | Admin | Lists accounts; optional `?status=registered|pending|active|inactive` |
| PATCH | `/api/admin/accounts/:id/approval` | Admin | `{status:"active"}` approves pending account; `"inactive"` deactivates |
| PATCH | `/api/admin/accounts/:id/status` | Admin | `{status:"inactive"}` deactivates an account |
| DELETE | `/api/admin/accounts/:id` | Admin | Removes only an unrequested or rejected account, freeing its member profile |
| GET | `/api/admin/members` | Admin | Lists all group member profiles |
| POST | `/api/admin/members` | Admin | `{name}` adds an available member profile with a 20,000 RWF target |

Payment history accepts `page`, `pageSize` (1-100), `memberId`, `from`, `to`,
`method`, and `sort` (`paidAt:asc`, `paidAt:desc`, `amount:asc`, or
`amount:desc`). Payment `amount` must be a positive safe integer in RWF.
Supported method keys are `mtn_mobile_money` (MTN Mobile Money), `airtel_money`
(Airtel Money), `cash` (Cash), `bank_transfer` (Bank transfer), and `other`
(Other). Create requests require a unique 8-128 character `Idempotency-Key`
header; transaction references are optional, but nonempty references must be
unique. Duplicate idempotency keys or references return HTTP 409.

`POST /api/payments` accepts `{memberId, amount, method, paidAt?,
transactionReference?, note?}` plus the `Idempotency-Key` header. The success
response is `{payment: {id, member, recordedBy, createdAt, amount, method,
paidAt, transactionReference, note}}`; `member` and `recordedBy` are each
`{id, name}`. `PATCH /api/payments/:id` accepts any subset of the same payment
fields; it returns the same `{payment: ...}` shape. `DELETE` returns 204 with no
body.

`GET /api/payments` returns
`{payments: [...], pagination: {page, pageSize, total, pages}}`. Each payment
has `{id, member: {id, name}, recordedBy: {id, name}, createdAt, amount,
method, paidAt, transactionReference, note}`. `recordedBy` is null only for
legacy records with no creator.

Login and `/api/auth/me` return `{user: {id, username, name, role, status,
member: {id, name}}}`. Registration returns
`{message, account: {id, username, name, role, status, member: {id, name}}}`;
new account status is `registered`. After an authenticated access request,
`/api/auth/me` reports `pending`.

The dashboard returns per-member entries under `members`, along with top-level
`totalCollected`, `remainingBalance`, `progressPercentage`, `fullyPaidMembers`,
`contributingMembers`, and `notContributedMembers`. The three `*Members` fields
are counts: fully paid means contribution is at least the target, contributing
means greater than zero, and not contributed means zero. The same metrics are
also returned under `totals`; the existing `contributed`, `remaining`, and
`progressPercent` aliases remain.

Payment create/update/delete operations are recorded in the audit collection.

After a payment has been saved and its audit record written, Socket.IO emits
`payment:created`, `payment:updated`, or `payment:deleted` to authenticated,
approved users. Socket connections use the same cookie/JWT and origin policy;
accounts that are deactivated are disconnected.

## Deployment notes

Provision MongoDB and environment variables before starting the process.
Deploy behind HTTPS, configure the exact frontend origin, and set cross-site
cookie settings as described above when the frontend and API use different
sites. Keep both secrets out of source control and rotate the setup secret after
the one-time seed. The source provides the API only; it does not provision
MongoDB, host the service, or deploy the frontend.
