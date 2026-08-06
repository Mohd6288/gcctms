-- Per-document reject path (verify was the only reviewer action before this
-- — see roles-and-workflows.md's document-review note). Mirrors
-- verified_by/verified_at exactly: only platform_admin's own UPDATE may set
-- these, any other actor's UPDATE (a contractor replacing the file) clears
-- them back to null, so a fresh re-upload always starts from a clean state.
alter table documents add column rejected_by uuid references auth.users (id) on delete restrict;
alter table documents add column rejected_at timestamptz;
alter table documents add column rejection_reason text;

alter table documents add constraint documents_not_verified_and_rejected
  check (verified_at is null or rejected_at is null);

create or replace function documents_protect_verification_columns() returns trigger
language plpgsql
as $$
begin
  if auth_role() <> 'platform_admin' then
    new.verified_by := null;
    new.verified_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  end if;
  return new;
end;
$$;
