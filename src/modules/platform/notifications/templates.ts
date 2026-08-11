// platform/notifications/templates — what each email actually says.
//
// Bilingual in one message, Arabic first. The platform is bilingual but we
// hold no language preference per recipient, and asking a contractor to pick
// one before they can be told their request was approved is the wrong trade.
// Both languages in one mail is what Saudi B2B correspondence looks like
// anyway.
import "server-only";
import type { NotificationType } from "./service";

interface Copy {
  subject: string;
  /** Arabic line, then English line. */
  ar: string;
  en: string;
  /** Path within the platform this is about, if any. */
  path?: string;
}

function num(value: unknown): string {
  return value == null ? "" : String(value);
}

// Kept deliberately plain: what happened, and where to go. A transactional
// notice that buries its one fact under branding is a notice people stop
// opening.
export function renderNotification(type: NotificationType, data: Record<string, unknown>): Copy {
  const requestId = num(data.requestId);
  const classId = num(data.classId);

  switch (type) {
    case "request.submitted":
      return {
        subject: `New training request #${requestId}`,
        ar: `تم استلام طلب تدريب جديد رقم ${requestId} وهو بانتظار المراجعة.`,
        en: `Training request #${requestId} has been submitted and is waiting for review.`,
        path: `/admin/requests/${requestId}`,
      };
    case "request.approved":
      return {
        subject: `Training request #${requestId} approved`,
        ar: `تم اعتماد طلب التدريب رقم ${requestId}. سيصلكم عرض السعر الرسمي قريباً، وبعد سداده يرجى رفع إيصال الدفع.`,
        en: `Training request #${requestId} has been approved. Your official quotation follows shortly; once paid, upload the receipt.`,
        path: `/dashboard/requests/${requestId}`,
      };
    case "request.rejected":
      return {
        subject: `Training request #${requestId} was not approved`,
        ar: `لم يتم اعتماد طلب التدريب رقم ${requestId}. يمكنكم الاطلاع على السبب في المنصة.`,
        en: `Training request #${requestId} was not approved. The reason is on the request page.`,
        path: `/dashboard/requests/${requestId}`,
      };
    case "request.info_requested":
      return {
        subject: `More information needed for request #${requestId}`,
        ar: `نحتاج معلومات إضافية بخصوص طلب التدريب رقم ${requestId} قبل استكمال المراجعة.`,
        en: `We need more information about training request #${requestId} before the review can continue.`,
        path: `/dashboard/requests/${requestId}`,
      };
    case "request.closed":
      return {
        subject: `Training request #${requestId} closed`,
        ar: `تم إغلاق طلب التدريب رقم ${requestId}.`,
        en: `Training request #${requestId} has been closed.`,
        path: `/dashboard/requests/${requestId}`,
      };
    case "payment.uploaded":
      return {
        subject: `Payment receipt uploaded for request #${requestId}`,
        ar: `تم رفع إيصال دفع للطلب رقم ${requestId} وهو بانتظار التحقق.`,
        en: `A payment receipt for request #${requestId} is waiting to be verified.`,
        path: `/admin/requests/${requestId}`,
      };
    case "payment.verified":
      return {
        subject: `Payment confirmed for request #${requestId}`,
        ar: `تم التحقق من الدفع الخاص بالطلب رقم ${requestId}، وسيتم جدولة التدريب.`,
        en: `Your payment for request #${requestId} has been confirmed. Scheduling follows.`,
        path: `/dashboard/requests/${requestId}`,
      };
    case "payment.rejected":
      return {
        subject: `Payment receipt returned for request #${requestId}`,
        ar: `لم يتم قبول إيصال الدفع للطلب رقم ${requestId}${data.reason ? `: ${String(data.reason)}` : ""}. يرجى رفع إيصال صحيح.`,
        en: `The payment receipt for request #${requestId} was not accepted${data.reason ? `: ${String(data.reason)}` : ""}. Please upload a corrected one.`,
        path: `/dashboard/requests/${requestId}`,
      };
    case "class.scheduled":
      return {
        subject: `Training scheduled — class #${classId}`,
        ar: `تم جدولة التدريب. تفاصيل الفصل رقم ${classId} والموقع متاحة في المنصة.`,
        en: `Training has been scheduled. Class #${classId} dates and location are on the platform.`,
        path: `/dashboard/training`,
      };
    case "class.cancelled":
      return {
        subject: `Class #${classId} cancelled`,
        ar: `تم إلغاء الفصل رقم ${classId}${data.reason ? `: ${String(data.reason)}` : ""}. سيتم إعادة جدولة المرشحين.`,
        en: `Class #${classId} has been cancelled${data.reason ? `: ${String(data.reason)}` : ""}. Candidates return to the scheduling pool.`,
        path: `/dashboard/training`,
      };
    case "class.results_submitted":
      return {
        subject: `Results submitted for class #${classId}`,
        ar: `تم تسجيل نتائج الفصل رقم ${classId} وهي جاهزة لمراجعة الشهادات.`,
        en: `Results for class #${classId} have been submitted and certificates are ready to review.`,
        path: `/admin/classes/${classId}`,
      };
    case "certificate.pending_approval":
      return {
        subject: `${num(data.count)} certificate(s) ready to release`,
        ar: `هناك ${num(data.count)} شهادة جاهزة للإصدار للفصل رقم ${classId}.`,
        en: `${num(data.count)} certificate(s) are ready to release for class #${classId}.`,
        path: `/admin/classes/${classId}`,
      };
    case "test.guidelines_sent": {
      // ارشادات حضور الاختبارات + MATERIAL LIST, carried in the message rather
      // than attached. An attachment is a file to lose; the four things a
      // contractor must actually DO — identity, permit, materials, notice —
      // belong in front of them when they open it.
      const venue = String(data.venue ?? "");
      const when = String(data.testDate ?? "");
      const link = String(data.locationUrl ?? "");
      const en = [
        `Your technicians are booked for ${String(data.courseTitle ?? "a qualification test")} on ${when}, at ${venue}.${link ? ` Location: ${link}` : ""}`,
        "",
        "Before the test day:",
        "• Each technician brings a valid Iqama or civil ID and a recent photograph. The Iqama must name your company as employer.",
        "• Their occupation must be a specialisation suited to the test — electrical or mechanical.",
        "• Send the list of materials, tools and equipment, with vehicle registration, insurance and the driver's licence, AT LEAST TWO WORKING DAYS ahead so entry permits can be issued.",
        "• If a technician cannot attend, tell the centre AT LEAST THREE WORKING DAYS ahead so the slot can be rescheduled.",
        "",
        "Materials to bring, per technician per test:",
        "straight connection kit and end connection kit for the voltage being tested; 3 m of straight cable for that voltage; gas cylinder; torch; crimping tool; wooden-handled knife; scoring knife; hacksaw and blade; electrician pliers; long-nose pliers; flat file; circular file; cutter; flat screwdrivers.",
        "",
        "On the day: arrive at the stated times, in work uniform. Smoking is prohibited except in designated areas.",
        "",
        "A card is awarded to a technician scoring 70% or above in every item of the evaluation, and is valid two years from the date of the test.",
      ].join("\n");
      const ar = [
        `تم جدولة الفنيين لديكم لاختبار ${String(data.courseTitle ?? "")} بتاريخ ${when}، في ${venue}.${link ? ` الموقع: ${link}` : ""}`,
        "",
        "قبل يوم الاختبار:",
        "• يحضر كل فني بطاقة أحوال مدنية أو إقامة سارية وصورة شخصية حديثة، على أن يكون اسم المقاول مثبتاً في الإقامة.",
        "• أن تكون مهنته ضمن إحدى المهن التخصصية المناسبة للاختبار (الكهربائية أو الميكانيكية).",
        "• إرسال قائمة المواد والأدوات والمعدات مع استمارة المركبة وصورة التأمين ورخصة السائق قبل موعد الاختبار بيومي عمل على الأقل لإصدار تصاريح الدخول.",
        "• في حال تعذّر حضور أحد الفنيين، إبلاغ المركز قبل ثلاثة أيام عمل على الأقل لإعادة الجدولة.",
        "",
        "المواد المطلوب إحضارها لكل فني ولكل اختبار:",
        "طقم وصلة مستقيمة وطقم وصلة نهاية حسب الجهد المطلوب؛ قطعة كابل مستقيم بطول 3 أمتار حسب الجهد؛ اسطوانة غاز؛ شعلة؛ أداة كبس؛ سكين بمقبض خشبي؛ سكين تخطيط؛ منشار حديد بشفرة؛ زرادية كهربائي؛ زرادية طويلة الأنف؛ مبرد مسطح؛ مبرد دائري؛ قاطع؛ مفكات مسطحة.",
        "",
        "يوم الاختبار: الالتزام بمواعيد البدء والانتهاء وبالزي الرسمي للعمل. يمنع التدخين في غير الأماكن المصرح بها.",
        "",
        "تُمنح بطاقة الاجتياز لمن يحقق 70% فأعلى في كل بند من بنود التقييم، وتكون صالحة لمدة عامين من تاريخ الاختبار.",
      ].join("\n");
      return {
        subject: `Test guidelines — ${String(data.courseTitle ?? "qualification test")}, ${when}`,
        ar,
        en,
        path: `/dashboard/training`,
      };
    }
    case "card.awaiting_dispatch":
      return {
        subject: `${num(data.count)} qualification card(s) to request from the manufacturer`,
        ar: `اجتاز ${num(data.count)} فني اختبار الفصل رقم ${classId}. أرسل قائمة الناجحين إلى الجهة المصدرة للبطاقات.`,
        en: `${num(data.count)} technician(s) passed class #${classId}. Send the pass list to the card issuer.`,
        path: `/admin/classes/${classId}`,
      };
    case "card.pass_list_dispatched": {
      // Masked identifiers only. The printable list, with full Iqama numbers,
      // sits behind a link that expires — never in a message that will live in
      // a third party's mailbox indefinitely.
      const names = Array.isArray(data.names) ? (data.names as string[]) : [];
      return {
        subject: `Card printing list — ${String(data.courseTitle ?? "qualification test")}, ${num(data.count)} technician(s)`,
        ar: `اجتاز ${num(data.count)} فني اختبار ${String(data.courseTitle ?? "")} بتاريخ ${String(data.testDate ?? "")}. القائمة الكاملة لإصدار البطاقات متاحة عبر الرابط أدناه ولمدة 72 ساعة.${names.length > 0 ? `\n\n${names.join("\n")}` : ""}`,
        en: `${num(data.count)} technician(s) passed ${String(data.courseTitle ?? "")} on ${String(data.testDate ?? "")}. The full printing list is available from the link below for 72 hours.${names.length > 0 ? `\n\n${names.join("\n")}` : ""}`,
        path: `/admin/classes/${classId}`,
      };
    }
    case "card.ready_for_collection":
      return {
        subject: `Qualification card ready to collect${data.cardNumber ? ` — ${String(data.cardNumber)}` : ""}`,
        ar: `بطاقة التأهيل${data.cardNumber ? ` رقم ${String(data.cardNumber)}` : ""} جاهزة للاستلام من مركز جي سي سي لاب.`,
        en: `Qualification card${data.cardNumber ? ` ${String(data.cardNumber)}` : ""} is ready to collect from GCC Lab.`,
        path: `/dashboard/cards`,
      };
    case "certificate.issued":
      return {
        subject: `Certificate issued${data.serial ? ` — ${String(data.serial)}` : ""}`,
        ar: `تم إصدار شهادة${data.serial ? ` برقم ${String(data.serial)}` : ""}. يمكنكم تنزيلها من المنصة.`,
        en: `A certificate has been issued${data.serial ? ` (${String(data.serial)})` : ""}. You can download it from the platform.`,
        path: `/dashboard/certificates`,
      };
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function siteUrl(path?: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  if (!path) return base || null;
  return base ? `${base}/en${path}` : null;
}

export function renderEmail(type: NotificationType, data: Record<string, unknown>) {
  const copy = renderNotification(type, data);
  const link = siteUrl(copy.path);

  const text = [copy.ar, "", copy.en, "", link ? link : "", "", "GCC Lab Development & Certification Center"]
    .filter((line) => line !== undefined)
    .join("\n");

  // Inline styles and a table-free layout: every email client strips <style>
  // blocks differently, and this message has one job.
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1719">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e0dee2;border-radius:6px;padding:24px">
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;direction:rtl;text-align:right">${escapeHtml(copy.ar)}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6">${escapeHtml(copy.en)}</p>
    ${
      link
        ? `<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d1f2c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:4px;font-size:14px">Open in GCC Lab TMS</a></p>`
        : ""
    }
    <p style="margin:0;font-size:12px;color:#857e88">GCC Lab Development &amp; Certification Center</p>
  </div>
</body></html>`;

  return { subject: copy.subject, html, text };
}
