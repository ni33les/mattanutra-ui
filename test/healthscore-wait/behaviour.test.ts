import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {HEALTHSCORE_COPY_WAIT_MS, waitForHealthScoreCopy} from '../../lib/healthscore-copy-client.ts';
import {createInitialState, fastForwardQuestionnaire, startQuestionnaire, applyAnswer} from '../../lib/questionnaire/engine.ts';
import {toAssessmentAnswers} from '../../lib/questionnaire/normalize.ts';
import {computeHealthScore} from '../../lib/health-score.ts';

test('HS-WAIT-01 the HealthScore foreground window is five minutes without changing other funnel waits', () => {
  assert.equal(HEALTHSCORE_COPY_WAIT_MS,300_000);
});
for (const elapsed of [91_000,301_000]) test(`HS-WAIT-02 pending work still opens automatically after ${elapsed}ms`, async t => {
  let now=0,reads=0;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>{reads++;if(reads===1)now=elapsed;return Response.json({copyReady:true,readyForHealthScore:reads>1,copyFailed:false,healthScorePageFailed:false});});
  const result=await waitForHealthScoreCopy(`wait-${elapsed}`,'en',new AbortController().signal);
  assert.equal(result.status,'ready');assert.equal(reads,2);
});
test('HS-WAIT-03 cancellation and actual generation failures still terminate waiting', async t => {
  const controller=new AbortController();controller.abort();
  await assert.rejects(waitForHealthScoreCopy('cancelled','en',controller.signal),{name:'AbortError'});
  t.mock.method(globalThis,'fetch',async()=>Response.json({copyReady:false,copyFailed:true,healthScorePageFailed:true}));
  assert.equal((await waitForHealthScoreCopy('failed','en',new AbortController().signal)).status,'failed');
});
test('DEV-FILL-01 opt-in random filling varies valid answers and scores while deterministic fixtures stay unchanged', () => {
  for (const locale of ['en','th','zh-CN'] as const) {
    const scores=new Set<number>(),answers=new Set<string>();
    for(const value of [0,0.25,0.6,0.95]) {
      const filled=fastForwardQuestionnaire(createInitialState({locale,channel:'web'}),()=>value);
      assert.ok(filled.ok);assert.equal(filled.state.phase,'complete');
      answers.add(JSON.stringify(filled.state.answers));scores.add(computeHealthScore(toAssessmentAnswers(filled.state.answers),locale).score);
    }
    assert.ok(answers.size>=3);assert.ok(scores.size>=3);
  }
  const control=fastForwardQuestionnaire(createInitialState({locale:'en',channel:'web'}));assert.ok(control.ok);
  assert.equal(computeHealthScore(toAssessmentAnswers(control.state.answers),'en').score,38);
  assert.match(readFileSync('components/chat-questionnaire/chat-questionnaire.tsx','utf8'),/fastForwardQuestionnaire\(initial, Math\.random\)/);
});
test('DEV-FILL-02 random completion preserves already-entered answers', () => {
  const started=startQuestionnaire(createInitialState({locale:'en',channel:'web'}));
  const named=applyAnswer(started.state,'firstName','Morgan');assert.ok(named.ok);
  const filled=fastForwardQuestionnaire(named.state,()=>0.8);assert.ok(filled.ok);
  assert.equal(filled.state.answers.firstName,'Morgan');
});

test('DEV-FILL-03 random filling keeps the Thailand market in every locale', () => {
  for (const locale of ['en', 'th', 'zh-CN'] as const) {
    for (const value of [0, 0.15, 0.25, 0.6, 0.95]) {
      const filled = fastForwardQuestionnaire(createInitialState({ locale, channel: 'web' }), () => value);
      assert.ok(filled.ok);
      assert.equal(filled.state.phase, 'complete');
      assert.equal(filled.state.answers.country, 'Thailand');
      assert.equal(toAssessmentAnswers(filled.state.answers).country, 'Thailand');
    }
  }
});

test('DEV-FILL-04 random filling preserves an explicitly saved country', () => {
  const state = createInitialState({ locale: 'en', channel: 'web' });
  state.answers.country = 'Singapore';
  const filled = fastForwardQuestionnaire(state, () => 0);
  assert.ok(filled.ok);
  assert.equal(filled.state.answers.country, 'Singapore');
});
