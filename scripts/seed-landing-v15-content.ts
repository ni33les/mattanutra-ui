import { randomUUID } from "node:crypto";
import { getLandingPageCopy } from "@/components/landing-page-copy";
import { getSql } from "@/lib/db";
import { publicLocales, type Locale } from "@/lib/i18n";

const testimonialGroups = [
  "9cc74e1f-725a-43be-b91c-a1fd9859d501",
  "bbf4232d-80c8-44fd-a979-8c4fd8ceae8b",
  "52726490-195c-4a64-9c31-af9b66b88a4c",
  "f530691b-b7a7-454f-a20f-c1b4599d9605"
] as const;

const blogGroups = [
  "83d53770-c5a1-421b-96bb-9a9f9a98af81",
  "577a59d9-bb5b-42f4-b2de-42c5ba589d4f",
  "aee34244-d750-4b6a-8486-83ed4a394889"
] as const;

const blogSlugs = [
  "why-more-is-rarely-the-answer-with-supplements",
  "magnesium-rich-everyday-foods",
  "travel-changes-what-your-body-needs"
] as const;

const blogTags = [
  ["Foundations", "Supplements"],
  ["Nutrition", "Food-first"],
  ["Living well", "Travel"]
] as const;

const blogBodies = {
  en: [
    {
      closing:
        "The right amount is not the smallest amount or the largest amount. It is the amount that fits your body, your context, and your real routine.",
      intro:
        "Supplement labels are built for broad populations, not your body. More can be wasteful, uncomfortable, or simply unnecessary when food and existing intake already cover the gap.",
      points: [
        {
          title: "Sufficiency beats intensity",
          body:
            "A good supplement plan starts with what is missing, not with the biggest dose on the shelf."
        },
        {
          title: "Context changes the dose",
          body:
            "Body size, diet, sleep, training, medications and sun exposure all change what enough looks like."
        },
        {
          title: "Safety matters",
          body:
            "The right amount also avoids stacking ingredients that may overlap or conflict with your current routine."
        }
      ]
    },
    {
      closing:
        "When your plate can do the job, the smartest supplement decision may be to skip the capsule.",
      intro:
        "Magnesium is not only found in bottles. Many everyday foods quietly provide meaningful amounts and bring fibre, minerals and plant compounds with them.",
      points: [
        {
          title: "Start with seeds and legumes",
          body:
            "Pumpkin seeds, black beans, chickpeas and lentils are useful, practical sources."
        },
        {
          title: "Greens help too",
          body:
            "Spinach and other leafy greens can add steady support when they appear often."
        },
        {
          title: "Whole foods compound benefits",
          body:
            "Food sources rarely bring one nutrient alone; that is part of why MattaNutra treats food and supplements together."
        }
      ]
    },
    {
      closing:
        "Travel does not require a new plan from scratch. It often needs a few precise adjustments.",
      intro:
        "Timezones, dehydration, disrupted meals and poor sleep can shift what your body needs before you notice the pattern.",
      points: [
        {
          title: "Sleep timing moves",
          body:
            "A supplement that normally works at home may need a different timing window when your evening shifts."
        },
        {
          title: "Hydration changes the maths",
          body:
            "Flights and hotter climates can make electrolytes and fluids matter more for a short period."
        },
        {
          title: "Keep the base steady",
          body:
            "Living Protocol adjusts around your foundation rather than rebuilding your whole routine every trip."
        }
      ]
    }
  ],
  th: [
    {
      closing:
        "ปริมาณที่พอดีไม่ใช่น้อยที่สุดหรือมากที่สุด แต่คือปริมาณที่เข้ากับร่างกาย บริบท และกิจวัตรจริงของคุณ",
      intro:
        "ฉลากอาหารเสริมถูกออกแบบสำหรับคนจำนวนมาก ไม่ใช่ร่างกายของคุณโดยตรง การมากขึ้นอาจสิ้นเปลือง ไม่สบายตัว หรือไม่จำเป็นเมื่ออาหารและสิ่งที่ใช้อยู่ครอบคลุมแล้ว",
      points: [
        {
          title: "ความพอเพียงสำคัญกว่าความแรง",
          body: "แผนที่ดีเริ่มจากสิ่งที่ขาด ไม่ใช่ขนาดที่สูงที่สุดบนชั้นวาง"
        },
        {
          title: "บริบทเปลี่ยนขนาดที่เหมาะ",
          body: "ขนาดตัว อาหาร การนอน การออกกำลัง ยา และแดด ล้วนเปลี่ยนคำว่าพอ"
        },
        {
          title: "ความปลอดภัยต้องมาก่อน",
          body: "ปริมาณที่พอดีต้องหลีกเลี่ยงการซ้อนส่วนผสมที่อาจทับกันหรือขัดกับกิจวัตรเดิม"
        }
      ]
    },
    {
      closing:
        "เมื่ออาหารทำหน้าที่ได้ดี การตัดสินใจเรื่องอาหารเสริมที่ฉลาดที่สุดอาจเป็นการข้ามแคปซูลนั้น",
      intro:
        "แมกนีเซียมไม่ได้อยู่แค่ในขวด อาหารประจำวันหลายอย่างให้แมกนีเซียมได้ดี พร้อมใยอาหาร แร่ธาตุ และสารจากพืช",
      points: [
        {
          title: "เริ่มจากเมล็ดพืชและถั่ว",
          body: "เมล็ดฟักทอง ถั่วดำ ถั่วชิกพี และเลนทิลเป็นแหล่งที่ใช้ได้จริง"
        },
        {
          title: "ผักใบเขียวก็ช่วย",
          body: "ผักโขมและผักใบเขียวอื่น ๆ ช่วยได้เมื่ออยู่ในมื้ออาหารสม่ำเสมอ"
        },
        {
          title: "อาหารทั้งชิ้นให้ประโยชน์ร่วมกัน",
          body: "อาหารมักไม่ได้ให้สารอาหารเดียว นี่คือเหตุผลที่ MattaNutra มองอาหารและอาหารเสริมไปด้วยกัน"
        }
      ]
    },
    {
      closing:
        "การเดินทางไม่จำเป็นต้องเริ่มแผนใหม่ทั้งหมด ส่วนใหญ่ต้องการเพียงการปรับเล็กน้อยที่แม่นยำ",
      intro:
        "เขตเวลา ภาวะขาดน้ำ มื้ออาหารที่เปลี่ยน และการนอนไม่ดี อาจเปลี่ยนสิ่งที่ร่างกายต้องการก่อนที่คุณจะเห็นรูปแบบ",
      points: [
        {
          title: "เวลานอนเปลี่ยน",
          body: "อาหารเสริมที่ใช้ได้ดีที่บ้านอาจต้องเปลี่ยนเวลาเมื่อช่วงเย็นของคุณเลื่อนไป"
        },
        {
          title: "น้ำในร่างกายเปลี่ยนสมการ",
          body: "เที่ยวบินและอากาศร้อนอาจทำให้อิเล็กโทรไลต์และน้ำสำคัญขึ้นชั่วคราว"
        },
        {
          title: "รักษาฐานหลักให้คงที่",
          body: "Living Protocol ปรับรอบฐานเดิม แทนที่จะสร้างกิจวัตรใหม่ทุกครั้งที่เดินทาง"
        }
      ]
    }
  ],
  "zh-CN": [
    {
      closing:
        "适量不是最少，也不是最多，而是适合您的身体、情境和真实日常的量。",
      intro:
        "补充剂标签面向广泛人群，而不是您的身体。当饮食和现有摄入已覆盖缺口时，更多可能浪费、不适，或根本不必要。",
      points: [
        {
          title: "充足胜过强度",
          body: "好的补充剂计划从缺什么开始，而不是从货架上最大剂量开始。"
        },
        {
          title: "情境改变剂量",
          body: "体型、饮食、睡眠、训练、用药和日晒都会改变“足够”的样子。"
        },
        {
          title: "安全很重要",
          body: "适量也意味着避免叠加可能重叠或与当前日常冲突的成分。"
        }
      ]
    },
    {
      closing:
        "当餐盘已经能完成任务时，最聪明的补充剂决定可能就是跳过胶囊。",
      intro:
        "镁并不只存在于瓶子里。许多日常食物能安静地提供有意义的镁，同时带来纤维、矿物质和植物化合物。",
      points: [
        {
          title: "从种子和豆类开始",
          body: "南瓜子、黑豆、鹰嘴豆和扁豆都是实用来源。"
        },
        {
          title: "绿叶蔬菜也有帮助",
          body: "菠菜和其他绿叶菜如果经常出现，也能提供稳定支持。"
        },
        {
          title: "全食物带来复合收益",
          body: "食物很少只带来一种营养，这也是 MattaNutra 将食物和补充剂一起考虑的原因。"
        }
      ]
    },
    {
      closing:
        "旅行不需要从头制定新计划，通常只需要几处精准调整。",
      intro:
        "时区、脱水、饮食中断和睡眠不佳，都会在您察觉模式之前改变身体需求。",
      points: [
        {
          title: "睡眠时间会移动",
          body: "在家有效的补充剂，到旅途中可能需要不同的服用时间窗口。"
        },
        {
          title: "水分改变计算",
          body: "飞行和更热的气候会让电解质和补水在短期内更重要。"
        },
        {
          title: "保持基础稳定",
          body: "Living Protocol 是围绕基础进行调整，而不是每次旅行都重建整套日常。"
        }
      ]
    }
  ]
} satisfies Record<Locale, readonly Record<string, unknown>[]>;

