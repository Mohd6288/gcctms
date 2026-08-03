import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { DirectionProvider } from "@/components/ui/direction";
import { routing, type Locale } from "@/i18n/routing";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Same --font-sans CSS variable name as geistSans (shadcn's --theme reads this one
// variable) — only one of the two is included in the root className per locale below,
// so whichever is active supplies --font-sans for that render.
const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-sans",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "GCC Lab Training Management System",
  description: "Training & Certification Management Platform for SEC contractor safety courses.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const RTL_LOCALES: Locale[] = ["ar"];

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Required for static rendering of this segment with next-intl.
  setRequestLocale(locale);

  const dir = RTL_LOCALES.includes(locale as Locale) ? "rtl" : "ltr";
  const sansFont = dir === "rtl" ? notoSansArabic : geistSans;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${sansFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <NextIntlClientProvider>
          <DirectionProvider dir={dir}>{children}</DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
