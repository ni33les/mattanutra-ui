"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { marketingGranted, META_PREFERENCE_CHANGED, saveMarketingPreference } from "@/lib/meta-client";

const copy = {
  en: { title: "Advertising preferences", body: "We use Meta to measure visits and purchases. You can turn this off without affecting your assessment. We do not share health answers, results or supplement details.", on: "On", off: "Off", enable: "Turn on", disable: "Turn off", saving: "Saving…", error: "Could not save your choice. Please try again." },
  th: { title: "การตั้งค่าโฆษณา", body: "เราใช้ Meta เพื่อวัดผลการเข้าชมและการซื้อ คุณปิดการวัดผลได้โดยไม่กระทบแบบประเมิน เราไม่ส่งคำตอบ ผลสุขภาพ หรือรายละเอียดอาหารเสริม", on: "เปิด", off: "ปิด", enable: "เปิดการวัดผล", disable: "ปิดการวัดผล", saving: "กำลังบันทึก…", error: "บันทึกตัวเลือกไม่สำเร็จ โปรดลองอีกครั้ง" },
  "zh-CN": { title: "广告偏好设置", body: "我们使用 Meta 衡量访问和购买。您可关闭此功能，不影响评估。我们不会分享健康答案、结果或补充剂详情。", on: "已开启", off: "已关闭", enable: "开启", disable: "关闭", saving: "正在保存…", error: "无法保存，请重试。" }
};

export function MarketingPrivacySettings({ locale }: { locale: Locale }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    const changed = () => setEnabled(marketingGranted());
    changed(); window.addEventListener(META_PREFERENCE_CHANGED, changed);
    return () => window.removeEventListener(META_PREFERENCE_CHANGED, changed);
  }, []);
  const labels = copy[locale];
  async function save() {
    setSaving(true); setError(false);
    try { setEnabled(await saveMarketingPreference(!enabled)); }
    catch { setError(true); }
    finally { setSaving(false); }
  }
  return <section id="advertising-preferences" aria-labelledby="advertising-preferences-title" className="mx-auto my-6 w-full max-w-3xl rounded-xl border border-stone-200 bg-white p-6 text-stone-900">
    <h2 id="advertising-preferences-title" className="text-xl font-semibold">{labels.title}</h2>
    <p className="my-3">{labels.body}</p>
    <div className="flex items-center gap-4">
      <span role="status">{saving ? labels.saving : enabled === null ? "" : enabled ? labels.on : labels.off}</span>
      <button type="button" disabled={saving || enabled === null} onClick={() => void save()} className="rounded border border-stone-400 px-4 py-2 disabled:opacity-50">{enabled ? labels.disable : labels.enable}</button>
    </div>
    {error && <p role="alert" className="mt-3">{labels.error}</p>}
  </section>;
}
