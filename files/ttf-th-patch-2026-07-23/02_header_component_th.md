# Shared Thai header component — correct strings

The global TH header (Next.js shared layout) still renders the old translation. The global
footer already uses the new Thai — this brings the header in line with it, the landing page,
and the locked glossary. **Copy-paste each string exactly; do not retype.**

## Availability banner

| Current live | Replace with (from v20) |
|---|---|
| พร้อมให้บริการใน | พร้อมให้บริการแล้วใน |
| เร็ว ๆ นี้ | เปิดเร็ว ๆ นี้ |

Country names in the banner (ไทย, สิงคโปร์, มาเลเซีย, ฟิลิปปินส์) are already correct.

## Logo tagline

รู้ปริมาณที่พอดี — already correct, keep.

## Nav items

| Current live | Replace with | Why |
|---|---|---|
| โปรโตคอลชีวิต | Living Protocol | Locked brand term — never translated (matches footer, landing, all 35 articles) |
| วิธีทำงาน | วิธีการทำงาน | Matches footer + landing |
| คำมั่น | คำมั่นของเรา | Matches footer + landing |
| คลังความรู้ | คลังความรู้ | Correct, keep |

## Header CTA button

| Current live | Replace with |
|---|---|
| ออกแบบปริมาณที่พอดีของคุณ | เริ่มประเมินฟรี |

v20 also ships a compact mobile variant of this button: **ออกแบบ →** (used only where the full
label doesn't fit). If the shared header has a mobile CTA slot, use that string.

## Language switcher

EN · TH · 中文 — unchanged. (All 中文 routes are `/zh-CN/…`, per the 15 July correction.)

---

After updating the component, `/th`, `/th/library` and `/th/nutrition/quiz` should all show an
identical header. Quick check: the string โปรโตคอลชีวิต should appear **zero** times anywhere
on the site.