function postMarkdown(
  title: string,
  body: Readonly<{
    closing: string;
    intro: string;
    points: readonly Readonly<{ body: string; title: string }>[];
  }>
) {
  return [
    `# ${title}`,
    body.intro,
    ...body.points.flatMap((point) => [`## ${point.title}`, point.body]),
    body.closing
  ].join("\n\n");
}

async function main() {
  const sql = getSql();

  if (!sql) {
    throw new Error("DB_URL is required");
  }

  let testimonialsWritten = 0;
  let blogsWritten = 0;

  for (const locale of publicLocales) {
    const landing = getLandingPageCopy(locale);
    const testimonialIds: string[] = [];

    for (const [index, testimonial] of landing.results.fallback.entries()) {
      const rows = await sql<Array<{ id: string }>>`
        insert into public.testimonials (
          id,
          translation_group_id,
          locale,
          status,
          quote,
          author_name,
          author_title,
          author_handle,
          author_image_url,
          author_image_alt,
          sort_order,
          source_agent,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()}::uuid,
          ${testimonialGroups[index]}::uuid,
          ${locale},
          'published',
          ${testimonial.quote},
          ${testimonial.name},
          ${testimonial.place},
          ${testimonial.role},
          ${testimonial.image},
          ${testimonial.imageAlt},
          ${index + 1},
          'landing_v15_seed',
          ${sql.json({
            homepage: true,
            homepageSortOrder: index + 1,
            homepageVersion: "v15",
            seedKey: `landing-v15-testimonial-${testimonial.id}`
          })},
          now(),
          now()
        )
        on conflict (translation_group_id, locale) do update set
          status = excluded.status,
          quote = excluded.quote,
          author_name = excluded.author_name,
          author_title = excluded.author_title,
          author_handle = excluded.author_handle,
          author_image_url = excluded.author_image_url,
          author_image_alt = excluded.author_image_alt,
          sort_order = excluded.sort_order,
          source_agent = excluded.source_agent,
          metadata = public.testimonials.metadata || excluded.metadata,
          updated_at = now()
        returning id::text
      `;

      if (rows[0]?.id) {
        testimonialIds[index] = rows[0].id;
      }
      testimonialsWritten += 1;
    }

    for (const [index, fallback] of landing.journal.fallback.entries()) {
      const [tag, title, excerpt] = fallback;
      const body = blogBodies[locale][index];
      const slug = blogSlugs[index];
      const contentMarkdown = postMarkdown(title, body);

      await sql`
        insert into public.blog_posts (
          id,
          translation_group_id,
          locale,
          slug,
          status,
          title,
          subtitle,
          excerpt,
          content_markdown,
          body,
          image_url,
          image_alt,
          testimonial_id,
          tags,
          seo_title,
          seo_description,
          social_title,
          social_description,
          social_image_url,
          source_channel,
          source_agent,
          source_ref,
          metadata,
          published_at,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()}::uuid,
          ${blogGroups[index]}::uuid,
          ${locale},
          ${slug},
          'published',
          ${title},
          ${excerpt},
          ${excerpt},
          ${contentMarkdown},
          ${sql.json(body)},
          ${null},
          ${title},
          ${testimonialIds[index] ?? null}::uuid,
          ${blogTags[index]},
          ${title},
          ${excerpt},
          ${title},
          ${excerpt},
          ${null},
          'landing',
          'landing_v15_seed',
          ${`landing-v15-blog-${index + 1}`},
          ${sql.json({
            homepage: true,
            homepageSortOrder: index + 1,
            homepageVersion: "v15",
            seedKey: `landing-v15-blog-${index + 1}`,
            tag
          })},
          now(),
          now(),
          now()
        )
        on conflict (translation_group_id, locale) do update set
          slug = excluded.slug,
          status = excluded.status,
          title = excluded.title,
          subtitle = excluded.subtitle,
          excerpt = excluded.excerpt,
          content_markdown = excluded.content_markdown,
          body = excluded.body,
          image_url = excluded.image_url,
          image_alt = excluded.image_alt,
          testimonial_id = excluded.testimonial_id,
          tags = excluded.tags,
          seo_title = excluded.seo_title,
          seo_description = excluded.seo_description,
          social_title = excluded.social_title,
          social_description = excluded.social_description,
          social_image_url = excluded.social_image_url,
          source_channel = excluded.source_channel,
          source_agent = excluded.source_agent,
          source_ref = excluded.source_ref,
          metadata = public.blog_posts.metadata || excluded.metadata,
          published_at = excluded.published_at,
          updated_at = now()
      `;

      blogsWritten += 1;
    }
  }

  console.log(
    `[landing:v15] seeded testimonials=${testimonialsWritten} blogs=${blogsWritten}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
