-- Private buckets per security-and-hosting.md: "documents" (national IDs,
-- prior certs, invoices) and "certificates" (generated PDFs). Both
-- public = false. storage.objects already has RLS enabled with zero
-- policies for authenticated/anon (Supabase default) — deliberately left
-- that way: the ONLY access path is the service-role client from
-- server-only code (modules/platform/storage/service.ts), which validates
-- ownership against the `documents` table (which has full RLS) before ever
-- touching Storage. No storage.objects policy is added, so no
-- session-based client can read/write these buckets even by accident.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf']),
  ('certificates', 'certificates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
