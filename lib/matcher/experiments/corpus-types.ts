import type { CanonicalRequest, CatalogSnapshot } from "../types.ts";
import type { ExperimentOracleFixture } from "./oracle.ts";

export type ExperimentCase = Readonly<{
  id: string;
  kind: "catalogue" | "synthetic";
  request: CanonicalRequest;
  catalog: CatalogSnapshot;
  provenance: Record<string, unknown>;
  oracleFixture?: ExperimentOracleFixture;
}>;
