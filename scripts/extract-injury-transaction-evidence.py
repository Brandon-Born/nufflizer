"""Independent numeric source witnesses and Fraction injury references.

Uses only stdlib replay decoding. Candidate coordinates are discovery inputs,
not an application admission oracle. Current-trait continuity, legal policy
and causal admission have separate tests. No original evidence is rewritten.
"""
import argparse
import hashlib
import importlib.util
import json
from fractions import Fraction
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)
skills = {17:'StandFirm',18:'AlwaysHungry',23:'SneakyGit',25:'Chainsaw',26:'Dauntless',37:'Grab',
          41:'JumpUp',47:'Pass',55:'Shadowing',64:'ThrowTeamMate',71:'Kick',84:'AnimalSavagery',
          95:'ProjectileVomit',97:'OnTheBall',1009:'MightyBlow2'}
enum_path = Path('tests/fixtures/evidence/bb3-installed-enums.json')
enums = json.loads(enum_path.read_text())
actual = {r['value']:r['member'] for e in enums['enums'] if e['name']=='EBB3BoardDataSkill' for r in e['entries']}
assert all(actual[k] == name for k,name in skills.items())
selections = [('demo5.bbr',77,1,1,1),('demo5.bbr',88,1,1,1),('demo6.bbr',52,1,1,2),
              ('demo8.bbr',60,1,1,1),('demo8.bbr',98,1,1,1),('demo8.bbr',177,1,1,1),
              ('demo8.bbr',190,1,1,1),('demo8.bbr',215,1,1,1),('demo8.bbr',220,1,1,1),
              ('demo9.bbr',33,1,2,1),('demo9.bbr',48,1,1,1)]
roots = {}
digests = {}
uses = []
notices = []
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root = inv.parse_xml(inv.decode_replay(path))
    assert root.findtext('ReplayVersion') == '1-4-0-0'
    roots[path.name] = root
    digests[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    for rn, outer in enumerate(root.findall('ReplayStep'),1):
        for ci, child in enumerate(outer):
            if child.tag != 'EventExecuteSequence':
                continue
            for si, step in enumerate(child.iter('StepResult')):
                header = inv.decode_message(step.findtext('./Step/MessageData'))
                messages = [inv.decode_message(m.findtext('MessageData')) for m in step.iter('StringMessage')]
                for mi, message in enumerate(messages):
                    locator = dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi)
                    if message.tag == 'ResultSkillUsage' and int(message.findtext('Skill')) in skills:
                        uses.append(dict(sourceFile=path.name,locator=locator,skill=int(message.findtext('Skill')),
                                         fields=[c.tag for c in message],payload=inv.numeric_projection(message)))
                    if (header.tag == 'DamageStep' and header.findtext('Source') == '1' and
                        message.tag == 'ResultGainSpp' and message.findtext('SppGained') == '2' and
                        0 < mi < len(messages)-1 and messages[mi-1].tag == 'ResultRoll' and
                        messages[mi-1].findtext('RollType') == '10' and messages[mi+1].tag == 'ResultInjuryRoll'):
                        notices.append(dict(sourceFile=path.name,locator=locator,header=inv.numeric_projection(header),
                                            payload=inv.numeric_projection(message),armor=inv.numeric_projection(messages[mi-1]),
                                            injury=inv.numeric_projection(messages[mi+1])))

def lists(data):
    return {name: None if data is None or data.find(tag) is None else [int(n.text) for n in data.find(tag)]
            for name,tag in [('innate','InnateSkills'),('acquired','AcquiredSkills')]}

def empty(node):
    return None if node is None else not len(node) and not (node.text or '').strip()

