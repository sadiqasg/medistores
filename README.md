# Medina Ledger

Medina Stores Dashboard — Product & System Requirements

1. Overview

Product name: Medina Stores Dashboard Business context: Medina Stores is a family-owned distributor of Coca-Cola products. The dashboard is an internal tool (not customer-facing) used to run the business: track inventory, record sales, calculate profit & loss, and manage how profit is distributed among family stakeholders (including recurring shares sent to two siblings for their upkeep).

Primary goal: Replace spreadsheets/manual tracking with a single, secure, real-time system that gives the owner/operator full visibility into stock, sales, profitability, and family profit-sharing — with a clear, auditable record of who has received what.

Tech stack (fixed):

Frontend: React + TypeScript + Tailwind CSS (Lovable default)

Backend: Supabase (Postgres, Auth, Row-Level Security, Edge Functions, Storage)

Hosting: Lovable-managed hosting, with GitHub sync enabled for version control

2. Users & Roles

Role Description Access Owner/Admin Primary operator (you). Full control. All modules, all data, can manage users and shares Family Member (Viewer) The 2 siblings and any other stakeholders Read-only access to their own share/payout history and high-level business summary (configurable — see 5.6) Staff (optional, future) Someone who logs day-to-day sales/inventory Can create sales & inventory entries only; no access to P&L or profit distribution

Auth is handled via Supabase Auth (email/password + optional magic link). Every table enforces Row-Level Security based on role, stored in a profiles table linked to auth.users.

3. Core Modules

3.1 Authentication & User Management

Email/password login via Supabase Auth

Roles: admin, family_viewer, staff

Admin can invite users and assign roles from a Settings screen

Password reset flow

Session persists across visits (no unnecessary re-login)

3.2 Dashboard / Analytics (Home)

Landing page after login, role-aware:

KPI cards: Total Revenue (This Month), Total Cost of Goods Sold, Gross Profit, Net Profit, Current Inventory Value, Low Stock Alerts count

Revenue trend chart (line, last 12 months, filterable by date range)

Top-selling products (bar chart, by volume and by revenue)

Recent sales feed (last 10 transactions)

Recent profit distributions feed (last 5, admin only)

Date range filter (This Week / This Month / This Quarter / This Year / Custom)

3.3 Inventory Management

Product catalog: name, SKU, category (e.g., Coca-Cola, Fanta, Sprite, crates vs bottles), unit type (crate/case/bottle), cost price, selling price, reorder threshold

Stock levels per product, updated automatically by sales and restocks

Stock In (restocking): record supplier, quantity, cost per unit, date, optional invoice/reference number

Stock Out (adjustments): for damages, expiry, internal use — with a required reason field

Low-stock alert when quantity falls below reorder threshold

Full inventory transaction history (audit trail: who changed what stock, when, why)

Inventory valuation report (current stock × cost price)

3.4 Sales Management

Record a sale: date, product(s) + quantity, unit price (editable per sale in case of discounts), customer name/reference (optional), payment method (cash/transfer/credit), payment status (paid/partial/owing)

Support multi-item sales (one sale, multiple products/quantities) — cart-style entry

Auto-decrement inventory on sale confirmation

Sales list with filters: date range, product, payment status, customer

Outstanding balances view (customers who owe money) — "Accounts Receivable" lite

Sales returns/void with reason logging (should not silently delete records — mark as voided, keep audit trail)

3.5 Profit & Loss (P&L)

Automatically computed from Sales (revenue), Inventory cost data (COGS), and a manually-entered Expenses module (rent, transport, salaries, utilities, etc.)

Expenses module: date, category, amount, description, optional receipt upload (Supabase Storage)

P&L statement view: Revenue − COGS = Gross Profit; Gross Profit − Operating Expenses = Net Profit

Filterable by period (monthly, quarterly, yearly, custom range)

Exportable as PDF or CSV

Comparison view: this period vs. previous period (% change)

3.6 Profit Distribution / Family Shares Ledger

This is the most sensitive module — restrict visibility carefully.

