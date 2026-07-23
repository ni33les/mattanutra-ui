# -*- coding: utf-8 -*-
"""
MattaNutra HealthScore — CONTENT BUILDER (salience ruleset)
===========================================================
Deterministic. Takes the engine result + normalized answers and produces an
ordered, page-ready content package. No AI here, no randomness: the same inputs
always yield the same package, and every selection is traceable to an answer.

PIPELINE POSITION:  engine.score()  ->  build_page_content()  ->  AI polish (Stage 6)  ->  HTML template

Public entry point:
    build_page_content(answers, result, percentile, median=60, chosen_nutrients=8)
        answers  : normalized questionnaire dict (engine input contract)
        result   : dict returned by engine.score(answers)
        percentile: int 0-100 from the score->percentile lookup
        median   : int, population median score (default 60)
        chosen_nutrients: int from the formula engine (defaults to 8 if unknown)
    returns: dict (JSON-serializable) consumed by the AI step and the template.

The output deliberately separates LOCKED facts (numbers the AI must not change)
from COPY (sentences the AI may re-phrase but not contradict).
"""
import healthscore_library as L

LOW, HIGH = 45, 70          # pillar band thresholds (percent)
GOAL_PILLARS = {            # which goals link to which pillars (mirrors engine.GOAL_MAP, inverted)
    'Sleep & Recovery':   ['energy','sleep','focus','hormones'],
    'Activity & Fitness': ['energy','longevity','fitness','weight','heart','joints'],
    'Nutrition & Diet':   ['longevity','immunity','weight','heart','skin'],
    'Stress & Balance':   ['focus','mood','hormones'],
    'Health Habits':      ['immunity'],
}

def _fmt(tpl, ctx):
    """Safe format: leaves unknown placeholders untouched rather than crashing."""
    class _D(dict):
        def __missing__(self, k): return '{'+k+'}'
    return tpl.format_map(_D(ctx))

def _oxford(items):
    items = [i for i in items if i]
    if not items: return ''
    if len(items) == 1: return items[0]
    if len(items) == 2: return items[0]+' and '+items[1]
    return ', '.join(items[:-1])+', and '+items[-1]

# ---------------------------------------------------------------------------
def _goal_mirror(goals):
    phrases = [L.GOAL_PHRASE.get(g, g) for g in goals[:3]]
    return 'You came here for ' + _oxford(phrases) + '.'

def _pillar_band(pct):
    v = pct*100
    return 'low' if v < LOW else ('mid' if v < HIGH else 'high')

def _goals_for_pillar(name, goals):
    return [g for g in goals if g in GOAL_PILLARS.get(name, [])]

