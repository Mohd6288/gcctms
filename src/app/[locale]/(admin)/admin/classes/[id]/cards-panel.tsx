"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { CardRow, DispatchRow } from "@/modules/cards/queries";
import {
  dispatchPassListAction,
  getPassListUrlAction,
  recordCardCollectionAction,
  recordCardIssuanceAction,
} from "@/modules/cards/actions";
import { refusalMessage } from "@/modules/platform/guard-error";

interface Props {
  classId: number;
  cards: CardRow[];
  dispatches: DispatchRow[];
  canEdit: boolean;
  locale: string;
}

const STATUS_STYLES: Record<string, string> = {
  awaiting_issuer: "bg-warning/15 text-warning",
  issued: "bg-primary/10 text-primary",
  collected: "bg-success/15 text-success",
  expired: "bg-muted text-muted-foreground",
  void: "bg-destructive/15 text-destructive",
};

/**
 * Steps 9 and 10 on one screen: send the pass list, then record what comes
 * back and who takes it away.
 *
 * The table is نموذج الغياب و استلام البطاقات — the same columns, in the same
 * order, because an admin working from the paper form should not have to
 * translate between the two.
 */
export function CardsPanel({ classId, cards, dispatches, canEdit, locale }: Props) {
  const t = useTranslations("admin.classes.cards");
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [cardNumbers, setCardNumbers] = useState<Record<number, string>>({});
  const [collector, setCollector] = useState<Record<number, { name: string; mobile: string }>>({});

  const awaiting = cards.filter((c) => c.status === "awaiting_issuer" && c.dispatchedAt === null);
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium" });

  async function run(key: string, fn: () => Promise<unknown>, message: string) {
    setError(null);
    setDone(null);
    setBusy(key);
    try {
      // These actions RETURN their refusals — Next.js redacts thrown Server
      // Action errors in production, so "no contact email on file" would
      // otherwise arrive as a React error code.
      const refusal = refusalMessage(await fn());
      if (refusal) {
        setError(refusal);
        return;
      }
      setDone(message);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(null);
    }
  }

  async function openPassList(dispatchId: number) {
    setError(null);
    const result = await getPassListUrlAction(dispatchId);
    const refusal = refusalMessage(result);
    if (refusal) {
      setError(refusal);
      return;
    }
    if (result.ok) window.open(result.data, "_blank", "noopener");
  }

  return (
    <section className="flex w-full max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div aria-live="polite">
        {done ? <p className="rounded-md bg-success/10 p-2.5 text-xs font-medium text-success">{done}</p> : null}
        {error ? <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p> : null}
      </div>

      {/* Step 9 */}
      <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t("dispatchTitle")}</span>
            <span className="text-xs text-muted-foreground">
              {awaiting.length > 0 ? t("awaitingCount", { count: awaiting.length }) : t("nothingAwaiting")}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!canEdit || awaiting.length === 0 || busy === "dispatch"}
            onClick={() => run("dispatch", () => dispatchPassListAction(classId), t("dispatchDone", { count: awaiting.length }))}
          >
            {busy === "dispatch" ? t("sending") : t("sendPassList")}
          </Button>
        </div>
        {/* Said before the click, not after: the recipient gets names and the
            last four digits only, and the printable list expires. */}
        <p className="text-xs text-muted-foreground">{t("dispatchPrivacyNote")}</p>

        {dispatches.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
            <span className="text-muted-foreground">
              {t("sentTo", { name: d.manufacturerName, email: d.recipientEmail })} ·{" "}
              {dateFmt.format(new Date(d.sentAt))} · {t("countPassed", { count: d.passCount })}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => openPassList(d.id)}>
              {new Date(d.linkExpiresAt) > new Date() ? t("openPassList") : t("openPassListExpired")}
            </Button>
          </div>
        ))}
      </div>

      {/* Step 10 — the receipt form */}
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCards")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{card.fullNameEn}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {card.maskedId} · {card.issuanceType === "renewal" ? t("renewal") : t("newIssue")}
                  </span>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_STYLES[card.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {t(`status.${card.status}`)}
                </span>
              </div>

              {card.status === "awaiting_issuer" && canEdit ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`num-${card.id}`}>{t("cardNumberLabel")}</Label>
                    <Input
                      id={`num-${card.id}`}
                      className="h-8 w-48"
                      value={cardNumbers[card.id] ?? ""}
                      onChange={(e) => setCardNumbers((n) => ({ ...n, [card.id]: e.target.value }))}
                      placeholder={t("cardNumberPlaceholder")}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === `issue-${card.id}` || !(cardNumbers[card.id] ?? "").trim()}
                    onClick={() =>
                      run(
                        `issue-${card.id}`,
                        () => recordCardIssuanceAction({ cardId: card.id, cardNumber: (cardNumbers[card.id] ?? "").trim() }),
                        t("issuedDone", { name: card.fullNameEn })
                      )
                    }
                  >
                    {t("recordIssued")}
                  </Button>
                  <span className="text-xs text-muted-foreground">{t("expiryHint")}</span>
                </div>
              ) : null}

              {card.status === "issued" ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    {card.cardNumber} · {t("validTo", { date: card.expiresAt ? dateFmt.format(new Date(card.expiresAt)) : "—" })}
                  </p>
                  {canEdit ? (
                    <div className="flex flex-wrap items-end gap-2">
                      {/* The paper form asks for both, because the person
                          collecting is often the contractor's representative
                          rather than the technician. */}
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`by-${card.id}`}>{t("collectedByLabel")}</Label>
                        <Input
                          id={`by-${card.id}`}
                          className="h-8 w-44"
                          value={collector[card.id]?.name ?? ""}
                          onChange={(e) =>
                            setCollector((c) => ({ ...c, [card.id]: { name: e.target.value, mobile: c[card.id]?.mobile ?? "" } }))
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`mob-${card.id}`}>{t("collectorMobileLabel")}</Label>
                        <Input
                          id={`mob-${card.id}`}
                          className="h-8 w-40"
                          inputMode="tel"
                          value={collector[card.id]?.mobile ?? ""}
                          onChange={(e) =>
                            setCollector((c) => ({ ...c, [card.id]: { name: c[card.id]?.name ?? "", mobile: e.target.value } }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          busy === `collect-${card.id}` ||
                          !(collector[card.id]?.name ?? "").trim() ||
                          !(collector[card.id]?.mobile ?? "").trim()
                        }
                        onClick={() =>
                          run(
                            `collect-${card.id}`,
                            () =>
                              recordCardCollectionAction({
                                cardId: card.id,
                                collectedByName: (collector[card.id]?.name ?? "").trim(),
                                collectedByMobile: (collector[card.id]?.mobile ?? "").trim(),
                              }),
                            t("collectedDone", { name: card.fullNameEn })
                          )
                        }
                      >
                        {t("recordCollected")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {card.status === "collected" ? (
                <p className="text-xs text-muted-foreground">
                  {card.cardNumber} · {t("validTo", { date: card.expiresAt ? dateFmt.format(new Date(card.expiresAt)) : "—" })} ·{" "}
                  {t("collectedBy", { name: card.collectedByName ?? "", mobile: card.collectedByMobile ?? "" })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
