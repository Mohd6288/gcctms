import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { authorize, getContext } from "@/modules/platform/auth/service";
import { listExams } from "@/modules/catalog/queries";
import { CreateExamForm } from "./create-exam-form";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function ExamsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superadmin.exams");

  const context = await getContext();
  const exams = authorize("manage_catalog", context) ? await listExams() : [];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="-mt-4 max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CreateExamForm />
        <div className="flex-1 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start font-medium">{t("tableCode")}</th>
                <th className="p-3 text-start font-medium">{t("tableTitle")}</th>
                <th className="p-3 text-start font-medium">{t("tablePassMark")}</th>
                <th className="p-3 text-start font-medium">{t("tableStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {exams.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={4}>
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                exams.map((exam) => (
                  <tr key={exam.id} className="border-b border-border last:border-0">
                    <td className="p-3">{exam.code}</td>
                    <td className="p-3">{exam.title}</td>
                    <td className="p-3">{exam.passMark}</td>
                    <td className="p-3">{exam.active ? t("statusActive") : t("statusInactive")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
