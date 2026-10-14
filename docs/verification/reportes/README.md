# Reportes verification

Implementation and all verification ran from `D:\Ale Code\API 2 - Copy`.
Existing user administration changes, dashboard/navigation and Vite build entries were preserved.
Verification made no schema changes or live database writes. The implementation is saved in commit `50175c0`; verification evidence is committed separately. No push was made.

## Behavior

- `GET /reportes` supplies authorized laboratory options, aggregate counts, state/laboratory charts and a paginated joined ticket list.
- `GET /reportes/exportar` streams all tickets matching the applied filters as UTF-8 CSV, with quoted fields and protection against spreadsheet formulas.
- Details reuse `GET /tickets/{id}`; the single-page detail dialog shows the description and ticket metadata.
- Administrator: all tickets/labs. Lab leader: their lab. Technician: assigned tickets. Teacher: tickets they created. Inactive labs remain available for historical reporting; inaccessible labs return 404.
- Dates use Sonora time (UTC-7). Today means the local calendar day; last week/month mean 7/30 calendar days including today; this year begins January 1. Period filters use ticket creation dates and show each ticket's current lifecycle state.
- Comparison text uses the preceding interval of equal length with the same filters. It compares creation cohorts in their current states, not historical state snapshots. A zero comparison denominator shows an explicit zero-ticket message. All-history mode has no percentage comparison.
- Selecting filters does not apply them until Apply is clicked. Export and pagination use the last applied filters. Clear resets to all states/labs and the last 30 days.
- Loading, empty and failed requests never display old counts as current results. Export is disabled during requests and for empty/error results; Apply retries failures.

## Evidence

Focused suite: `backend/.venv/Scripts/python.exe -m pytest tests_reportes -q` from backend: **14 passed**.

Full suite: `backend/.venv/Scripts/python.exe -m pytest tests tests_admin tests_reportes -q` from backend: **47 passed, 2 pre-existing failures**:

- `test_jwks_fetch_bypasses_a_broken_system_proxy`: existing JWT proxy test expects `security.urllib`.
- `test_actualizar_estado_ticket`: obsolete `PUT /tickets/{id}` test receives 405.

Both failures were reproduced before implementation; no new failing tests.

Live read-only verification: `.venv/Scripts/python.exe tests_reportes/live_read_only.py` from backend, with the copy's API on port 8005. All six existing profiles passed database/API comparisons for all-history statistics, state/lab filters, every page, CSV and inaccessible details. Live dataset: 13 tickets, two laboratories. Admin profiles see 13; leader sees 6; technician and teacher each see 2.

Browser checks used the copy's Vite server on port 5176 and proxy to port 8005. Verified next-page navigation, page sizes 3/10, state/lab filters, clear, desktop/mobile detail dialogs, empty states, horizontal mobile table scrolling and CSV export. The captured CSV blob contained all four filtered closed tickets, including the ticket on page two. Mobile document width stayed at 390 CSS pixels with table overflow contained inside the card. Delayed and failed network requests verified loading/error/retry behavior. Production `npm run build` passed with Reportes and Usuarios included.

Authentication verification used temporary locally signed, expiring JWTs for existing database profiles and the existing Supabase session/API helper. No production authentication bypass was added. Those initial checks did not retest Supabase password login; the later automatic-capacity checks below did. Temporary token files were deleted.

## Screenshots

Captured and visually inspected before editing:

- [Original desktop](before-desktop.png)
- [Original mobile](before-mobile.png)

Captured and visually inspected during implementation:

- [Desktop](desktop.png)
- [Filtered desktop](filtered-desktop.png)
- [Filtered mobile](filtered-mobile.png)
- [Mobile](mobile.png)
- [Mobile charts/table/footer](mobile-table.png)
- [Empty desktop](empty-desktop.png)
- [Empty mobile](empty-mobile.png)
- [Desktop detail](detail.png)
- [Mobile detail](detail-mobile.png)
- [Loading](loading.png)
- [Simulated network error](error.png)

The live database currently contains no `En Proceso` tickets; focused tests exercise that state with actual SQLite records. CSV is the implemented export format. Large production datasets were not load-tested.

## Automatic page capacity update

The fixed page-size selector was removed. Reportes calculates how many complete rows fit in the table area, excluding the column header and pagination footer, and sends that value to backend pagination. A debounced ResizeObserver recalculates capacity when the available area changes. Resizing keeps the previous first visible ticket within the new page. On mobile the table card occupies one viewport of height within the existing scrolling single page. Text cells show up to two lines, with full text available in their title and ticket details.

The zero-denominator comparison now says `0 tickets en el período anterior` instead of `Sin base en período anterior`.

`node frontend/tests/reportes-capacity.cjs` passed against the running copy on ports 5173/8000 with actual Supabase password login. This check uses Playwright/Edge, the saved local test account, and live tickets. Playwright was installed only inside ignored `docs/local/browser-check`; alternatively set `PLAYWRIGHT_PATH` to an installed Playwright package.

Verified capacities: 1280×800 = 2 rows, 1440×1080 = 9, 1280×600 = 1, 390×844 = 15 (all 13 current tickets), and 320×568 = 9. No clipped rows or overflowing cards. Resize navigation, empty state and CSV download passed. The 14 focused backend tests and production build also passed after this update.

- [Automatic desktop pagination](adaptive-desktop.png)
- [Taller desktop with more rows](adaptive-tall.png)
- [Short desktop](adaptive-short.png)
- [Automatic mobile pagination](adaptive-mobile.png)
- [Small mobile](adaptive-small-mobile.png)
- [Automatic empty state](adaptive-empty.png)
