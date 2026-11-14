"""Independent fair armor faces under two fixed Mighty Blow decision policies.

Controlled synthetic AV8 / opposing Mighty Blow1, not a captured match. The
choice is made after the armor dice; a +1 is used only on an unmodified7.
"""
import argparse,json
from fractions import Fraction
from pathlib import Path
profiles=[]
for policy,target in [('never_use',8),('use_on_seven',7)]:
    held=sum(a+b<target for a in range(1,7) for b in range(1,7))
    p=Fraction(held,36)
    rows=[]
    for a in range(1,7):
        for b in range(1,7):
            rows.append(dict(dice=[a,b],use=policy=='use_on_seven' and a+b==7,held=a+b<target,
                delta=str(Fraction(a+b<target)-p)))
    assert sum(Fraction(r['delta']) for r in rows)==0
    profiles.append(dict(policy=policy,heldCount=held,totalFaces=36,holdChance=str(p),rows=rows))
out=dict(scope='Controlled ordinary AV8 with opposing Mighty Blow1, fixed never-use or use-only-on-seven decision policy. No contextual or calibrated match value.',
    ruleEvidence='docs/ARMOR_MODIFIER_BUDGET_EVIDENCE.md; GR-005, BB2020 printed80/PDF81; post-roll armor/injury choice, skill13.',profiles=profiles)
text=json.dumps(out,indent=2,sort_keys=True)+'\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();path=Path('tests/fixtures/evidence/bb3-armor-choice-policy.json')
if args.check:assert path.read_text()==text
else:path.write_text(text)
print(json.dumps(dict(profiles=2,facePairs=72,zeroMeans=True)))
