# Claude Code Prompt: Billy Business Review App (Node.js / cPanel)

## Project Overview

Build a **Business Review Dashboard** as a **Node.js web application** that connects to the **Billy (billy.dk) accounting API v2** to deliver clean, actionable P&L reporting and cashflow monitoring across **weekly, monthly, and yearly** time horizons.

This application will be deployed to **cPanel** using its built-in **Node.js App** support (Passenger/Phusion), with all Billy API calls made **server-side** to keep the API token secure.

---

## Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Templating:** EJS (server-rendered HTML)
- **HTTP Client:** Axios (for Billy API calls, server-side only)
- **Styling:** Plain CSS (no build step) — clean, minimal dashboard aesthetic
- **Charts:** Chart.js via CDN (client-side rendering only)
- **Config:** dotenv for environment variables
- **cPanel Entry Point:** `app.js`

---

## cPanel Deployment Requirements

- Entry point file must be named **`app.js`** (cPanel Passenger looks for this by default).
- The app must read the `PORT` from the environment: `process.env.PORT || 3000`
- No build step required — EJS templates render on the server and are served directly.
- All dependencies listed in `package.json` — cPanel runs `npm install` automatically.
- Store the Billy API token in a **`.env`** file in the project root (never committed to git).
- The `.env` file is created manually on the server via cPanel File Manager or SSH.

---

## Project File Structure

```
/
├── app.js                    # Express app entry point (Passenger-compatible)
├── package.json
├── .env                      # BILLY_API_TOKEN=xxxx (created manually on server)
├── .gitignore                # node_modules, .env
│
├── routes/
│   ├── index.js              # GET / → redirect to /dashboard
│   └── dashboard.js          # GET /dashboard?period=weekly|monthly|yearly
│
├── services/
│   └── billyService.js       # All Billy API calls (axios, server-side only)
│
├── utils/
│   ├── dateUtils.js          # Period date range helpers
│   └── formatters.js         # Currency and percentage formatting
│
└── views/
    ├── layout.ejs            # Base HTML shell (nav, head, scripts)
    ├── dashboard.ejs         # Main dashboard view
    ├── settings.ejs          # API token settings page
    └── partials/
        ├── pl-report.ejs     # P&L report card partial
        └── cashflow.ejs      # Cashflow card partial
│
└── public/
    ├── css/
    │   └── style.css         # All app styles
    └── js/
        └── charts.js         # Chart.js initialisation (client-side only)
```

---

## Environment Variables (`.env`)

```
BILLY_API_TOKEN=your_billy_access_token_here
```

Load with `dotenv` at the top of `app.js`:
```js
require('dotenv').config();
```

---

## `app.js` — Entry Point

```js
require('dotenv').config();
const express = require('express');
const app = express();

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use('/', require('./routes/index'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/settings', require('./routes/settings'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
```

---

## `services/billyService.js` — Billy API Integration

Base URL: `https://api.billysbilling.com/v2`
Auth header: `X-Access-Token: <BILLY_API_TOKEN>`

Implement the following functions, all returning parsed JSON:

### `getOrganisation()`
```
GET /v2/organization
```
Returns org name and `baseCurrency.id` (e.g. `"DKK"`).

### `getInvoices(startDate, endDate)`
```
GET /v2/invoices
  ?state=approved
  &minEntryDate={startDate}
  &maxEntryDate={endDate}
  &pageSize=1000
```
Returns array of invoices. Each has `amount`, `tax`, `isPaid`, `balance`.

### `getBills(startDate, endDate)`
```
GET /v2/bills
  ?state=approved
  &minEntryDate={startDate}
  &maxEntryDate={endDate}
  &pageSize=1000
```
Returns array of bills. Each has `amount`, `tax`, `isPaid`, `balance`.

### `getBankPayments(startDate, endDate)`
```
GET /v2/bankPayments
  ?minEntryDate={startDate}
  &maxEntryDate={endDate}
  &pageSize=1000
```
Returns array of payments. Each has `cashAmount` and `cashSide` (`"debit"` or `"credit"`).

---

## `utils/dateUtils.js` — Period Logic

Implement three functions that return `{ startDate, endDate }` as `"YYYY-MM-DD"` strings:

| Function | Range |
|---|---|
| `getWeeklyRange()` | Monday → Sunday of current week |
| `getMonthlyRange()` | 1st → last day of current month |
| `getYearlyRange()` | Jan 1 → Dec 31 of current year |

Also implement a `getPreviousPeriodRange(period)` function that returns the same range one period back (previous week / previous month / previous year), used for trend comparison.

---

## `routes/dashboard.js` — Main Route

`GET /dashboard?period=weekly` (default: `monthly`)

This route should:

1. Read `period` from query string (`weekly`, `monthly`, `yearly`).
2. Compute current and previous period date ranges using `dateUtils`.
3. Call `billyService` in **parallel** using `Promise.all` for:
   - Current period: invoices, bills, bankPayments
   - Previous period: invoices, bills (for trend comparison)
4. Aggregate the data server-side:

