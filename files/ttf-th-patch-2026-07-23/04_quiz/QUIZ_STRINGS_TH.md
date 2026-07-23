# /th/nutrition/quiz — corrected Thai for post-v4 strings

The live questionnaire correctly uses **v4 as its base** — title, metadata (including the Thai
share card), the consent module, step-1 headings, the quote, เพศกำเนิด and its helper are all
the delivered copy. Keep all of that untouched.

Since v4 shipped, the questionnaire gained new fields and rewritten helpers, and their Thai was
written outside the review process. This file lists every affected string with its replacement.
**Copy-paste only.** Machine-readable version: `quiz-strings-th.json` (key → final string).

Verdicts: **REPLACE** = paste the new string · **RESTORE** = paste the v4 string back ·
**KEEP** = live is already correct, do not touch.

## Progress and steps

| # | EN (live) | Thai live | Verdict → Final Thai |
|---|---|---|---|
| Q1 | 2% complete. 36 essential signals left before the precision layer. | เสร็จแล้ว 2% ยังเหลือข้อมูลหลัก 36 ข้อก่อนเข้าสู่ชั้นความแม่นยำ | **REPLACE** → เสร็จแล้ว {pct}% — เหลือข้อมูลหลักอีก {n} ข้อ ก่อนเข้าสู่ขั้นความแม่นยำ |
| Q2 | Start / Essentials → 80% / Precision → 100% | เริ่มต้น / ข้อมูลหลัก → 80% / ความแม่นยำ → 100% | **KEEP** |
| Q3 | It's all you (step-1 group label) | พื้นฐาน | **REPLACE** → เรื่องของคุณ |
| Q4 | About you (step-1 name) | ข้อมูลพื้นฐาน | **KEEP** |

Q1 note: ข้อ is the correct classifier — keep it. ขั้น (stage), not ชั้น (layer/storey), for the
precision stage.

## Field helpers

| # | EN (live) | Thai live | Verdict → Final Thai |
|---|---|---|---|
| Q5 | Sunscreen use — Helps tune vitamin D and sun exposure context. | ช่วยปรับบริบทวิตามินดีและการได้รับแดด | **REPLACE** → ช่วยปรับการประเมินวิตามินดีร่วมกับการได้รับแสงแดด |
| Q6 | Country — Used for local context and product availability. | ใช้เพื่อปรับบริบทพื้นที่และสินค้าที่พร้อมใช้งาน | **REPLACE** → ใช้ปรับคำแนะนำตามพื้นที่และสินค้าที่มีจำหน่ายในประเทศของคุณ |
| Q7 | Select country (placeholder) | เลือกประเทศ | **KEEP**, but restore the ellipsis: เลือกประเทศ… |
| Q8 | Sex helper | ใช้ปรับความต้องการสารอาหารและแสดงคำถามด้านสุขภาพที่เกี่ยวข้องกับคุณ | **KEEP** (this is the reviewed v4 copy) |
| Q9 | Sun exposure label + helper | เวลาที่ได้รับแสงแดดต่อวัน / ช่วยประเมินการสังเคราะห์วิตามินดีควบคู่กับการได้รับแสงแดด | **KEEP** (v4 copy) |

Q5 note: แดด alone is too casual for this register and "ปรับบริบท" is calqued; the replacement
says what the sentence means. Q6 note: พร้อมใช้งาน is software-UI Thai ("feature available");
retail goods are มีจำหน่าย.

## Trust strip (three cards above the footer)

