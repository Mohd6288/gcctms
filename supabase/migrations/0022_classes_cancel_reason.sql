-- Matches the validated prototype's TrainingClass.cancelReason/cancelledAt —
-- shown to affected companies/trainer and on the class detail page.
alter table classes add column cancel_reason text;
alter table classes add column cancelled_at timestamptz;
