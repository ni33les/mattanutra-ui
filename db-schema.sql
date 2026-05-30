-- MattaNutra database schema
-- Destructive PostgreSQL rebuild script.
--
-- This file is intentionally schema-first: it creates the current database
-- shape from scratch and does not contain migration/backfill patch logic.
-- Apply the db-data-* files afterwards to seed catalogue data.
--
-- WARNING: this deletes MattaNutra app tables and app enum/function objects
-- before rebuilding them. It does not drop the whole public schema, so
-- unrelated extensions or non-app objects in public are left alone.

create schema if not exists public;
create extension if not exists pgcrypto;

drop table if exists
  public.admin_alert_acknowledgements,
  public.admin_audit_events,
  public.admin_auth_challenges,
  public.admin_conversion_targets,
  public.admin_invitations,
  public.admin_passkey_credentials,
  public.admin_sessions,
  public.agent_credentials,
  public.agents,
  public.ai_response_cache,
  public.assessment_events,
  public.assessment_example_requests,
  public.assessment_formulations,
  public.assessment_submissions,
  public.assessment_versions,
  public.assessments,
  public.blog_posts,
  public.blog_testimonials,
  public.bpm,
  public.communication_channels,
  public.communication_identities,
  public.communication_messages,
  public.cron,
  public.finance_accounts,
  public.finance_transactions,
  public.food_admin_audit,
  public.food_aliases,
  public.food_guidance,
  public.food_nutrient_profiles,
  public.food_safety_rules,
  public.food_serving_sizes,
  public.food_translations,
  public.foods,
  public.formulations,
  public.goals,
  public.legacy_assessment_events,
  public.legacy_product_fact_versions,
  public.legacy_supplement_alias_events,
  public.marketplace_products,
  public.nutrients,
  public.nutrition_plan_versions,
  public.nutrition_reports,
  public.organisation_memberships,
  public.organisations,
  public.payment_versions,
  public.payments,
  public.people,
  public.plan_chat_messages,
  public.plan_communication_identities,
  public.plan_feedback,
  public.plan_guidance_adjustments,
  public.plan_runs,
  public.product_admin_audit,
  public.product_affiliate_links,
  public.product_brand_countries,
  public.product_brands,
  public.product_countries,
  public.product_import_translations,
  public.product_fact_versions,
  public.product_facts,
  public.product_import_runs,
  public.product_imports,
  public.product_offers,
  public.product_recommendation_decisions,
  public.product_recommendation_items,
  public.product_recommendation_runs,
  public.product_translations,
  public.product_versions,
  public.products,
  public.rays,
  public.recommendations,
  public.safety_reviews,
  public.site_locales,
  public.stripe_webhook_events,
  public.supplement_admin_audit,
  public.supplement_alias_events,
  public.supplement_aliases,
  public.supplement_recommendation_selections,
  public.supplement_safety_limits,
  public.supplement_translations,
  public.supplement_versions,
  public.supplements,
  public.task_approvals,
  public.task_comments,
  public.task_dependencies,
  public.task_events,
  public.task_reservations,
  public.tasks,
  public.testimonials,
  public.worker_sessions
cascade;

drop function if exists public.mattanutra_supplement_safety_flags(text) cascade;
drop function if exists public.prevent_domain_history_mutation() cascade;
drop function if exists public.prevent_domain_version_mutation() cascade;
drop function if exists public.prevent_task_dependency_cycle() cascade;
drop function if exists public.prevent_task_events_mutation() cascade;

drop type if exists public.assessment_status cascade;
drop type if exists public.assessment_plan cascade;

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


--
-- Name: assessment_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assessment_plan AS ENUM (
    'precision',
    'pro'
);


--
-- Name: assessment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assessment_status AS ENUM (
    'captured',
    'queued',
    'preparing',
    'ready',
    'failed'
);


--
-- Name: mattanutra_supplement_safety_flags(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mattanutra_supplement_safety_flags(raw_flag text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  with normalized as (
    select lower(coalesce(raw_flag, '')) as flag
  ), matched as (
    select unnest(array_remove(array[
      case when flag like '%exclude%' then 'exclude_automated_use' end,
      case when flag like '%regulatory%' or flag like '%prescription%' then 'regulatory_risk' end,
      case when flag like '%pregnan%' then 'pregnancy_caution' end,
      case when flag like '%warfarin%' or flag like '%med%' or flag like '%acei%' or flag like '%arb%' or flag like '%ssri%' or flag like '%serotonin%' or flag like '%anticoagulant%' then 'medication_interaction' end,
      case when flag like '%bleed%' or flag like '%antiplatelet%' then 'bleeding_risk' end,
      case when flag like '%liver%' then 'liver_caution' end,
      case when flag like '%kidney%' or flag like '%renal%' then 'kidney_caution' end,
      case when flag like '%stimulant%' or flag like '%caffeine%' then 'stimulant' end,
      case when flag like '%hormon%' or flag like '%thyroid%' or flag like '%estrogen%' or flag like '%dht%' or flag like '%testosterone%' then 'hormone_caution' end,
      case when flag like '%allerg%' or flag like '%shellfish%' or flag like '%fish%' or flag like '%dairy%' then 'allergy_caution' end,
      case when flag like '%contamination%' or flag like '%heavy metal%' or flag like '%purified%' or flag like '%coa%' then 'contamination_risk' end,
      case when flag like '%condition%' or flag like '%disease%' or flag like '%hypertension%' or flag like '%g6pd%' or flag like '%autoimmune%' or flag like '%seizure%' or flag like '%surgery%' or flag like '%glucose%' or flag like '%diabetes%' or flag like '%hypercalcemia%' or flag like '%neuropathy%' or flag like '%stone%' then 'condition_caution' end,
      case when flag like '%upper%' or flag like '%ul%' or flag like '%dose%' then 'upper_dose_risk' end
    ]::text[], null)) as flag
    from normalized
  )
  select case
    when exists (select 1 from matched) then (
      select array_agg(distinct flag order by flag)
      from matched
    )
    when trim(coalesce(raw_flag, '')) <> '' then array['general_caution']::text[]
    else '{}'::text[]
  end;
$$;


--
-- Name: prevent_domain_version_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_domain_version_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception '% is an append-only version table', tg_table_name;
end;
$$;


--
-- Name: prevent_task_dependency_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

create or replace function public.prevent_task_dependency_cycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  previous_task_id uuid := null;
  previous_depends_on_task_id uuid := null;
begin
  perform pg_advisory_xact_lock(1413563211, 1145393235);

  if tg_op = 'UPDATE' then
    previous_task_id := old.task_id;
    previous_depends_on_task_id := old.depends_on_task_id;
  end if;

  if new.task_id = new.depends_on_task_id then
    raise exception 'Task cannot depend on itself'
      using errcode = '23514';
  end if;

  if exists (
    with recursive dependency_path(task_id) as (
      select new.depends_on_task_id
      union
      select task_dependencies.depends_on_task_id
      from public.task_dependencies
      inner join dependency_path
        on dependency_path.task_id = task_dependencies.task_id
      where previous_task_id is null
        or task_dependencies.task_id <> previous_task_id
        or task_dependencies.depends_on_task_id <> previous_depends_on_task_id
    )
    select 1
    from dependency_path
    where task_id = new.task_id
  ) then
    raise exception 'Task dependency cycle detected'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


--
-- Name: prevent_task_events_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_task_events_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'task_events is append-only';
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_alert_acknowledgements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_alert_acknowledgements (
    id uuid NOT NULL,
    source text NOT NULL,
    source_id text NOT NULL,
    status text DEFAULT 'acknowledged'::text NOT NULL,
    actor text DEFAULT 'admin_api'::text NOT NULL,
    note text,
    acknowledged_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_alert_acknowledgements_source_check CHECK ((source = ANY (ARRAY['bpm'::text, 'cron'::text, 'task'::text, 'task_event'::text]))),
    CONSTRAINT admin_alert_acknowledgements_status_check CHECK ((status = ANY (ARRAY['acknowledged'::text, 'resolved'::text])))
);


--
-- Name: admin_conversion_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_conversion_targets (
    target_id text NOT NULL,
    target_rate numeric(5,2) NOT NULL,
    description text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_conversion_targets_rate_check CHECK (((target_rate >= (0)::numeric) AND (target_rate <= (100)::numeric)))
);


--
-- Name: organisations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    slug text NOT NULL,
    name text NOT NULL,
    organisation_type text DEFAULT 'tenant'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    default_locale text DEFAULT 'en'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organisations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'archived'::text]))),
    CONSTRAINT organisations_type_check CHECK ((organisation_type = ANY (ARRAY['platform'::text, 'tenant'::text])))
);


--
-- Name: people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    email text NOT NULL,
    display_name text NOT NULL,
    preferred_locale text DEFAULT 'en'::text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT people_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'invited'::text])))
);


--
-- Name: organisation_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisation_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    principal_type text DEFAULT 'person'::text NOT NULL,
    person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
    agent_id uuid,
    role text NOT NULL,
    title text,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organisation_memberships_principal_type_check CHECK ((principal_type = ANY (ARRAY['person'::text, 'agent'::text]))),
    CONSTRAINT organisation_memberships_principal_check CHECK ((((principal_type = 'person'::text) AND (person_id IS NOT NULL) AND (agent_id IS NULL)) OR ((principal_type = 'agent'::text) AND (agent_id IS NOT NULL) AND (person_id IS NULL)))),
    CONSTRAINT organisation_memberships_role_check CHECK (((principal_type = 'person'::text) AND (role = ANY (ARRAY['platform_owner'::text, 'platform_admin'::text, 'retail_admin'::text, 'retail_agent'::text, 'retail_assistant'::text])) OR ((principal_type = 'agent'::text) AND (role = ANY (ARRAY['platform_agent'::text, 'retail_agent'::text]))))),
    CONSTRAINT organisation_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text, 'disabled'::text, 'invited'::text])))
);


--
-- Name: admin_passkey_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_passkey_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    credential_id text NOT NULL,
    credential_public_key text NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    transports text[] DEFAULT '{}'::text[] NOT NULL,
    device_type text,
    backed_up boolean DEFAULT false NOT NULL,
    label text,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_auth_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_auth_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    challenge text NOT NULL,
    challenge_type text NOT NULL,
    person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
    email text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_auth_challenges_type_check CHECK ((challenge_type = ANY (ARRAY['authentication'::text, 'registration'::text])))
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    session_hash text NOT NULL,
    person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    assumed_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    assumed_organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
    csrf_token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL,
    invited_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    token_hash text NOT NULL,
    preferred_locale text DEFAULT 'en'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_invitations_role_check CHECK ((role = ANY (ARRAY['platform_owner'::text, 'platform_admin'::text, 'retail_admin'::text, 'retail_agent'::text, 'retail_assistant'::text]))),
    CONSTRAINT admin_invitations_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'expired'::text, 'pending'::text, 'revoked'::text])))
);


--
-- Name: admin_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
    actor_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    assumed_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    agent_type text DEFAULT 'system'::text NOT NULL,
    role text DEFAULT 'platform_agent'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    capabilities text[] DEFAULT '{}'::text[] NOT NULL,
    model text,
    endpoint_url text,
    organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
    person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agents_agent_type_check CHECK ((agent_type = ANY (ARRAY['human'::text, 'ai'::text, 'deterministic'::text, 'external'::text, 'system'::text]))),
    CONSTRAINT agents_role_check CHECK ((role = ANY (ARRAY['platform_agent'::text, 'retail_agent'::text]))),
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'offline'::text, 'retired'::text])))
);


--
-- Name: TABLE agents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agents IS 'Humans, AI agents, deterministic workers, and external workers that may reserve and process tasks by capability.';


--
-- Name: agent_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    membership_id uuid REFERENCES public.organisation_memberships(id) ON DELETE SET NULL,
    credential_hash text NOT NULL,
    display_prefix text NOT NULL,
    label text,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    revoked_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    revoked_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_credentials_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: TABLE agent_credentials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_credentials IS 'Hash-only API credentials for first-class agent principals.';


