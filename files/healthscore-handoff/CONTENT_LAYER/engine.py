"""
MattaNutra HealthScore — layered reference engine.
Maps 1:1 to questionnaire field keys (data-single / data-multi / numeric ids).
Layers: 1) self-report pillars (max 75)  2) verification unlock (max 25)
        3) symptom multiplier  4) goal weighting (redistribution)  5) safety flags (narrative only)
Final = clamp( round( (pillars_goal_weighted + verification) * symptom_mult ), 30, 92 )
"""

# ---- VO2max good-band thresholds (age/sex). 'good' lower bound from Reference sheet ----
VO2_GOOD = {
    ('male','u30'):45, ('male','30s'):42, ('male','40s'):39, ('male','50s'):35, ('male','60+'):32,
    ('female','u30'):38,('female','30s'):36,('female','40s'):32,('female','50s'):29,('female','60+'):26,
}
def _ageband(age):
    return {'18-25':'u30','26-35':'30s','36-45':'40s','46-55':'50s','56-65':'60+','66+':'60+'}[age]

# ============================ LAYER 1: SELF-REPORT PILLARS (max 75) ============================
# Each pillar returns (earned, maxpts, [(line,pts,max)])
def pillar_sleep(a):                       # max 15
    rows=[]
    sh={'7-8':9,'8-9':8,'6-7':8,'9+':7,'5-6':5,'u5':2}.get(a['sleepHrs'],5)
    rows.append(('Sleep duration',sh,9))
    en={'excellent':6,'good':5,'ok':4,'low':2,'drained':0}.get(a['energy'],4)
    rows.append(('Daytime energy (recovery proxy)',en,6))
    return sum(p for _,p,_ in rows),15,rows

def pillar_activity(a):                     # max 14
    lvl={'athlete':14,'active':12,'moderate':9,'light':6,'sitting':2}.get(a['activity'],6)
    return lvl,14,[('Activity level',lvl,14)]

def pillar_nutrition(a):                    # max 18
    rows=[]
    diet={'whole':8,'mediterranean':8,'plant':7,'vegan':6,'balanced':6,'carnivore':4,'processed':2}.get(a['diet'],5)
    rows.append(('Diet pattern',diet,8))
    fish={'often':5,'once':4,'rare':3,'never':1}.get(a.get('f_fish'),3)
    rows.append(('Oily fish frequency',fish,5))
    fv={'most':3,'3+':3,'weekly':2,'1-2':2,'rare':1,'notdaily':1,'never':0}.get(a.get('f_fruitveg'),2)
    rows.append(('Fruit & vegetables',fv,3))
    leg={'most':1,'3+':1,'weekly':1,'1-2':1}.get(a.get('f_legumes'),0)
    egg={'most':1,'3+':1}.get(a.get('f_eggs'),0); leg=min(leg+egg,2)
    rows.append(('Legumes / eggs variety',leg,2))
    return sum(p for _,p,_ in rows),18,rows

def pillar_stress(a):                       # max 13
    s={'verylow':13,'low':11,'moderate':9,'high':5,'extreme':2}.get(a['stress'],9)
    return s,13,[('Stress level',s,13)]

def pillar_habits(a):                       # max 15
    rows=[]
    sm={'never':7,'ex5+':6,'ex5':5,'occasional':3,'daily':0}.get(a['smoking'],5)
    rows.append(('Smoking status',sm,7))
    al={'none':3,'1-3':3,'4-7':2,'8+':0}.get(a['alcohol'],2)
    rows.append(('Alcohol / week',al,3))
    cf={'none':2,'1':2,'2-3':2,'4+':1}.get(a['caffeine'],2)
    rows.append(('Caffeine load',cf,2))
    # sun behaviour relevant to vit D: moderate sun + not-daily sunscreen is ideal
    sun_ok = a['sun'] in ('30-60','60+') and a['sunscreen']!='daily'
    sb = 2 if sun_ok else 1
    rows.append(('Sun-exposure behaviour',sb,2))
    dg={'none':1}.get(a['digestion'],0.5)
    rows.append(('Digestive comfort',dg,1))
    return sum(p for _,p,_ in rows),15,rows

