import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listAuditActivity } from "@/modules/audit/queries";
import { AuditTable, type AuditColumn } from "@/components/audit-table";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AuditorActivityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auditor.activity");

  const context = await getContext();
  if (!authorize("view_audit_portal", context)) return null;

  const rows: Row[] = (await listAuditActivity()).map((r) => ({
    createdAt: new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19),
    actor: r.actor,
    actorRole: r.actorRole,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    note: r.note,
  }));

  const columns: AuditColumn<Row>[] = [
    { key: "createdAt", label: t("colWhen") },
    { key: "actor", label: t("colActor") },
    { key: "actorRole", label: t("colActorRole") },
    { key: "entityType", label: t("colEntity") },
    { key: "entityId", label: t("colEntityId") },
    { key: "action", label: t("colAction") },
    { key: "fromStatus", label: t("colFrom") },
    { key: "toStatus", label: t("colTo") },
    { key: "note", label: t("colNote") },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <AuditTable columns={columns} rows={rows} fileName="activity-log" />
    </div>
  );
}