--
-- Name: ai_response_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_response_cache (
    cache_key text NOT NULL,
    cache_type text NOT NULL,
    model text NOT NULL,
    prompt_version text NOT NULL,
    response jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: site_locales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_locales (
    code text PRIMARY KEY,
    label text NOT NULL,
    native_label text NOT NULL,
    html_lang text NOT NULL,
    direction text DEFAULT 'ltr'::text NOT NULL,
    fallback_locale text REFERENCES public.site_locales(code),
    is_public boolean DEFAULT false NOT NULL,
    is_indexable boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_locales_code_check CHECK ((code ~ '^[a-z]{2}(-[A-Z0-9]{2,8})?$'::text)),
    CONSTRAINT site_locales_direction_check CHECK ((direction = ANY (ARRAY['ltr'::text, 'rtl'::text])))
);


--
-- Name: TABLE site_locales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.site_locales IS 'Publish-gated locale registry used for public routing, SEO, and scalable admin translation fields.';


--
-- Name: assessment_example_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_example_requests (
    id uuid NOT NULL,
    plan_id uuid NOT NULL,
    email text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL REFERENCES public.site_locales(code),
    status text DEFAULT 'requested'::text NOT NULL,
    health_score jsonb DEFAULT '{}'::jsonb NOT NULL,
    formulation_status text DEFAULT 'not_started'::text NOT NULL,
    food_guidance_status text DEFAULT 'not_started'::text NOT NULL,
    email_html text,
    error_message text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assessment_example_requests_food_guidance_status_check CHECK ((food_guidance_status = ANY (ARRAY['not_started'::text, 'queued'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT assessment_example_requests_formulation_status_check CHECK ((formulation_status = ANY (ARRAY['not_started'::text, 'queued'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT assessment_example_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'formulation_queued'::text, 'formulation_ready'::text, 'email_queued'::text, 'email_rendered'::text, 'email_sent'::text, 'failed'::text])))
);


--
-- Name: assessment_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_versions (
    plan_id uuid NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    actor text DEFAULT 'system'::text NOT NULL,
    reason text NOT NULL,
    source text DEFAULT 'application'::text NOT NULL,
    task_id uuid,
    request_id text,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE assessment_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assessment_versions IS 'Append-only assessment source-of-truth versions. assessments is the current-state read model.';


--
-- Name: assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments (
    plan_id uuid NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL REFERENCES public.site_locales(code),
    selected_plan public.assessment_plan,
    status public.assessment_status DEFAULT 'captured'::public.assessment_status NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    answer_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    first_name text,
    health_score jsonb DEFAULT '{}'::jsonb NOT NULL,
    queue_position integer,
    error_message text,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_selected_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid NOT NULL,
    translation_group_id uuid NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL REFERENCES public.site_locales(code),
    slug text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    title text NOT NULL,
    subtitle text,
    excerpt text NOT NULL,
    content_markdown text,
    body jsonb DEFAULT '{}'::jsonb NOT NULL,
    image_url text,
    image_alt text,
    testimonial_id uuid,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    seo_title text,
    seo_description text,
    social_title text,
    social_description text,
    social_image_url text,
    source_channel text,
    source_agent text,
    source_ref text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blog_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: bpm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bpm (
    id uuid NOT NULL,
    ray uuid NOT NULL,
    plan_id uuid,
    cron_id uuid,
    example_request_id uuid,
    event_name text NOT NULL,
    event_type text DEFAULT 'funnel'::text NOT NULL,
    event_status text DEFAULT 'observed'::text NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    actor_type text DEFAULT 'visitor'::text NOT NULL,
    emitted_by text,
    locale text REFERENCES public.site_locales(code),
    selected_plan public.assessment_plan,
    email_hash text,
    ip_hash text,
    user_agent text,
    device_type text,
    browser text,
    os text,
    country_code text,
    path text,
    route text,
    referrer text,
    landing_page text,
    traffic_source text,
    source_channel text,
    source_detail text,
    source_url text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    campaign_id text,
    campaign_name text,
    promo_code text,
    affiliate_id text,
    affiliate_ref text,
    affiliate_sub_id text,
    affiliate_click_id text,
    ad_id text,
    click_id text,
    health_score integer,
    score_band text,
    lowest_domain text,
    value_amount numeric(14,2),
    value_currency text,
    error_code text,
    error_message text,
    safety_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_ms integer,
    http_status integer,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bpm_actor_type_check CHECK ((actor_type = ANY (ARRAY['visitor'::text, 'system'::text, 'worker'::text, 'admin'::text, 'openclaw'::text]))),
    CONSTRAINT bpm_event_type_check CHECK ((event_type = ANY (ARRAY['traffic'::text, 'content'::text, 'funnel'::text, 'plan'::text, 'payment'::text, 'email'::text, 'chat'::text, 'formulation'::text, 'reassessment'::text, 'affiliate'::text, 'safety'::text, 'error'::text, 'system'::text]))),
    CONSTRAINT bpm_health_score_check CHECK (((health_score IS NULL) OR ((health_score >= 0) AND (health_score <= 100)))),
    CONSTRAINT bpm_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
);


--
-- Name: TABLE bpm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bpm IS 'Business process monitoring events for funnel, campaign, affiliate, sales, safety, and operational dashboards.';


--
-- Name: COLUMN bpm.ray; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bpm.ray IS 'Anonymous journey/session UUID tying one visitor interaction ray through multiple funnel stages.';


--
-- Name: COLUMN bpm.email_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bpm.email_hash IS 'Hash of email where available. Never store raw email here.';


--
-- Name: COLUMN bpm.properties; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bpm.properties IS 'Flexible event-specific payload for dashboard slices that do not justify first-class columns yet.';


--
-- Name: COLUMN bpm.metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bpm.metrics IS 'Flexible numeric metrics such as counts, timings, scores, or model usage details.';


--
-- Name: communication_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_channels (
    id uuid NOT NULL,
    identity_id uuid NOT NULL,
    channel_type text NOT NULL,
    address text NOT NULL,
    display_name text,
    status text DEFAULT 'active'::text NOT NULL,
    preference_rank integer DEFAULT 100 NOT NULL,
    actor_type text DEFAULT 'human'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT communication_channels_actor_check CHECK ((actor_type = ANY (ARRAY['ai'::text, 'human'::text, 'system'::text, 'unknown'::text]))),
    CONSTRAINT communication_channels_status_check CHECK ((status = ANY (ARRAY['active'::text, 'unverified'::text, 'disabled'::text, 'failed'::text]))),
    CONSTRAINT communication_channels_type_check CHECK ((channel_type = ANY (ARRAY['email'::text, 'line'::text, 'manual'::text, 'sms'::text, 'telegram'::text, 'wechat'::text, 'whatsapp'::text])))
);


--
-- Name: TABLE communication_channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.communication_channels IS 'Plan or customer contact channels such as LINE, WhatsApp, Telegram, WeChat, and email.';


--
-- Name: communication_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_identities (
    id uuid NOT NULL,
    display_name text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE communication_identities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.communication_identities IS 'Customer communication identities. One identity can have several channels.';


--
-- Name: communication_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_messages (
    id uuid NOT NULL,
    identity_id uuid,
    channel_id uuid,
    plan_id uuid,
    task_id uuid,
    direction text DEFAULT 'outbound'::text NOT NULL,
    message_type text DEFAULT 'general'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    subject text,
    body text NOT NULL,
    html text,
    provider text,
    provider_message_id text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    scheduled_for timestamp with time zone,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT communication_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT communication_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text, 'no_channel'::text])))
);


--
-- Name: TABLE communication_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.communication_messages IS 'Append-only-ish outbound and inbound communication records tied to plans, goals, and tasks.';


--
-- Name: cron; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron (
    id uuid NOT NULL,
    plan_id uuid,
    action_type text NOT NULL,
    recipient jsonb DEFAULT '{}'::jsonb NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    recurrence_days integer,
    unsubscribe_token text,
    unsubscribed_at timestamp with time zone,
    result_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    queued_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cron_recurrence_days_check CHECK (((recurrence_days IS NULL) OR (recurrence_days > 0))),
    CONSTRAINT cron_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'queued'::text, 'complete'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: finance_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_accounts (
    id uuid NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE finance_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.finance_accounts IS 'Account master table for providers and internal cost accounts. These are not bank accounts or payment instruments.';


--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_transactions (
    id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL,
    entry_type text DEFAULT 'nominal'::text NOT NULL,
    source text NOT NULL,
    source_ref text,
    provider text,
    task_id uuid,
    from_account_id uuid,
    to_account_id uuid,
    "from" text NOT NULL,
    "to" text NOT NULL,
    amount bigint NOT NULL,
    amount_unit text DEFAULT 'micros'::text NOT NULL,
    currency text NOT NULL,
    usd_rate numeric(20,10) NOT NULL,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_transactions_amount_check CHECK ((amount > 0)),
    CONSTRAINT finance_transactions_amount_unit_check CHECK ((amount_unit = 'micros'::text)),
    CONSTRAINT finance_transactions_category_check CHECK ((category = ANY (ARRAY['ai'::text, 'hosting'::text, 'other'::text, 'payment_fee'::text, 'payout'::text, 'refund'::text, 'revenue'::text]))),
    CONSTRAINT finance_transactions_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT finance_transactions_entry_type_check CHECK ((entry_type = ANY (ARRAY['nominal'::text, 'actual'::text]))),
    CONSTRAINT finance_transactions_usd_rate_check CHECK ((usd_rate > (0)::numeric))
);


--
-- Name: TABLE finance_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.finance_transactions IS 'Positive-value platform finance ledger. entry_type distinguishes nominal fine-grained costs from actual money-flow rows.';


--
-- Name: COLUMN finance_transactions.entry_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finance_transactions.entry_type IS 'nominal for fine-grained cost accruals and actual for real money-flow rows. Defaults to nominal.';


--
-- Name: COLUMN finance_transactions.task_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finance_transactions.task_id IS 'Task that caused this cost accrual, when the liability came from task-backed work.';


--
-- Name: COLUMN finance_transactions."from"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finance_transactions."from" IS 'Nominal cost origin or actual money-flow source.';


--
-- Name: COLUMN finance_transactions."to"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finance_transactions."to" IS 'Nominal provider/cost destination or actual money-flow recipient.';


--
-- Name: COLUMN finance_transactions.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finance_transactions.amount IS 'Positive integer amount in micros of the transaction currency, e.g. 1 USD = 1000000.';


--
-- Name: COLUMN finance_transactions.usd_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finance_transactions.usd_rate IS 'Conversion rate from one unit of transaction currency to USD at booking time.';


--
-- Name: food_admin_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_admin_audit (
    id uuid NOT NULL,
    food_id uuid,
    actor_id text,
    action text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: food_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_aliases (
    id uuid NOT NULL,
    food_id uuid NOT NULL,
    alias text NOT NULL,
    normalized_alias text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: food_guidance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_guidance (
    plan_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    guidance jsonb NOT NULL,
    model_version text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: food_nutrient_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_nutrient_profiles (
    food_id uuid NOT NULL,
    nutrient_id text NOT NULL,
    amount_per_100g numeric(14,4) NOT NULL,
    source text,
    source_url text,
    confidence text DEFAULT 'moderate'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT food_nutrient_profiles_amount_per_100g_check CHECK ((amount_per_100g >= (0)::numeric)),
    CONSTRAINT food_nutrient_profiles_confidence_check CHECK ((confidence = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text])))
);


--
-- Name: food_safety_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_safety_rules (
    id uuid NOT NULL,
    food_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    allergen_flags text[] DEFAULT '{}'::text[] NOT NULL,
    condition_flags text[] DEFAULT '{}'::text[] NOT NULL,
    confidence text DEFAULT 'moderate'::text NOT NULL,
    safety_notes text,
    source_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT food_safety_rules_confidence_check CHECK ((confidence = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text])))
);


--
-- Name: food_serving_sizes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_serving_sizes (
    food_id uuid NOT NULL,
    label text NOT NULL,
    grams numeric(10,2) NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT food_serving_sizes_grams_check CHECK ((grams > (0)::numeric))
);


--
-- Name: foods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foods (
    id uuid NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    category text DEFAULT 'Other'::text NOT NULL,
    primary_use_case text,
    benefit_tags text[] NOT NULL DEFAULT '{}'::text[],
    nutrient_tags text[] NOT NULL DEFAULT '{}'::text[],
    notes text,
    list_status text DEFAULT 'whitelisted'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source text,
    image_path text,
    image_source text,
    image_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT foods_list_status_check CHECK ((list_status = ANY (ARRAY['whitelisted'::text, 'review_required'::text, 'blacklisted'::text, 'inactive'::text])))
);


--
-- Name: food_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_translations (
    food_id uuid NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    category text,
    primary_use_case text,
    image_alt text,
    status text DEFAULT 'missing'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT food_translations_pkey PRIMARY KEY (food_id, locale),
    CONSTRAINT food_translations_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'draft'::text, 'missing'::text])))
);


--
-- Name: TABLE food_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.food_translations IS 'Locale-scalable managed food display copy and image alt text.';


--
-- Name: formulations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulations (
    plan_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    formulation jsonb NOT NULL,
    model_version text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nutrients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrients (
    id text NOT NULL,
    label text NOT NULL,
    unit text NOT NULL,
    category text NOT NULL,
    display_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nutrition_plan_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrition_plan_versions (
    plan_id uuid NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    actor text DEFAULT 'system'::text NOT NULL,
    reason text NOT NULL,
    source text DEFAULT 'application'::text NOT NULL,
    task_id uuid,
    request_id text,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nutrition_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrition_reports (
    plan_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    task_id uuid,
    report jsonb NOT NULL,
    model_version text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE nutrition_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.nutrition_reports IS 'Versioned final nutrition plans generated from food guidance, supplement guidance, and plan refinement chat history.';


--
-- Name: payment_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_versions (
    payment_id uuid NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    actor text DEFAULT 'system'::text NOT NULL,
    reason text NOT NULL,
    source text DEFAULT 'application'::text NOT NULL,
    plan_id uuid,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE payment_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_versions IS 'Append-only payment state versions.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid NOT NULL,
    plan_id uuid,
    selected_plan public.assessment_plan NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL REFERENCES public.site_locales(code),
    source_surface text DEFAULT 'healthscore'::text NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    amount bigint NOT NULL,
    amount_unit text DEFAULT 'micros'::text NOT NULL,
    currency text DEFAULT 'THB'::text NOT NULL,
    stripe_mode text DEFAULT 'test'::text NOT NULL,
    stripe_checkout_session_id text,
    stripe_payment_intent_id text,
    stripe_customer_id text,
    stripe_price_id text,
    customer_email text,
    customer_email_opted_in boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    bound_at timestamp with time zone,
    CONSTRAINT payments_amount_check CHECK ((amount > 0)),
    CONSTRAINT payments_amount_unit_check CHECK ((amount_unit = 'micros'::text)),
    CONSTRAINT payments_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT payments_source_surface_check CHECK ((source_surface = ANY (ARRAY['landing'::text, 'healthscore'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['created'::text, 'checkout_session_created'::text, 'checkout_opened'::text, 'processing'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'expired'::text, 'fulfillment_failed'::text, 'bound'::text]))),
    CONSTRAINT payments_stripe_mode_check CHECK ((stripe_mode = ANY (ARRAY['test'::text, 'live'::text, 'mock'::text])))
);


--
-- Name: TABLE payments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payments IS 'Current payment projection. payment_versions is the append-only source-of-truth.';


--
-- Name: plan_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_chat_messages (
    id uuid NOT NULL,
    plan_id uuid NOT NULL,
    task_id uuid,
    reply_to_message_id uuid,
    role text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))),
    CONSTRAINT plan_chat_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: TABLE plan_chat_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.plan_chat_messages IS 'Plan-native chat messages used to refine the food and supplement guidance before final report generation.';


--
-- Name: plan_communication_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_communication_identities (
    plan_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    relationship text DEFAULT 'client'::text NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: plan_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_feedback (
    id uuid NOT NULL,
    plan_id uuid NOT NULL,
    source_message_id uuid,
    source_task_id uuid,
    feedback_type text NOT NULL,
    item_type text,
    item_id text,
    item_name text,
    normalized_text text NOT NULL,
    body text NOT NULL,
    urgency text NOT NULL DEFAULT 'normal'::text,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['budget'::text, 'capsule_limit'::text, 'constraint'::text, 'cuisine'::text, 'dislike'::text, 'preference'::text, 'removal'::text, 'routine'::text, 'safety_disclosure'::text, 'other'::text]))),
    CONSTRAINT plan_feedback_item_type_check CHECK (((item_type IS NULL) OR (item_type = ANY (ARRAY['condition'::text, 'food'::text, 'other'::text, 'plan'::text, 'supplement'::text])))),
    CONSTRAINT plan_feedback_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text]))),
    CONSTRAINT plan_feedback_urgency_check CHECK ((urgency = ANY (ARRAY['normal'::text, 'safety'::text])))
);


