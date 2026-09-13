set local lock_timeout = '2s';
set local statement_timeout = '30s';
alter table public.retail_customer_orders drop constraint if exists retail_customer_orders_source_check;
alter table public.retail_customer_orders add constraint retail_customer_orders_source_check
  check (source in ('manual', 'checkout', 'pharmacy'));
