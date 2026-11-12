"""Independent exact enumeration of the declared single-pool choice model.
State facts: GR-012 Block, GR-018 Tackle, GR-019 Dodge, GR-023 Wrestle and
paired block-symbol observations. This is arithmetic, not roster continuity,
coach preference, position/ball/availability value or calibration evidence.
"""
import argparse,itertools,json
from fractions import Fraction
from pathlib import Path
DIE=[0,1,2,2,3,4]
VALUES=[-1,0,0,0,0,1,1]
def resolve(face,a,d,policy):
 if face==0:return 0
 if face==1:
  ak=30 not in a;dk=30 not in d
  if policy=='improve_knockdown_balance' and ((ak and not dk and 68 in a) or (dk and not ak and 68 in d)):return 2
  return {(True,False):0,(True,True):1,(False,False):3,(False,True):5}[(ak,dk)]
 if face==2 or face==3 and 7 in d and 57 not in a:return 4
 return 6
cases=[]
for bits in itertools.product([False,True],repeat=6):
 a=[s for s,b in zip([30,57,68],bits[:3]) if b];d=[s for s,b in zip([30,7,68],bits[3:]) if b]
 for n,attacker,policy in itertools.product([1,2,3],[False,True],['decline','improve_knockdown_balance']):
  # Also cover a conditional one-die replacement with two retained symbols.
  shapes=[([0]*n,list(range(n)))] if n!=3 else [([0]*n,list(range(n))),([0,1,4],[1])]
  for faces,indices in shapes:
   counts=[0]*7
   def choose(pool):
    options=[resolve(f,a,d,policy) for f in pool];value=(max if attacker else min)(VALUES[o] for o in options)
    return min(o for o in options if VALUES[o]==value)
   for draws in itertools.product(DIE,repeat=len(indices)):
    pool=faces.copy()
    for i,face in zip(indices,draws):pool[i]=face
    counts[choose(pool)]+=1
   total=6**len(indices);dist=[Fraction(c,total) for c in counts]
   cases.append(dict(attackerSkills=a,defenderSkills=d,faces=faces,rolledIndexes=indices,attackerChooses=attacker,wrestlePolicy=policy,faceOutcomes=[resolve(f,a,d,policy) for f in range(5)],distribution=[str(p) for p in dist],expectedValue=str(sum((p*VALUES[i] for i,p in enumerate(dist)),Fraction())),positiveChance=str(sum((p for i,p in enumerate(dist) if VALUES[i]>0),Fraction())),poolOutcome=choose(faces)))
output=dict(scope=__doc__,cases=cases);path=Path('tests/fixtures/evidence/block-skill-arithmetic.json');rendered='{\n  \"scope\": '+json.dumps(output['scope'])+',\n  \"cases\": [\n'+',\n'.join('    '+json.dumps(c,separators=(',',':')) for c in cases)+'\n  ]\n}\n';p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:assert path.read_text()==rendered,'Arithmetic specification changed; review before replacing.'
else:path.write_text(rendered)
print(len(cases),'independent exact arithmetic cases')
