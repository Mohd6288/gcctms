# Manufacturer-issued cards — the cable programme

## What this is

Four courses GCC Lab already runs — the Power Cable Joint and Termination
courses at 1KV, 13.8KV, 33KV and 69KV — award a **card printed by the
cable-accessory manufacturer** instead of a certificate this platform issues.
Everything else about them follows the workflow the platform already runs.

| Code | Course |
| --- | --- |
| CTCT06 | Installation of Power Cable Joint and Termination – 1KV |
| CTCT08 | … 13.8KV |
| CTCT10 | … 33KV |
| CTCT12 | … 69KV |

**These are existing catalog rows, not new ones.** An earlier draft of this work
created four duplicates under `CBLT-*` codes before checking, which would have
split every technician's cable history across two course ids and made any
report on it quietly wrong. That has been undone; a test now fails if a second
row with the same programme title ever appears.

## What actually differs from a normal course

Only the last third of the workflow:

1. The assessment is a **scored rubric** across two practical tests — the Cable
   Technician Evaluation form — not a single exam mark.
2. The evaluator can belong to the **manufacturer** rather than to GCC Lab.
3. The credential is a **physical card the manufacturer prints**. The platform
   sends them the pass list and records who collected a card. It never issues
   the card and must never claim to.

Requests, review, registration, invoicing, payment, scheduling and attendance
are unchanged. That is the point — there is no second pipeline.

---

## Part 1 — The request

### The form is an output, not a form to re-type

`نموذج طلب اختبار` asks for three blocks of information. The platform already
holds nearly all of it:

| Block | Where it comes from |
| --- | --- |
| Company: name (AR/EN), city, national address, tax number, email, contact person, mobile, affiliated activity | the company record, entered once at registration |
| Per technician: name, **occupation per Iqama**, ID/Iqama number, **courses obtained**, **dates obtained**, email | the employee record and the certificates already on file |
| The test: which course, new vs renewal, venue | the three genuinely new fields below |

So the contractor should **pick employees from a list**, and the platform fills
the rest. The paper form asks a contractor to *declare* which courses a
technician holds; the platform *knows*. Removing the declaration removes the gap
where a course gets claimed that was never taken.

**The completed form is then generated as a PDF** and stored against the request
as a `test_request_form` document — the record of what was requested, downloadable
by the contractor and the admin. This reuses the headless-Chromium HTML→PDF
pipeline that already renders certificates, so it needs no new dependency and
handles Arabic correctly, which is the part a spreadsheet library would get wrong.

### The three new fields

| Field | Column | Status |
| --- | --- | --- |
| Request type — إصدار جديد / تجديد | `training_requests.issuance_type` | column added, nothing writes to it yet |
| Venue | `training_requests.preferred_city` | already exists |
| External institute name — معهد خارجي | `training_requests.external_institute_name` | column added, nothing writes to it yet |

### Venue

The form offers four GCC Lab institutes or a named external one. The four cities
are already in the `cities` table and match exactly:

| City | Arabic | Region |
| --- | --- | --- |
| Riyadh | الرياض | Central |
| Jeddah | جدة | West |
| Abha | أبها | South |
| Dammam | الدمام | East |

The request screen offers those four plus **Other institute**, which reveals a
name field. Exactly one must be chosen, and choosing "Other" without naming the
institute is refused — an unnamed external venue cannot be scheduled, and a
request that reaches an admin with a blank venue costs a phone call.

Both go on the generated form.

### Why renewal is a real distinction

A card lapses two years after the test date, so a renewal is a request for
someone who already holds one. Three things depend on knowing which:

- the card receipt form records `جديد / إعادة` per person;
- a renewal should not be blocked by a prerequisite the technician evidently
  has, having been carded before;
- lapsing cards are what generate repeat business, and nothing can report on
  them if the distinction is not stored.

---

## Part 2 — Who may be registered

### The rule

A technician must hold **four certificates**. The contractor uploads them, an
admin verifies them and checks the ID, and only then can the technician be
registered — the same document step as a course request.

### The platform already does exactly this

- `assertCourseFitsEmployees()` (`src/modules/requests/service.ts:130`) **refuses
  the submission** when prerequisites are unmet or the job role is not eligible.
  It throws; it is not an advisory badge, and it runs again if the course is
  later swapped, so a change cannot slip past it.
- A `prior_certificate` document, uploaded and admin-verified, satisfies the
  prerequisite gate identically to a certificate this platform issued. So a
  technician trained elsewhere is handled without a special case.
- The Iqama is a `national_id` document with its own verification step.

**No new mechanism is needed. What is needed is the list of four.**

### The four, per test

