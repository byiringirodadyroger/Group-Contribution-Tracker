# Group Contribution Tracker — web client

## Run locally

From the repository root in PowerShell:

```powershell
Set-Location client
npm.cmd install
npm.cmd run dev
```

The Vite development server proxies `/api` and `/socket.io` to
`http://localhost:5000`. Start the API server separately before signing in.

For a deployed API, set `VITE_API_URL` to its HTTPS origin before building
(for example, in the Vercel project environment variables). The API must allow
credentialed requests from the deployed site.

```powershell
npm.cmd run build
npm.cmd run preview
```

## Account access

There is no public self-activation. A member selects their existing group
profile and creates login credentials. They can sign in to submit an access
request, but the account remains restricted until Roger approves it. Approved
accounts can then view the dashboard and payment history.

## Pages

- Overview: group and individual progress with Socket.IO refreshes.
- Members and member detail: contribution summaries and recent payments.
- Payment history: searchable filters, date range, method, sorting and pages;
  administrators can edit or delete records.
- Record contribution: administrator only.
- Account settings: password change.
- Administration: approve or reject access requests.
