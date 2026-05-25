-- ============================================================================
-- db-data-10-platform-seed.sql
-- ============================================================================
-- MattaNutra rollout SQL
-- Seed small platform reference rows needed after a fresh schema rebuild.

begin;

insert into public.site_locales (
  code,
  label,
  native_label,
  html_lang,
  direction,
  fallback_locale,
  is_public,
  is_indexable,
  sort_order,
  created_at,
  updated_at
)
values
  ('en', 'EN', 'English', 'en', 'ltr', null, true, true, 10, now(), now()),
  ('th', 'TH', 'ไทย', 'th', 'ltr', 'en', true, true, 20, now(), now())
on conflict (code) do update set
  label = excluded.label,
  native_label = excluded.native_label,
  html_lang = excluded.html_lang,
  direction = excluded.direction,
  fallback_locale = excluded.fallback_locale,
  is_public = excluded.is_public,
  is_indexable = excluded.is_indexable,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.testimonials (
  id,
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
values
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a01'::uuid,
    'en',
    'published',
    'I turned 40 and realised I kept saying I wanted to make changes, but I didn''t know where to start. I had a drawer full of random vitamins and no real plan. MattaNutra gave me a clear first step, without making the whole process feel overwhelming.',
    'Daniel L.',
    '40, Bangkok · Project Manager',
    null,
    '/v11/portrait-daniel.jpg',
    'Daniel L. testimonial photo',
    10,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a02'::uuid,
    'en',
    'published',
    'Between work, travel, and caring for my family, my health routine became whatever I could remember to do that day. MattaNutra helped me turn a messy supplement shelf into a simple plan that fits real life in Singapore.',
    'Mei Lin T.',
    '45, Singapore · Operations Lead',
    null,
    '/v11/portrait-01.jpg',
    'Mei Lin T. testimonial photo',
    20,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a03'::uuid,
    'en',
    'published',
    'My doctor told me my blood pressure was creeping up and I needed to make changes. I spent hours researching supplements online and ended up more confused than when I started. MattaNutra cut through all the noise and built me something that actually fits my life.',
    'Wanida P. (วนิดา)',
    '43, Khon Kaen · Shop Owner',
    null,
    '/v11/portrait-02.jpg',
    'Wanida P. testimonial photo',
    30,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a04'::uuid,
    'en',
    'published',
    'I work in a clinic, so everyone assumes I know exactly what supplements to take. The honest truth was the more I read, the less sure I felt. MattaNutra finally gave me a clear, sensible plan I could trust — for myself this time, not just my patients.',
    'Malee S. (มาลี)',
    '41, Phuket · Nurse Aide',
    null,
    '/v11/portrait-03.jpg',
    'Malee S. testimonial photo',
    40,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a11'::uuid,
    'th',
    'published',
    'พออายุ 40 ผมรู้ตัวว่าพูดตลอดว่าอยากเปลี่ยน แต่ไม่รู้จะเริ่มตรงไหน ลิ้นชักเต็มไปด้วยวิตามินแบบสุ่ม ๆ MattaNutra ให้ก้าวแรกที่ชัดเจนโดยไม่ทำให้รู้สึกหนักเกินไป',
    'Daniel L.',
    '40, กรุงเทพฯ · ผู้จัดการโครงการ',
    null,
    '/v11/portrait-daniel.jpg',
    'ภาพคำรับรองของ Daniel L.',
    10,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a12'::uuid,
    'th',
    'published',
    'ระหว่างงาน การเดินทาง และดูแลครอบครัว กิจวัตรสุขภาพของฉันกลายเป็นอะไรที่นึกออกวันนั้น MattaNutra ช่วยเปลี่ยนชั้นอาหารเสริมที่ยุ่งให้เป็นแผนเรียบง่ายที่เข้ากับชีวิตจริง',
    'Mei Lin T.',
    '45, สิงคโปร์ · หัวหน้าฝ่ายปฏิบัติการ',
    null,
    '/v11/portrait-01.jpg',
    'ภาพคำรับรองของ Mei Lin T.',
    20,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a13'::uuid,
    'th',
    'published',
    'คุณหมอบอกว่าความดันเริ่มสูงและต้องปรับบางอย่าง ฉันค้นเรื่องอาหารเสริมอยู่นานจนสับสนกว่าเดิม MattaNutra ช่วยตัดเสียงรบกวนและสร้างแผนที่เข้ากับชีวิตฉัน',
    'Wanida P. (วนิดา)',
    '43, ขอนแก่น · เจ้าของร้าน',
    null,
    '/v11/portrait-02.jpg',
    'ภาพคำรับรองของ Wanida P.',
    30,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  ),
  (
    '27d8d2be-2d4d-4c59-9204-f00e951a1a14'::uuid,
    'th',
    'published',
    'ฉันทำงานในคลินิก ทุกคนเลยคิดว่าฉันรู้ว่าควรกินอะไร แต่ยิ่งอ่านก็ยิ่งไม่แน่ใจ MattaNutra ให้แผนที่ชัด สมเหตุผล และไว้ใจได้สำหรับตัวฉันเอง',
    'Malee S. (มาลี)',
    '41, ภูเก็ต · ผู้ช่วยพยาบาล',
    null,
    '/v11/portrait-03.jpg',
    'ภาพคำรับรองของ Malee S.',
    40,
    'homepage_v11_seed',
    '{"homepage": true, "source": "v11_homepage"}'::jsonb,
    now(),
    now()
  )
