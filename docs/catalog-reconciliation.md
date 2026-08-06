# Catalog Reconciliation

Phase 4 of the client handover plan: the current `courses`/`course_job_roles`/`course_prerequisites`/`pricing` seed (`scripts/seed-catalog.mjs`, originally transcribed from the prototype's `mockData.ts`) checked programmatically against the three real region source documents in `/home/mk/some_doc/`:

- `_جدوله الاعداد للمقاولين المنطقة الوسطى -.xlsx` (Central)
- `_جدوله الاعداد للمقاولين المنطقة الشرقية.xlsx` (East)
- `_جدوله الاعداد للمقاولين المنطقة الجنوبية والغربية -.xlsx` (South/West)

Each file has three sheets: a pricing/scheduling sheet, a Distribution contractor training-and-certification matrix, and a Transmission (National Grid) matrix. The two matrix sheets are the authoritative source for job-role eligibility and prerequisites; the pricing sheet is the authoritative source for duration and regional day-rate pricing.

## Method

Parsed all 9 sheets programmatically (not by eye — column positions were mapped via header text, including merged-cell sub-headers for the four cable-voltage columns and the two "Auxiliary" columns) and diffed against a live export of the database. Two early false positives were caught and fixed before trusting the results: an OR-semantics prerequisite cell (`CSCC08/CSCC03`) that looked like a mismatch until split on `/`, and category-agnostic (`contractor_category = null`) courses initially compared against only one matrix sheet instead of both.

## Result: no data changes required

Every course/job-role/prerequisite row already matches its source-document row exactly:

- **Job-role eligibility**: zero mismatches across all 43 courses × both matrices, checked position-by-position against all 52 job roles (22 Distribution + 30 Transmission).
- **Prerequisites**: zero mismatches, including the 8 courses fixed in Phase 3 (OHS hard gate) — the matrix independently confirms `CSCC00` as their prerequisite.
- **Pricing**: every course explicitly listed in a region's pricing sheet (22 of 43) matches the seed's `duration_days × regional_day_rate` formula exactly, for all three regions (Central 500/day, East 450/day, South/West 550/day).
- **Job-role and course code counts**: the matrix's 22 Distribution / 30 Transmission role columns match `JOB_ROLE_ROWS` exactly, including the source's own typos and abbreviations (e.g. "Alram" for "Alarm", "Battary" for "Battery", "Maint. Electrician" for "Maintenance Electrician") — the seed's fuller titles are a deliberate, harmless normalization, not a divergence.

## Decisions

1. **`CSCC04`/`CSCC05` duration — client confirmed: keep 4 days.** The matrix sheet says 5 days in all three region files, but the pricing sheet in the same file prices both at 4 days (`CSCC04`: SAR 2,000 = 4 × 500; `CSCC05`: SAR 1,800 = 4 × 450) — the charged price only makes arithmetic sense at 4 days, so the matrix's "5" is treated as a source typo. No change needed; the seed already uses 4 days.
2. **North region pricing — client confirmed: keep the placeholder.** No source document exists for North at all (only Central/East/South-West). `REGIONAL_DAY_RATES.North` stays defaulted to the Central rate (500 SAR/day) until a real North rate is provided.

## Flagged for awareness, not blocking

3. **19 of 43 courses have no explicit price row in any region's pricing sheet** (all `CTCT*` technical certification tests, plus `CSCC17/24/27/28/29`). Their pricing is extrapolated using the same `duration_days × regional_day_rate` formula confirmed exact for the other 22 — a reasonable assumption given it holds without exception elsewhere, but not directly source-verified for these 19.
4. **`CTCT07`/`CTCT09`/`CTCT11`/`CTCT13`: blank rows in the Distribution matrix, not real courses.** Each has an empty title and requirement, sitting directly below `CTCT06`/`CTCT08`/`CTCT10`/`CTCT12` (the real 1KV/13.8KV/33KV/69KV cable-joint courses) with the same single role checked — a source-spreadsheet artifact (leftover/duplicate row), not a fifth course code to add. No action taken.