PILLARS=[('Sleep & Recovery',pillar_sleep),('Activity & Fitness',pillar_activity),
         ('Nutrition & Diet',pillar_nutrition),('Stress & Balance',pillar_stress),
         ('Health Habits',pillar_habits)]

# ============================ LAYER 2: VERIFICATION UNLOCK (max 25) ============================
def verification(a):                        # earned only from objective data
    rows=[]; 
    def lab(name,val,full,opt_lo,opt_hi=None,good_lo=None):
        if not val: rows.append((name+' (not tested)',0,full)); return 0
        if opt_hi is None: ok = val<=opt_lo
        else: ok = opt_lo<=val<=opt_hi
        if ok: p=full
        elif good_lo is not None and val>=good_lo: p=round(full*0.35,1)
        else: p=round(full*0.25,1)
        rows.append((name+' (measured)',p,full)); return p
    t=0
    t+=lab('Vitamin D', a.get('lab_vitd',0), 4, 50,80, good_lo=30)
    t+=lab('Vitamin B12',a.get('lab_b12',0), 2, 400,900, good_lo=300)
    t+=lab('Ferritin',  a.get('lab_ferritin',0),2,50,150, good_lo=30)
    t+=lab('HbA1c',     a.get('lab_hba1c',0),  4, 5.4, good_lo=5.7)  # lower better
    t+=lab('Omega-3 Index',a.get('lab_o3',0), 3, 8,12, good_lo=5)
    t+=lab('Homocysteine',a.get('lab_homo',0),2, 8, good_lo=12)      # lower better
    # VO2max
    vo2=a.get('vo2',0)
    if vo2:
        gl=VO2_GOOD[(a['sex'],_ageband(a['age']))]
        v = 5 if vo2>=gl else (3 if vo2>=gl*0.88 else 1.5)
        rows.append(('VO\u2082max (measured)',v,5))
    else: v=0; rows.append(('VO\u2082max (not measured)',0,5))
    t+=v
    # HRV
    hrv=a.get('hrv',0)
    if hrv:
        h = 2 if hrv>=70 else (1 if hrv>=50 else 0.5); rows.append(('HRV (measured)',h,2))
    else: h=0; rows.append(('HRV (not measured)',0,2))
    t+=h
    # protein
    pr={'2+':3,'1.5-2':3,'1-1.5':1.5}.get(a.get('protein'),0)
    rows.append(('Protein adequacy',pr,3) if a.get('protein') else ('Protein (not provided)',0,3))
    t+=pr
    return round(t,1),25,rows

# ============================ LAYER 3: SYMPTOM MULTIPLIER ============================
def symptom_mult(a):
    syms=[s for s in a.get('symptoms',[]) if s!='great']
    if 'great' in a.get('symptoms',[]) and not syms: return 1.00,0
    n=len(syms)
    m = 1.00 if n==0 else 0.95 if n<=2 else 0.88 if n<=4 else 0.82
    return m,n

# ============================ LAYER 4: GOAL WEIGHTING ============================
GOAL_MAP={'energy':['Sleep & Recovery','Activity & Fitness'],'sleep':['Sleep & Recovery'],
 'focus':['Stress & Balance','Sleep & Recovery'],'longevity':['Nutrition & Diet','Activity & Fitness'],
 'immunity':['Nutrition & Diet','Health Habits'],'fitness':['Activity & Fitness'],
 'weight':['Activity & Fitness','Nutrition & Diet'],'mood':['Stress & Balance'],
 'heart':['Activity & Fitness','Nutrition & Diet'],'joints':['Activity & Fitness'],
 'skin':['Nutrition & Diet'],'hormones':['Stress & Balance','Sleep & Recovery']}