Ownership/Share configuration: define each stakeholder (owner + 2 siblings + anyone else) and their agreed share/percentage of distributable profit. Store as a versioned table (so historical changes to share % are preserved, not overwritten) — e.g. ownership_shares with effective_from date.

Distribution records: each time profit is taken out and sent to a sibling (or any stakeholder) for upkeep, record:

Stakeholder name

Amount

Date

Source period it's drawn from (e.g. "September 2026 profit")

Payment method/reference (bank transfer ref, etc.)

Notes

Status (pending / sent / confirmed received)

Per-stakeholder running ledger: total entitled (based on share % × net profit since last distribution), total paid out, balance owing/overpaid — so it's always clear if a sibling is "ahead" or "behind" their entitled share.

Summary report: total distributed to each stakeholder over any date range, with running totals since inception.

Each family member (viewer role) can log into their own read-only view showing only their own distribution history and current balance — not other siblings' data, and not full company financials, unless the admin chooses to change that.

3.7 Settings

Manage users & roles

Manage product categories

Manage ownership/share percentages (with history)

Business profile (name, logo, currency — default to your local currency, make it a configurable setting, not hardcoded)

Data export (CSV backups of core tables)

4. Data Model (guidance for Supabase schema)

Core tables (Lovable/Supabase should create these with appropriate foreign keys and RLS):

profiles — id (uid), full_name, role, linked_stakeholder_id (nullable, links to ownership_shares if this user is a sibling)

products — id, name, sku, category, unit_type, cost_price, selling_price, reorder_threshold, is_active

inventory_transactions — id, product_id, type (stock_in/stock_out/sale_deduction/adjustment), quantity, unit_cost, reference, reason, created_by, created_at

sales — id, sale_date, customer_name, payment_method, payment_status, total_amount, is_voided, created_by, created_at

sale_items — id, sale_id, product_id, quantity, unit_price, subtotal

expenses — id, date, category, amount, description, receipt_url, created_by

ownership_shares — id, stakeholder_name, share_percentage, effective_from, effective_to (nullable)

profit_distributions — id, stakeholder_id, amount, source_period, date, payment_reference, status, notes, created_by

audit_log — id, table_name, record_id, action, changed_by, changed_at, old_value, new_value (recommended for inventory + distribution changes, given financial sensitivity)

Row-Level Security rules to build in:

family_viewer role: SELECT only, restricted to their own rows in profit_distributions (via linked_stakeholder_id); no access to expenses, inventory_transactions, or other stakeholders' distribution rows.

staff role: INSERT on sales, sale_items, inventory_transactions (stock_in/out only); no SELECT on expenses or profit_distributions.

admin role: full access.

5. Key Business Rules

Inventory quantities must never go negative — block a sale if stock is insufficient (or require explicit admin override with a warning).

Voided sales must restore inventory quantities.

Net profit for distribution purposes = Net Profit per P&L for the selected period, before any distributions already paid out are subtracted a second time — distributions are a draw against profit, not an expense line in the P&L.

Share percentages must always sum to 100% at any point in time; validate this when editing ownership_shares.

All monetary fields use a single currency, configurable in Settings, applied consistently across the app (no hardcoded currency symbols in components).

Family viewers should never see other stakeholders' individual payout amounts unless the admin explicitly enables a "shared visibility" setting.

6. Non-Functional Requirements

Security: RLS enforced on every table; no sensitive financial data ever fetched client-side without a role check. Auth required for all routes.

Responsiveness: Fully usable on mobile (siblings may check their balance from their phones).

Performance: Dashboard KPIs should load in under 2 seconds for typical data volumes (hundreds to low thousands of transactions/month).

Auditability: Inventory and profit-distribution changes should be logged (who/when/what changed), given the financial sensitivity of family shares.

Data integrity: Use database constraints (foreign keys, check constraints on percentages/quantities) rather than relying solely on frontend validation.

Backups: Rely on Supabase's automated backups; also expose a manual CSV export option for peace of mind.

7. Screens/Pages List

Login / Sign up (invite-only signup preferred)

Dashboard (home)

Inventory — Product list, Stock In, Stock Out, Transaction history

Sales — New Sale, Sales list, Outstanding balances

