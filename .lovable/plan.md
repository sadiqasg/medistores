# Complete the Medina Stores UI

## Goal
Replace the starter page with the secure, mobile-friendly Medina Stores ledger application, using the existing database, access rules, currency setting, and six-color visual system.

## Screens and workflows
- Add email/password sign-in, account creation, magic-link access, and password reset at `/auth`.
- Protect all operational pages behind sign-in and send each role to the right starting view.
- Build the role-aware dashboard with period filters, KPI totals, 12-month revenue chart, top products, recent sales, low-stock summary, and admin-only recent distributions.
- Build inventory management: searchable catalog, add/edit products, stock-in and stock-out forms, low-stock indicators, valuation, and transaction history.
- Build sales management: multi-item sale cart, editable line prices, payment details, sales history and filters, receivables view, and admin void flow with a required reason.
- Build expenses: add and review expenses with date/category filters and optional receipt upload where storage is available.
- Build Profit & Loss: period comparison, revenue/COGS/gross profit/expenses/net profit statement, percentage changes, and CSV/print-friendly export.
- Build distributions: ownership summary, payout ledger, new distribution flow, statuses, balances, and admin-only stakeholder/share management.
- Build the family view at `/my-payouts`, limited to the signed-in stakeholder’s own payouts and balance unless shared visibility is enabled.
- Build settings for business details, configurable currency/categories, shared visibility, user roles, ownership history, and CSV data export.

## Shared experience
- Keep the ledger visual direction: flat ruled sheets, precise tables, serif headings, sans UI text, and mono-formatted numbers.
- Load IBM Plex Serif, Sans, and Mono correctly without changing the six-token palette.
- Improve the navigation for phones, show the signed-in account state, and clear protected cached data on sign-out.
- Add reusable filters, form fields, loading/empty/error states, confirmations, and success/error notices.
- Use the saved business currency everywhere; no hardcoded currency symbols in screens.

## Data and access behavior
- Use the existing row-level access rules for every read and write; UI controls will also reflect admin, staff, and family-viewer permissions.
- Use the existing atomic sale and void operations so stock cannot go negative and voids restore inventory.
- Record stock movements through inventory transactions rather than directly changing stock totals.
- Treat distributions as profit draws, never operating expenses.
- Validate ownership totals before saving and preserve effective-date history.
- Avoid exposing financial datasets on pages the current role cannot access.

## Routes and metadata
- Create the protected route layout and all requested route files together so navigation never points to missing pages.
- Replace `/` with a session-aware entry page that sends signed-in users to the dashboard and signed-out users to authentication.
- Give every content route unique Medina Stores title, description, Open Graph, and Twitter metadata.

## Verification
- Check the generated route tree and preview build after implementation.
- Exercise sign-in and representative role flows in the live preview.
- Verify dashboard, forms, dialogs, tables, exports, mobile navigation, and desktop layouts at phone and desktop sizes.
- Confirm there are no runtime, console, network, or current build errors before completion.