# ---------------------------------------------------------------------------
def _build_findings(answers, result):
    """Assemble the findings pool from flags + goal-pattern insights, then
    rank by tier and return the top 3 (always keeping >=1 safety flag if any fired)."""
    pool = []
    goals = answers.get('goals', [])[:3]
    syms  = [s for s in answers.get('symptoms', []) if s != 'great']

    # (a) safety-flag findings, straight from the engine's stable codes
    for code in result.get('flag_codes', []):
        f = L.FINDINGS.get(code)
        if f: pool.append((f['tier'], code, dict(f)))

    # (b) goal-pattern insights (derived, deterministic)
    low_energy = answers.get('energy') in ('low','drained') or 'fatigue' in syms
    if 'energy' in goals and low_energy:
        causes = []
        if answers.get('stress') in ('high','extreme'): causes.append('stress')
        if answers.get('sleepHrs') in ('u5','5-6'):     causes.append('sleep')
        if answers.get('activity') in ('sitting','light'): causes.append('activity')
        if causes:
            f = dict(L.FINDINGS['ENERGY_UPSTREAM'])
            f['body'] = _fmt(f['body'], {'energy_causes': _oxford([L.ENERGY_CAUSE[c] for c in causes])})
            pool.append((f['tier'], 'ENERGY_UPSTREAM', f))
    if 'sleep' in goals and answers.get('sleepHrs') in ('u5','5-6','6-7'):
        pool.append((L.FINDINGS['SLEEP_UPSTREAM']['tier'], 'SLEEP_UPSTREAM', dict(L.FINDINGS['SLEEP_UPSTREAM'])))
    if 'weight' in goals:
        pool.append((L.FINDINGS['WEIGHT_PATTERN']['tier'], 'WEIGHT_PATTERN', dict(L.FINDINGS['WEIGHT_PATTERN'])))

    # de-duplicate by code, keep first (lowest tier wins via sort below)
    seen=set(); uniq=[]
    for tier, code, f in sorted(pool, key=lambda x: x[0]):
        if code in seen: continue
        seen.add(code); uniq.append((tier, code, f))

    chosen = uniq[:3]
    # A tier-1 medication-INTERACTION flag is the strongest "we caught something"
    # lead. Safety-routing flags (pregnancy/kidney/liver, tier 4) are included but
    # do NOT outrank a personal goal insight, so they are not forced to lead.
    t1 = [c for c in result.get('flag_codes', []) if L.FINDINGS.get(c, {}).get('tier') == 1]
    if t1 and not (chosen and chosen[0][1] in t1):
        lead = sorted(t1, key=lambda c: L.FINDINGS[c]['tier'])[0]
        rest = [x for x in chosen if x[1] != lead][:2]
        chosen = [(1, lead, dict(L.FINDINGS[lead]))] + rest

    findings = [{'code':c, 'icon':f['icon'], 'headline':f['headline'], 'body':f['body']}
                for _,c,f in chosen]
    return findings

def _build_strength_findings(pillars):
    """Fallback for high scorers with no gaps/flags: turn the section into
    'what is working', built from their two strongest pillars."""
    out=[]
    for r in sorted(pillars, key=lambda r:-r['value'])[:2]:
        note=L.PILLAR_STRENGTH.get(r['name'],'')
        if note:
            out.append({'code':'STRENGTH_'+r['name'].split()[0].upper(),'icon':'\u2713',
                        'headline':r['label']+' is doing the heavy lifting.',
                        'body':_fmt(note,{'value':r['value']})})
    return out

# ---------------------------------------------------------------------------
def _build_pillars(result, goals):
    """Pillar rows in display order (high->low), with goal-linked tags."""
    rows=[]
    for p in result['pillars']:
        name=p['name']; val=round(p['pct']*100)
        linked=_goals_for_pillar(name, goals)
        tag=None
        if linked:
            tag = ('all '+str(len(linked))+' goals') if len(linked)>=3 else (' / '.join(L.GOAL_TAG[g] for g in linked))
        rows.append({'name':name,'label':L.PILLAR_LABEL[name],'value':val,
                     'band':_pillar_band(p['pct']),'goal_linked':bool(linked),
                     'linked_goals':linked,'tag':tag})
    rows.sort(key=lambda r:-r['value'])
    return rows

def _highest_leverage(pillars, goals):
    """Lowest-scoring GOAL-LINKED pillar = the highest-return move."""
    cands=[r for r in pillars if r['goal_linked']]
    if not cands: return None
    hero=min(cands, key=lambda r:r['value'])
    if hero['value'] >= HIGH: return None         # no real leverage gap
    goal_list=_oxford([L.GOAL_PHRASE.get(g,g) for g in goals[:3]])
    return {'pillar':hero['label'],'value':hero['value'],
            'text':_fmt(L.LEVER_BOX,{'pillar':hero['label'],'value':hero['value'],'goal_list':goal_list})}

def _strength_note(pillars):
    for r in pillars:
        if r['value']>=80 and not r['goal_linked']:
            return _fmt(L.PILLAR_STRENGTH.get(r['name'],''),{'value':r['value']})
    top=pillars[0]
    if top['value']>=80:
        return _fmt(L.PILLAR_STRENGTH.get(top['name'],''),{'value':top['value']})
    return None

