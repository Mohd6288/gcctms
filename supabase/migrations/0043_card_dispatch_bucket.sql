-- Private bucket for the card printing lists sent to manufacturers.
--
-- Not `documents` and not `certificates`. Both restrict mime types and both
-- carry a meaning this does not share: `documents` holds what a contractor
-- uploaded, `certificates` holds what GCC Lab issued. A pass list is neither —
-- it is what GCC Lab sent OUT to a third party, and it is the only object in
-- the system whose whole purpose is to leave the building.
--
-- Keeping it separate means the retention question can be answered separately
-- too: these carry unmasked Iqama numbers for people who have already received
-- their cards, and there will come a point where they should not be kept.
--
-- public = false, and as with the other buckets no storage.objects policy is
-- added — the only access path is the service-role client in server-only code,
-- after cards/service.ts has checked who is asking.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-dispatches', 'card-dispatches', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