**P&L Aggregations:**
```
totalRevenue         = sum of invoice.amount (all approved invoices)
collectedRevenue     = sum of invoice.amount where isPaid === true
outstandingRevenue   = totalRevenue - collectedRevenue

totalExpenses        = sum of bill.amount (all approved bills)
paidExpenses         = sum of bill.amount where isPaid === true
outstandingExpenses  = totalExpenses - paidExpenses

grossProfit          = totalRevenue - totalExpenses
profitMargin         = (grossProfit / totalRevenue) * 100  [handle division by zero]
```

**Cashflow Aggregations:**
```
cashIn               = sum of bankPayment.cashAmount where cashSide === "debit"
cashOut              = sum of bankPayment.cashAmount where cashSide === "credit"
netCashflow          = cashIn - cashOut
```

**Trend Badges:**
```
revenueTrend         = compare totalRevenue vs previous period totalRevenue → "up" | "down" | "flat"
expenseTrend         = compare totalExpenses vs previous period totalExpenses → "up" | "down" | "flat"
```

5. Render `dashboard.ejs` passing all aggregated values plus the raw chart data arrays.

---

## Views

### `views/dashboard.ejs`

Render a two-section layout:

#### Section 1 — P&L Report Card

```
┌────────────────────────────────────────┐
│  P&L Report  [Weekly | Monthly | Yearly] (tabs as links)
├────────────────────────────────────────┤
│  REVENUE                               │
│  Total Invoiced          DKK 12,500.00 │
│  Collected               DKK  9,800.00 │
│  Outstanding             DKK  2,700.00 │
├────────────────────────────────────────┤
│  EXPENSES                              │
│  Total Bills             DKK  7,200.00 │
│  Paid                    DKK  5,100.00 │
│  Payables                DKK  2,100.00 │
├────────────────────────────────────────┤
│  GROSS PROFIT            DKK  5,300.00 │
│  PROFIT MARGIN                  42.4%  │
└────────────────────────────────────────┘
```

- Revenue rows styled in green. Expense rows in amber/red. Profit row bold — green if positive, red if negative.
- Period tabs are simple `<a href="/dashboard?period=weekly">` links, styled as active tabs.
- Trend arrows (↑ ↓ →) next to Revenue and Expenses totals based on `revenueTrend` / `expenseTrend`.

#### Section 2 — Cashflow Monitor Card

```
┌────────────────────────────────────────┐
│  Cashflow Monitor                      │
├────────────────────────────────────────┤
│  Cash In                 DKK  9,800.00 │
│  Cash Out                DKK  5,100.00 │
│  ─────────────────────────────────── │
│  Net Cashflow            DKK  4,700.00 │
│                                        │
│  [Horizontal Bar Chart - Chart.js]     │
│                                        │
│  🟢 Receivables Due      DKK  2,700.00 │
│  🔴 Payables Due         DKK  2,100.00 │
└────────────────────────────────────────┘
```

Pass `cashIn` and `cashOut` to the client as a JSON data attribute on the chart canvas element so `public/js/charts.js` can initialise the Chart.js horizontal bar chart without an extra API call.

### `views/settings.ejs`

A simple form page to update the `.env` token is **not recommended** in production (writing to `.env` from the app is fragile in cPanel). Instead, this page should:

- Display the currently configured token (masked: show only last 6 chars).
- Show the live connection status: call `getOrganisation()` on page load and display org name or an error.
- Provide a link: "To update your token, edit the `.env` file via cPanel File Manager and restart the Node.js app."

---

## `public/css/style.css`

Write clean, minimal CSS with no external framework. Key rules:

- White background, `#1e3a5f` (dark navy) for headers and key figures.
- Card components with `border-radius: 8px`, subtle `box-shadow`.
- Responsive layout using CSS Grid — single column on mobile, two-column on desktop.
- Green: `#16a34a`, Red: `#dc2626`, Amber: `#d97706`.
- Clean sans-serif font stack: `system-ui, -apple-system, sans-serif`.

---

## `package.json` Dependencies

```json
{
  "name": "billy-business-review",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "dotenv": "^16.3.0",
    "ejs": "^3.1.9",
    "express": "^4.18.2"
  }
}
```

---

## Error Handling

- Wrap all `billyService` calls in `try/catch`. If the API call fails (invalid token, network error), render the dashboard with empty/zero values and a visible error banner at the top: `"Could not connect to Billy API. Check your token in Settings."`
- If `BILLY_API_TOKEN` is not set in `.env`, show a redirect to `/settings` with a warning message.
- Handle division-by-zero in profit margin (return `0` if revenue is `0`).

---

## cPanel Deployment Notes for Claude Code

When this application is ready, the deployment steps on cPanel are:

1. Upload the project files (excluding `node_modules` and `.env`) via cPanel File Manager or Git.
2. In cPanel → **Node.js App**, create a new app:
   - Node.js version: 18+
   - Application root: `/path/to/project`
   - Application URL: your domain or subdomain
   - Application startup file: `app.js`
3. Click **Run NPM Install** inside the cPanel Node.js App interface.
4. Create a `.env` file in the project root via File Manager and add: `BILLY_API_TOKEN=your_token_here`
5. Start the application.

---

## Billy API Reference

- **Base URL:** `https://api.billysbilling.com/v2`
- **Auth:** `X-Access-Token` header (permanent token from Billy → Settings → Access Tokens)
- **Docs:** https://www.billy.dk/api/
