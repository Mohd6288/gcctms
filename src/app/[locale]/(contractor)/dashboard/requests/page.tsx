import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { getContext } from "@/modules/platform/auth/service";
import { listRequestsForCompany } from "@/modules/requests/queries";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractor.requests");
  const tStatus = await getTranslations("requestStatus");

  const context = await getContext();
  const requests = context?.companyId ? await listRequestsForCompany(context.companyId) : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Button asChild>
          <Link href="/dashboard/requests/new">{t("newRequest")}</Link>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start font-medium">{t("tableCourse")}</th>
              <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
              <th className="p-3 text-start font-medium">{t("tableTotal")}</th>
              <th className="p-3 text-start font-medium">{t("tableCreated")}</th>
              <th className="p-3 text-start font-medium" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={5}>
                  {t("empty")}
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="border-b border-border last:border-0">
                  <td className="p-3">{locale === "ar" ? request.courseTitleAr : request.courseTitleEn}</td>
                  <td className="p-3">{tStatus(request.status)}</td>
                  <td className="p-3">{request.totalAmount ? `${request.totalAmount} SAR` : "—"}</td>
                  <td className="p-3">{new Date(request.createdAt).toLocaleDateString(locale)}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/requests/${request.id}`} className="text-primary hover:underline">
                      {t("view")}
                    </Link>
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