--
-- Name: TABLE plan_feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.plan_feedback IS 'Durable concierge feedback and preferences used as input when refining a nutrition plan version.';


--
-- Name: plan_guidance_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_guidance_adjustments (
    id uuid NOT NULL,
    plan_id uuid NOT NULL,
    source_message_id uuid,
    source_task_id uuid,
    action text DEFAULT 'remove'::text NOT NULL,
    item_type text NOT NULL,
    item_id text,
    item_name text NOT NULL,
    normalized_item_name text NOT NULL,
    reason text,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_guidance_adjustments_action_check CHECK ((action = 'remove'::text)),
    CONSTRAINT plan_guidance_adjustments_item_type_check CHECK ((item_type = ANY (ARRAY['food'::text, 'supplement'::text]))),
    CONSTRAINT plan_guidance_adjustments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--
-- Name: TABLE plan_guidance_adjustments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.plan_guidance_adjustments IS 'Durable client-requested plan refinements from chat, such as removing a visible food or supplement from the plan.';


--
-- Name: product_admin_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_admin_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    brand_id uuid,
    action text NOT NULL,
    actor text,
    before_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    after_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_brand_countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_brand_countries (
    brand_id uuid NOT NULL,
    country_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_brand_countries_code_check CHECK ((country_code ~ '^[A-Z]{2}$'::text))
);


--
-- Name: product_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    country_code text DEFAULT 'TH'::text NOT NULL,
    official_url text,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_brands_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'ignored'::text, 'pending_review'::text])))
);


--
-- Name: product_countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_countries (
    product_id uuid NOT NULL,
    country_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_countries_code_check CHECK ((country_code ~ '^[A-Z]{2}$'::text))
);


--
-- Name: product_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    item_type text NOT NULL,
    supplement_id uuid,
    food_id uuid,
    nutrient_id text,
    name text NOT NULL,
    normalized_name text NOT NULL,
    amount numeric,
    unit text,
    serving_label text,
    confidence text DEFAULT 'moderate'::text NOT NULL,
    source text DEFAULT 'admin'::text NOT NULL,
    source_url text,
    source_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_facts_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'low'::text, 'moderate'::text]))),
    CONSTRAINT product_facts_item_type_check CHECK ((item_type = ANY (ARRAY['food'::text, 'nutrient'::text, 'supplement'::text])))
);


--
-- Name: product_import_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_import_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_name text NOT NULL,
    normalized_brand_name text NOT NULL,
    source text DEFAULT 'manufacturer_scrape'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    requested_auto_approve boolean DEFAULT false NOT NULL,
    total_products integer DEFAULT 0 NOT NULL,
    staged_count integer DEFAULT 0 NOT NULL,
    approved_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    notes text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_import_runs_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text, 'running'::text])))
);


--
-- Name: product_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_run_id uuid,
    brand_name text NOT NULL,
    normalized_brand_name text NOT NULL,
    product_title text NOT NULL,
    normalized_product_title text NOT NULL,
    title_en text,
    title_th text,
    source_url text NOT NULL,
    source text DEFAULT 'manufacturer_scrape'::text NOT NULL,
    description text,
    description_en text,
    description_th text,
    image_urls text[] DEFAULT '{}'::text[] NOT NULL,
    fda_approval_number text,
    parsed_facts jsonb DEFAULT '[]'::jsonb NOT NULL,
    raw_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    duplicate_product_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    parse_confidence text DEFAULT 'moderate'::text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    review_task_id uuid,
    product_id uuid,
    reviewer_note text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_imports_parse_confidence_check CHECK ((parse_confidence = ANY (ARRAY['high'::text, 'low'::text, 'moderate'::text]))),
    CONSTRAINT product_imports_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'duplicate'::text, 'ignored'::text, 'pending_review'::text])))
);


--
-- Name: product_import_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_import_translations (
    import_id uuid NOT NULL,
    locale text NOT NULL REFERENCES public.site_locales(code),
    title text,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    source text DEFAULT 'importer'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_import_translations_pkey PRIMARY KEY (import_id, locale),
    CONSTRAINT product_import_translations_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'draft'::text, 'missing'::text])))
);


--
-- Name: TABLE product_import_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_import_translations IS 'Locale-scalable translated copy projection for staged product import evidence.';


--
-- Name: product_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    network text,
    url text NOT NULL,
    link_type text DEFAULT 'affiliate'::text NOT NULL,
    platform text,
    commission_rate numeric,
    admin_priority integer DEFAULT 0 NOT NULL,
    price_amount numeric,
    currency text DEFAULT 'THB'::text NOT NULL,
    availability_status text DEFAULT 'unknown'::text NOT NULL,
    tracking_id text,
    status text DEFAULT 'active'::text NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_offers_availability_status_check CHECK ((availability_status = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'unavailable'::text, 'unknown'::text]))),
    CONSTRAINT product_offers_link_type_check CHECK ((link_type = ANY (ARRAY['affiliate'::text, 'direct'::text]))),
    CONSTRAINT product_offers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'flagged_stale'::text, 'inactive'::text])))
);


--
-- Name: product_recommendation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_recommendation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    product_id uuid NOT NULL,
    rank integer NOT NULL,
    score numeric DEFAULT 0 NOT NULL,
    product_coverage_percent numeric DEFAULT 0 NOT NULL,
    stack_contribution_percent numeric DEFAULT 0 NOT NULL,
    serving_multiplier integer DEFAULT 1 NOT NULL,
    covered_needs jsonb DEFAULT '[]'::jsonb NOT NULL,
    why text,
    offer_id uuid,
    url_used text NOT NULL,
    price_amount numeric,
    currency text DEFAULT 'THB'::text NOT NULL,
    image_url text,
    unknown_at_recommendation boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_recommendation_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_recommendation_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    plan_id uuid,
    task_id uuid,
    product_id uuid NOT NULL,
    product_title text NOT NULL,
    outcome text NOT NULL,
    dedupe_key text NOT NULL,
    rank integer,
    score numeric,
    product_coverage_percent numeric,
    stack_contribution_percent numeric,
    serving_multiplier integer DEFAULT 1 NOT NULL,
    covered_needs jsonb DEFAULT '[]'::jsonb NOT NULL,
    reason text,
    offer_id uuid,
    url_used text,
    price_amount numeric,
    currency text DEFAULT 'THB'::text NOT NULL,
    unknown_at_recommendation boolean DEFAULT false NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_recommendation_decisions_outcome_check CHECK ((outcome = ANY (ARRAY['chosen'::text, 'near_miss'::text, 'rejected'::text]))),
    CONSTRAINT product_recommendation_decisions_serving_multiplier_check CHECK ((serving_multiplier >= 1))
);


--
-- Name: product_recommendation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_recommendation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid,
    task_id uuid,
    ray_id uuid,
    status text DEFAULT 'completed'::text NOT NULL,
    market_region text DEFAULT 'TH'::text NOT NULL,
    stack_coverage_percent numeric DEFAULT 0 NOT NULL,
    supplement_product_coverage_percent numeric DEFAULT 0 NOT NULL,
    food_coverage_percent numeric DEFAULT 0 NOT NULL,
    total_coverage_percent numeric DEFAULT 0 NOT NULL,
    client_needs jsonb DEFAULT '[]'::jsonb NOT NULL,
    exclusions jsonb DEFAULT '[]'::jsonb NOT NULL,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_recommendation_runs_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text, 'partial'::text])))
);


--
-- Name: product_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_versions (
    product_id uuid NOT NULL,
    version integer NOT NULL,
    actor text,
    change_note text,
    reason text,
    source text DEFAULT 'application'::text NOT NULL,
    task_id uuid,
    request_id text,
    title text NOT NULL,
    title_en text,
    title_th text,
    brand_name text,
    normalized_brand_name text,
    image_url text,
    product_url text NOT NULL,
    normalized_url text NOT NULL,
    description text,
    description_en text,
    description_th text,
    fda_approval_number text,
    product_kind text DEFAULT 'supplement'::text NOT NULL,
    product_audience text DEFAULT 'both'::text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    label_status text DEFAULT 'missing'::text NOT NULL,
    availability_status text DEFAULT 'unknown'::text NOT NULL,
    affiliate_status text DEFAULT 'none'::text NOT NULL,
    price_amount numeric,
    currency text DEFAULT 'THB'::text NOT NULL,
    validation_status text DEFAULT 'needs_review'::text NOT NULL,
    validation_reasons text[] DEFAULT '{}'::text[] NOT NULL,
    validation_summary text,
    validation_checked_at timestamp with time zone,
    facts_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    region text DEFAULT 'TH'::text NOT NULL,
    external_product_id text,
    title text NOT NULL,
    normalized_title text NOT NULL,
    brand_id uuid,
    brand_name text,
    normalized_brand_name text,
    image_url text,
    product_url text NOT NULL,
    normalized_url text NOT NULL,
    description text,
    category text,
    title_en text,
    title_th text,
    description_en text,
    description_th text,
    fda_approval_number text,
    fda_verified_at timestamp with time zone,
    source_url text,
    source_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    product_kind text DEFAULT 'supplement'::text NOT NULL,
    product_audience text DEFAULT 'both'::text NOT NULL,
    status text DEFAULT 'pending_review'::text NOT NULL,
    label_status text DEFAULT 'missing'::text NOT NULL,
    availability_status text DEFAULT 'unknown'::text NOT NULL,
    affiliate_status text DEFAULT 'none'::text NOT NULL,
    price_amount numeric,
    currency text DEFAULT 'THB'::text NOT NULL,
    price_cached_at timestamp with time zone,
    availability_cached_at timestamp with time zone,
    affiliate_checked_at timestamp with time zone,
    product_data_expires_at timestamp with time zone,
    source text DEFAULT 'admin'::text NOT NULL,
    admin_notes text,
    validation_status text DEFAULT 'needs_review'::text NOT NULL,
    validation_reasons text[] DEFAULT '{}'::text[] NOT NULL,
    validation_summary text,
    validation_checked_at timestamp with time zone,
    current_version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_affiliate_status_check CHECK ((affiliate_status = ANY (ARRAY['active'::text, 'flagged_stale'::text, 'none'::text]))),
    CONSTRAINT products_availability_status_check CHECK ((availability_status = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'unavailable'::text, 'unknown'::text]))),
    CONSTRAINT products_label_status_check CHECK ((label_status = ANY (ARRAY['failed'::text, 'missing'::text, 'parsed'::text, 'stale'::text]))),
    CONSTRAINT products_platform_check CHECK ((platform = ANY (ARRAY['lazada'::text, 'manual'::text, 'shopee'::text]))),
    CONSTRAINT products_product_audience_check CHECK ((product_audience = ANY (ARRAY['both'::text, 'female'::text, 'male'::text]))),
    CONSTRAINT products_product_kind_check CHECK ((product_kind = ANY (ARRAY['food'::text, 'multi'::text, 'other'::text, 'supplement'::text]))),
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'ignored'::text, 'pending_review'::text]))),
    CONSTRAINT products_validation_status_check CHECK ((validation_status = ANY (ARRAY['failed'::text, 'needs_review'::text, 'pass'::text])))
);


--
-- Name: product_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_translations (
    product_id uuid NOT NULL,
    locale text NOT NULL REFERENCES public.site_locales(code),
    title text,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    source text DEFAULT 'admin'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_translations_pkey PRIMARY KEY (product_id, locale),
    CONSTRAINT product_translations_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'draft'::text, 'missing'::text])))
);


--
-- Name: TABLE product_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_translations IS 'Locale-scalable product title and description projection. Legacy title_en/title_th columns are compatibility fields.';


