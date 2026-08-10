-- Where a class actually happens.
--
-- Courses have no fixed venue: GCC Lab coordinates a location per class and
-- shares it as a link — usually a map pin, sometimes a meeting link for a
-- remote session. Until now that was arranged outside the platform, so the
-- trainer and the contractor's candidates learned the address from a WhatsApp
-- message while the system that scheduled them said nothing.
--
-- training_centers already exists for GCC Lab's own venues and stays: a class
-- can be at a centre, at a link, or both (the centre plus the pin for the
-- specific building entrance).
alter table classes add column location_url text;
alter table classes add column location_note text;

-- A link that is not a link helps nobody, and this one is put in front of
-- people travelling to it.
alter table classes add constraint classes_location_url_shape
  check (location_url is null or location_url ~ '^https?://');

comment on column classes.location_url is
  'Map pin or meeting link for this class, coordinated per class rather than per course. Shown to the trainer and to every enrolled company.';
comment on column classes.location_note is
  'Free text beside the link — gate number, floor, what to bring.';
