# -*- coding: utf-8 -*-
"""
MattaNutra HealthScore — FINDING LIBRARY
=========================================
This file is DATA, not logic. It maps every fact the engine can emit to the
exact words a customer sees. Marketing/clinical staff can edit copy here freely
without touching the selection logic in healthscore_content.py.

HARD RULES (enforced by tests in run_content.py):
  • No mention of bloodwork, lab tests, "get tested", or a score "ceiling/cap".
  • Templates use {curly} placeholders filled from a context dict at render time.
  • Every safety finding is framed as "your plan accounts for this" — never as
    "go do this test" or "you are deficient".

Placeholders available to templates: {goal}, {goals}, {pillar}, {value},
{goal_list}, {sym_list}, {median}, {gap}, {pct}, {score}, {band}.
"""

# ---------------------------------------------------------------------------
# 1. GOAL DISPLAY PHRASES  — used in the hero "goal mirror" and goal-linked tags
# ---------------------------------------------------------------------------
GOAL_PHRASE = {            # phrase used in the hero sentence
    'energy':    'energy',
    'sleep':     'deeper sleep',
    'focus':     'sharper focus',
    'longevity': 'a longer healthspan',
    'immunity':  'a stronger immune system',
    'fitness':   'a real way back to fitness',
    'weight':    'a healthier weight',
    'mood':      'a steadier mood',
    'heart':     'a stronger heart',
    'joints':    'easier joints',
    'skin':      'better skin',
    'hormones':  'balanced hormones',
}
GOAL_TAG = {               # short word for the "Goal-linked · X" pillar tag
    'energy':'energy','sleep':'sleep','focus':'focus','longevity':'longevity',
    'immunity':'immunity','fitness':'fitness','weight':'weight','mood':'mood',
    'heart':'heart','joints':'joints','skin':'skin','hormones':'hormones',
}

# ---------------------------------------------------------------------------
# 2. SYMPTOM DISPLAY NAMES  — for the symptom gap card
# ---------------------------------------------------------------------------
SYMPTOM_NAME = {
    'fatigue':'fatigue','brainfog':'brain fog','mood':'low mood','joint':'joint aches',
    'digestion':'bloating','sleep':'restless sleep','stress':'stress','skin':'skin issues',
    'hair':'thinning hair','libido':'low libido','colds':'frequent colds',
}

# ---------------------------------------------------------------------------
# 3. PILLAR COPY  — gap-card text + strength notes, by pillar and band
#    bands: 'low' (<45%), 'mid' (45–69%), 'high' (>=70%)
#    {value} = integer percent; {goal} = a goal that links to this pillar (if any)
# ---------------------------------------------------------------------------
PILLAR_LABEL = {
    'Sleep & Recovery':'Sleep & Recovery',
    'Activity & Fitness':'Activity & Fitness',
    'Nutrition & Diet':'Nutrition & Diet',
    'Stress & Balance':'Stress & Balance',
    'Health Habits':'Health Habits',
}
# Gap-card headline + body when a pillar is a weak spot.
PILLAR_GAP = {
    'Sleep & Recovery': {
        'headline':'Your recovery is running short',
        'body':'Short or broken sleep is capping how much everything else can work. It is one of the most movable parts of your score.'},
    'Activity & Fitness': {
        'headline':'Movement is the lever you are not pulling',
        'body':'Your activity sits low — and it is the pillar most of your goals route through, which makes it your highest-return change.'},
    'Nutrition & Diet': {
        'headline':'Your plate is leaving value on the table',
        'body':'A few targeted shifts in what you eat would move this pillar quickly — your plan shows exactly which ones matter for you.'},
    'Stress & Balance': {
        'headline':'Your lowest pillar by far',
        'body':'A high stress load is quietly taxing the very energy and focus you came here for. It is the single biggest drag on your score right now.'},
    'Health Habits': {
        'headline':'A few daily habits are costing you',
        'body':'Small, specific habit changes — not a lifestyle overhaul — would lift this pillar and the score with it.'},
}
# Strength note when a pillar is genuinely strong (>=80%).
PILLAR_STRENGTH = {
    'Health Habits':'A note worth hearing: your Health Habits score is {value}%. Whatever you have been telling yourself, this was never a discipline problem — you have a strong foundation, it is just pointed in slightly the wrong direction.',
    'Sleep & Recovery':'Your sleep is genuinely solid at {value}% — a real asset most people your age do not have. Your plan builds on it rather than fixing it.',
    'Activity & Fitness':'Your activity is strong at {value}%. That foundation means your plan can focus on refinement, not catch-up.',
    'Nutrition & Diet':'Your diet is already working for you at {value}%. The plan sharpens it rather than rebuilding it.',
    'Stress & Balance':'You manage stress well at {value}% — a quiet advantage that makes every other change easier to sustain.',
}
# The "highest-leverage move" box, shown when a goal-linked pillar is the key gap.
LEVER_BOX = ('<b>Your highest-leverage move:</b> {pillar} sits at {value}% — and '
             'every one of your goals routes through it. Lift this one pillar and '
             '{goal_list} all move together. That is not a coincidence in your '
             'results; it is the shape of your answers.')