--
-- Name: recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendations (
    plan_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    recommendations jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: safety_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safety_reviews (
    id uuid NOT NULL,
    ray uuid,
    plan_id uuid,
    task_id uuid,
    bpm_event_id uuid,
    formulation_version integer,
    review_type text DEFAULT 'ingredient_safety'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    item_type text DEFAULT 'supplement'::text NOT NULL,
    item_name text,
    supplement_name text NOT NULL,
    suggested_dose_value numeric(14,4),
    suggested_dose_unit text,
    suggested_frequency text,
    suggested_form text,
    suggested_timing text,
    limit_value numeric(14,4),
    limit_unit text,
    rule_code text,
    flag_reason text NOT NULL,
    ai_suggestion jsonb DEFAULT '{}'::jsonb NOT NULL,
    safety_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    reviewer_id text,
    reviewer_note text,
    client_message jsonb DEFAULT '{}'::jsonb NOT NULL,
    client_notification_status text DEFAULT 'not_started'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    client_informed_at timestamp with time zone,
    closed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT safety_reviews_client_notification_status_check CHECK ((client_notification_status = ANY (ARRAY['not_started'::text, 'not_required'::text, 'queued'::text, 'sent'::text, 'failed'::text]))),
    CONSTRAINT safety_reviews_item_type_check CHECK ((item_type = ANY (ARRAY['supplement'::text, 'food'::text]))),
    CONSTRAINT safety_reviews_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT safety_reviews_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'accepted'::text, 'rejected'::text, 'revised'::text, 'escalated'::text, 'client_notification_queued'::text, 'client_informed'::text, 'closed'::text]))),
    CONSTRAINT safety_reviews_type_check CHECK ((review_type = ANY (ARRAY['ingredient_safety'::text, 'dose_limit'::text, 'contraindication'::text, 'medication_interaction'::text, 'condition_stop'::text, 'age_stop'::text, 'pregnancy_breastfeeding'::text, 'other'::text])))
);


--
-- Name: TABLE safety_reviews; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.safety_reviews IS 'Operational human-review queue for supplement and dose safety flags raised during formulation checks.';


--
-- Name: COLUMN safety_reviews.task_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.safety_reviews.task_id IS 'Optional task that represents the human or agent action required for this review.';


--
-- Name: COLUMN safety_reviews.bpm_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.safety_reviews.bpm_event_id IS 'Optional BPM event showing the business/safety dashboard event that opened this review.';


--
-- Name: COLUMN safety_reviews.ai_suggestion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.safety_reviews.ai_suggestion IS 'The exact AI supplement suggestion payload that triggered the safety review.';


--
-- Name: COLUMN safety_reviews.safety_context; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.safety_reviews.safety_context IS 'Relevant assessment context, rule output, limits, medication flags, or stop-rule evidence.';


--
-- Name: COLUMN safety_reviews.client_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.safety_reviews.client_message IS 'Draft or final client-facing message after the human decision, localized where needed.';


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text NOT NULL,
    payload_shape text DEFAULT 'fat'::text NOT NULL,
    stripe_mode text NOT NULL,
    event_type text NOT NULL,
    payment_id uuid,
    stripe_checkout_session_id text,
    status text DEFAULT 'received'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT stripe_webhook_events_payload_shape_check CHECK ((payload_shape = ANY (ARRAY['fat'::text, 'thin'::text]))),
    CONSTRAINT stripe_webhook_events_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processed'::text, 'ignored'::text, 'failed'::text]))),
    CONSTRAINT stripe_webhook_events_stripe_mode_check CHECK ((stripe_mode = ANY (ARRAY['test'::text, 'live'::text, 'mock'::text])))
);


--
-- Name: TABLE stripe_webhook_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stripe_webhook_events IS 'Idempotency and diagnostics for Stripe webhook processing.';


--
-- Name: supplement_admin_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_admin_audit (
    id uuid NOT NULL,
    supplement_id uuid,
    action text NOT NULL,
    actor text,
    before_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    after_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplement_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_aliases (
    id uuid NOT NULL,
    supplement_id uuid NOT NULL,
    alias text NOT NULL,
    normalized_alias text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplement_safety_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_safety_limits (
    id uuid NOT NULL,
    supplement_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    max_amount numeric(14,4),
    max_unit text NOT NULL,
    basis_rationale text,
    confidence text DEFAULT 'low'::text NOT NULL,
    safety_flag text,
    safety_flags text[] DEFAULT '{}'::text[] NOT NULL,
    safety_notes text,
    source_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplement_safety_limits_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'moderate'::text, 'low'::text]))),
    CONSTRAINT supplement_safety_limits_safety_flags_check CHECK ((safety_flags <@ ARRAY['allergy_caution'::text, 'bleeding_risk'::text, 'condition_caution'::text, 'contamination_risk'::text, 'exclude_automated_use'::text, 'general_caution'::text, 'hormone_caution'::text, 'kidney_caution'::text, 'liver_caution'::text, 'medication_interaction'::text, 'pregnancy_caution'::text, 'regulatory_risk'::text, 'stimulant'::text, 'upper_dose_risk'::text])),
    CONSTRAINT supplement_safety_limits_version_check CHECK ((version > 0))
);


--
-- Name: supplement_recommendation_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_recommendation_selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    formulation_version integer NOT NULL,
    task_id uuid,
    model_version text,
    item_id text NOT NULL,
    supplement_id uuid,
    supplement_name jsonb DEFAULT '{}'::jsonb NOT NULL,
    supplement_name_text text NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    effectiveness_rank integer NOT NULL,
    daily_dose jsonb DEFAULT '{}'::jsonb NOT NULL,
    daily_dose_text text NOT NULL,
    dose_amount numeric,
    dose_unit text,
    dose_parse_status text DEFAULT 'unparsed'::text NOT NULL,
    safety_action text,
    safety_visibility text,
    is_current boolean DEFAULT false NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplement_recommendation_selections_dose_parse_status_check CHECK ((dose_parse_status = ANY (ARRAY['parsed'::text, 'unparsed'::text]))),
    CONSTRAINT supplement_recommendation_selections_status_check CHECK ((status = ANY (ARRAY['covered'::text, 'add'::text, 'review'::text])))
);


--
-- Name: supplement_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_versions (
    supplement_id uuid NOT NULL,
    version integer NOT NULL,
    action text NOT NULL,
    actor text DEFAULT 'system'::text NOT NULL,
    change_reason text NOT NULL,
    source text DEFAULT 'application'::text NOT NULL,
    before_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    after_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplements (
    id uuid NOT NULL,
    source_row_id integer,
    name text NOT NULL,
    normalized_name text NOT NULL,
    category text NOT NULL,
    source_status text DEFAULT 'core'::text NOT NULL,
    ingredient_type text,
    primary_use_case text,
    notes text,
    list_status text DEFAULT 'active'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source text,
    source_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplements_list_status_check CHECK ((list_status = ANY (ARRAY['active'::text, 'blocked'::text]))),
    CONSTRAINT supplements_source_status_check CHECK ((source_status = ANY (ARRAY['core'::text, 'recommended_add'::text])))
);


--
-- Name: supplement_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplement_translations (
    supplement_id uuid NOT NULL,
    locale text NOT NULL REFERENCES public.site_locales(code),
    name text,
    primary_use_case text,
    category_label text,
    safety_notes text,
    aliases text[] DEFAULT ARRAY[]::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source text DEFAULT 'admin'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplement_translations_pkey PRIMARY KEY (supplement_id, locale),
    CONSTRAINT supplement_translations_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'draft'::text, 'missing'::text])))
);


--
-- Name: task_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_approvals (
    id uuid NOT NULL,
    task_id uuid NOT NULL,
    requested_by_agent_id uuid,
    decided_by_agent_id uuid,
    approval_type text DEFAULT 'four_eyes'::text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    required_capabilities text[] DEFAULT '{}'::text[] NOT NULL,
    request_comment text,
    decision_comment text,
    decision_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_approvals_approval_type_check CHECK ((approval_type = ANY (ARRAY['four_eyes'::text, 'human_review'::text, 'agent_review'::text, 'safety'::text, 'business'::text]))),
    CONSTRAINT task_approvals_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text]))),
    CONSTRAINT task_approvals_type_check CHECK ((approval_type = ANY (ARRAY['four_eyes'::text, 'human_review'::text, 'agent_review'::text, 'safety'::text, 'business'::text])))
);


--
-- Name: task_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_comments (
    id uuid NOT NULL,
    task_id uuid NOT NULL,
    agent_id uuid,
    author_type text DEFAULT 'system'::text NOT NULL,
    author_name text,
    visibility text DEFAULT 'internal'::text NOT NULL,
    comment_type text DEFAULT 'note'::text NOT NULL,
    body text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_comments_author_type_check CHECK ((author_type = ANY (ARRAY['human'::text, 'ai'::text, 'deterministic'::text, 'external'::text, 'system'::text, 'worker'::text]))),
    CONSTRAINT task_comments_comment_type_check CHECK ((comment_type = ANY (ARRAY['instruction'::text, 'note'::text, 'decision'::text, 'question'::text, 'answer'::text, 'status'::text, 'system'::text]))),
    CONSTRAINT task_comments_type_check CHECK ((comment_type = ANY (ARRAY['instruction'::text, 'note'::text, 'decision'::text, 'question'::text, 'answer'::text, 'status'::text, 'system'::text]))),
    CONSTRAINT task_comments_visibility_check CHECK ((visibility = ANY (ARRAY['internal'::text, 'admin'::text, 'worker'::text, 'customer'::text])))
);


--
-- Name: TABLE task_comments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task_comments IS 'Collaborative working notes for humans and agents. Comments explain what is needed or decided; task_events remains the immutable audit trail.';


--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    task_id uuid NOT NULL,
    depends_on_task_id uuid NOT NULL,
    dependency_type text DEFAULT 'complete'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_dependencies_check CHECK ((task_id <> depends_on_task_id)),
    CONSTRAINT task_dependencies_dependency_type_check CHECK ((dependency_type = ANY (ARRAY['complete'::text, 'approved'::text, 'successful'::text]))),
    CONSTRAINT task_dependencies_no_self_check CHECK ((task_id <> depends_on_task_id)),
    CONSTRAINT task_dependencies_type_check CHECK ((dependency_type = ANY (ARRAY['complete'::text, 'approved'::text, 'successful'::text])))
);


