-- The quotation GCC Lab issues after approving a request. It is produced in
-- Dynamics 365 — the finance system — and uploaded here so the contractor
-- can see the amount and the payment instructions. The portal's own figure
-- (payments.total_amount) stays an estimate; this document is the real one.
--
-- First document in the system that travels the other way: every other type
-- is uploaded by a contractor and verified by an admin. This one is uploaded
-- by an admin and read by a contractor, and is never "verified" by anyone —
-- verified_at/rejected_at stay null for it.
alter table documents drop constraint documents_type_check;
alter table documents add constraint documents_type_check
  check (type in (
    'national_id', 'prior_certificate', 'sadad_invoice', 'generated_certificate',
    'registration_sheet', 'hrbl_request_form', 'quotation', 'other'
  ));

-- Contractors read quotations (documents_contractor_select_own is already
-- type-agnostic and company-scoped, so that needs no change) but must never
-- write one. Without this a contractor holding the anon key could insert a
-- row claiming to be their own quotation. They could not attach a file to it
-- — storage.objects has RLS on with no policies at all (0016) — but a row
-- pointing at nothing is still a row the payment panel would render.
drop policy documents_contractor_insert_own on documents;
create policy documents_contractor_insert_own on documents
  for insert
  with check (
    auth_role() = 'contractor_manager' and company_id = auth_company_id()
    and type <> 'quotation'
    and (
      request_id is null
      or exists (
        select 1 from training_requests tr
        where tr.id = documents.request_id and tr.company_id = auth_company_id()
          and tr.status in ('draft', 'submitted', 'info_requested')
      )
    )
  );

drop policy documents_contractor_update_own on documents;
create policy documents_contractor_update_own on documents
  for update
  using (
    auth_role() = 'contractor_manager' and company_id = auth_company_id()
    and type <> 'quotation'
    and (
      request_id is null
      or exists (
        select 1 from training_requests tr
        where tr.id = documents.request_id and tr.company_id = auth_company_id()
          and tr.status in ('draft', 'submitted', 'info_requested')
      )
    )
  )
  with check (auth_role() = 'contractor_manager' and company_id = auth_company_id() and type <> 'quotation');

-- Retire the fabricated SADAD reference.
--
-- approveRequest generated it as `SADAD-` || two random four-digit numbers
-- and the contractor payment panel rendered it as the literal payment
-- instruction. No bill ever existed behind it: a contractor who tried to pay
-- one was pushing money at a reference the SADAD system has never heard of.
-- It came from the validated prototype, where it was demo scaffolding.
--
-- The quotation now carries the real payment instructions, so the column
-- stops being written and stops being displayed. Kept (nullable) rather than
-- dropped so historical rows aren't rewritten by a schema change, but the
-- existing values are cleared — leaving a plausible-looking fake payment
-- reference in a live database is the part that could actually cost someone
-- money.
update payments set sadad_invoice_ref = null where sadad_invoice_ref is not null;

comment on column payments.sadad_invoice_ref is
  'Deprecated (0034). Was a fabricated reference shown as a payment instruction; the uploaded quotation document now carries the real instructions. Not written by application code.';
