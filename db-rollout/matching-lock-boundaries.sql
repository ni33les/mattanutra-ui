-- Defer the shared catalogue fence until commit. The event is transaction-local
-- by key and removed by its deferred trigger; it is never a growing work queue.
CREATE TABLE IF NOT EXISTS public.catalogue_revision_commits (
  transaction_id bigint PRIMARY KEY
);
CREATE OR REPLACE FUNCTION public.commit_catalogue_runtime_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.catalogue_runtime_revision SET revision=revision+1, updated_at=now() WHERE singleton=true;
  DELETE FROM public.catalogue_revision_commits WHERE transaction_id=NEW.transaction_id;
  RETURN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.catalogue_revision_commits'::regclass AND tgname='commit_catalogue_runtime_revision') THEN
    CREATE CONSTRAINT TRIGGER commit_catalogue_runtime_revision
      AFTER INSERT ON public.catalogue_revision_commits DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.commit_catalogue_runtime_revision();
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.bump_catalogue_runtime_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.catalogue_revision_commits(transaction_id) VALUES(txid_current()) ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;

-- A cycle can only involve the connected components containing the two ends.
-- Lock those nodes, not every dependency graph in the service. Recheck the
-- component after acquisition, because a concurrently committed edge may join it.
-- Try-locks avoid lock-order deadlocks across multiple edges in one transaction.
CREATE OR REPLACE FUNCTION public.prevent_task_dependency_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  nodes uuid[];
  confirmed uuid[];
  node_id uuid;
BEGIN
  IF NEW.task_id=NEW.depends_on_task_id THEN
    RAISE EXCEPTION 'Task cannot depend on itself' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.task_id=OLD.task_id AND NEW.depends_on_task_id=OLD.depends_on_task_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.task_dependencies WHERE task_id=NEW.task_id AND depends_on_task_id=NEW.depends_on_task_id) THEN
    RETURN NEW;
  END IF;
  LOOP
    WITH RECURSIVE connected(id) AS (
      SELECT unnest(ARRAY[NEW.task_id,NEW.depends_on_task_id])
      UNION
      SELECT CASE WHEN d.task_id=c.id THEN d.depends_on_task_id ELSE d.task_id END
      FROM connected c JOIN public.task_dependencies d ON d.task_id=c.id OR d.depends_on_task_id=c.id
    ) SELECT array_agg(id ORDER BY id) INTO nodes FROM connected;
    FOREACH node_id IN ARRAY nodes LOOP
      IF NOT pg_try_advisory_xact_lock(hashtextextended('task-dependency:'||node_id::text,0)) THEN
        RAISE EXCEPTION 'Concurrent task dependency change; retry the transaction' USING ERRCODE='40001';
      END IF;
    END LOOP;
    WITH RECURSIVE connected(id) AS (
      SELECT unnest(ARRAY[NEW.task_id,NEW.depends_on_task_id])
      UNION
      SELECT CASE WHEN d.task_id=c.id THEN d.depends_on_task_id ELSE d.task_id END
      FROM connected c JOIN public.task_dependencies d ON d.task_id=c.id OR d.depends_on_task_id=c.id
    ) SELECT array_agg(id ORDER BY id) INTO confirmed FROM connected;
    EXIT WHEN nodes=confirmed;
  END LOOP;
  IF EXISTS (
    WITH RECURSIVE dependency_path(task_id) AS (
      SELECT NEW.depends_on_task_id
      UNION
      SELECT d.depends_on_task_id FROM public.task_dependencies d JOIN dependency_path p ON d.task_id=p.task_id
      WHERE TG_OP<>'UPDATE' OR d.task_id<>OLD.task_id OR d.depends_on_task_id<>OLD.depends_on_task_id
    ) SELECT 1 FROM dependency_path WHERE task_id=NEW.task_id
  ) THEN
    RAISE EXCEPTION 'Task dependency cycle detected' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
