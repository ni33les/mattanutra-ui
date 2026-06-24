import { closeSqlPool, getSql } from "@/lib/db";
import { productForms } from "@/lib/product-form";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to backfill product form details");
}

const productFormValuesSql = productForms
  .map((form) => `'${form}'`)
  .join(", ");

const productFormInferenceCase = `
  case
    when product_form_text.product_kind = 'food' then 'food'
    when product_form_text.search_text ~* '\\ysoft[[:space:]-]*gels?\\y|\\ysoftgels?\\y' then 'softgel'
    when product_form_text.search_text ~* '\\ycapsules?\\y|\\ycaps\\y' then 'capsule'
    when product_form_text.search_text ~* '\\ytablets?\\y|\\ytabs?\\y' then 'tablet'
    when product_form_text.search_text ~* '\\ypowders?\\y' then 'powder'
    when product_form_text.search_text ~* '\\ygumm(y|ies)\\y' then 'gummy'
    when product_form_text.search_text ~* '\\ysachets?\\y|\\ysticks?\\y' then 'sachet'
    when product_form_text.search_text ~* '\\ysprays?\\y' then 'spray'
    when product_form_text.search_text ~* '\\ydrops?\\y|\\ydroppers?\\y' then 'drop'
    when product_form_text.search_text ~* '\\ylozenges?\\y|\\ypastilles?\\y' then 'lozenge'
    when product_form_text.search_text ~* '\\ybars?\\y' then 'bar'
    when product_form_text.search_text ~* '\\yliquids?\\y|\\ysolution\\y|\\ysyrup\\y|\\ydrinks?\\y|\\ybeverages?\\y' then 'liquid'
    when product_form_text.search_text ~* '\\yfoods?\\y|\\ysnacks?\\y|\\ygranola\\y|\\ycereal\\y' then 'food'
    when product_form_text.search_text ~* '\\ypills?\\y' then 'pill'
    else 'unknown'
  end
`;

try {
  const backfillRows = await sql.unsafe<Array<{
    product_form: string;
    updated_count: string | number;
  }>>(`
    with product_form_text as (
      select
        products.id,
        products.product_kind,
        lower(concat_ws(
          ' ',
          products.title,
          products.description,
          products.category,
          products.product_kind,
          products.source_snapshot::text,
          coalesce(product_translation_rows.search_text, ''),
          coalesce(fact_rows.search_text, '')
        )) as search_text
      from public.products
      left join lateral (
        select string_agg(
          concat_ws(
            ' ',
            product_translations.locale,
            product_translations.title,
            product_translations.description
          ),
          ' '
        ) as search_text
        from public.product_translations
        where product_translations.product_id = products.id
      ) product_translation_rows on true
      left join lateral (
        select string_agg(
          concat_ws(
            ' ',
            product_facts.name,
            product_facts.serving_label,
            product_facts.source_text,
            product_facts.unit
          ),
          ' '
        ) as search_text
        from public.product_facts
        where product_facts.product_id = products.id
      ) fact_rows on true
    ),
    inferred as (
      select
        product_form_text.id,
        ${productFormInferenceCase} as product_form
      from product_form_text
    ),
    updated as (
      update public.products
      set source_snapshot = coalesce(products.source_snapshot, '{}'::jsonb) ||
        jsonb_build_object('productForm', inferred.product_form)
      from inferred
      where products.id = inferred.id
        and inferred.product_form <> 'unknown'
        and coalesce(nullif(products.source_snapshot ->> 'productForm', ''), 'unknown') = 'unknown'
      returning inferred.product_form
    )
    select product_form, count(*) as updated_count
    from updated
    group by product_form
    order by product_form
  `);

  const distribution = await sql.unsafe<Array<{
    product_form: string;
    total: string | number;
  }>>(`
    select
      coalesce(nullif(source_snapshot ->> 'productForm', ''), 'unknown') as product_form,
      count(*) as total
    from public.products
    where coalesce(nullif(source_snapshot ->> 'productForm', ''), 'unknown') in (${productFormValuesSql})
    group by product_form
    order by total desc, product_form asc
  `);

  console.log(JSON.stringify({
    productFormBackfill: "applied",
    backfilled: backfillRows,
    distribution
  }));
} finally {
  await closeSqlPool();
}
