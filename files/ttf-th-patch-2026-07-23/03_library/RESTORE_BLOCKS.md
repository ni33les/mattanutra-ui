# /th/library — restore two re-translated blocks

The live page correctly uses the delivered body (all 35 cards, chips, search, footer). Two
blocks, however, were **re-translated instead of pasted**, and they read as translated Thai —
passive constructions and calqued word order that the rest of the page was specifically
re-authored to avoid. Both are one-paragraph copy-paste fixes. Source of truth:
`library-th.html` in this folder (body is byte-identical to the 19 July delivery).

## Block 1 — Hero standfirst (paragraph under เรียนรู้ปริมาณที่พอดี)

**Currently live (replace):**

> คำตอบเรื่องอาหารเสริมที่คนถามจริงอย่างชัดเจนและอ้างอิงหลักฐาน - แมกนีเซียม วิตามินดี โอเมกา-3 การนอน และอื่น ๆ ทุกหน้าถูกเขียนมาเพื่อช่วยให้คุณตัดสินใจจากความรู้ ไม่ใช่การเดา

**Delivered copy (paste this):**

> คำตอบที่ชัดเจนและอ้างอิงหลักฐาน สำหรับคำถามเรื่องอาหารเสริมที่คนถามกันจริง ๆ ทั้งแมกนีเซียม วิตามินดี โอเมกา-3 การนอน และอื่น ๆ ทุกบทความเขียนขึ้นเพื่อช่วยให้คุณตัดสินใจจากการรู้จริง ไม่ใช่การเดา

Why it matters: ทุกหน้าถูกเขียนมา is English passive voice rendered literally; the ASCII "-"
and the word order of อย่างชัดเจน mark the sentence as translated. The delivered sentence is
the reviewed native line.

The line below it — พร้อมด้วย Nong Matta ผู้ช่วยประจำคลังความรู้ของเรา — is already correct
on live. Keep it.

## Block 2 — Closing CTA (above the footer, next to the celebrating Nong Matta)

**Currently live (replace):**

> พร้อมทำให้คำแนะนำเป็นของคุณจริง ๆ หรือยัง?
> ใช้เวลาไม่กี่นาทีเพื่อให้ MattaNutra เข้าใจบริบทของคุณ แล้วเปลี่ยนคำตอบกว้าง ๆ เป็นปริมาณที่พอดี

**Delivered copy (paste this):**

Heading (two lines, break after ที่ดี):

> การอ่านคือจุดเริ่มต้นที่ดี
> แต่การรู้จริงดีกว่า

Body:

> เปลี่ยนสิ่งที่คุณได้เรียนรู้ ให้เป็นแผนที่ออกแบบเพื่อร่างกายของคุณ เริ่มต้นฟรี ไม่ต้องใช้บัตรเครดิต

Button: เริ่มประเมินฟรี (already correct on live).

## Also on this page (from `library-th.html` head — see 00_START_HERE Priority 3)

The page's metadata should switch to the Thai set in the updated file: Thai meta description,
Thai og:title/og:description, and `og:image` →
`https://www.mattanutra.com/assets/og/mattanutra-library-th.jpg` (card included in this pack).
The English metadata currently live matches what we originally delivered — that was our gap,
now fixed in the updated `library-th.html`.

## Known and accepted (no action)

- Card order is CMS-sorted differently from the delivered file — fine.
- Card excerpts use each article's meta description instead of the index's curated excerpts.
  The text is still the delivered Thai, so integrity holds. If you ever want the curated
  excerpts (they avoid repeating the title inside the card), they are in the delivered
  `library-th.html` / `library-manifest.json`.
- Search placeholder, if not yet wired: ค้นหาในคลังความรู้ — ลองพิมพ์ “แมกนีเซียม” หรือ “การนอน”
  and the JS result counter format: พบ {n} บทความ.