--
-- Name: task_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_events (
    id uuid NOT NULL,
    task_id uuid,
    agent_id uuid,
    event_type text NOT NULL,
    event_status text DEFAULT 'observed'::text NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    event_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT task_events_event_status_check CHECK ((event_status = ANY (ARRAY['observed'::text, 'requested'::text, 'accepted'::text, 'rejected'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT task_events_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT task_events_status_check CHECK ((event_status = ANY (ARRAY['observed'::text, 'requested'::text, 'accepted'::text, 'rejected'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: TABLE task_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task_events IS 'Append-only audit trail for task lifecycle and causal events. Comments are working notes; events are the record.';


--
-- Name: task_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_reservations (
    id uuid NOT NULL,
    task_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    worker_session_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    reserved_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone NOT NULL,
    heartbeat_at timestamp with time zone,
    released_at timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT task_reservations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'completed'::text, 'expired'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid NOT NULL,
    organisation_id uuid NOT NULL REFERENCES public.organisations(id),
    parent_task_id uuid,
    plan_id uuid,
    ray_id uuid,
    task_group_id uuid NOT NULL,
    group_label text,
    task_type text NOT NULL,
    title text NOT NULL,
    description text,
    actor_type text DEFAULT 'system'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    business_value integer NOT NULL DEFAULT 200,
    required_capabilities text[] DEFAULT '{}'::text[] NOT NULL,
    reasoning_effort text DEFAULT 'none'::text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    idempotency_key text,
    idempotency_scope_key text NOT NULL DEFAULT 'global'::text,
    scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
    reserved_by_agent_id uuid,
    lease_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    retry_of_task_id uuid,
    retry_root_task_id uuid,
    retry_attempt integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 0 NOT NULL,
    retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by_agent_id uuid,
    created_by_task_id uuid,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_actor_type_check CHECK ((actor_type = ANY (ARRAY['human'::text, 'ai'::text, 'deterministic'::text, 'external'::text, 'system'::text, 'worker'::text]))),
    CONSTRAINT tasks_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT tasks_business_value_check CHECK ((business_value > 0)),
    CONSTRAINT tasks_max_attempts_check CHECK ((max_attempts > 0)),
    CONSTRAINT tasks_max_retries_check CHECK ((max_retries >= 0)),
    CONSTRAINT tasks_reasoning_effort_check CHECK ((reasoning_effort = ANY (ARRAY['none'::text, 'low'::text, 'medium'::text, 'high'::text, 'xhigh'::text]))),
    CONSTRAINT tasks_retry_attempt_check CHECK ((retry_attempt >= 0)),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'reserved'::text, 'running'::text, 'needs_review'::text, 'waiting_approval'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'skipped'::text])))
);


--
-- Name: TABLE tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tasks IS 'Atomic work items. Tasks carry their own business value, retry state, lineage, and operational grouping.';


--
-- Name: COLUMN tasks.plan_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.plan_id IS 'Optional assessment plan identifier used for filtering and customer context.';


--
-- Name: COLUMN tasks.ray_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.ray_id IS 'Optional request or trace identifier used for filtering and correlation.';


--
-- Name: COLUMN tasks.task_group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.task_group_id IS 'Default visual and operational chain grouping. Root tasks point at themselves; spawned and retry tasks inherit the root group.';


--
-- Name: COLUMN tasks.business_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.business_value IS 'Base execution value. Reservation adds computed aging after a grace period instead of mutating this value.';


--
-- Name: COLUMN tasks.required_capabilities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.required_capabilities IS 'Capabilities required to reserve the task. This keeps task identity separate from any specific worker.';


--
-- Name: COLUMN tasks.reasoning_effort; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.reasoning_effort IS 'Declared reasoning level for AI or human work planning: none, low, medium, high, or xhigh.';


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid NOT NULL,
    translation_group_id uuid NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL REFERENCES public.site_locales(code),
    status text DEFAULT 'published'::text NOT NULL,
    quote text NOT NULL,
    author_name text NOT NULL,
    author_title text,
    author_handle text,
    author_image_url text,
    author_image_alt text,
    sort_order integer DEFAULT 0 NOT NULL,
    source_agent text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testimonials_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: worker_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_sessions (
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    instance_id text NOT NULL,
    status text DEFAULT 'idle'::text NOT NULL,
    capabilities text[] DEFAULT '{}'::text[] NOT NULL,
    task_types text[] DEFAULT '{}'::text[] NOT NULL,
    concurrency integer DEFAULT 1 NOT NULL,
    worker_version text,
    current_task_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT worker_sessions_concurrency_check CHECK ((concurrency > 0)),
    CONSTRAINT worker_sessions_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'polling'::text, 'working'::text, 'offline'::text])))
);


--
-- Baseline append-only versions for current projections.
--

INSERT INTO public.assessment_versions (
    plan_id,
    version,
    action,
    actor,
    reason,
    source,
    snapshot,
    metadata,
    created_at
)
SELECT
    assessments.plan_id,
    1,
    'baseline',
    'schema_rebuild',
    'versioned_projection_baseline',
    'versioned_projection_baseline',
    to_jsonb(assessments),
    jsonb_build_object('source', 'versioned_projection_baseline'),
    coalesce(assessments.captured_at, now())
FROM public.assessments assessments
ON CONFLICT DO NOTHING;

INSERT INTO public.nutrition_plan_versions (
    plan_id,
    version,
    action,
    actor,
    reason,
    source,
    task_id,
    snapshot,
    metadata,
    created_at
)
SELECT
    nutrition_reports.plan_id,
    nutrition_reports.version,
    'baseline',
    'schema_rebuild',
    'versioned_projection_baseline',
    'versioned_projection_baseline',
    nutrition_reports.task_id,
    to_jsonb(nutrition_reports),
    jsonb_build_object('source', 'versioned_projection_baseline'),
    coalesce(nutrition_reports.generated_at, now())
FROM public.nutrition_reports nutrition_reports
ON CONFLICT DO NOTHING;

INSERT INTO public.supplement_versions (
    supplement_id,
    version,
    action,
    actor,
    change_reason,
    source,
    after_payload,
    snapshot,
    metadata,
    created_at
)
SELECT
    supplements.id,
    1,
    'baseline',
    'schema_rebuild',
    'versioned_projection_baseline',
    'versioned_projection_baseline',
    to_jsonb(supplements),
    to_jsonb(supplements),
    jsonb_build_object('source', 'versioned_projection_baseline'),
    coalesce(supplements.created_at, now())
FROM public.supplements supplements
ON CONFLICT DO NOTHING;

INSERT INTO public.product_versions (
    product_id,
    version,
    actor,
    change_note,
    reason,
    source,
    title,
    title_en,
    title_th,
    brand_name,
    normalized_brand_name,
    image_url,
    product_url,
    normalized_url,
    description,
    description_en,
    description_th,
    fda_approval_number,
    product_kind,
    product_audience,
    status,
    label_status,
    availability_status,
    affiliate_status,
    price_amount,
    currency,
    validation_status,
    validation_reasons,
    validation_summary,
    validation_checked_at,
    source_snapshot,
    snapshot,
    metadata,
    created_at
)
SELECT
    products.id,
    1,
    'schema_rebuild',
    'versioned_projection_baseline',
    'versioned_projection_baseline',
    'versioned_projection_baseline',
    products.title,
    products.title_en,
    products.title_th,
    products.brand_name,
    products.normalized_brand_name,
    products.image_url,
    products.product_url,
    products.normalized_url,
    products.description,
    products.description_en,
    products.description_th,
    products.fda_approval_number,
    products.product_kind,
    products.product_audience,
    products.status,
    products.label_status,
    products.availability_status,
    products.affiliate_status,
    products.price_amount,
    products.currency,
    products.validation_status,
    products.validation_reasons,
    products.validation_summary,
    products.validation_checked_at,
    products.source_snapshot,
    to_jsonb(products),
    jsonb_build_object('source', 'versioned_projection_baseline'),
    coalesce(products.created_at, now())
FROM public.products products
ON CONFLICT DO NOTHING;


--
-- Name: admin_alert_acknowledgements admin_alert_acknowledgements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alert_acknowledgements
    ADD CONSTRAINT admin_alert_acknowledgements_pkey PRIMARY KEY (id);


--
-- Name: admin_alert_acknowledgements admin_alert_acknowledgements_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alert_acknowledgements
    ADD CONSTRAINT admin_alert_acknowledgements_source_id_key UNIQUE (source, source_id);


--
-- Name: admin_alert_acknowledgements admin_alert_acknowledgements_source_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alert_acknowledgements
    ADD CONSTRAINT admin_alert_acknowledgements_source_source_id_key UNIQUE (source, source_id);


--
-- Name: admin_conversion_targets admin_conversion_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_conversion_targets
    ADD CONSTRAINT admin_conversion_targets_pkey PRIMARY KEY (target_id);


--
-- Name: organisation_memberships organisation_memberships_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organisation_memberships
    ADD CONSTRAINT organisation_memberships_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: ai_response_cache ai_response_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_response_cache
    ADD CONSTRAINT ai_response_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: assessment_example_requests assessment_example_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_example_requests
    ADD CONSTRAINT assessment_example_requests_pkey PRIMARY KEY (id);


--
-- Name: assessment_versions assessment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_versions
    ADD CONSTRAINT assessment_versions_pkey PRIMARY KEY (plan_id, version);


--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (plan_id);


--
-- Name: blog_posts blog_posts_locale_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_locale_slug_key UNIQUE (locale, slug);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_translation_group_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_translation_group_locale_key UNIQUE (translation_group_id, locale);


--
-- Name: bpm bpm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpm
    ADD CONSTRAINT bpm_pkey PRIMARY KEY (id);


--
-- Name: communication_channels communication_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_channels
    ADD CONSTRAINT communication_channels_pkey PRIMARY KEY (id);


--
-- Name: communication_identities communication_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_identities
    ADD CONSTRAINT communication_identities_pkey PRIMARY KEY (id);


--
-- Name: communication_messages communication_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_messages
    ADD CONSTRAINT communication_messages_pkey PRIMARY KEY (id);


--
-- Name: cron cron_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron
    ADD CONSTRAINT cron_pkey PRIMARY KEY (id);


--
-- Name: finance_accounts finance_accounts_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_name_key UNIQUE (name);


--
-- Name: finance_accounts finance_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_pkey PRIMARY KEY (id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: food_admin_audit food_admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_admin_audit
    ADD CONSTRAINT food_admin_audit_pkey PRIMARY KEY (id);


--
-- Name: food_aliases food_aliases_normalized_alias_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_aliases
    ADD CONSTRAINT food_aliases_normalized_alias_key UNIQUE (normalized_alias);


--
-- Name: food_aliases food_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_aliases
    ADD CONSTRAINT food_aliases_pkey PRIMARY KEY (id);


--
-- Name: food_guidance food_guidance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_guidance
    ADD CONSTRAINT food_guidance_pkey PRIMARY KEY (plan_id, version);


--
-- Name: food_nutrient_profiles food_nutrient_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_nutrient_profiles
    ADD CONSTRAINT food_nutrient_profiles_pkey PRIMARY KEY (food_id, nutrient_id);


--
-- Name: food_safety_rules food_safety_rules_food_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_safety_rules
    ADD CONSTRAINT food_safety_rules_food_id_version_key UNIQUE (food_id, version);


--
-- Name: food_safety_rules food_safety_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_safety_rules
    ADD CONSTRAINT food_safety_rules_pkey PRIMARY KEY (id);


--
-- Name: food_serving_sizes food_serving_sizes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_serving_sizes
    ADD CONSTRAINT food_serving_sizes_pkey PRIMARY KEY (food_id, label);


--
-- Name: foods foods_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foods
    ADD CONSTRAINT foods_normalized_name_key UNIQUE (normalized_name);


--
-- Name: foods foods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foods
    ADD CONSTRAINT foods_pkey PRIMARY KEY (id);


--
-- Name: formulations formulations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_pkey PRIMARY KEY (plan_id, version);


--
-- Name: nutrients nutrients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrients
    ADD CONSTRAINT nutrients_pkey PRIMARY KEY (id);


--
-- Name: nutrition_plan_versions nutrition_plan_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_plan_versions
    ADD CONSTRAINT nutrition_plan_versions_pkey PRIMARY KEY (plan_id, version);


--
-- Name: nutrition_reports nutrition_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_reports
    ADD CONSTRAINT nutrition_reports_pkey PRIMARY KEY (plan_id, version);


--
-- Name: payment_versions payment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_versions
    ADD CONSTRAINT payment_versions_pkey PRIMARY KEY (payment_id, version);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: plan_chat_messages plan_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_chat_messages
    ADD CONSTRAINT plan_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: plan_communication_identities plan_communication_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_communication_identities
    ADD CONSTRAINT plan_communication_identities_pkey PRIMARY KEY (plan_id, identity_id);


--
-- Name: plan_feedback plan_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_feedback
    ADD CONSTRAINT plan_feedback_pkey PRIMARY KEY (id);


--
-- Name: plan_guidance_adjustments plan_guidance_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_guidance_adjustments
    ADD CONSTRAINT plan_guidance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: product_admin_audit product_admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_admin_audit
    ADD CONSTRAINT product_admin_audit_pkey PRIMARY KEY (id);


--
-- Name: product_brand_countries product_brand_countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_brand_countries
    ADD CONSTRAINT product_brand_countries_pkey PRIMARY KEY (brand_id, country_code);


--
-- Name: product_brands product_brands_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_brands
    ADD CONSTRAINT product_brands_normalized_name_key UNIQUE (normalized_name);


--
-- Name: product_brands product_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_brands
    ADD CONSTRAINT product_brands_pkey PRIMARY KEY (id);


--
-- Name: product_countries product_countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_countries
    ADD CONSTRAINT product_countries_pkey PRIMARY KEY (product_id, country_code);


--
-- Name: product_facts product_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_facts
    ADD CONSTRAINT product_facts_pkey PRIMARY KEY (id);


--
-- Name: product_import_runs product_import_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_import_runs
    ADD CONSTRAINT product_import_runs_pkey PRIMARY KEY (id);


--
-- Name: product_imports product_imports_normalized_brand_name_normalized_product_ti_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_imports
    ADD CONSTRAINT product_imports_normalized_brand_name_normalized_product_ti_key UNIQUE (normalized_brand_name, normalized_product_title, source_url);


--
-- Name: product_imports product_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_imports
    ADD CONSTRAINT product_imports_pkey PRIMARY KEY (id);


--
-- Name: product_offers product_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_offers
    ADD CONSTRAINT product_offers_pkey PRIMARY KEY (id);


--
-- Name: product_recommendation_items product_recommendation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_items
    ADD CONSTRAINT product_recommendation_items_pkey PRIMARY KEY (id);


--
-- Name: product_recommendation_items product_recommendation_items_run_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_items
    ADD CONSTRAINT product_recommendation_items_run_id_product_id_key UNIQUE (run_id, product_id);


--
-- Name: product_recommendation_items product_recommendation_items_run_id_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_items
    ADD CONSTRAINT product_recommendation_items_run_id_rank_key UNIQUE (run_id, rank);


--
-- Name: product_recommendation_decisions product_recommendation_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_pkey PRIMARY KEY (id);


--
-- Name: product_recommendation_decisions product_recommendation_decisions_run_id_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_run_id_dedupe_key_key UNIQUE (run_id, dedupe_key);


--
-- Name: product_recommendation_runs product_recommendation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_runs
    ADD CONSTRAINT product_recommendation_runs_pkey PRIMARY KEY (id);


--
-- Name: product_versions product_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_versions
    ADD CONSTRAINT product_versions_pkey PRIMARY KEY (product_id, version);


--
-- Name: products products_normalized_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_normalized_url_key UNIQUE (normalized_url);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: recommendations recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (plan_id, version);


--
-- Name: safety_reviews safety_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_reviews
    ADD CONSTRAINT safety_reviews_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_stripe_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: supplement_admin_audit supplement_admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_admin_audit
    ADD CONSTRAINT supplement_admin_audit_pkey PRIMARY KEY (id);


--
-- Name: supplement_aliases supplement_aliases_normalized_alias_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_aliases
    ADD CONSTRAINT supplement_aliases_normalized_alias_key UNIQUE (normalized_alias);


--
-- Name: supplement_aliases supplement_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_aliases
    ADD CONSTRAINT supplement_aliases_pkey PRIMARY KEY (id);


--
-- Name: supplement_safety_limits supplement_safety_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_safety_limits
    ADD CONSTRAINT supplement_safety_limits_pkey PRIMARY KEY (id);


--
-- Name: supplement_safety_limits supplement_safety_limits_supplement_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_safety_limits
    ADD CONSTRAINT supplement_safety_limits_supplement_id_version_key UNIQUE (supplement_id, version);


--
-- Name: supplement_recommendation_selections supplement_recommendation_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_recommendation_selections
    ADD CONSTRAINT supplement_recommendation_selections_pkey PRIMARY KEY (id);


--
-- Name: supplement_recommendation_selections supplement_recommendation_selections_plan_version_item_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_recommendation_selections
    ADD CONSTRAINT supplement_recommendation_selections_plan_version_item_key UNIQUE (plan_id, formulation_version, item_id);


--
-- Name: supplement_versions supplement_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_versions
    ADD CONSTRAINT supplement_versions_pkey PRIMARY KEY (supplement_id, version);


--
-- Name: supplements supplements_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplements
    ADD CONSTRAINT supplements_normalized_name_key UNIQUE (normalized_name);


--
-- Name: supplements supplements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplements
    ADD CONSTRAINT supplements_pkey PRIMARY KEY (id);


--
-- Name: task_approvals task_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approvals
    ADD CONSTRAINT task_approvals_pkey PRIMARY KEY (id);


--
-- Name: task_comments task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (task_id, depends_on_task_id);


--
-- Name: task_events task_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_pkey PRIMARY KEY (id);


--
-- Name: task_reservations task_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reservations
    ADD CONSTRAINT task_reservations_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);

--
-- Name: testimonials testimonials_translation_group_locale_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_translation_group_locale_key UNIQUE (translation_group_id, locale);


--
-- Name: worker_sessions worker_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_sessions
    ADD CONSTRAINT worker_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_alert_acknowledgements_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_alert_acknowledgements_status_idx ON public.admin_alert_acknowledgements USING btree (status, updated_at DESC);


CREATE INDEX admin_audit_events_actor_idx ON public.admin_audit_events USING btree (actor_person_id, created_at DESC);


CREATE INDEX admin_audit_events_created_idx ON public.admin_audit_events USING btree (created_at DESC);


CREATE INDEX admin_auth_challenges_lookup_idx ON public.admin_auth_challenges USING btree (id, challenge_type, expires_at) WHERE (consumed_at IS NULL);


CREATE INDEX admin_invitations_org_status_idx ON public.admin_invitations USING btree (organisation_id, status, created_at DESC);


CREATE UNIQUE INDEX admin_invitations_token_idx ON public.admin_invitations USING btree (token_hash);


CREATE UNIQUE INDEX admin_passkey_credentials_credential_idx ON public.admin_passkey_credentials USING btree (credential_id);


CREATE INDEX admin_passkey_credentials_person_idx ON public.admin_passkey_credentials USING btree (person_id, updated_at DESC);


CREATE UNIQUE INDEX admin_sessions_hash_idx ON public.admin_sessions USING btree (session_hash);


CREATE INDEX admin_sessions_person_active_idx ON public.admin_sessions USING btree (person_id, expires_at DESC) WHERE (revoked_at IS NULL);


CREATE INDEX agent_credentials_agent_status_idx ON public.agent_credentials USING btree (agent_id, status, created_at DESC);


CREATE UNIQUE INDEX agent_credentials_hash_idx ON public.agent_credentials USING btree (credential_hash);


CREATE INDEX agent_credentials_membership_status_idx ON public.agent_credentials USING btree (membership_id, status, created_at DESC) WHERE (membership_id IS NOT NULL);


--
-- Name: agents_capabilities_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_capabilities_gin_idx ON public.agents USING gin (capabilities);


CREATE INDEX agents_organisation_idx ON public.agents USING btree (organisation_id, status, updated_at DESC);


CREATE INDEX agents_person_idx ON public.agents USING btree (person_id) WHERE (person_id IS NOT NULL);


--
-- Name: agents_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agents_name_idx ON public.agents USING btree (lower(name));


--
-- Name: agents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agents_status_idx ON public.agents USING btree (status, agent_type, updated_at DESC);


CREATE UNIQUE INDEX organisation_memberships_agent_org_active_idx ON public.organisation_memberships USING btree (agent_id, organisation_id) WHERE ((principal_type = 'agent'::text) AND (status <> 'deleted'::text));


CREATE INDEX organisation_memberships_agent_status_idx ON public.organisation_memberships USING btree (agent_id, status, updated_at DESC) WHERE (principal_type = 'agent'::text);


CREATE UNIQUE INDEX organisation_memberships_person_org_active_idx ON public.organisation_memberships USING btree (person_id, organisation_id) WHERE ((principal_type = 'person'::text) AND (status <> 'deleted'::text));


CREATE INDEX organisation_memberships_org_status_idx ON public.organisation_memberships USING btree (organisation_id, principal_type, status, role);


CREATE UNIQUE INDEX organisations_slug_idx ON public.organisations USING btree (lower(slug));


CREATE UNIQUE INDEX people_email_idx ON public.people USING btree (lower(email));


--
-- Name: ai_response_cache_type_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_response_cache_type_expiry_idx ON public.ai_response_cache USING btree (cache_type, expires_at DESC);


--
-- Name: assessment_example_requests_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_example_requests_plan_idx ON public.assessment_example_requests USING btree (plan_id, requested_at DESC);


--
-- Name: assessment_example_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_example_requests_status_idx ON public.assessment_example_requests USING btree (status, requested_at);


--
-- Name: assessment_versions_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessment_versions_latest_idx ON public.assessment_versions USING btree (plan_id, version DESC, created_at DESC);


--
-- Name: assessments_answers_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessments_answers_gin_idx ON public.assessments USING gin (answers jsonb_path_ops);


--
-- Name: assessments_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessments_plan_idx ON public.assessments USING btree (selected_plan, captured_at DESC);


--
-- Name: assessments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessments_status_idx ON public.assessments USING btree (status, captured_at DESC);


--
-- Name: blog_posts_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_published_idx ON public.blog_posts USING btree (locale, status, published_at DESC NULLS LAST, created_at DESC);


--
-- Name: blog_posts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_status_idx ON public.blog_posts USING btree (status, updated_at DESC);


--
-- Name: blog_posts_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_tags_idx ON public.blog_posts USING gin (tags);


--
-- Name: blog_posts_translation_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_translation_group_idx ON public.blog_posts USING btree (translation_group_id);


--
-- Name: bpm_affiliate_id_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_affiliate_id_filter_idx ON public.bpm USING btree (lower(COALESCE(affiliate_id, ''::text)), occurred_at DESC) WHERE (affiliate_id IS NOT NULL);


--
-- Name: bpm_affiliate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_affiliate_idx ON public.bpm USING btree (affiliate_id, affiliate_ref, occurred_at DESC) WHERE ((affiliate_id IS NOT NULL) OR (affiliate_ref IS NOT NULL));


--
-- Name: bpm_affiliate_ref_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_affiliate_ref_filter_idx ON public.bpm USING btree (lower(COALESCE(affiliate_ref, ''::text)), occurred_at DESC) WHERE (affiliate_ref IS NOT NULL);


--
-- Name: bpm_affiliate_sub_id_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_affiliate_sub_id_filter_idx ON public.bpm USING btree (lower(COALESCE(affiliate_sub_id, ''::text)), occurred_at DESC) WHERE (affiliate_sub_id IS NOT NULL);


--
-- Name: bpm_alerts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_alerts_idx ON public.bpm USING btree (severity, event_type, occurred_at DESC) WHERE ((severity = ANY (ARRAY['medium'::text, 'high'::text, 'critical'::text])) OR (event_type = ANY (ARRAY['safety'::text, 'error'::text])));


--
-- Name: bpm_campaign_id_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_campaign_id_filter_idx ON public.bpm USING btree (lower(campaign_id), occurred_at DESC) WHERE (campaign_id IS NOT NULL);


--
-- Name: bpm_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_campaign_idx ON public.bpm USING btree (utm_campaign, campaign_id, occurred_at DESC) WHERE ((utm_campaign IS NOT NULL) OR (campaign_id IS NOT NULL));


--
-- Name: bpm_campaign_name_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_campaign_name_filter_idx ON public.bpm USING btree (lower(COALESCE(campaign_name, ''::text)), occurred_at DESC) WHERE (campaign_name IS NOT NULL);


--
-- Name: bpm_device_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_device_idx ON public.bpm USING btree (lower(COALESCE(device_type, ''::text)), occurred_at DESC) WHERE (device_type IS NOT NULL);


--
-- Name: bpm_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_email_hash_idx ON public.bpm USING btree (email_hash, occurred_at DESC) WHERE (email_hash IS NOT NULL);


--
-- Name: bpm_event_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_event_time_idx ON public.bpm USING btree (event_type, event_name, occurred_at DESC);


--
-- Name: bpm_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_locale_idx ON public.bpm USING btree (locale, occurred_at DESC) WHERE (locale IS NOT NULL);


--
-- Name: bpm_metrics_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_metrics_gin_idx ON public.bpm USING gin (metrics jsonb_path_ops);


--
-- Name: bpm_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_occurred_idx ON public.bpm USING btree (occurred_at DESC);


--
-- Name: bpm_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_plan_idx ON public.bpm USING btree (plan_id, occurred_at DESC) WHERE (plan_id IS NOT NULL);


--
-- Name: bpm_promo_code_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_promo_code_filter_idx ON public.bpm USING btree (lower(promo_code), occurred_at DESC) WHERE (promo_code IS NOT NULL);


--
-- Name: bpm_promo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_promo_idx ON public.bpm USING btree (promo_code, occurred_at DESC) WHERE (promo_code IS NOT NULL);


--
-- Name: bpm_properties_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_properties_gin_idx ON public.bpm USING gin (properties jsonb_path_ops);


--
-- Name: bpm_ray_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_ray_idx ON public.bpm USING btree (ray, occurred_at DESC);


--
-- Name: bpm_selected_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_selected_plan_idx ON public.bpm USING btree (selected_plan, occurred_at DESC) WHERE (selected_plan IS NOT NULL);


--
-- Name: bpm_source_channel_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_source_channel_filter_idx ON public.bpm USING btree (lower(COALESCE(source_channel, ''::text)), occurred_at DESC) WHERE (source_channel IS NOT NULL);


--
-- Name: bpm_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_source_idx ON public.bpm USING btree (traffic_source, source_channel, occurred_at DESC) WHERE ((traffic_source IS NOT NULL) OR (source_channel IS NOT NULL));


--
-- Name: bpm_traffic_source_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_traffic_source_filter_idx ON public.bpm USING btree (lower(COALESCE(traffic_source, ''::text)), occurred_at DESC) WHERE (traffic_source IS NOT NULL);


--
-- Name: bpm_utm_campaign_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_utm_campaign_filter_idx ON public.bpm USING btree (lower(COALESCE(utm_campaign, ''::text)), occurred_at DESC) WHERE (utm_campaign IS NOT NULL);


--
-- Name: bpm_utm_medium_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_utm_medium_filter_idx ON public.bpm USING btree (lower(utm_medium), occurred_at DESC) WHERE (utm_medium IS NOT NULL);


--
-- Name: bpm_utm_source_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bpm_utm_source_filter_idx ON public.bpm USING btree (lower(COALESCE(utm_source, ''::text)), occurred_at DESC) WHERE (utm_source IS NOT NULL);


--
-- Name: communication_channels_identity_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX communication_channels_identity_address_idx ON public.communication_channels USING btree (identity_id, channel_type, lower(address));


--
-- Name: communication_messages_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_messages_plan_idx ON public.communication_messages USING btree (plan_id, created_at DESC) WHERE (plan_id IS NOT NULL);


--
-- Name: communication_messages_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_messages_status_idx ON public.communication_messages USING btree (status, created_at);


--
-- Name: cron_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cron_due_idx ON public.cron USING btree (status, scheduled_for);


--
-- Name: cron_plan_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cron_plan_action_idx ON public.cron USING btree (plan_id, action_type, status);


--
-- Name: cron_unsubscribe_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cron_unsubscribe_token_idx ON public.cron USING btree (unsubscribe_token) WHERE (unsubscribe_token IS NOT NULL);


--
-- Name: finance_accounts_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX finance_accounts_name_idx ON public.finance_accounts USING btree (lower(name));


--
-- Name: finance_transactions_category_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_category_occurred_idx ON public.finance_transactions USING btree (category, occurred_at DESC);


--
-- Name: finance_transactions_entry_type_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_entry_type_occurred_idx ON public.finance_transactions USING btree (entry_type, occurred_at DESC);


--
-- Name: finance_transactions_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_occurred_idx ON public.finance_transactions USING btree (occurred_at DESC);


--
-- Name: finance_transactions_source_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX finance_transactions_source_ref_idx ON public.finance_transactions USING btree (source, source_ref) WHERE (source_ref IS NOT NULL);


--
-- Name: finance_transactions_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_task_idx ON public.finance_transactions USING btree (task_id, occurred_at DESC) WHERE (task_id IS NOT NULL);


--
-- Name: food_aliases_food_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_aliases_food_idx ON public.food_aliases USING btree (food_id);


--
-- Name: food_guidance_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_guidance_latest_idx ON public.food_guidance USING btree (plan_id, version DESC, generated_at DESC);


--
-- Name: food_nutrient_profiles_nutrient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_nutrient_profiles_nutrient_idx ON public.food_nutrient_profiles USING btree (nutrient_id, amount_per_100g DESC);


--
-- Name: food_safety_rules_allergen_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_safety_rules_allergen_gin_idx ON public.food_safety_rules USING gin (allergen_flags);


--
-- Name: food_safety_rules_condition_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_safety_rules_condition_gin_idx ON public.food_safety_rules USING gin (condition_flags);


--
-- Name: food_safety_rules_food_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_safety_rules_food_idx ON public.food_safety_rules USING btree (food_id, version DESC);


--
-- Name: food_serving_sizes_food_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_serving_sizes_food_idx ON public.food_serving_sizes USING btree (food_id, is_default DESC);


--
-- Name: food_translations_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX food_translations_locale_idx ON public.food_translations USING btree (locale, status);


--
-- Name: foods_benefit_tags_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX foods_benefit_tags_gin_idx ON public.foods USING gin (benefit_tags);


--
-- Name: foods_nutrient_tags_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX foods_nutrient_tags_gin_idx ON public.foods USING gin (nutrient_tags);


--
-- Name: foods_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX foods_status_idx ON public.foods USING btree (list_status, is_active, name);


--
-- Name: formulations_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulations_latest_idx ON public.formulations USING btree (plan_id, version DESC, generated_at DESC);


--
-- Name: nutrition_plan_versions_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutrition_plan_versions_latest_idx ON public.nutrition_plan_versions USING btree (plan_id, version DESC, created_at DESC);


--
-- Name: nutrition_reports_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutrition_reports_latest_idx ON public.nutrition_reports USING btree (plan_id, version DESC, generated_at DESC);


--
-- Name: nutrition_reports_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX nutrition_reports_task_idx ON public.nutrition_reports (task_id) WHERE task_id IS NOT NULL;


--
-- Name: payment_versions_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_versions_latest_idx ON public.payment_versions USING btree (payment_id, version DESC, created_at DESC);


--
-- Name: payments_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_plan_idx ON public.payments USING btree (plan_id, created_at DESC) WHERE (plan_id IS NOT NULL);


--
-- Name: payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_status_idx ON public.payments USING btree (status, created_at DESC);


--
-- Name: payments_stripe_checkout_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_stripe_checkout_session_idx ON public.payments USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);


