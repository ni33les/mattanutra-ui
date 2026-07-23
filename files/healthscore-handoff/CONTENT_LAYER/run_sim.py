import random, statistics as st
from engine import score, _ageband, VO2_GOOD

def base(**k):
    d=dict(sex='male',age='36-45',reproStatus='none',menopause='', flow='',
      goals=['energy'],symptoms=[], sleepHrs='7-8',energy='ok',activity='moderate',stress='moderate',
      digestion='none',digCondition='none',smoking='never',alcohol='1-3',caffeine='2-3',
      diet='balanced',f_fish='rare',f_fruitveg='1-2',f_legumes='1-2',f_eggs='1-2',
      allergies=['none'],meds='no',medTypes=[],suppAllergies=['none'],kidney='normal',liver='normal',
      surgery='no',antibiotics='no',supplements='none',budget='1000-2500',maxPills='4-6',form='mixed',
      country='Thailand',sun='15-30',sunscreen='sometimes',protein=None,
      lab_vitd=0,lab_b12=0,lab_ferritin=0,lab_hba1c=0,lab_o3=0,lab_homo=0,vo2=0,hrv=0)
    d.update(k); return d

PERSONAS=[
 ("Statin user, tired (Reveal user)", base(age='46-55',goals=['energy','heart','sleep'],
    symptoms=['fatigue','poor sleep' if False else 'sleep','brainfog'],energy='low',sleepHrs='6-7',
    stress='high',activity='light',diet='balanced',f_fish='rare',meds='yes',medTypes=['statin'],
    supplements='basic',country='Thailand',sunscreen='daily',sun='15-30')),
 ("Stressed founder, no labs", base(age='36-45',goals=['focus','sleep','mood'],
    symptoms=['stress','fatigue','brainfog','sleep'],energy='low',sleepHrs='5-6',stress='extreme',
    activity='light',diet='balanced',caffeine='4+',alcohol='4-7')),
 ("Vegan endurance athlete", base(sex='female',age='26-35',goals=['fitness','longevity','energy'],
    symptoms=['fatigue'],energy='good',sleepHrs='7-8',stress='low',activity='athlete',diet='vegan',
    f_fish='never',f_fruitveg='3+',f_legumes='3+',protein='1.5-2',vo2=46,hrv=72)),
 ("Post-menopausal walker", base(sex='female',age='56-65',menopause='post',flow='none',
    goals=['joints','heart','longevity'],symptoms=['joint','sleep'],energy='ok',sleepHrs='6-7',
    stress='low',activity='light',diet='mediterranean',f_fish='once',f_fruitveg='3+')),
 ('"I feel great" optimiser, no labs', base(age='26-35',goals=['longevity','fitness','immunity'],
    symptoms=['great'],energy='excellent',sleepHrs='7-8',stress='low',activity='active',diet='whole',
    f_fish='often',f_fruitveg='3+',smoking='never',alcohol='none')),
 ("Fully documented optimiser (labs+wearable)", base(age='36-45',goals=['longevity','fitness'],
    symptoms=['great'],energy='excellent',sleepHrs='7-8',stress='verylow',activity='active',diet='whole',
    f_fish='often',f_fruitveg='3+',alcohol='none',protein='1.5-2',vo2=44,hrv=78,
    lab_vitd=60,lab_b12=600,lab_ferritin=90,lab_hba1c=5.2,lab_o3=9,lab_homo=7)),
 ("Sedentary processed-diet smoker", base(age='46-55',goals=['energy','weight','heart'],
    symptoms=['fatigue','brainfog','digestion','low mood' if False else 'mood','sleep'],
    energy='drained',sleepHrs='5-6',stress='high',activity='sitting',diet='processed',f_fish='never',
    f_fruitveg='rare',smoking='daily',alcohol='8+',caffeine='4+',digestion='bloating')),
 ("PPI + metformin, average", base(age='56-65',goals=['energy','immunity','longevity'],
    symptoms=['fatigue','digestion'],energy='low',sleepHrs='6-7',stress='moderate',activity='light',
    diet='balanced',meds='yes',medTypes=['ppi','metformin'],supplements='basic')),
 ("Healthy mum, mild symptoms", base(sex='female',age='36-45',reproStatus='none',goals=['energy','skin','mood'],
    symptoms=['fatigue','skin'],energy='ok',sleepHrs='6-7',stress='moderate',activity='moderate',
    diet='whole',f_fish='once',f_fruitveg='3+')),
 ("Young gym-goer, decent diet", base(age='18-25',goals=['fitness','focus'],symptoms=['stress'],
    energy='good',sleepHrs='7-8',stress='moderate',activity='active',diet='balanced',f_fish='once',
    protein='1.5-2',vo2=50)),
 ("Pregnant, cautious", base(sex='female',age='26-35',reproStatus='pregnant',goals=['energy','immunity'],
    symptoms=['fatigue'],energy='low',sleepHrs='7-8',stress='moderate',activity='light',diet='whole',
    f_fish='rare',f_fruitveg='3+')),
 ("Average everything (median test)", base()),
]