cases = []
for filename,rn,ci,si,mi in selections:
    root = roots[filename]
    sequence = list(root.findall('ReplayStep')[rn-1])[ci]
    steps = list(sequence.iter('StepResult'))
    step = steps[si]
    header = inv.decode_message(step.findtext('./Step/MessageData'))
    messages = [inv.decode_message(m.findtext('MessageData')) for m in step.iter('StringMessage')]
    roll = messages[mi]
    assert roll.tag == 'ResultInjuryRoll' and roll.findtext('RollType') == '11'
    assert empty(roll.find('Modifiers'))
    subject = header.findtext('PlayerId')
    wanted = {subject}
    for prior in steps[:si]:
        h = inv.decode_message(prior.findtext('./Step/MessageData'))
        wanted.update([h.findtext('PlayerId'), h.findtext('TargetId')])
    initial = root.find('./NotificationGameJoined/InitialBoardState')
    seeds = []
    for ti,team in enumerate(initial.findall('./ListTeams/TeamState')):
        for p in team.findall('./ListPitchPlayers/PlayerState'):
            if p.findtext('Id') not in wanted:
                continue
            data = p.find('Data')
            seeds.append(dict(playerId=p.findtext('Id'),rosterIndex=ti,explicitTeamId=team.findtext('./Data/TeamId'),
                              prayersEmpty=empty(team.find('ActivePrayers')),
                              playerType=None if data is None else data.findtext('IdPlayerTypes'),
                              dataPlayerId=None if data is None else data.findtext('Id'),**lists(data)))
    seed = next(s for s in seeds if s['playerId'] == subject)
    assert seed['innate'] is not None and seed['acquired'] is not None
    stunty = 59 in seed['innate']+seed['acquired']
    thick = 63 in seed['innate']+seed['acquired']
    # Literal rule rows for totals2..12; triangular multiplicities, not runtime
    # enumeration or the production ordinal implementation.
    table = ([0,0,0,0,0,0,1,2,3,3,3] if thick else [0,0,0,0,0,1,1,2,3,3,3]) if stunty else (
        [0,0,0,0,0,0,0,1,3,3,3] if thick else [0,0,0,0,0,0,1,1,3,3,3])
    counts = [sum(n for n,k in zip([1,2,3,4,5,6,5,4,3,2,1],table) if k==j) for j in range(4)]
    faces = [int(d.findtext('Value')) for d in roll.findall('./Dice/Die')]
    code = int(roll.findtext('Outcome'))
    assert [0,2,3,4][table[sum(faces)-2]] == code
    tier = min([0,2,3,4].index(code),2)
    tiers = [counts[0],counts[1],counts[2]+counts[3]]
    delta = Fraction(sum(tiers[tier+1:])-sum(tiers[:tier]),36)
    board = initial
    board_locator = dict(replayStep=None,childIndex=None)
    for nr,outer in enumerate(root.findall('ReplayStep'),1):
        for nc,child in enumerate(outer):
            if (nr,nc) >= (rn,ci):
                break
            if child.tag == 'BoardState':
                board=child;board_locator=dict(replayStep=nr,childIndex=nc)
        if nr >= rn:
            break
    current = []
    for ti,team in enumerate(board.findall('./ListTeams/TeamState')):
        for p in team.findall('./ListPitchPlayers/PlayerState'):
            if p.findtext('Id') not in wanted:
                continue
            current.append(dict(playerId=p.findtext('Id'),rosterIndex=ti,explicitTeamId=team.findtext('./Data/TeamId'),
                                effectsEmpty=empty(p.find('Effects')),teamEffectsEmpty=empty(team.find('Effects')),
                                transformationsEmpty=empty(team.find('TransformedPlayers')),prayersEmpty=empty(team.find('ActivePrayers')),
                                raw=inv.numeric_projection(p)))
    preceding = steps[si-1] if si else None
    cases.append(dict(sourceFile=filename,locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),
                      subjectId=subject,header=inv.numeric_projection(header),messages=[dict(tag=m.tag,payload=inv.numeric_projection(m)) for m in messages],
                      previousStep=None if preceding is None else dict(header=inv.numeric_projection(inv.decode_message(preceding.findtext('./Step/MessageData'))),
                                                                    messages=[dict(tag=m.tag,payload=inv.numeric_projection(m)) for m in [inv.decode_message(x.findtext('MessageData')) for x in preceding.iter('StringMessage')]]),
                      seeds=seeds,current=dict(locator=board_locator,phase=board.findtext('CurrentPhase'),effectsEmpty=empty(board.find('Effects')),players=current),
                      reference=dict(scope='conditional table from observed initial lists; admission/current continuity/cause require separate proof',stunty=stunty,thickSkull=thick,counts=counts,
                                     dice=faces,outcome=['stunned','ko','badly_hurt','casualty'][[0,2,3,4].index(code)],delta=str(delta),weighted=str(delta*Fraction(3,2)))))
assert len(uses)==80 and len(notices)==6 and len(cases)==11
pushes=[]
for question_step,push_step,final_step in [(46,47,48),(69,70,71),(83,84,85)]:
    records=[]
    for rn,mi,tag in [(question_step,1,'QuestionPushBack'),(push_step,0,'ResultPushBack'),(final_step,1,'ResultBlockOutcome')]:
        child=list(roots['demo9.bbr'].findall('ReplayStep')[rn-1])[1]
        step=list(child.iter('StepResult'))[0]
        raw=list(step.iter('StringMessage'))[mi]
        message=inv.decode_message(raw.findtext('MessageData'))
        assert message.tag==tag
        records.append(dict(tag=tag,locator=dict(replayStep=rn,childIndex=1,stepIndex=0,messageIndex=mi),payload=inv.numeric_projection(message)))
    pushes.append(dict(sourceFile='demo9.bbr',question=records[0],push=records[1],applied=records[2]))
result=dict(scope='Raw source witnesses and independent fixed-table arithmetic, not gameplay/current-trait admission or final availability certificates.',
            replayVersion='1-4-0-0',sourceHashes=digests,enumSource=dict(file=str(enum_path),sha256=hashlib.sha256(enum_path.read_bytes()).hexdigest(),executableSha256=enums['source']['sha256']),
            skillUses=uses,damageSpp=notices,injuries=cases,pushes=pushes)
rendered=json.dumps(result,indent=2)+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
output=Path('tests/fixtures/evidence/bb3-injury-transactions.json')
if args.check:
    assert output.read_text()==rendered,'Transaction source/reference changed; review original bytes.'
else:
    output.write_text(rendered)
print(json.dumps(dict(skillUseWitnesses=len(uses),sppPrefixes=len(notices),injuryCandidates=len(cases),pushBranches=len(pushes)*4)))
