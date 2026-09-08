import type { PlanOperationRecord } from "@/lib/agentic/store/types";

type Checkpoint = Record<string, unknown> & { search?: Record<string, unknown> & { cursor?: string } };

/** Polls and lease changes carry small checkpoint metadata. An omitted cursor
 * preserves the stored archive; checkpoint=null explicitly clears it. */
export function operationCursor(record: PlanOperationRecord): string | undefined {
  return (record.checkpoint as Checkpoint | null)?.search?.cursor;
}
export function withoutOperationCursor(record: PlanOperationRecord): PlanOperationRecord {
  const checkpoint = record.checkpoint as Checkpoint | null;
  if (!checkpoint?.search) return record;
  const search = { ...checkpoint.search }; delete search.cursor;
  return { ...record, checkpoint: { ...checkpoint, search } };
}
export function withOperationCursor(record: PlanOperationRecord, cursor: string | undefined): PlanOperationRecord {
  const checkpoint = record.checkpoint as Checkpoint | null;
  return cursor === undefined || !checkpoint?.search ? record
    : { ...record, checkpoint: { ...checkpoint, search: { ...checkpoint.search, cursor } } };
}
