import type { PlanOperationRecord } from "@/lib/agentic/store/types";

export type OperationCursor = string | Uint8Array;
type Checkpoint = Record<string, unknown> & { search?: Record<string, unknown> & { cursor?: OperationCursor } };

/** Polls and lease changes carry small checkpoint metadata. An omitted cursor
 * preserves the stored archive; checkpoint=null explicitly clears it. */
export function operationCursor(record: PlanOperationRecord): OperationCursor | undefined {
  return (record.checkpoint as Checkpoint | null)?.search?.cursor;
}
export function withoutOperationCursor(record: PlanOperationRecord): PlanOperationRecord {
  const checkpoint = record.checkpoint as Checkpoint | null;
  if (!checkpoint?.search) return record;
  const search = { ...checkpoint.search }; delete search.cursor;
  return { ...record, checkpoint: { ...checkpoint, search } };
}
export function withOperationCursor(record: PlanOperationRecord, cursor: OperationCursor | undefined): PlanOperationRecord {
  const checkpoint = record.checkpoint as Checkpoint | null;
  return cursor === undefined || !checkpoint?.search ? record
    : { ...record, checkpoint: { ...checkpoint, search: { ...checkpoint.search, cursor } } };
}
export function operationCursorBytes(cursor: OperationCursor): Buffer {
  return typeof cursor === "string" ? Buffer.from(cursor, "base64") : Buffer.from(cursor.buffer, cursor.byteOffset, cursor.byteLength);
}
