import { FIXTURE_SUPPLEMENTS, fixtureSnapshot } from "../../lib/agentic/catalogue/fixtures.ts";
import { ceilingsForSubjects } from "../../lib/agentic/catalogue/supplemental-ul-reference.ts";
import {
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache
} from "../../lib/agentic/catalogue/snapshot.ts";
import { resetQaPersistForTests } from "../../lib/agentic/qa/persist.ts";
import { resetInfoCache } from "../../lib/agentic/info.ts";
import {
  resetMatcherSafetyCeilings,
  setMatcherSafetyCeilings
} from "../../lib/matcher/safety-ceilings.ts";

export function installGoldCatalogue() {
  resetQaPersistForTests();
  replaceCatalogueSnapshot(fixtureSnapshot());
  setMatcherSafetyCeilings(
    ceilingsForSubjects(
      FIXTURE_SUPPLEMENTS.flatMap((item) => [
        { aliases: item.aliases, id: item.supplementId, name: item.name },
        { aliases: item.aliases, id: item.uuid, name: item.name }
      ])
    )
  );
  resetInfoCache();
}

export function uninstallGoldCatalogue() {
  replaceCatalogueSnapshot(null);
  resetCatalogueSnapshotCache();
  resetQaPersistForTests();
  resetMatcherSafetyCeilings();
  resetInfoCache();
}
