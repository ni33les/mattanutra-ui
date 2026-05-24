-- ============================================================================
-- db-data-05-catalogue-reset.sql
-- ============================================================================
-- MattaNutra rollout SQL
-- Clear current catalogue projections/evidence before loading the curated seed.
-- This makes db-data-* replayable against UAT/PRD schemas that already contain
-- older product/supplement rows with different IDs but the same URLs/names.

begin;

truncate table
  public.product_recommendation_items,
  public.product_recommendation_runs,
  public.product_admin_audit,
  public.product_offers,
  public.product_imports,
  public.product_import_runs,
  public.product_versions,
  public.product_facts,
  public.product_countries,
  public.product_brand_countries,
  public.products,
  public.product_brands,
  public.supplement_admin_audit,
  public.supplement_versions,
  public.supplement_aliases,
  public.supplement_safety_limits,
  public.supplements
cascade;

commit;
