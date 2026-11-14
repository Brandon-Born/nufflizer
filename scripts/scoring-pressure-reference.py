"""Exact synthetic score/clock references; no application imports/admission."""
import argparse
import itertools
import json
from fractions import Fraction
from pathlib import Path

clocks=[(0,1,0),(0,8,7),(0,8,8),(1,9,8),(1,15,15),(1,16,15),(1,16,16)]
cases=[]
sign=lambda n:(n>0)-(n<0)
for (period,own_turn,opponent_turn),(own,opponent) in itertools.product(clocks,itertools.product(range(3),repeat=2)):
    pressure=Fraction(8*(sign(own+1-opponent)-sign(own-opponent)),1+(16-own_turn)+(16-opponent_turn))
    difference=4+pressure
    contributions=[(int(face>=2)-Fraction(5,6))*difference for face in range(1,7)]
    assert sum(contributions)==0
    cases.append(dict(period=period,ownTurn=own_turn,opponentTurn=opponent_turn,ownScore=own,opponentScore=opponent,scorePressure=str(pressure),difference=str(difference),contributions=list(map(str,contributions))))
result=dict(scope=__doc__,cases=cases)
target=Path('tests/fixtures/evidence/scoring-pressure-arithmetic.json')
rendered=json.dumps(result,indent=2)+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
if args.check:assert target.read_text()==rendered,'Reference changed; review exact arithmetic before regeneration'
else:target.write_text(rendered)
print(dict(strata=len(cases),pipelineFacesAndSides=len(cases)*12))