| Test | Safe Working Procedures | Plus, always |
| --- | --- | --- |
| CTCT06–CTCT13 (cable, Distribution) | CSCC02 Electrical | Basic Fire Fighting (CSCC21) · Basic First Aid (CSCC22) · OHS General Induction (CSCC00) |
| CTCT02 Heavy Vehicles | CSCC03 Mechanical **or** CSCC02 Electrical | as above |
| CTCT18 Transformer Maintenance | CSCC08 **and** CSCC03 — the work is both | as above |
| CTCT19–CTCT22 (Transmission) | CSCC08 | as above |

The induction is not a `course_prerequisites` row: the platform appends it to
every course, because SEC's rule is that nobody trains at all without it. It is
still one of the four and is enforced.

CTCT02 and CTCT18 are the reason `group_no` exists. "Either of these" and "both
of these" are different requirements, and a single list cannot say which one is
meant — CTCT02's two courses share a group so either satisfies it, CTCT18's sit
in separate groups so both are needed.

### What is configured today, and the gap

Each of the four courses already restricts to its matching job role and requires
one prior course:

| Course | Eligible job role | Prerequisite |
| --- | --- | --- |
| CTCT06 | Cable Joint & Termination Technician (1KV) | CSCC02 Safe Working Procedures for Electrical |
| CTCT08 | … (13.8KV) | CSCC02 |
| CTCT10 | … (33KV) | CSCC02 |
| CTCT12 | … (69KV) | CSCC02 |

Plus **CSCC00 OHS General Induction**, which the platform requires for every
course. That is **two** certificates enforced, where the rule says four.

**The remaining two are named in `ضوابط التأهيل لفني الكابلات`, which is not among
the supplied documents.** Adding them is a one-line insert into
`course_prerequisites` once confirmed. Guessing would refuse legitimate
technicians, so nothing has been guessed.

Also still to confirm: whether the voltages step up — does 33KV require holding
13.8KV first? The form's "courses obtained" column hints at a ladder, but a hint
is not a rule, and this one has to come from SEC.

### One rule the platform cannot currently check

*"The technician must have the name of the contractor requesting in his Iqama."*

The platform verifies that an Iqama exists, is legible and is unexpired. It has
nowhere to record that someone checked the **employer printed on it**. Without
that, a technician sponsored by a different company passes every check made.

The fix is small: one attestation on the Iqama verification screen — *the
employer named on this document is this company* — stored with the verification
and visible in the audit trail.

---

## How the upload steps must look

Two screens GCC Lab flagged show the failure mode to avoid. Both render a bare
`<input type="file">`, which produces:

- **"No file chosen  Choose File" in English, inside an Arabic page.** Browsers
  render that text themselves and it cannot be translated — so an Arabic user
  gets an English control, laid out left-to-right in a right-to-left page.
- **No statement of what to upload,** or why, or what happens next.
- **No visible required/optional marker and no review status.**

`src/components/documents/document-upload-slot.tsx` already solves all of this
— its own comment says it exists "rather than a bare `<input type="file">` with
a status string next to it". Six files render their own input anyway; two of
them are the screens flagged.

**Every upload the cable programme adds uses `DocumentUploadSlot`, with no
exceptions.** Concretely, each upload point must state:

1. **What document** — "Basic Fire Fighting certificate (CSCC21)", not "file".
2. **Why it is needed** — one line: which requirement it satisfies.
3. **Required or optional**, visibly, before the upload rather than after a
   refusal.
4. **What is accepted** — PDF or image, and any size limit.
5. **Current status** — not attached / pending review / verified / rejected,
   and the rejection reason where there is one.
6. **What happens next** — "an admin verifies this before your request can be
   approved".

And for the entry certificates specifically: the screen lists the four by name
with a tick against each, so a contractor sees what is still missing **before**
choosing employees — not as a refusal at submit.

Buttons follow the same rule. An action that uploads says "Upload", one that
sends says "Send", and the confirmation names what happened. No control that
performs an action may look like plain text.

## Build order

1. **Confirm and seed the four prerequisites.** Nothing else should ship first;
   the gate is worth little while it enforces two of four.
2. **Employer attestation** on Iqama verification.
3. **Request intake** — course, new/renewal, venue including external institute;
   employees picked from a list with occupation, ID and prior courses filled in.
4. **Generate the completed `نموذج طلب اختبار`** as a PDF against the request.
5. **Renewal handling** — a held card satisfies the gate; lapsing cards drive a
   reminder.
6. Then the assessment rubric, the pass list, the card and the handover.

## Verification

- A technician whose job role is not eligible is refused at submit, with a
  message naming the person rather than a generic failure.
- A technician missing any of the four is refused, and the message says which.
- Changing the course on an existing request re-runs both checks.
- The generated form carries every field of the paper original, renders Arabic
  right-to-left, and lists the venue — including a named external institute.
- Choosing "Other institute" with no name is refused.
- A renewal for a currently-carded technician is accepted.
- Each of the four courses reports a non-empty eligible job-role list. Zero
  eligible roles means *unrestricted* in this system, so a course that reports
  zero is gating nothing — the check fails loudly rather than reading as
  "no restrictions".
