import type {PlanRevisionRecord} from "@/lib/agentic/store/types";
import {planStatusProjection} from "@/lib/agentic/presentation/status-projection";

/** Encode the immutable documents before acquiring a publication fence. */
export function preparePlanRevisionRecord(record: PlanRevisionRecord): PlanRevisionRecord {
  const statusProjection=record.statusProjection ?? planStatusProjection(record.result);
  return Object.freeze({...record,statusProjection,storageJson:Object.freeze({
    request:JSON.stringify(record.requestSnapshot ?? null),result:JSON.stringify(record.result ?? null),projection:JSON.stringify(statusProjection)
  })});
}
