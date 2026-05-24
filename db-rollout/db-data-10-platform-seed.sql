-- ============================================================================
-- db-data-10-platform-seed.sql
-- ============================================================================
-- MattaNutra rollout SQL
-- Seed small platform reference rows needed after a fresh schema rebuild.

begin;

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
