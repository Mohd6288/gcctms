import { setRequestLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listSubmittedRequestsForAdmin } from "@/modules/requests/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function AdminRequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.requests");

  const context = await getContext();
  const requests = authorize("review_requests", context) ? await listSubmittedRequestsForAdmin(context?.region) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {context?.region ? <p className="text-sm text-muted-foreground">{t("regionScopedNote", { region: context.region })}</p> : null}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableCompany")}</th>
              <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
              <th className="p-3 text-start font-medium">{t("tableCreated")}</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="border-b border-border last:border-0">
                  <td className="p-3">{request.companyName}</td>
                  <td className="p-3">{locale === "ar" ? request.courseTitleAr : request.courseTitleEn}</td>
                  <td className="p-3">{new Date(request.createdAt).toLocaleDateString(locale)}</td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/requests/${request.id}`}>{t("review")}</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