on conflict (id) do update set
  locale = excluded.locale,
  status = excluded.status,
  quote = excluded.quote,
  author_name = excluded.author_name,
  author_title = excluded.author_title,
  author_handle = excluded.author_handle,
  author_image_url = excluded.author_image_url,
  author_image_alt = excluded.author_image_alt,
  sort_order = excluded.sort_order,
  source_agent = excluded.source_agent,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.agents (
  id,
  name,
  agent_type,
  status,
  capabilities,
  model,
  metadata,
  last_seen_at,
  created_at,
  updated_at
)
values
  (
    '668ee3d3-00ec-48a0-86cc-8091af904eda'::uuid,
    'HealthScore Engine',
    'ai',
    'active',
    array[
      'healthscore_analysis',
      'sales_copy'
    ]::text[],
    'grok:healthscore',
    '{"seeded": true, "usesModel": true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    'ef8472a6-2049-44e0-a001-3f5d6963499f'::uuid,
    'Nutrition Plan Formulator',
    'ai',
    'active',
    array[
      'formulation_generation',
      'free_example_formulation'
    ]::text[],
    'grok:formulation',
    '{"seeded": true, "usesModel": true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    'b955a43d-2506-4f31-8955-ec7dd599a5f5'::uuid,
    'Nutrition Plan Advisor',
    'ai',
    'active',
    array[
      'nutrition_plan_chat',
      'nutrition_plan_refinement',
      'nutrition_report_generation'
    ]::text[],
    'grok:nutrition-advisor',
    '{"seeded": true, "usesModel": true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '1fa305ca-e68c-40f1-bd6e-a7cbc632d210'::uuid,
    'Safety Scanner',
    'deterministic',
    'active',
    array[
      'dose_normalization',
      'supplement_review_triage',
      'supplement_safety_scan'
    ]::text[],
    null,
    '{"seeded": true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '28e0d3fd-4f6f-4877-92bc-bb77024496d4'::uuid,
    'Product Matcher',
    'deterministic',
    'active',
    array[
      'dose_normalization',
      'product_recommendation',
      'supplement_safety_scan'
    ]::text[],
    null,
    '{"seeded": true, "marketRegion": "TH"}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '161f03a5-70ec-4e56-b54e-b23daee2e520'::uuid,
    'Communications Coordinator',
    'deterministic',
    'active',
    array[
      'client_safety_followup',
      'communication_dispatch',
      'communication_route'
    ]::text[],
    null,
    '{"seeded": true, "channelFallbackOrder": ["chat", "email"]}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '5a72e41c-4535-4d28-8043-51448af40343'::uuid,
    'Email Dispatcher',
    'deterministic',
    'active',
    array[
      'email_send',
      'free_email_send',
      'reassessment_email_send'
    ]::text[],
    null,
    '{"seeded": true, "channelFamily": "email"}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    'bd2db46f-149a-4d7c-8805-25efcb621b3d'::uuid,
    'Content Publisher',
    'deterministic',
    'active',
    array[
      'content_publish'
    ]::text[],
    null,
    '{"seeded": true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '8386c905-f607-4d5f-bb5f-3a98a598294d'::uuid,
    'Chat Dispatcher',
    'external',
    'active',
    array[
      'chat_send',
      'communication_dispatch',
      'line_send',
      'telegram_send',
      'whatsapp_send'
    ]::text[],
    null,
    '{"seeded": true, "channelFamily": "chat"}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '5ccf4955-5b2b-4240-aa75-d5d7dfc9b380'::uuid,
    'Human Reviewer',
    'human',
    'active',
    array[
      'food_guidance_review',
      'food_review',
      'formulation_review',
      'human_review',
      'product_review',
      'safety_review',
      'supplement_governance',
      'supplement_review'
    ]::text[],
    null,
    '{"seeded": true}'::jsonb,
    null,
    now(),
    now()
  ),
  (
    '436cc481-6639-402e-b639-bf5737e3acd4'::uuid,
    'Scheduler',
    'deterministic',
    'active',
    array[
      'communication_dispatch',
      'hosting_cost_sync',
      'scheduler'
    ]::text[],
    null,
    '{"seeded": true}'::jsonb,
    null,
    now(),
    now()
  )
