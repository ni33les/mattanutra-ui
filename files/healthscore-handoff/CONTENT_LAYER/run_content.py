# -*- coding: utf-8 -*-
"""Validate the library+ruleset across diverse profiles and emit example JSON."""
import json
from engine import score
from healthscore_content import build_page_content
import healthscore_library as L
import run_sim   # reuse the persona definitions + base()
pct = json.load(open('pctile.json'))

def P(**k): return run_sim.base(**k)

PROFILES = {
 'Profile 1 — Singapore statin male (47)': P(age='36-45',country='Singapore',
    goals=['energy','heart','fitness'],symptoms=['fatigue','digestion','sleep'],
    energy='low',sleepHrs='6-7',activity='light',stress='high',digestion='bloating',
    diet='balanced',f_fish='rare',meds='yes',medTypes=['statin'],sunscreen='daily',sun='15-30',supplements='basic'),
 'Vegan endurance athlete (76, above median)': P(sex='female',age='26-35',
    goals=['fitness','longevity','energy'],symptoms=['fatigue'],energy='good',sleepHrs='7-8',
    stress='low',activity='athlete',diet='vegan',f_fish='never',f_fruitveg='3+',f_legumes='3+',
    protein='1.5-2',vo2=46,hrv=72),
 'Stressed founder, no flags (38)': P(age='36-45',goals=['focus','sleep','mood'],
    symptoms=['stress','fatigue','brainfog','sleep'],energy='low',sleepHrs='5-6',stress='extreme',
    activity='light',diet='balanced',caffeine='4+',alcohol='4-7'),
 'PPI + metformin, average (56)': P(age='56-65',goals=['energy','immunity','longevity'],
    symptoms=['fatigue','digestion'],energy='low',sleepHrs='6-7',stress='moderate',activity='light',
    diet='balanced',meds='yes',medTypes=['ppi','metformin'],supplements='basic'),
 '"Feeling great" optimiser (79, above median)': P(age='26-35',goals=['longevity','fitness','immunity'],
    symptoms=['great'],energy='excellent',sleepHrs='7-8',stress='low',activity='active',diet='whole',
    f_fish='often',f_fruitveg='3+',smoking='never',alcohol='none'),
 'Pregnant, cautious (60)': P(sex='female',age='26-35',reproStatus='pregnant',goals=['energy','immunity'],
    symptoms=['fatigue'],energy='low',sleepHrs='7-8',stress='moderate',activity='light',diet='whole',
    f_fish='rare',f_fruitveg='3+'),
}

def check_forbidden(pkg):
    """Assert no banned (bloodwork/cap/locked) substring appears in any COPY string."""
    hits=[]
    def walk(o, path=''):
        if isinstance(o,str):
            low=o.lower()
            for bad in L.FORBIDDEN:
                if bad in low: hits.append((path,bad,o[:60]))
        elif isinstance(o,dict):
            for k,v in o.items(): walk(v,path+'.'+k)
        elif isinstance(o,list):
            for i,v in enumerate(o): walk(v,path+'['+str(i)+']')
    walk(pkg['copy'])
    return hits

print("="*94)
all_ok=True
example=None
for name,ans in PROFILES.items():
    r=score(ans)
    pkg=build_page_content(ans, r, pct[str(r['final'])])
    if example is None: example=(name,pkg)
    # validations
    nf=len(pkg['copy']['findings'])
    t1=[c for c in r['flag_codes'] if L.FINDINGS.get(c,{}).get('tier')==1]
    lead = pkg['copy']['findings'][0]['code'] if pkg['copy']['findings'] else '—'
    lead_ok = (not t1) or (lead in t1)
    nonempty_ok = nf>=1            # every profile yields at least 1 (caught or strengths)
    num_ok = pkg['locked']['score']==r['final']
    forb = check_forbidden(pkg)
    ok = nf<=3 and lead_ok and num_ok and nonempty_ok and not forb
    all_ok &= ok
    print(f"{name:46} score {r['final']:>3} | {pkg['copy']['findings_mode']:9} {nf} | rel:{pkg['copy']['relativity']['mode']:>4} "
          f"| lead:{lead:16} | {'OK' if ok else 'FAIL'}")
    if forb: print("    !! forbidden term:",forb)
    if not num_ok: print("    !! number mismatch")
    if not lead_ok: print("    !! safety flag did not lead")
print("="*94)
print("ALL PROFILES PASS" if all_ok else "FAILURES ABOVE")

# emit one full example package
name,pkg=example
json.dump(pkg, open('example_profile1_content.json','w'), indent=2, ensure_ascii=False)
print("\nExample package written: example_profile1_content.json  ("+name+")")
print("\n--- COPY block preview (Profile 1) ---")
c=pkg['copy']
print("goal_mirror :", c['goal_mirror'])
print("band_line   :", c['band_line'][:90],"...")
print("relativity  :", c['relativity']['headline'])
print("gap_trio    :", [g['tag'] for g in c['gap_trio']])
print("leverage    :", (c['highest_leverage']['pillar'] if c['highest_leverage'] else None))
print("strength    :", (c['strength_note'][:70]+'...') if c['strength_note'] else None)
print("findings    :", [f['code'] for f in c['findings']])
print("subtraction :", c['subtraction'])