# ---------------------------------------------------------------------------
# 4. FINDINGS  — the "What we caught" cards. Each has an icon, headline, body.
#    'tier' drives salience ordering (lower number = higher priority).
#    SAFETY-FLAG findings are keyed by the engine's flag codes.
# ---------------------------------------------------------------------------
FINDINGS = {
    # --- tier 1: medication / interaction flags (most surprising, build trust) ---
    'STATIN_COQ10': dict(tier=1, icon='\u2726',
        headline='Your statin answer changed the entire review.',
        body='Because you reported a statin <em>and</em> low energy, your plan does '
             'not get a generic \u201cmen\u2019s health\u201d stack. It specifically reviews '
             'CoQ10 \u2014 which statins are known to deplete \u2014 alongside heart-aware '
             'nutrient choices. This is the kind of interaction a one-size quiz never '
             'checks, and it is why your formula will look different from your friend\u2019s.'),
    'PPI_B12_MAG': dict(tier=1, icon='\u2726',
        headline='Your medication quietly affects how you absorb nutrients.',
        body='You reported a PPI (acid-reducing medication), which over time can blunt how '
             'well you absorb vitamin B12 and magnesium. Your plan accounts for that directly '
             'rather than assuming everything you take is fully absorbed.'),
    'METFORMIN_B12': dict(tier=1, icon='\u2726',
        headline='Your medication shapes one specific nutrient choice.',
        body='Long-term metformin use is associated with lower vitamin B12 over time. Your '
             'plan factors that in, so your formula reflects how your body actually handles '
             'nutrients \u2014 not a generic template.'),
    'BLOODTHINNER': dict(tier=1, icon='\u2726',
        headline='Your medication sets a clear safety boundary.',
        body='Because you reported a blood thinner, your plan is routed carefully around '
             'vitamin K and high-dose fish oil, which can interact with it. Safety here is '
             'applied first, before anything is recommended.'),
    # --- tier 2: goal-pattern insights (deeply personal) ---
    'ENERGY_UPSTREAM': dict(tier=2, icon='\u25ce',
        headline='Your energy problem isn\u2019t a caffeine problem.',
        body='Your low energy lines up with {energy_causes} \u2014 not a missing stimulant. '
             'So your plan works the actual sequence: steady the stress load, support deeper '
             'sleep, and ease movement back in, with nutrients chosen to support that chain. '
             'More caffeine would only paper over it.'),
    'SLEEP_UPSTREAM': dict(tier=2, icon='\u25ce',
        headline='Better sleep is upstream of almost everything you asked for.',
        body='Your answers put short or restless sleep at the centre of the pattern. Your '
             'plan treats it as the lever it is \u2014 because lifting sleep tends to pull '
             'energy, focus and mood up with it.'),
    'WEIGHT_PATTERN': dict(tier=2, icon='\u25ce',
        headline='Your weight goal is really a consistency goal.',
        body='Your pattern points less to willpower and more to the daily rhythm around '
             'movement, sleep and meals. Your plan targets that rhythm rather than handing '
             'you another restrictive rulebook.'),
    # --- tier 3: lifestyle / routine flags (contextual, "we noticed how you live") ---
    'VITD_ROUTINE': dict(tier=3, icon='\u263c',
        headline='Your daily routine shapes your formula.',
        body='Daily sunscreen, limited time in the sun, and low oily-fish intake all point '
             'the same way \u2014 so your plan leans into vitamin D and omega-3 support rather '
             'than guessing. Your formula is built around how you actually live, not just your '
             'age and sex.'),
    'PLANT_OMEGA_B12': dict(tier=3, icon='\u263c',
        headline='Your plant-forward diet has two specific blind spots.',
        body='Eating mostly plant-based with little oily fish makes omega-3 (EPA/DHA) and '
             'vitamin B12 the two nutrients worth getting right. Your plan emphasises exactly '
             'these, so the way you eat stays an asset, not a gap.'),
    'DIURETIC_MIN': dict(tier=3, icon='\u263c',
        headline='Your medication affects a couple of key minerals.',
        body='Diuretics can lower magnesium and potassium over time. Your plan keeps an eye '
             'on those minerals so your formula complements your medication rather than working '
             'against it.'),
    # --- tier 4: safety routing (important, handled with care) ---
    'KIDNEY_CEILING': dict(tier=4, icon='\u2727',
        headline='Your plan respects a hard safety boundary.',
        body='Because you reported reduced kidney function, several minerals are kept within '
             'careful dose ceilings. Your plan is built to support you without ever crossing '
             'that line.'),
    'LIVER_ROUTING': dict(tier=4, icon='\u2727',
        headline='Your plan routes carefully around liver safety.',
        body='With a liver condition noted, certain botanicals and doses are handled with '
             'extra caution. Safety is applied as a filter first, before any recommendation.'),
    'PREGNANCY': dict(tier=4, icon='\u2727',
        headline='Your plan follows strict pregnancy-safe routing.',
        body='Because you are pregnant or breastfeeding, every ingredient is screened against '
             'strict safety rules. Nothing is recommended that is not appropriate for this '
             'stage \u2014 this is the most conservative routing we apply.'),
}

