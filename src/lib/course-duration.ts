// Turning a course's duration into calendar dates.
//
// courses.duration_hours is the contact time from the GCC Lab catalog (8, 16,
// 24…). A training day is 8 hours, so an 8-hour course is one day and its end
// date is its start date — which is why picking a start date used to leave an
// admin working out the end date in their head, and getting it off by one on
// every single-day course.
export const TRAINING_HOURS_PER_DAY = 8;

export function courseDurationDays(durationHours: string | number): number {
  const hours = Number(durationHours);
  if (!Number.isFinite(hours) || hours <= 0) return 1;
  return Math.max(1, Math.ceil(hours / TRAINING_HOURS_PER_DAY));
}

// Consecutive calendar days — a 2-day course starting Thursday ends Friday,
// it does not skip the Saudi weekend. That is deliberate: the end date stays
// editable, and quietly moving a date an admin did not type is worse than
// showing an obvious one they can adjust. If GCC Lab never runs across
// Fri/Sat, this is where that rule belongs.
//
// Date-only arithmetic on the "YYYY-MM-DD" strings the inputs and the DB both
// use — no Date objects, so no timezone can shift the day.
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function endDateFor(startDate: string, durationHours: string | number): string {
  if (!startDate) return "";
  return addDays(startDate, courseDurationDays(durationHours) - 1);
}
