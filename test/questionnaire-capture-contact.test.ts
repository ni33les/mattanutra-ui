import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncCapturedQuestionnaireContact } from "../lib/questionnaire/capture-contact.ts";
import { resolveChatDraft } from "../lib/questionnaire/browser-draft.ts";

const savedDraft = () => {
  const draft = resolveChatDraft({ locale: "en", sessionId: "saved-session", server: {
    answers: { firstName: "Maya", disclosure: true }, planId: "saved-plan", revision: 2, captured: true, contactEmail: "prior@fixture.test"
  } });
  return { ...draft, captured: { ...draft.captured!, contactEmail: "prior@fixture.test" } };
};

describe("saved questionnaire contact synchronization", () => {
  it("patches only contact and display locale, retaining the saved assessment receipt", async () => {
    const draft = { ...savedDraft(), contactEmail: "  Updated@fixture.test  " };
    let calls = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      calls++;
      assert.equal(url, "/api/assessment/saved-plan/contact");
      assert.equal(init?.method, "PATCH");
      assert.deepEqual(JSON.parse(String(init?.body)), { contactEmail: "updated@fixture.test", locale: "th" });
      return Response.json({ planId: "saved-plan", revision: 2, contactEmail: "updated@fixture.test" });
    };
    const synced = await syncCapturedQuestionnaireContact(draft, "th", fetchImpl);
    assert.equal(synced.contactEmail, "updated@fixture.test");
    assert.equal(synced.captured?.contactEmail, "updated@fixture.test");
    assert.equal(synced.captured?.revision, 2);
    assert.equal(synced.state, draft.state);
    assert.equal(synced.state.locale, "en");
    assert.equal(await syncCapturedQuestionnaireContact(synced, "zh-CN", fetchImpl), synced);
    assert.equal(calls, 1);
  });

  it("does not send unchanged or uncaptured contact requests", async () => {
    const fetchImpl: typeof fetch = async () => { assert.fail("No contact request expected"); };
    for (const draft of [savedDraft(), { ...savedDraft(), captured: null }]) {
      assert.equal(await syncCapturedQuestionnaireContact(draft, "en", fetchImpl), draft);
    }
  });

  it("retains the old receipt when contact saving fails, so retry saves contact without recapture", async () => {
    const draft = { ...savedDraft(), contactEmail: "updated@fixture.test" };
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return calls === 1 ? Response.json({ message: "Unavailable" }, { status: 503 })
        : Response.json({ planId: "saved-plan", revision: 2, contactEmail: "updated@fixture.test" });
    };
    await assert.rejects(syncCapturedQuestionnaireContact(draft, "en", fetchImpl), /Could not save/);
    assert.equal(draft.captured?.contactEmail, "prior@fixture.test");
    const retried = await syncCapturedQuestionnaireContact(draft, "en", fetchImpl);
    assert.equal(retried.captured?.planId, "saved-plan");
    assert.equal(retried.captured?.revision, 2);
    assert.equal(calls, 2);
  });

  it("rejects missing and invalid contact before reusing a saved receipt", async () => {
    for (const contactEmail of [null, "", " ", "not an email"]) {
      const draft = { ...savedDraft(), contactEmail };
      await assert.rejects(syncCapturedQuestionnaireContact(draft, "en", async () => { assert.fail("Invalid contact must stay local"); }), /valid email/);
    }
  });

  it("migrates a legacy receipt by synchronizing contact once", async () => {
    const draft = { ...savedDraft(), captured: { planId: "saved-plan", revision: 2 } };
    const updated = await syncCapturedQuestionnaireContact(draft, "en", async () => Response.json({
      planId: "saved-plan", revision: 2, contactEmail: "prior@fixture.test"
    }));
    assert.equal(updated.captured?.contactEmail, "prior@fixture.test");
  });

  it("requests a saved link once for an unchanged server-prefilled email without assuming an old plan already sent it", async () => {
    const draft = resolveChatDraft({ locale: "en", sessionId: "older-plan-session", server: {
      answers: { firstName: "Maya", disclosure: true }, planId: "saved-plan", revision: 2, captured: true, contactEmail: "prior@fixture.test"
    } });
    let calls = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
      calls++;
      assert.equal(url, "/api/assessment/saved-plan/contact");
      assert.deepEqual(JSON.parse(String(init?.body)), { contactEmail: "prior@fixture.test", locale: "th" });
      return Response.json({ planId: "saved-plan", revision: 2, contactEmail: "prior@fixture.test" });
    };
    const updated = await syncCapturedQuestionnaireContact(draft, "th", fetchImpl);
    const reloaded = resolveChatDraft({ locale: "zh-CN", sessionId: "older-plan-session", local: updated });
    assert.equal(await syncCapturedQuestionnaireContact(reloaded, "zh-CN", fetchImpl), reloaded);
    assert.equal(calls, 1);
    assert.equal(reloaded.captured?.revision, 2);
  });
});
