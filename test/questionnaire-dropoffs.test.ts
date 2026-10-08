import assert from "node:assert/strict";
import { it } from "node:test";
import { randomUUID } from "node:crypto";
import { buildQuestionnaireReport, QUESTIONNAIRE_INACTIVITY_MS, questionLabel, type QuestionnaireEventRow } from "../lib/questionnaire-dropoffs.ts";
import { emptyAdminDashboardFilters } from "../lib/admin-dashboard-filters.ts";
import { createInitialState, startQuestionnaire } from "../lib/questionnaire/engine.ts";
import { QuestionDisplayTracker, questionnaireAttemptContext, captureQuestionnaireContext } from "../lib/questionnaire/telemetry.ts";
import { metaEventForBpm } from "../lib/meta-event-policy.ts";

const base = Date.parse("2026-10-08T00:00:00Z");
function event(name: string, seconds = 0, override: Partial<QuestionnaireEventRow> = {}): QuestionnaireEventRow {
  return { id: randomUUID(), attemptKey: "attempt", eventName:name, occurredAt:new Date(base+seconds*1000).toISOString(),
    properties: {attemptId:"attempt",questionnaireVersion:"v6-conversational",turnKey:"firstName",displayId:"display"},
    inScope:true, journey:"web", pharmacy:"", source:"direct", ray:"visitor", planId:null, emailHash:null,
    locale:"en", campaign:null, path:"/en/nutrition/quiz", contactEmail:null, ...override };
}
function build(rows: QuestionnaireEventRow[], after = 1800) {
  return buildQuestionnaireReport({rows,range:"all",filters:emptyAdminDashboardFilters,generatedAt:new Date(base+after*1000).toISOString()});
}
it("counts first-question abandonment exactly at 30 minutes",()=>{
  const view=event("chat_question_viewed");
  assert.equal(QUESTIONNAIRE_INACTIVITY_MS,1800000);
  assert.equal(build([view],1799).attempts[0].bucket,"active");
  const report=build([view]);
  assert.equal(report.attempts[0].questionKey,"firstName");
  assert.deepEqual(report.report.groups[0].questions[0],{key:"firstName",version:"v6-conversational",order:0,reached:1,continued:0,inProgress:0,dropped:1,unknown:0});
});
it("real activity resets inactivity and a resumed display stays one reached attempt",()=>{
  const view=event("chat_question_viewed");
  assert.equal(build([view,event("chat_question_activity",1200)],2000).attempts[0].bucket,"active");
  const resumed=event("chat_question_viewed",1900,{properties:{...view.properties,displayId:"resumed"}});
  const result=build([view,resumed,event("chat_answer",1901,{properties:resumed.properties})],3701);
  assert.equal(result.report.groups[0].questions[0].reached,1);
  assert.equal(result.report.groups[0].questions[0].continued,1);
  assert.equal(result.attempts[0].bucket,"transition");
});
it("skips continue; unshown conditional questions never enter the denominator",()=>{
  const result=build([event("chat_question_viewed"),event("chat_skip",1),event("chat_complete",2)]);
  assert.equal(result.report.groups[0].questions.length,1);
  assert.equal(result.report.groups[0].questions[0].continued,1);
  assert.equal(result.report.groups[0].questions[0].dropped,0);
  assert.equal(result.attempts[0].bucket,"submission_pending");
});
it("completion outside campaign/date filters still closes a selected attempt",()=>{
  const result=build([event("chat_question_viewed"),event("assessment_captured",2,{inScope:false})]);
  assert.equal(result.attempts[0].bucket,"completed");
  assert.equal(result.report.groups[0].questions[0].dropped,0);
});
it("later questions outside the cohort do not erase earlier reached questions",()=>{
  const next=event("chat_question_viewed",2,{inScope:false,properties:{...event("").properties,turnKey:"goals",displayId:"goals"}});
  const result=build([event("chat_question_viewed"),event("chat_answer",1),next],1802);
  assert.equal(result.report.groups[0].questions[0].reached,1);
  assert.equal(result.report.groups[0].questions[0].continued,1);
  assert.equal(result.report.groups[0].questions.length,1);
  assert.equal(result.attempts.length,0);
});
it("does not confuse a submission failure or a transition with an unanswered question",()=>{
  assert.equal(build([event("chat_question_viewed"),event("chat_answer",1)]).attempts[0].bucket,"active");
  assert.equal(build([event("chat_question_viewed"),event("chat_answer",1)],1801).attempts[0].bucket,"transition");
  assert.equal(build([event("chat_question_viewed"),event("chat_complete",1),event("chat_capture_failed",2)]).attempts[0].bucket,"submission_failed");
  assert.equal(build([event("chat_complete",1),event("chat_capture_failed",2),event("assessment_captured",3)]).attempts[0].bucket,"completed");
});
it("duplicate and reordered deliveries do not inflate counts or reopen resolved displays",()=>{
  const view=event("chat_question_viewed",5,{properties:{...event("").properties,telemetryEventId:"view",clientAt:base}});
  const answer=event("chat_answer",2,{properties:{...view.properties,telemetryEventId:"answer",clientAt:base+1000}});
  const result=build([answer,view,{...view,id:randomUUID(),occurredAt:new Date(base+6000).toISOString()}],1801);
  assert.equal(result.report.groups[0].questions[0].reached,1);
  assert.equal(result.report.groups[0].questions[0].continued,1);
  assert.equal(result.attempts[0].bucket,"transition");
});
it("an edited question uses the latest display instead of its earlier answer",()=>{
  const view=event("chat_question_viewed");
  const reopened=event("chat_question_viewed",3,{properties:{...view.properties,displayId:"edited"}});
  const result=build([view,event("chat_answer",1),reopened],1803);
  assert.equal(result.attempts[0].bucket,"dropped");
  assert.equal(result.report.groups[0].questions[0].reached,1);
  assert.equal(result.report.groups[0].questions[0].continued,0);
});
it("post-completion reviews and future events cannot enter the acquisition breakdown",()=>{
  const view=event("chat_question_viewed",10,{properties:{...event("").properties,postCompletionReview:true}});
  assert.equal(build([view]).attempts.length,0);
  assert.equal(build([event("chat_question_viewed",2000)]).attempts.length,0);
});
it("historical and unsupported questions remain unknown without guessing the next question",()=>{
  const old=event("chat_answer",0,{attemptKey:"legacy:visitor",properties:{turnKey:"goals",questionnaireVersion:"v6-conversational"}});
  const result=build([old]);
  assert.equal(result.attempts[0].bucket,"unknown");
  assert.equal(result.attempts[0].lastAnsweredKey,"goals");
  assert.equal(result.report.groups[0].questions.length,0);
  const invalid=event("chat_question_viewed",1,{properties:{...event("").properties,turnKey:"not-a-question",displayId:"other"}});
  assert.equal(build([event("chat_question_viewed"),invalid],1801).attempts[0].bucket,"unknown");
});
it("keeps pharmacy sources separate and includes every attempt beyond 1000",()=>{
  const rows=Array.from({length:1210},(_,i)=>event("chat_question_viewed",0,{attemptKey:`attempt-${i}`}));
  rows.push(event("chat_question_viewed",0,{attemptKey:"pharmacy",journey:"retail",pharmacy:"shop",source:"in_store"}));
  const result=build(rows);
  assert.equal(result.attempts.length,1211);
  assert.equal(result.report.groups.find(g=>g.journey==="web")!.questions[0].dropped,1210);
  assert.equal(result.report.groups.find(g=>g.journey==="retail")!.questions[0].dropped,1);
});
it("question labels use versioned definitions and preserve Chinese's English fallback",()=>{
  assert.equal(questionLabel("firstName","v6-conversational","zh-CN")!.question,questionLabel("firstName","v6-conversational","en")!.question);
  assert.notEqual(questionLabel("firstName","v6-conversational","th")!.question,questionLabel("firstName","v6-conversational","en")!.question);
  assert.equal(questionLabel("firstName","missing","en"),null);
});
it("stable attempt and display identifiers survive resume while restart is independent of capture IDs",()=>{
  const state=startQuestionnaire(createInitialState({locale:"en",sessionId:"saved-session"})).state;
  assert.equal(questionnaireAttemptContext(state).attemptId,questionnaireAttemptContext({...state,phase:"resume_prompt"}).attemptId);
  assert.notEqual(questionnaireAttemptContext(state).attemptId,questionnaireAttemptContext({...state,startedAt:state.startedAt!+1}).attemptId);
  const tracker=new QuestionDisplayTracker();
  const shown=tracker.show(state,"firstName",0,false,base)!;
  assert.ok(shown.displayId);
  assert.equal(tracker.show(state,"firstName",0,false,base+1),null);
  assert.equal(tracker.activity(base+59_999),null);
  assert.ok(tracker.activity(base+60_000));
  assert.equal(tracker.activity(base+60_001),null);
  tracker.close();
  assert.notEqual(tracker.show(state,"firstName",0,false,base+60_002)!.displayId,shown.displayId);
  assert.equal("answers" in captureQuestionnaireContext(state),false);
});
it("question-level metadata has no Meta export mapping",()=>{
  for(const name of ["chat_question_viewed","chat_question_activity","chat_answer","chat_skip"]) assert.equal(metaEventForBpm(name),null);
});
