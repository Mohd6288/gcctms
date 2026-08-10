import { getTranslations } from "next-intl/server";

// The per-entity history. audit_log has recorded every transition since Phase
// 1 and carried an index on (entity_type, entity_id) the whole time, but
// nothing read it that way — answering "what happened to this request" meant
// scrolling the auditor's global feed.
//
// A server component on purpose: the rows are already fetched by the page,
// there is nothing to interact with, and this way it costs no client JS on
// screens that are otherwise static.
export interface HistoryEntry {
  id: number;
  actor: string | null;
  actorRole?: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Date | string;
}

export async function Timeline({
  entries,
  locale,
  title,
}: {
  entries: HistoryEntry[];
  locale: string;
  title?: string;
}) {
  const t = await getTranslations("common.timeline");

  // Actions are internal verbs ("change_course", "upload_quotation") and new
  // ones appear whenever a feature does. t.has() keeps an untranslated verb
  // readable instead of throwing or printing a raw key at an auditor.
  function actionLabel(action: string) {
    const key = `action.${action}` as Parameters<typeof t.has>[0];
    return t.has(key) ? t(key) : action.replace(/_/g, " ");
  }

  return (
    <section className="flex w-full flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-semibold">{title ?? t("title")}</h2>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry, index) => (
            <li key={entry.id} className="flex gap-3">
              {/* The rail: a dot per event, joined by a line that stops at the
                  last one so the trail visibly ends. */}
              <div className="flex flex-col items-center">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                {index < entries.length - 1 ? <span className="w-px flex-1 bg-border" aria-hidden /> : null}
              </div>

              <div className="flex flex-1 flex-col gap-0.5 pb-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium">{actionLabel(entry.action)}</span>
                  {entry.fromStatus || entry.toStatus ? (
                    <span className="text-xs text-muted-foreground">
                      {entry.fromStatus ? `${entry.fromStatus} → ` : ""}
                      {entry.toStatus}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {/* An unattributed row is a real state — a system action, or
                      an actor whose profile has since been removed. */}
                  {entry.actor ?? t("systemActor")} · {new Date(entry.createdAt).toLocaleString(locale)}
                </span>
                {entry.note ? <span className="text-xs text-muted-foreground">{entry.note}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