| # | EN (live) | Thai live | Verdict → Final Thai |
|---|---|---|---|
| Q10 | Reviewed for safety | ตรวจเพื่อความปลอดภัย | **RESTORE** → ตรวจสอบด้านความปลอดภัย |
| Q11 | Every formula is screened against your medicines, labs, and Thai FDA registration. | สูตรถูกตรวจร่วมกับยา แล็บ และบริบททะเบียน อย. ไทย | **RESTORE** → ทุกสูตรผ่านการคัดกรองเทียบกับยาที่ใช้ ผลตรวจทางห้องปฏิบัติการ และเลขทะเบียน อย. ไทย |
| Q12 | Private by default | เป็นส่วนตัวตั้งแต่ต้น | **RESTORE** → ความเป็นส่วนตัวตั้งแต่ต้น |
| Q13 | Your answers stay tied to your plan. We do not sell them or share them with advertisers. | คำตอบผูกกับแผนของคุณ เราไม่ขายหรือส่งให้ผู้ลงโฆษณา | **REPLACE** → คำตอบของคุณใช้เพื่อแผนของคุณเท่านั้น เราไม่ขายข้อมูลหรือเปิดเผยแก่ผู้โฆษณา |
| Q14 | Wellness, not diagnosis | สุขภาวะ ไม่ใช่การวินิจฉัย | **RESTORE** → คำแนะนำเพื่อสุขภาวะ ไม่ใช่การวินิจฉัย |
| Q15 | Guidance to support your goals, always shareable with your doctor. | คำแนะนำเพื่อสนับสนุนเป้าหมายสุขภาวะ และนำไปคุยกับแพทย์ได้ | **RESTORE** → คำแนะนำเพื่อสนับสนุนเป้าหมายของคุณ และสามารถนำไปปรึกษาแพทย์ได้เสมอ |

Q11 note: สูตรถูกตรวจ is English passive rendered literally; แล็บ is spoken-register; บริบททะเบียน
is a word-for-word calque. The v4 sentence carries the same meaning in the page's register.

## Email capture (ต้องพักก่อนหรือไม่?)

| # | EN (live) | Thai live | Verdict → Final Thai |
|---|---|---|---|
| Q16 | Leave your email and we will send a private link back to this exact spot. That is all it is for. | ฝากอีเมลไว้ แล้วเราจะส่งลิงก์ส่วนตัวเพื่อกลับมายังจุดนี้เท่านั้น | **REPLACE** → ฝากอีเมลไว้ แล้วเราจะส่งลิงก์ส่วนตัวสำหรับกลับมาทำต่อจากจุดนี้ เราใช้อีเมลของคุณเพื่อการนี้เท่านั้น |
| Q17 | Saved only to return you to your assessment. Never used for marketing without consent. | บันทึกไว้เพื่อกลับมาทำแบบประเมินต่อเท่านั้น ไม่ใช้เพื่อการตลาดหากไม่ได้ยินยอม | **REPLACE** → บันทึกไว้เพื่อพาคุณกลับมาทำแบบประเมินต่อเท่านั้น และจะไม่นำไปใช้ทางการตลาดโดยไม่ได้รับความยินยอม |

Q16 note: in the live sentence เท่านั้น attaches to the destination ("only back to this spot")
instead of the purpose — the meaning drifted.

## Units (height and weight)

English unit abbreviations returned to the Thai page — the same defect class fixed in v2.

| Live | Replace with |
|---|---|
| 170 cm | 170 ซม. |
| 5 ft 7 in | 5 ฟุต 7 นิ้ว |
| 70 kg | 70 กก. |
| 154 lb | 154 ปอนด์ |

## Country list (18 entries)

All 18 Thai country names on live are **correct and approved** — no changes:
ประเทศไทย, สิงคโปร์, มาเลเซีย, อินโดนีเซีย, ฟิลิปปินส์, เวียดนาม, เมียนมา, สหรัฐอเมริกา,
ออสเตรเลีย, สหราชอาณาจักร, แคนาดา, เยอรมนี, ฝรั่งเศส, ญี่ปุ่น, เกาหลีใต้, อินเดีย, จีน, อื่น ๆ

## Metadata

`og:locale` is currently `th` — change to `th_TH` (matches v4 and the other Thai pages).

---

**After applying:** run `python3 verification/lint_th.py` against the rendered page, and
`verify_deployment.py --compare` if a static snapshot is available. Zero occurrences expected
of: แล็บ, โปรโตคอลชีวิต, ไกด์, `cm`, `kg`.