# Sub-phrases for ENERGY_UPSTREAM, chosen by which causes are present.
ENERGY_CAUSE = {
    'stress':   'high stress',
    'sleep':    'short sleep',
    'activity': 'light activity',
}

# ---------------------------------------------------------------------------
# 5. RELATIVITY  — how the score is framed against peers.
#    The ruleset chooses RANK (at/above median) or GAP (below median).
# ---------------------------------------------------------------------------
RELATIVITY = {
    'rank':  'You are ahead of about {pct}% of people who finish this assessment.',
    'gap':   'The average person who finishes this assessment scores about {median}. '
             'Your gap is {gap} points \u2014 and none of them are about age.',
    'gap_sub':  'Those {gap} points aren\u2019t genetics, and they aren\u2019t willpower. They '
                'are a few specific, recoverable things \u2014 and the biggest are exactly the '
                'goals you told us mattered most.',
    'rank_sub': 'You are clearly doing a lot right. What is left is refinement \u2014 a few '
                'targeted points between you and your personal best.',
}

# ---------------------------------------------------------------------------
# 6. BAND HEADLINE  — the short line under the big number, by band.
# ---------------------------------------------------------------------------
BAND_LINE = {
    'Needs attention':       'This is a starting line, not a verdict \u2014 and we can see exactly where to begin.',
    'Building foundation':   'A {score} isn\u2019t a verdict on your health. It\u2019s a starting line \u2014 and the rare thing is, we can see <em>exactly</em> where the line sits.',
    'Good, with a clear gap':'A {score} is a genuinely solid base \u2014 with one clear, nameable gap between you and the next level.',
    'Strong, with headroom': 'A {score} is strong. What is left is the fine-tuning most people never get to.',
    'Excellent':             'A {score} is excellent \u2014 you are in rare company. Your plan is about protecting and sharpening what you have built.',
}

# Forbidden substrings — the test in run_content.py asserts none appear in output.
FORBIDDEN = ['bloodwork', 'blood work', 'get tested', 'lab test', 'lab result',
             'unmeasured', 'capped', "can't rise", 'locked', 'deficien']