on conflict ((lower(name))) do update set
  agent_type = excluded.agent_type,
  capabilities = excluded.capabilities,
  model = excluded.model,
  metadata = public.agents.metadata || excluded.metadata,
  status = case
    when public.agents.status in ('offline', 'paused', 'retired')
      then public.agents.status
    else excluded.status
  end,
  updated_at = now();

insert into public.finance_accounts (
  id,
  name,
  description,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'xAI',
    'xAI Grok API usage costs.',
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'DigitalOcean',
    'DigitalOcean hosting, app platform, database, storage, and network costs.',
    now(),
    now()
  ),
  (
    '33333333-3333-4333-8333-333333333333'::uuid,
    'Stripe',
    'Stripe payment processing and settlement.',
    now(),
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444444'::uuid,
    'MattaNutra revenue',
    'MattaNutra customer payment revenue.',
    now(),
    now()
  ),
  (
    '55555555-5555-4555-8555-555555555555'::uuid,
    'Stripe clearing',
    'Stripe clearing account for customer payments before payout reconciliation.',
    now(),
    now()
  ),
  (
    '66666666-6666-4666-8666-666666666666'::uuid,
    'MattaNutra bank',
    'MattaNutra bank or settlement account for Stripe payouts.',
    now(),
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.admin_conversion_targets (
  target_id,
  target_rate,
  description,
  updated_by,
  created_at,
  updated_at
)
values
  ('landingVisitors', 100, 'Entry benchmark', 'schema_default', now(), now()),
  ('assessmentStarts', 30, 'Landed visitors who start the assessment', 'schema_default', now(), now()),
  ('assessmentCompletions', 65, 'Assessment starts that complete submission', 'schema_default', now(), now()),
  ('healthScoreViews', 95, 'Completed assessments that view HealthScore', 'schema_default', now(), now()),
  ('freeRequests', 20, 'HealthScore views that request the Free email', 'schema_default', now(), now()),
  ('precisionConversions', 5, 'HealthScore views that buy Precision', 'schema_default', now(), now()),
  ('proConversions', 1, 'HealthScore views that buy Pro', 'schema_default', now(), now())
on conflict (target_id) do nothing;

commit;