--
-- Name: plan_chat_assistant_reply_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plan_chat_assistant_reply_idx ON public.plan_chat_messages USING btree (reply_to_message_id) WHERE ((role = 'assistant'::text) AND (reply_to_message_id IS NOT NULL));


--
-- Name: plan_chat_messages_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_chat_messages_plan_idx ON public.plan_chat_messages USING btree (plan_id, created_at);


--
-- Name: plan_chat_messages_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_chat_messages_task_idx ON public.plan_chat_messages USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: plan_communication_primary_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plan_communication_primary_identity_idx ON public.plan_communication_identities USING btree (plan_id) WHERE is_primary;


--
-- Name: plan_feedback_active_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plan_feedback_active_unique_idx ON public.plan_feedback USING btree (plan_id, feedback_type, COALESCE(item_type, ''::text), COALESCE(item_id, ''::text), normalized_text) WHERE (status = 'active'::text);


--
-- Name: plan_feedback_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_feedback_plan_idx ON public.plan_feedback USING btree (plan_id, status, urgency, created_at);


--
-- Name: plan_feedback_source_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_feedback_source_message_idx ON public.plan_feedback USING btree (source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: plan_guidance_adjustments_active_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plan_guidance_adjustments_active_unique_idx ON public.plan_guidance_adjustments USING btree (plan_id, item_type, action, COALESCE(item_id, ''::text), normalized_item_name) WHERE (status = 'active'::text);


--
-- Name: plan_guidance_adjustments_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_guidance_adjustments_plan_idx ON public.plan_guidance_adjustments USING btree (plan_id, status, created_at);


--
-- Name: plan_guidance_adjustments_source_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_guidance_adjustments_source_message_idx ON public.plan_guidance_adjustments USING btree (source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: product_admin_audit_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_admin_audit_brand_idx ON public.product_admin_audit USING btree (brand_id, created_at DESC);


--
-- Name: product_admin_audit_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_admin_audit_product_idx ON public.product_admin_audit USING btree (product_id, created_at DESC);


--
-- Name: product_brand_countries_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_brand_countries_country_idx ON public.product_brand_countries USING btree (country_code, brand_id);


--
-- Name: product_countries_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_countries_country_idx ON public.product_countries USING btree (country_code, product_id);


--
-- Name: product_facts_food_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_facts_food_idx ON public.product_facts USING btree (food_id) WHERE (food_id IS NOT NULL);


--
-- Name: product_facts_nutrient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_facts_nutrient_idx ON public.product_facts USING btree (nutrient_id) WHERE (nutrient_id IS NOT NULL);


--
-- Name: product_facts_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_facts_product_idx ON public.product_facts USING btree (product_id, item_type, normalized_name);


--
-- Name: product_facts_supplement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_facts_supplement_idx ON public.product_facts USING btree (supplement_id) WHERE (supplement_id IS NOT NULL);


--
-- Name: product_import_runs_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_import_runs_brand_idx ON public.product_import_runs USING btree (normalized_brand_name, started_at DESC);


--
-- Name: product_import_runs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_import_runs_status_idx ON public.product_import_runs USING btree (status, started_at DESC);


--
-- Name: product_imports_review_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_imports_review_task_idx ON public.product_imports USING btree (review_task_id) WHERE (review_task_id IS NOT NULL);


--
-- Name: product_imports_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_imports_run_idx ON public.product_imports USING btree (import_run_id, created_at) WHERE (import_run_id IS NOT NULL);


--
-- Name: product_imports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_imports_status_idx ON public.product_imports USING btree (status, created_at);


--
-- Name: product_import_translations_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_import_translations_locale_idx ON public.product_import_translations USING btree (locale, status);


--
-- Name: product_offers_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_offers_priority_idx ON public.product_offers USING btree (product_id, status, link_type, commission_rate DESC NULLS LAST, admin_priority DESC, updated_at DESC);


--
-- Name: product_offers_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_offers_product_idx ON public.product_offers USING btree (product_id, status, updated_at DESC);


--
-- Name: product_offers_product_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_offers_product_url_idx ON public.product_offers USING btree (product_id, url);


--
-- Name: product_recommendation_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_recommendation_items_product_idx ON public.product_recommendation_items USING btree (product_id, created_at DESC);


--
-- Name: product_recommendation_decisions_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_recommendation_decisions_current_idx ON public.product_recommendation_decisions USING btree (is_current, outcome, generated_at DESC);


--
-- Name: product_recommendation_decisions_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_recommendation_decisions_product_idx ON public.product_recommendation_decisions USING btree (product_id, outcome, generated_at DESC);


--
-- Name: product_recommendation_decisions_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_recommendation_decisions_run_idx ON public.product_recommendation_decisions USING btree (run_id, outcome);


--
-- Name: product_recommendation_runs_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_recommendation_runs_plan_idx ON public.product_recommendation_runs USING btree (plan_id, generated_at DESC);


--
-- Name: product_recommendation_runs_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_recommendation_runs_task_idx ON public.product_recommendation_runs USING btree (task_id) WHERE (task_id IS NOT NULL);


--
-- Name: product_versions_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_versions_latest_idx ON public.product_versions USING btree (product_id, version DESC);


--
-- Name: products_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_brand_idx ON public.products USING btree (brand_id, status, title);


--
-- Name: products_fda_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_fda_idx ON public.products USING btree (fda_approval_number) WHERE (fda_approval_number IS NOT NULL);


--
-- Name: products_platform_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_platform_identifier_idx ON public.products USING btree (platform, region, external_product_id) WHERE (external_product_id IS NOT NULL);


--
-- Name: products_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_status_idx ON public.products USING btree (status, availability_status, label_status, updated_at DESC);


--
-- Name: product_translations_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_translations_locale_idx ON public.product_translations USING btree (locale, status);


--
-- Name: products_title_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_title_search_idx ON public.products USING btree (normalized_title);


--
-- Name: recommendations_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recommendations_latest_idx ON public.recommendations USING btree (plan_id, version DESC, generated_at DESC);


--
-- Name: safety_reviews_ai_suggestion_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_ai_suggestion_gin_idx ON public.safety_reviews USING gin (ai_suggestion jsonb_path_ops);


--
-- Name: safety_reviews_context_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_context_gin_idx ON public.safety_reviews USING gin (safety_context jsonb_path_ops);


--
-- Name: safety_reviews_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_item_idx ON public.safety_reviews USING btree (item_type, lower(COALESCE(item_name, supplement_name)), opened_at DESC);


--
-- Name: safety_reviews_notification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_notification_idx ON public.safety_reviews USING btree (client_notification_status, opened_at);


--
-- Name: safety_reviews_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_plan_idx ON public.safety_reviews USING btree (plan_id, opened_at DESC) WHERE (plan_id IS NOT NULL);


--
-- Name: safety_reviews_ray_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_ray_idx ON public.safety_reviews USING btree (ray, opened_at DESC) WHERE (ray IS NOT NULL);


--
-- Name: safety_reviews_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_status_idx ON public.safety_reviews USING btree (status, severity, opened_at);


--
-- Name: safety_reviews_supplement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_supplement_idx ON public.safety_reviews USING btree (lower(supplement_name), opened_at DESC);


--
-- Name: safety_reviews_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX safety_reviews_task_idx ON public.safety_reviews USING btree (task_id, opened_at DESC) WHERE (task_id IS NOT NULL);


--
-- Name: stripe_webhook_events_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_payment_idx ON public.stripe_webhook_events USING btree (payment_id, received_at DESC) WHERE (payment_id IS NOT NULL);


--
-- Name: stripe_webhook_events_stripe_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stripe_webhook_events_stripe_event_id_idx ON public.stripe_webhook_events USING btree (stripe_event_id);


--
-- Name: supplement_admin_audit_supplement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_admin_audit_supplement_idx ON public.supplement_admin_audit USING btree (supplement_id, created_at DESC);


--
-- Name: supplement_aliases_supplement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_aliases_supplement_idx ON public.supplement_aliases USING btree (supplement_id, alias);


--
-- Name: supplement_recommendation_selections_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_recommendation_selections_current_idx ON public.supplement_recommendation_selections USING btree (is_current, status, generated_at DESC);


--
-- Name: supplement_recommendation_selections_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_recommendation_selections_plan_idx ON public.supplement_recommendation_selections USING btree (plan_id, formulation_version DESC);


--
-- Name: supplement_recommendation_selections_supplement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_recommendation_selections_supplement_idx ON public.supplement_recommendation_selections USING btree (supplement_id, generated_at DESC) WHERE (supplement_id IS NOT NULL);


--
-- Name: supplement_safety_limits_supplement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_safety_limits_supplement_idx ON public.supplement_safety_limits USING btree (supplement_id, version DESC);


--
-- Name: supplement_translations_locale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_translations_locale_idx ON public.supplement_translations USING btree (locale, status);


--
-- Name: supplement_versions_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplement_versions_latest_idx ON public.supplement_versions USING btree (supplement_id, version DESC);


--
-- Name: supplements_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplements_category_idx ON public.supplements USING btree (category, list_status, name);


--
-- Name: supplements_list_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplements_list_status_idx ON public.supplements USING btree (list_status, is_active, name);


--
-- Name: supplements_name_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplements_name_search_idx ON public.supplements USING btree (normalized_name);


--
-- Name: task_approvals_capabilities_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_approvals_capabilities_gin_idx ON public.task_approvals USING gin (required_capabilities);


--
-- Name: task_approvals_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_approvals_status_idx ON public.task_approvals USING btree (status, requested_at);


--
-- Name: task_approvals_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_approvals_task_idx ON public.task_approvals USING btree (task_id, requested_at DESC);


--
-- Name: task_comments_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_comments_agent_idx ON public.task_comments USING btree (agent_id, created_at DESC) WHERE (agent_id IS NOT NULL);


--
-- Name: task_comments_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_comments_task_idx ON public.task_comments USING btree (task_id, created_at);


--
-- Name: task_dependencies_waiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_dependencies_waiting_idx ON public.task_dependencies USING btree (depends_on_task_id, task_id);


--
-- Name: task_events_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_events_agent_idx ON public.task_events USING btree (agent_id, occurred_at DESC) WHERE (agent_id IS NOT NULL);


--
-- Name: task_events_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_events_task_idx ON public.task_events USING btree (task_id, occurred_at) WHERE (task_id IS NOT NULL);


--
-- Name: task_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_events_type_idx ON public.task_events USING btree (event_type, occurred_at DESC);


--
-- Name: task_reservations_active_task_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX task_reservations_active_task_idx ON public.task_reservations USING btree (task_id) WHERE (status = 'active'::text);


--
-- Name: task_reservations_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_reservations_agent_idx ON public.task_reservations USING btree (agent_id, status, reserved_at DESC);


--
-- Name: task_reservations_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_reservations_membership_idx ON public.task_reservations USING btree (membership_id, status, reserved_at DESC);


--
-- Name: task_reservations_lease_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_reservations_lease_idx ON public.task_reservations USING btree (status, lease_until) WHERE (status = 'active'::text);


--
-- Name: task_reservations_worker_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_reservations_worker_session_idx ON public.task_reservations USING btree (worker_session_id, status, reserved_at DESC) WHERE (worker_session_id IS NOT NULL);


--
-- Name: tasks_active_idempotency_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tasks_active_idempotency_idx ON public.tasks USING btree (idempotency_scope_key, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (status <> ALL (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text, 'skipped'::text])));


--
-- Name: tasks_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_group_idx ON public.tasks USING btree (task_group_id, created_at);


--
-- Name: tasks_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_parent_idx ON public.tasks USING btree (parent_task_id, created_at) WHERE (parent_task_id IS NOT NULL);


--
-- Name: tasks_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_plan_idx ON public.tasks USING btree (plan_id, created_at DESC) WHERE (plan_id IS NOT NULL);


CREATE INDEX tasks_organisation_status_idx ON public.tasks USING btree (organisation_id, status, scheduled_for DESC);


--
-- Name: tasks_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_queue_idx ON public.tasks USING btree (status, business_value DESC, scheduled_for, created_at);


--
-- Name: tasks_ray_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_ray_idx ON public.tasks USING btree (ray_id, created_at DESC) WHERE (ray_id IS NOT NULL);


--
-- Name: tasks_required_capabilities_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_required_capabilities_gin_idx ON public.tasks USING gin (required_capabilities);


--
-- Name: tasks_reserved_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_reserved_agent_idx ON public.tasks USING btree (reserved_by_agent_id, lease_until) WHERE (reserved_by_agent_id IS NOT NULL);


--
-- Name: tasks_retry_lineage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_retry_lineage_idx ON public.tasks USING btree (task_group_id, COALESCE(retry_root_task_id, id), retry_attempt, created_at);


--
-- Name: testimonials_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testimonials_status_idx ON public.testimonials USING btree (locale, status, sort_order, created_at DESC);

--
-- Name: testimonials_translation_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testimonials_translation_group_idx ON public.testimonials USING btree (translation_group_id);


--
-- Name: worker_sessions_agent_instance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worker_sessions_agent_idx ON public.worker_sessions USING btree (agent_id, status, last_seen_at DESC);


--
-- Name: worker_sessions_membership_instance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX worker_sessions_membership_instance_idx ON public.worker_sessions USING btree (membership_id, instance_id);


--
-- Name: worker_sessions_capabilities_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worker_sessions_capabilities_gin_idx ON public.worker_sessions USING gin (capabilities);


--
-- Name: worker_sessions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worker_sessions_status_idx ON public.worker_sessions USING btree (status, last_seen_at DESC);


--
-- Name: assessment_versions assessment_versions_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessment_versions_no_update_delete BEFORE DELETE OR UPDATE ON public.assessment_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: nutrition_plan_versions nutrition_plan_versions_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nutrition_plan_versions_no_update_delete BEFORE DELETE OR UPDATE ON public.nutrition_plan_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: payment_versions payment_versions_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_versions_no_update_delete BEFORE DELETE OR UPDATE ON public.payment_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: product_recommendation_items product_recommendation_items_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_recommendation_items_no_update_delete BEFORE DELETE OR UPDATE ON public.product_recommendation_items FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: product_recommendation_runs product_recommendation_runs_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_recommendation_runs_no_update_delete BEFORE DELETE OR UPDATE ON public.product_recommendation_runs FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: product_versions product_versions_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_versions_no_update_delete BEFORE DELETE OR UPDATE ON public.product_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: supplement_safety_limits supplement_safety_limits_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplement_safety_limits_no_update_delete BEFORE DELETE OR UPDATE ON public.supplement_safety_limits FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: supplement_versions supplement_versions_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplement_versions_no_update_delete BEFORE DELETE OR UPDATE ON public.supplement_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_version_mutation();


--
-- Name: task_dependencies task_dependencies_prevent_cycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_dependencies_prevent_cycle BEFORE INSERT OR UPDATE OF task_id, depends_on_task_id ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION public.prevent_task_dependency_cycle();


--
-- Name: task_events task_events_no_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_events_no_update_delete BEFORE DELETE OR UPDATE ON public.task_events FOR EACH ROW EXECUTE FUNCTION public.prevent_task_events_mutation();


--
-- Name: assessment_example_requests assessment_example_requests_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_example_requests
    ADD CONSTRAINT assessment_example_requests_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: blog_posts blog_posts_testimonial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_testimonial_id_fkey FOREIGN KEY (testimonial_id) REFERENCES public.testimonials(id) ON DELETE SET NULL;


--
-- Name: bpm bpm_cron_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpm
    ADD CONSTRAINT bpm_cron_id_fkey FOREIGN KEY (cron_id) REFERENCES public.cron(id) ON DELETE SET NULL;


--
-- Name: bpm bpm_example_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpm
    ADD CONSTRAINT bpm_example_request_id_fkey FOREIGN KEY (example_request_id) REFERENCES public.assessment_example_requests(id) ON DELETE SET NULL;


--
-- Name: bpm bpm_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bpm
    ADD CONSTRAINT bpm_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: communication_channels communication_channels_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_channels
    ADD CONSTRAINT communication_channels_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.communication_identities(id) ON DELETE CASCADE;


--
-- Name: communication_messages communication_messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_messages
    ADD CONSTRAINT communication_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.communication_channels(id) ON DELETE SET NULL;


--
-- Name: communication_messages communication_messages_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_messages
    ADD CONSTRAINT communication_messages_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.communication_identities(id) ON DELETE SET NULL;


--
-- Name: communication_messages communication_messages_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_messages
    ADD CONSTRAINT communication_messages_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: communication_messages communication_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_messages
    ADD CONSTRAINT communication_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: cron cron_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron
    ADD CONSTRAINT cron_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: finance_transactions finance_transactions_from_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_from_account_id_fkey FOREIGN KEY (from_account_id) REFERENCES public.finance_accounts(id) ON DELETE RESTRICT;


--
-- Name: finance_transactions finance_transactions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_to_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES public.finance_accounts(id) ON DELETE RESTRICT;


--
-- Name: food_admin_audit food_admin_audit_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_admin_audit
    ADD CONSTRAINT food_admin_audit_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE SET NULL;


--
-- Name: food_aliases food_aliases_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_aliases
    ADD CONSTRAINT food_aliases_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_guidance food_guidance_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_guidance
    ADD CONSTRAINT food_guidance_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: food_nutrient_profiles food_nutrient_profiles_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_nutrient_profiles
    ADD CONSTRAINT food_nutrient_profiles_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_nutrient_profiles food_nutrient_profiles_nutrient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_nutrient_profiles
    ADD CONSTRAINT food_nutrient_profiles_nutrient_id_fkey FOREIGN KEY (nutrient_id) REFERENCES public.nutrients(id) ON DELETE RESTRICT;


--
-- Name: food_safety_rules food_safety_rules_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_safety_rules
    ADD CONSTRAINT food_safety_rules_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_serving_sizes food_serving_sizes_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_serving_sizes
    ADD CONSTRAINT food_serving_sizes_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_translations food_translations_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_translations
    ADD CONSTRAINT food_translations_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: formulations formulations_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: nutrition_reports nutrition_reports_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_reports
    ADD CONSTRAINT nutrition_reports_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: nutrition_reports nutrition_reports_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_reports
    ADD CONSTRAINT nutrition_reports_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: payment_versions payment_versions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_versions
    ADD CONSTRAINT payment_versions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE RESTRICT;


--
-- Name: payment_versions payment_versions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_versions
    ADD CONSTRAINT payment_versions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: payments payments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: plan_chat_messages plan_chat_messages_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_chat_messages
    ADD CONSTRAINT plan_chat_messages_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: plan_chat_messages plan_chat_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_chat_messages
    ADD CONSTRAINT plan_chat_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.plan_chat_messages(id) ON DELETE SET NULL;


--
-- Name: plan_chat_messages plan_chat_messages_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_chat_messages
    ADD CONSTRAINT plan_chat_messages_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: plan_communication_identities plan_communication_identities_identity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_communication_identities
    ADD CONSTRAINT plan_communication_identities_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES public.communication_identities(id) ON DELETE CASCADE;


--
-- Name: plan_communication_identities plan_communication_identities_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_communication_identities
    ADD CONSTRAINT plan_communication_identities_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: plan_feedback plan_feedback_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_feedback
    ADD CONSTRAINT plan_feedback_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: plan_feedback plan_feedback_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_feedback
    ADD CONSTRAINT plan_feedback_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.plan_chat_messages(id) ON DELETE SET NULL;


--
-- Name: plan_feedback plan_feedback_source_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_feedback
    ADD CONSTRAINT plan_feedback_source_task_id_fkey FOREIGN KEY (source_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: plan_guidance_adjustments plan_guidance_adjustments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_guidance_adjustments
    ADD CONSTRAINT plan_guidance_adjustments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: plan_guidance_adjustments plan_guidance_adjustments_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_guidance_adjustments
    ADD CONSTRAINT plan_guidance_adjustments_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.plan_chat_messages(id) ON DELETE SET NULL;


--
-- Name: plan_guidance_adjustments plan_guidance_adjustments_source_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_guidance_adjustments
    ADD CONSTRAINT plan_guidance_adjustments_source_task_id_fkey FOREIGN KEY (source_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: product_admin_audit product_admin_audit_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_admin_audit
    ADD CONSTRAINT product_admin_audit_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.product_brands(id) ON DELETE SET NULL;


--
-- Name: product_admin_audit product_admin_audit_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_admin_audit
    ADD CONSTRAINT product_admin_audit_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: product_facts product_facts_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_facts
    ADD CONSTRAINT product_facts_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE SET NULL;


--
-- Name: product_facts product_facts_nutrient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_facts
    ADD CONSTRAINT product_facts_nutrient_id_fkey FOREIGN KEY (nutrient_id) REFERENCES public.nutrients(id) ON DELETE SET NULL;


--
-- Name: product_facts product_facts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_facts
    ADD CONSTRAINT product_facts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_facts product_facts_supplement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_facts
    ADD CONSTRAINT product_facts_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE SET NULL;


--
-- Name: product_imports product_imports_import_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_imports
    ADD CONSTRAINT product_imports_import_run_id_fkey FOREIGN KEY (import_run_id) REFERENCES public.product_import_runs(id) ON DELETE SET NULL;


--
-- Name: product_imports product_imports_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_imports
    ADD CONSTRAINT product_imports_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: product_imports product_imports_review_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_imports
    ADD CONSTRAINT product_imports_review_task_id_fkey FOREIGN KEY (review_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: product_import_translations product_import_translations_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_import_translations
    ADD CONSTRAINT product_import_translations_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.product_imports(id) ON DELETE CASCADE;


--
-- Name: product_offers product_offers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_offers
    ADD CONSTRAINT product_offers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_recommendation_items product_recommendation_items_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_items
    ADD CONSTRAINT product_recommendation_items_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.product_offers(id) ON DELETE SET NULL;


--
-- Name: product_recommendation_items product_recommendation_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_items
    ADD CONSTRAINT product_recommendation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: product_recommendation_items product_recommendation_items_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_items
    ADD CONSTRAINT product_recommendation_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.product_recommendation_runs(id) ON DELETE CASCADE;


--
-- Name: product_recommendation_decisions product_recommendation_decisions_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.product_offers(id) ON DELETE SET NULL;


--
-- Name: product_recommendation_decisions product_recommendation_decisions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: product_recommendation_decisions product_recommendation_decisions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: product_recommendation_decisions product_recommendation_decisions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.product_recommendation_runs(id) ON DELETE CASCADE;


--
-- Name: product_recommendation_decisions product_recommendation_decisions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_decisions
    ADD CONSTRAINT product_recommendation_decisions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: product_recommendation_runs product_recommendation_runs_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_runs
    ADD CONSTRAINT product_recommendation_runs_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: product_recommendation_runs product_recommendation_runs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_recommendation_runs
    ADD CONSTRAINT product_recommendation_runs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: product_translations product_translations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_translations
    ADD CONSTRAINT product_translations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.product_brands(id) ON DELETE SET NULL;


--
-- Name: recommendations recommendations_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: safety_reviews safety_reviews_bpm_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_reviews
    ADD CONSTRAINT safety_reviews_bpm_event_id_fkey FOREIGN KEY (bpm_event_id) REFERENCES public.bpm(id) ON DELETE SET NULL;


--
-- Name: safety_reviews safety_reviews_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_reviews
    ADD CONSTRAINT safety_reviews_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: safety_reviews safety_reviews_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_reviews
    ADD CONSTRAINT safety_reviews_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: stripe_webhook_events stripe_webhook_events_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: supplement_admin_audit supplement_admin_audit_supplement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_admin_audit
    ADD CONSTRAINT supplement_admin_audit_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE SET NULL;


--
-- Name: supplement_aliases supplement_aliases_supplement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_aliases
    ADD CONSTRAINT supplement_aliases_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE CASCADE;


--
-- Name: supplement_recommendation_selections supplement_recommendation_selections_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_recommendation_selections
    ADD CONSTRAINT supplement_recommendation_selections_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE CASCADE;


--
-- Name: supplement_recommendation_selections supplement_recommendation_selections_supplement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_recommendation_selections
    ADD CONSTRAINT supplement_recommendation_selections_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE SET NULL;


--
-- Name: supplement_recommendation_selections supplement_recommendation_selections_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_recommendation_selections
    ADD CONSTRAINT supplement_recommendation_selections_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: supplement_safety_limits supplement_safety_limits_supplement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_safety_limits
    ADD CONSTRAINT supplement_safety_limits_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE CASCADE;


--
-- Name: supplement_translations supplement_translations_supplement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplement_translations
    ADD CONSTRAINT supplement_translations_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE CASCADE;


--
-- Name: task_approvals task_approvals_decided_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approvals
    ADD CONSTRAINT task_approvals_decided_by_agent_id_fkey FOREIGN KEY (decided_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: task_approvals task_approvals_requested_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approvals
    ADD CONSTRAINT task_approvals_requested_by_agent_id_fkey FOREIGN KEY (requested_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: task_approvals task_approvals_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_approvals
    ADD CONSTRAINT task_approvals_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_comments task_comments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: task_comments task_comments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_comments
    ADD CONSTRAINT task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_events task_events_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: task_events task_events_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: task_reservations task_reservations_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reservations
    ADD CONSTRAINT task_reservations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: task_reservations task_reservations_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reservations
    ADD CONSTRAINT task_reservations_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.organisation_memberships(id) ON DELETE RESTRICT;


--
-- Name: task_reservations task_reservations_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reservations
    ADD CONSTRAINT task_reservations_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_reservations task_reservations_worker_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_reservations
    ADD CONSTRAINT task_reservations_worker_session_id_fkey FOREIGN KEY (worker_session_id) REFERENCES public.worker_sessions(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_agent_id_fkey FOREIGN KEY (created_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_task_id_fkey FOREIGN KEY (created_by_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assessments(plan_id) ON DELETE SET NULL;


--
-- Name: tasks tasks_reserved_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_reserved_by_agent_id_fkey FOREIGN KEY (reserved_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_retry_of_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_retry_of_task_id_fkey FOREIGN KEY (retry_of_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_retry_root_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_retry_root_task_id_fkey FOREIGN KEY (retry_root_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: worker_sessions worker_sessions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_sessions
    ADD CONSTRAINT worker_sessions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: worker_sessions worker_sessions_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_sessions
    ADD CONSTRAINT worker_sessions_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.organisation_memberships(id) ON DELETE RESTRICT;


INSERT INTO public.organisations (
    slug,
    name,
    organisation_type,
    status,
    default_locale
)
VALUES (
    'mattanutra',
    'MattaNutra',
    'platform',
    'active',
    'en'
)
ON CONFLICT DO NOTHING;


--
-- PostgreSQL database dump complete
--
