import { test, afterEach } from "node:test";
import { profiles } from "../ax-refinement/helpers.ts";
import { runPayloadJourney, cleanupPayloadJourney } from "./journey-case.ts";

afterEach(cleanupPayloadJourney);
const locale = "th";
for (const fixture of profiles) test(`PAY-AX-01 ${fixture.id} ${locale} documented clients preserve decisions and payment recovery with smaller whole journeys`, { timeout: 120000 }, async () => {
  await runPayloadJourney(locale, fixture);
});
