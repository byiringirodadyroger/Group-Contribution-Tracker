# Group Contribution Tracker

A full-stack contribution tracker that starts with seven member profiles. Each
profile has a fixed target of **20,000 RWF**; Roger can add more profiles from
Administration when additional members join.
Members create an account for their group profile, sign in to request access,
and must be approved by Roger before they can view group data.

## Project layout

- `server/` — Express, Mongoose, JWT-cookie authentication, access control,
  payment history, audit logging, and authenticated Socket.IO updates.
- `client/` — React/Vite dashboard and member-facing pages.

See [server/README.md](./server/README.md) for API details and deployment
configuration, and [client/README.md](./client/README.md) for frontend setup.

## Run locally (Windows PowerShell)

### 1. Configure and start the API

Use Node.js 20 or newer. Start MongoDB locally or create a MongoDB Atlas
database, then configure the connection string and fresh secrets:

```powershell
Set-Location server
npm.cmd install
Copy-Item .env.example .env
notepad .env
```

In `server/.env`, set `MONGODB_URI`, generate independent random values of at
least 32 characters for `JWT_SECRET` and `BOOTSTRAP_SETUP_SECRET`, and use
`CORS_ORIGINS=http://localhost:5173` for the Vite development server. Never
commit `.env`.

Start the API:

```powershell
npm.cmd run dev
```

The API listens on `http://localhost:4000`. Keep it running.

### 2. Create the initial administrator and group profiles

In a second PowerShell window, enter the bootstrap secret and choose a strong,
unique password for Roger. The setup endpoint runs only once and refuses a
non-empty database.

```powershell
$setupSecretSecure = Read-Host "Bootstrap setup secret" -AsSecureString
$setupSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupSecretSecure)
$adminEmail = Read-Host "Admin email address"
$adminPasswordSecure = Read-Host "New Roger administrator password" -AsSecureString
$adminPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPasswordSecure)
try {
    $setupSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupSecretPointer)
    $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPasswordPointer)
    $body = @{ username = $adminEmail; adminPassword = $adminPassword } | ConvertTo-Json
    Invoke-RestMethod -Method Post `
        -Uri "http://localhost:4000/api/auth/setup/bootstrap" `
        -Headers @{ "X-Setup-Secret" = $setupSecret } `
        -ContentType "application/json" -Body $body
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupSecretPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPasswordPointer)
    Remove-Variable adminEmail, adminPassword, adminPasswordSecure, setupSecret, setupSecretSecure -ErrorAction SilentlyContinue
}
```

After successful setup, remove `BOOTSTRAP_SETUP_SECRET` from `server/.env` and
restart the API. Roger signs in with the email address configured above and the
password entered at the prompt. Login also accepts usernames. No production
password is supplied or stored in the source.

### 3. Start the frontend

```powershell
Set-Location ..\client
npm.cmd install
npm.cmd run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).
Roger can approve member account requests from **Administration**. Each regular
member selects their matching name when creating an account.
After signing in, they must submit an access request; group data remains
inaccessible until Roger approves it.

## Verify

```powershell
Set-Location ..\server
npm.cmd test
npm.cmd run lint
Set-Location ..\client
npm.cmd run build
npm.cmd audit
```

## Deploy

1. Provision MongoDB Atlas and create a database user with a strong password.
   Keep the connection string private.
2. Deploy `server/` to Render (Node service; build `npm ci`, start `npm start`),
   or create a service from [render.yaml](./render.yaml).
   Set `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`,
   `BOOTSTRAP_SETUP_SECRET`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, and
   `COOKIE_SAME_SITE=none` when the browser frontend and API are on separate
   sites. For reliable browser cookies, prefer custom frontend/API subdomains
   under the same registrable domain and keep `COOKIE_SAME_SITE=lax`. Use HTTPS
   and run the one-time bootstrap before removing the setup secret.
3. Deploy `client/` to Vercel (build `npm run build`, output `dist`). Set
   `VITE_API_URL` to the API's HTTPS origin and configure the API's
   `CORS_ORIGINS` to the exact frontend origin.
4. Share the deployed HTTPS frontend URL after testing sign-in, approval,
   payment permissions, and live updates.

The code is deployment-ready but this workspace has not been connected to a
user-owned MongoDB, Vercel, or Render account, so no public URL has been
provisioned. Keep payment writes restricted to the approved administrator;
the API enforces this independently of the frontend.