# ---------------------------------------------------------------------------
def _build_gap_trio(result, pillars, answers, above_median):
    """The three things making up the gap: weakest pillars + symptom drag."""
    syms=[s for s in answers.get('symptoms',[]) if s!='great']
    weak=sorted([r for r in pillars], key=lambda r:r['value'])      # low first
    cards=[]
    # card 1: lowest pillar
    p1=weak[0]
    cards.append(_gap_pillar_card(p1, '01'))
    # card 2: lowest GOAL-LINKED pillar if different from p1, else 2nd lowest
    linked_low=[r for r in weak if r['goal_linked']]
    p2 = next((r for r in linked_low if r['name']!=p1['name']), None) or weak[1]
    cards.append(_gap_pillar_card(p2, '02'))
    # card 3: symptoms if >=2 reported, else next pillar
    used={p1['name'],p2['name']}
    if len(syms)>=2:
        names=_oxford([L.SYMPTOM_NAME.get(s,s) for s in syms[:3]])
        cards.append({'tag':'GAP 03 · HOW YOU FEEL','value':str(len(syms)),
            'headline':'The symptoms dragging on everything',
            'body':_fmt('{caps} pull down your whole score at once \u2014 and they are the '
                        'felt signals your plan is built to address first.',
                        {'caps':names[0].upper()+names[1:]})})
    else:
        p3=next((r for r in weak if r['name'] not in used), weak[-1])
        cards.append(_gap_pillar_card(p3, '03'))
    return cards

def _gap_pillar_card(p, n):
    g=L.PILLAR_GAP[p['name']]
    return {'tag':'GAP '+n+' · '+p['label'].upper(),'value':str(p['value'])+'%',
            'headline':g['headline'],'body':g['body']}

# ---------------------------------------------------------------------------
def _build_relativity(score, percentile, median):
    above = score >= median
    if above:
        return {'mode':'rank','headline':_fmt(L.RELATIVITY['rank'],{'pct':percentile}),
                'sub':L.RELATIVITY['rank_sub'],'spectrum_you':score,'spectrum_median':median}
    gap=median-score
    return {'mode':'gap','gap':gap,
            'headline':_fmt(L.RELATIVITY['gap'],{'median':median,'gap':gap}),
            'sub':_fmt(L.RELATIVITY['gap_sub'],{'gap':gap}),
            'spectrum_you':score,'spectrum_median':median}

# ===========================================================================
def build_page_content(answers, result, percentile, median=60, chosen_nutrients=8):
    goals=answers.get('goals',[])[:3]
    pillars=_build_pillars(result, goals)
    above=result['final']>=median

    locked = {                          # the AI MUST NOT alter these
        'score':result['final'], 'band':result['band'],
        'percentile':percentile, 'median':median,
        'pillars':[{'label':r['label'],'value':r['value'],'goal_linked':r['goal_linked'],'tag':r['tag']} for r in pillars],
        'flag_codes':result.get('flag_codes',[]),
        'nutrients_chosen':chosen_nutrients, 'nutrients_evaluated':120,
    }
    findings=_build_findings(answers, result)
    findings_mode='caught'
    if not findings:
        findings=_build_strength_findings(pillars); findings_mode='strengths'
    copy = {                            # sentences the AI may polish, not contradict
        'goal_mirror':_goal_mirror(goals),
        'band_line':_fmt(L.BAND_LINE.get(result['band'],''),{'score':result['final']}),
        'relativity':_build_relativity(result['final'], percentile, median),
        'gap_trio':_build_gap_trio(result, pillars, answers, above),
        'highest_leverage':_highest_leverage(pillars, goals),
        'strength_note':_strength_note(pillars),
        'findings':findings, 'findings_mode':findings_mode,
        'subtraction':{'evaluated':120,'set_aside':120-chosen_nutrients,'chosen':chosen_nutrients},
    }
    return {'locked':locked, 'copy':copy,
            'meta':{'engine_score':result['final'],'finding_count':len(copy['findings']),
                    'relativity_mode':copy['relativity']['mode']}}
