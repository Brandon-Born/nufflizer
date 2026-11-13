"""Independent raw witnesses and exact BB2020 injury-table arithmetic.

No application imports or eligibility/scoring outputs. The numeric table rows
are transcribed rule facts (2020 p60 / Thick Skull p80, in-game GR-010).
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

def empty(node):
    return node is not None and not len(node) and not (node.text or '').strip()

def skills(data, name):
    node = data.find(name)
    return None if node is None else [int(x.text) for x in node]

# Indices correspond to totals 2..12. Count with the independently known
# triangular 2D6 multiplicities rather than the runtime face enumeration.
rows = [
    (False, False, [0,0,0,0,0,0,1,1,3,3,3]),
    (False, True,  [0,0,0,0,0,0,0,1,3,3,3]),
    (True, False, [0,0,0,0,0,1,1,2,3,3,3]),
    (True, True,  [0,0,0,0,0,0,1,2,3,3,3])
]
tables = [dict(stunty=s, thickSkull=t, totalOutcomes=r,
               counts=[sum(n for n, k in zip([1,2,3,4,5,6,5,4,3,2,1], r) if k == i) for i in range(4)])
          for s, t, r in rows]
selections = [('demo10.bbr',23,1,1,2,True), ('demo10.bbr',26,1,1,1,True),
              ('demo5.bbr',29,1,1,1,True), ('demo5.bbr',48,1,1,1,False),
              ('demo8.bbr',45,1,10,1,True), ('demo8.bbr',60,1,1,1,False),
              ('demo1.bbr',36,1,1,1,True), ('demo10.bbr',32,1,1,1,True),
              ('demo10.bbr',76,1,1,1,True), ('demo10.bbr',90,1,1,1,True),
              ('demo5.bbr',70,1,1,1,True)]
cases = []
for filename, number, ci, si, mi, supported in selections:
    path = Path('demo-replays') / filename
    root = inv.parse_xml(inv.decode_replay(path))
    target = list(root.findall('ReplayStep')[number-1])[ci]
    result = list(target.iter('StepResult'))[si]
    step = inv.decode_message(result.findtext('./Step/MessageData'))
    roll = inv.decode_message(list(result.iter('StringMessage'))[mi].findtext('MessageData'))
    assert roll.tag == 'ResultInjuryRoll' and roll.findtext('Modifiers') == ''
    subject = step.findtext('PlayerId')
    initial = root.find('./NotificationGameJoined/InitialBoardState')
    seed = None
    for index, team in enumerate(initial.findall('./ListTeams/TeamState')):
        for player in team.findall('./ListPitchPlayers/PlayerState'):
            if player.findtext('Id') == subject:
                data = player.find('Data')
                seed = dict(teamId=team.findtext('./Data/TeamId'), rosterIndex=index,
                            prayersKnownEmpty=empty(team.find('ActivePrayers')),
                            dataPlayerId=int(data.findtext('Id')), playerTypeId=int(data.findtext('IdPlayerTypes')),
                            innateSkills=skills(data,'InnateSkills'), acquiredSkills=skills(data,'AcquiredSkills'))
    assert seed and seed['prayersKnownEmpty'] and seed['dataPlayerId'] == int(subject)
    current = None
    refreshes = []
    observed_seed_locator = dict(replayStep=None, childIndex=None)
    for rn, outer in enumerate(root.findall('ReplayStep'),1):
        for cn, child in enumerate(outer):
            if (rn,cn) >= (number,ci): break
            if child.tag != 'BoardState': continue
            for ti, team in enumerate(child.findall('./ListTeams/TeamState')):
                for player in team.findall('./ListPitchPlayers/PlayerState'):
                    if player.findtext('Id') != subject: continue
                    current = dict(replayStep=rn,childIndex=cn,rosterIndex=ti,
                                   boardEffectsKnownEmpty=empty(child.find('Effects')),
                                   teamEffectsKnownEmpty=empty(team.find('Effects')),
                                   transformationsKnownAbsent=empty(team.find('TransformedPlayers')),
                                   playerEffectsKnownEmpty=empty(player.find('Effects')),
                                   player=inv.numeric_projection(player))
                    if player.find('Data') is not None:
                        refreshes.append(current)
                        data=player.find('Data')
                        if all(data.find(k) is not None for k in ['Id','IdPlayerTypes','InnateSkills','AcquiredSkills']):
                            observed_seed_locator=dict(replayStep=rn,childIndex=cn)
        if rn >= number: break
    assert current and all(current[k] for k in ['boardEffectsKnownEmpty','teamEffectsKnownEmpty','transformationsKnownAbsent','playerEffectsKnownEmpty'])
    cases.append(dict(sourceFile=filename,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                      locator=dict(replayStep=number,childIndex=ci,stepIndex=si,messageIndex=mi),
                      subjectId=subject,modelSupported=supported,modifiersExplicitlyEmpty=True,seed=seed,observedSeedLocator=observed_seed_locator,current=current,refreshes=refreshes,
                      step=inv.numeric_projection(step),roll=inv.numeric_projection(roll)))
output = dict(scope='Raw source witnesses and conditional unmodified injury arithmetic; not actual modifier choice, treatment, final availability or tactical calibration.',
              rules=dict(edition='BB2020',injuryPage=60,thickSkullPage=80,gameReference='GR-010'),
              outcomes=['stunned','ko','badly_hurt','casualty'],tables=tables,cases=cases)
rendered=json.dumps(output,indent=2)+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
path=Path('tests/fixtures/evidence/bb3-injury-tables.json')
if args.check: assert path.read_text()==rendered, 'Source/rule witness changed; review before updating.'
else: path.write_text(rendered)
print([(c['sourceFile'],c['locator']['replayStep'],c['modelSupported']) for c in cases])
