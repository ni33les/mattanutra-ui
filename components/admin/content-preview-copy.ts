import type { Locale } from "@/lib/i18n";

type PreviewLabelKey = "adminPreview" | "content" | "testimonialPreview";

export const adminContentPreviewCopy = {
  en: {
    labels: {
      adminPreview: "Admin preview",
      content: "Content",
      testimonialPreview: "Testimonial preview"
    },
    tokens: {
      archived: "Deleted",
      blog_post: "Blog post",
      deleted: "Deleted",
      draft: "Draft",
      published: "Published",
      scheduled: "Scheduled",
      testimonial: "Testimonial"
    },
    cta: {
      body:
        "Take a few minutes to discover your HealthScore and begin a more personal conversation about your energy, sleep, diet, budget, and what support actually fits your day.",
      eyebrow: "Your next step",
      href: "/en/nutrition/quiz",
      primaryLabel: "Start the assessment",
      secondaryHref: "/en",
      secondaryLabel: "Back to home",
      title: "Start with your HealthScore, then build from there"
    }
  },
  th: {
    labels: {
      adminPreview: "ตัวอย่างสำหรับแอดมิน",
      content: "คอนเทนต์",
      testimonialPreview: "ตัวอย่างคำรับรอง"
    },
    tokens: {
      archived: "ลบแล้ว",
      blog_post: "บทความ",
      deleted: "ลบแล้ว",
      draft: "ฉบับร่าง",
      published: "เผยแพร่แล้ว",
      scheduled: "ตั้งเวลาแล้ว",
      testimonial: "คำรับรอง"
    },
    cta: {
      body:
        "ใช้เวลาเพียงไม่กี่นาทีเพื่อดู HealthScore ของคุณ และเริ่มบทสนทนาที่เป็นส่วนตัวมากขึ้นเกี่ยวกับพลังงาน การนอน อาหาร งบประมาณ และสิ่งที่เหมาะกับชีวิตประจำวันของคุณจริงๆ",
      eyebrow: "ขั้นตอนถัดไป",
      href: "/th/nutrition/quiz",
      primaryLabel: "เริ่มทำแบบประเมิน",
      secondaryHref: "/th",
      secondaryLabel: "กลับหน้าหลัก",
      title: "เริ่มจาก HealthScore ของคุณ แล้วค่อยๆ สร้างแผนที่เหมาะกับคุณ"
    }
  },
  "zh-CN": {
    labels: {
      adminPreview: "管理员预览",
      content: "内容",
      testimonialPreview: "见证预览"
    },
    tokens: {
      archived: "已删除",
      blog_post: "博客文章",
      deleted: "已删除",
      draft: "草稿",
      published: "已发布",
      scheduled: "已定时",
      testimonial: "见证"
    },
    cta: {
      body:
        "花几分钟了解您的 HealthScore，并围绕精力、睡眠、饮食、预算以及真正适合日常生活的支持，开启更个性化的对话。",
      eyebrow: "下一步",
      href: "/zh-CN/nutrition/quiz",
      primaryLabel: "开始评估",
      secondaryHref: "/zh-CN",
      secondaryLabel: "返回首页",
      title: "从您的 HealthScore 开始，再逐步建立适合您的计划"
    }
  }
} satisfies Record<
  Locale,
  {
    cta: {
      body: string;
      eyebrow: string;
      href: string;
      primaryLabel: string;
      secondaryHref: string;
      secondaryLabel: string;
      title: string;
    };
    labels: Record<PreviewLabelKey, string>;
    tokens: Record<string, string>;
  }
>;

export function readablePreviewToken(
  locale: Locale,
  value: string | undefined,
  fallback: string
) {
  if (!value) {
    return fallback;
  }

  const tokens: Record<string, string> = adminContentPreviewCopy[locale].tokens;

  return (
    tokens[value] ??
    value
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