if __name__ == "__main__":
    print("="*92)
    print(f"{'PERSONA':42} {'SCORE':>5} {'BAND':24} {'raw':>5} {'mult':>4} {'sym':>3}  flags")
    print("="*92)
    for name,a in PERSONAS:
        r=score(a)
        print(f"{name:42} {r['final']:>5} {r['band']:24} {r['raw']:>5} {r['mult']:>4} {r['nsym']:>3}  {len(r['flags'])}")

    # -------- Monte Carlo over realistic answer space --------
    CH=dict(
     sex=['male','female'], age=['18-25','26-35','36-45','46-55','56-65','66+'],
     sleepHrs=['u5','5-6','6-7','7-8','8-9','9+'], energy=['drained','low','ok','good','excellent'],
     activity=['sitting','light','moderate','active','athlete'],
     stress=['verylow','low','moderate','high','extreme'],
     digestion=['none','bloating','constipation','loose'],
     smoking=['never','ex5+','ex5','occasional','daily'], alcohol=['none','1-3','4-7','8+'],
     caffeine=['none','1','2-3','4+'],
     diet=['processed','balanced','whole','mediterranean','plant','vegan','carnivore'],
     f_fish=['never','rare','once','often'], f_fruitveg=['never','1-2','3+'], f_legumes=['never','1-2','3+'],
     f_eggs=['never','1-2','3+'], sun=['u15','15-30','30-60','60+'], sunscreen=['rarely','sometimes','daily'])
    GOALS=list(__import__('engine').GOAL_MAP.keys())
    SYMS=['fatigue','brainfog','mood','joint','digestion','sleep','stress','skin','hair','libido','colds']

    # realistic answer weights (most people cluster mid; few extremes)
    W=dict(  # health-engaged quiz-finisher population (skews health-curious, not gen-pop)
     sex=[1,1.4], age=[3,6,6,4,3,2],
     sleepHrs=[1,3,6,8,3,1], energy=[1,3,6,6,2], activity=[2,5,8,5,2],
     stress=[2,5,7,4,2], digestion=[7,3,2,1], smoking=[14,3,2,1,1],
     alcohol=[4,7,2,1], caffeine=[2,5,6,1],
     diet=[1,7,5,3,2,1,1], f_fish=[1,4,5,2], f_fruitveg=[1,4,6], f_legumes=[2,5,4],
     f_eggs=[2,5,3], sun=[2,5,5,2], sunscreen=[2,4,4])
    def rand_profile(r):
        a=base()
        for k,v in CH.items(): a[k]=r.choices(v,weights=W[k])[0]
        a['goals']=r.sample(GOALS,k=r.randint(1,3))
        nsym=r.choices([0,1,2,3,4,5],weights=[3,5,5,4,2,1])[0]
        if r.random()<0.10 and nsym<=1: a['symptoms']=['great']
        else: a['symptoms']=r.sample(SYMS,k=nsym)
        # ~22% enter at least some objective data
        if r.random()<0.22:
            if r.random()<0.8: a['lab_vitd']=r.choice([18,25,32,45,60,72])
            if r.random()<0.5: a['lab_hba1c']=round(r.uniform(5.0,6.2),1)
            if r.random()<0.4: a['lab_o3']=round(r.uniform(3,10),1)
            if r.random()<0.4: a['vo2']=r.randint(28,55)
            if r.random()<0.3: a['hrv']=r.randint(30,90)
            if r.random()<0.5: a['protein']=r.choice(['u1','1-1.5','1.5-2','2+'])
        return a

    r=random.Random(42)
    N=8000
    scores=[score(rand_profile(r))['final'] for _ in range(N)]
    scores.sort()
    def pct(p): return scores[int(p/100*N)]
    print("\n"+"="*60)
    print(f"MONTE CARLO DISTRIBUTION  (N={N})")
    print("="*60)
    print(f"min {scores[0]}  p10 {pct(10)}  p25 {pct(25)}  median {pct(50)}  "
          f"mean {round(st.mean(scores),1)}  p75 {pct(75)}  p90 {pct(90)}  max {scores[-1]}")
    bins=[(0,46),(46,58),(58,70),(70,82),(82,93)]
    labels=['Needs attention <46','Building 46-57','Good 58-69','Strong 70-81','Excellent 82+']
    print("\nBand spread:")
    for (lo,hi),lab in zip(bins,labels):
        c=sum(1 for s in scores if lo<=s<hi)
        print(f"  {lab:24} {c/N*100:5.1f}%  {'█'*int(c/N*50)}")
    print(f"\n% scoring 85+ : {sum(1 for s in scores if s>=85)/N*100:.1f}%  (target: very low without labs)")
    print(f"% in 'itchy' 55-74 zone : {sum(1 for s in scores if 55<=s<=74)/N*100:.1f}%")