Expenses — list + add

Profit & Loss — statement view with filters and export

Profit Distribution — Ledger (admin view), Add distribution, Ownership/share settings

My Payouts (family viewer's personal view)

Settings — Users, Categories, Business profile, Shares

8. Out of Scope (v1)

Customer-facing storefront or ordering portal

Multi-warehouse/multi-location inventory (single location assumed for v1)

Automated bank integration/reconciliation

Tax filing/computation beyond basic expense categorization

Mobile app (web-responsive is sufficient for v1)

9. Success Criteria

Owner can fully replace manual/spreadsheet tracking within the first month of use.

Every profit distribution to a sibling is logged and reconcilable against the P&L for that period.

Inventory counts stay accurate (no drift) because all stock movements flow through the system rather than being tracked separately.

Siblings can independently check their own payout history without needing to ask the owner.

10. Build Notes for Lovable

Scaffold the Supabase schema and RLS policies from Section 4 before generating UI screens — get the data model right first.

Build in this order: Auth/roles → Inventory → Sales (depends on Inventory) → Expenses → P&L (depends on Sales + Inventory + Expenses) → Profit Distribution (depends on P&L) → Settings.

Explicitly prompt for RLS policies at each table-creation step; don't assume Lovable will lock down family_viewer access correctly without being told the exact restriction.

Treat this document as the source of truth — paste relevant sections in as you build each module rather than the whole document at once, so Lovable isn't overwhelmed in a single prompt.

Also seed default user for one admin, so I can login and test. 

Important note: I don't want a single shadow and border colours, like all AI-built sites look like. For font and colours, my thoughts:

Given the subject — a family-run Coca-Cola distributor's internal ops/finance tool — I'd steer away from generic "SaaS dashboard" look (rounded cards + soft grey shadows + one accent color everywhere) and lean into what this actually is: a ledger. Precise numbers, inventory counts, money moving between family members. It should feel trustworthy and exact, with a bit of warmth since it's family, not a faceless corporate tool.

Colors

Token Hex Use Ink #1C2B33 Primary text, dark surfaces, headers Ledger Paper #EEEAE0 Background — a duller, greyer stone tone (not the cliché warm-cream you see in most AI output) Crate Red #A63A2E Primary actions, key CTAs — a muted brick-red, a nod to Coca-Cola crates without mimicking the trademark's vivid red Bottle Green #35563F Positive figures — profit, stock healthy, payout confirmed Warning Ochre #B8862F Low stock, pending/unconfirmed distributions Steel Blue #2E4756 Secondary structure — links, selected states, chart secondary series

Red = action/attention, green = good financial position, ochre = needs attention. Keep it to these six; don't let extra accent colors creep in on charts or badges.

Typography — one family, three roles, so everything feels cohesive but purposeful:

IBM Plex Serif — headlines, section titles, the P&L statement header. Gives it a "ledger book" gravity instead of a generic SaaS feel.

IBM Plex Sans — all UI text: labels, buttons, nav, body copy.

IBM Plex Mono — every number: prices, quantities, percentages, table figures. Tabular figures so columns of numbers actually align — this matters a lot for a financial/inventory table and is the detail that makes it feel built for the job rather than templated.

Why this combination: the Plex family was designed for IBM's technical/engineering documentation, so it naturally reads as precise and operational rather than trendy — appropriate for something family members will use to check money and stock, not a marketing site. Using mono specifically for numbers (not just as a data-label accent) is the functional choice that actually helps: eyes can scan a column of stock counts or shillings/naira/dollars and trust they line up.

Layout note: left-align everything except number columns in tables, which should be right-aligned within Plex Mono's tabular figures. Avoid rounding every card the same radius — reserve rounded corners for interactive elements (buttons, inputs) and keep data tables and statement views closer to flat, hairline-bordered ledger sheets.

One thing worth deciding before you lock this in: what's the actual home currency (₦, $, etc.)? It affects number formatting and column widths in the P&L and distribution ledger, so worth setting in Supabase config early rather than hardcoding a symbol.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9bfcdcd9-e6b1-474f-a717-daa8ce139f93).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
