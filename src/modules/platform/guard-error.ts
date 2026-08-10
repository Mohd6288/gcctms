// A refusal the user is meant to read, as opposed to a crash.
//
// Next.js redacts every error thrown out of a Server Action in production —
// the client receives a generic Error whose message is literally
// "Minified React error #441; visit https://react.dev/errors/441 …". Any form
// doing `catch (err) { setError(err.message) }` therefore shows that string
// instead of the reason, which is exactly what an admin saw when the
// double-booking guard stopped them creating a class: a React error code in
// place of "this trainer is already teaching that day".
//
// So guards that a user can act on are not thrown across the boundary. They
// are raised as GuardError inside the service, caught at the action edge by
// runGuarded(), and RETURNED — return values survive the boundary intact.
// Anything else still throws and still reaches the error boundary and the
// logs, because a bug is not a message for the user.
export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; message: string };

export async function runGuarded<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (error instanceof GuardError) return { ok: false, message: error.message };
    throw error;
  }
}

// Client-side counterpart: pulls the refusal out of whatever an action
// returned, without every form repeating the same shape check.
export function refusalMessage(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const candidate = result as { ok?: unknown; message?: unknown };
  return candidate.ok === false && typeof candidate.message === "string" ? candidate.message : null;
}