# ============================ LAYER 5: SAFETY / INTERACTION FLAGS (narrative only) ============================
def safety_flag_codes(a):
    """Stable codes for the content layer. Narrative-only; never affects the score."""
    c=[]; meds=a.get('medTypes',[]); syms=a.get('symptoms',[])
    low_energy = a['energy'] in ('low','drained') or 'fatigue' in syms
    if 'statin' in meds and low_energy: c.append('STATIN_COQ10')
    if 'ppi' in meds: c.append('PPI_B12_MAG')
    if 'metformin' in meds: c.append('METFORMIN_B12')
    if 'diuretic' in meds: c.append('DIURETIC_MIN')
    if 'bloodthinner' in meds: c.append('BLOODTHINNER')
    if a['diet'] in ('vegan','plant') and a.get('f_fish') in ('never','rare'): c.append('PLANT_OMEGA_B12')
    trop = a.get('country') in ('Thailand','Singapore','Malaysia','Vietnam','Indonesia','Philippines')
    if a['sunscreen']=='daily' and a['sun'] in ('u15','15-30') and trop: c.append('VITD_ROUTINE')
    if a.get('kidney') in ('reduced','disease'): c.append('KIDNEY_CEILING')
    if a.get('liver')=='condition': c.append('LIVER_ROUTING')
    if a.get('reproStatus') in ('pregnant','breastfeeding'): c.append('PREGNANCY')
    return c

def safety_flags(a):
    f=[]; meds=a.get('medTypes',[]); syms=a.get('symptoms',[])
    low_energy = a['energy'] in ('low','drained') or 'fatigue' in syms
    if 'statin' in meds and low_energy: f.append("Statin + low energy \u2192 CoQ10 depletion check")
    if 'ppi' in meds: f.append("PPI / omeprazole \u2192 B12 & magnesium absorption check")
    if 'metformin' in meds: f.append("Metformin \u2192 long-term B12 check")
    if 'diuretic' in meds: f.append("Diuretic \u2192 magnesium / potassium check")
    if 'bloodthinner' in meds: f.append("Blood thinner \u2192 vitamin K / omega-3 / fish-oil caution")
    if a['diet'] in ('vegan','plant') and a.get('f_fish') in ('never','rare'):
        f.append("Plant-based + little oily fish \u2192 omega-3 (EPA/DHA) & B12 gap")
    trop = a.get('country') in ('Thailand','Singapore','Malaysia','Vietnam','Indonesia','Philippines')
    if a['sunscreen']=='daily' and a['sun'] in ('u15','15-30') and trop:
        f.append("Daily sunscreen + low sun in the tropics \u2192 vitamin D risk despite climate")
    if a.get('kidney') in ('reduced','disease'): f.append("Reduced kidney function \u2192 dose ceilings on several minerals")
    if a.get('liver')=='condition': f.append("Liver condition \u2192 herb/dose safety routing")
    if a.get('reproStatus') in ('pregnant','breastfeeding'): f.append("Pregnant / breastfeeding \u2192 strict ingredient safety routing")
    return f

# ============================ ASSEMBLE ============================
def score(a):
    pil=[]; tot_e=0
    for name,fn in PILLARS:
        e,mx,rows=fn(a); pil.append({'name':name,'earned':e,'max':mx,'pct':e/mx,'rows':rows}); 
    # base weights = pillar max share
    base={p['name']:p['max'] for p in pil}; bs=sum(base.values())
    w={k:v/bs for k,v in base.items()}
    goals=a.get('goals',[])[:3]
    matched=set()
    for g in goals:
        for pn in GOAL_MAP.get(g,[]): matched.add(pn)
    adj={k:(v*1.30 if k in matched else v) for k,v in w.items()}
    s=sum(adj.values()); adjw={k:v/s for k,v in adj.items()}
    weighted_pct=sum(adjw[p['name']]*p['pct'] for p in pil)
    selfrep_pts=weighted_pct*86
    ver_e,ver_mx,ver_rows=verification(a); ver_e=round(ver_e*18/25,1)
    raw=selfrep_pts+ver_e                       # 0..100
    mult,nsym=symptom_mult(a)
    final=max(30,min(92,round(raw*mult)))
    band = ('Excellent' if final>=82 else 'Strong, with headroom' if final>=70
            else 'Good, with a clear gap' if final>=58 else 'Building foundation' if final>=46 else 'Needs attention')
    return {'final':final,'band':band,'raw':round(raw,1),'selfrep':round(selfrep_pts,1),
            'verification':ver_e,'mult':mult,'nsym':nsym,'pillars':pil,'adjw':adjw,
            'matched':matched,'ver_rows':ver_rows,'flags':safety_flags(a),'flag_codes':safety_flag_codes(a)}
