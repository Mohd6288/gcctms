-- The "documents" bucket's allowed_mime_types (0016_storage_buckets.sql)
-- only ever allowed image/pdf — a real, confirmed bug: registration_sheet
-- and hrbl_request_form are supposed to be .xlsx uploads (the contractor
-- downloads a blank Excel template and re-uploads it filled in), and the
-- bucket itself rejected them regardless of the app-level check.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'documents';
