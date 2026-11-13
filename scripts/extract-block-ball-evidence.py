"""Independent numeric block/ball source witnesses, without application imports.

Selected raw frames preserve ordering and source locators. Board projections
retain only physical/ownership fields; they do not certify complete traits or
playable state. Human interpretation is anchored to UI-096 and BB2020 p25/27.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('inventory', 'scripts/inventory-replay-actions.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

selections = [('demo1.bbr',111,2), ('demo3.bbr',381,3),
              ('demo5.bbr',196,2), ('demo5.bbr',502,3),
              ('demo11.bbr',232,3), ('demo-goblins1.bbr',490,2),
              ('demo6.bbr',563,2)]

def selected(node, names):
    out = ET.Element(node.tag)
    for child in node:
        if child.tag in names:
            out.append(child)
    return out

def physical_board(node, participants):
    out = selected(node, ['Ball','CurrentPhase','IsStable','ActiveTeam','ActiveGamer','ActivePlayer','PitchType','TurnsPerPeriod'])
    teams = ET.SubElement(out,'ListTeams')
    for team in node.findall('./ListTeams/TeamState'):
        t = selected(team,['GameTurn','Side'])
        if team.find('Data') is not None:
            t.append(selected(team.find('Data'),['TeamId']))
        players = ET.SubElement(t,'ListPitchPlayers')
        for player in team.findall('./ListPitchPlayers/PlayerState'):
            fields=['Id','Cell','Status','Situation'] if player.findtext('Id') in participants else ['Id']
            players.append(selected(player,fields))
        teams.append(t)
    return inv.numeric_projection(out)

cases=[]
for filename, number, bounce_index in selections:
    path=Path('demo-replays')/filename
    root=inv.parse_xml(inv.decode_replay(path))
    replay_steps=root.findall('ReplayStep')
    final_frame=replay_steps[number-1]
    sequence=final_frame.find('EventExecuteSequence')
    # Source-selected final block and first bounce, independently decoded.
    results=list(sequence.iter('StepResult'))
    messages=[inv.decode_message(m.findtext('MessageData')) for m in results[0].iter('StringMessage')]
    final=next(m for m in messages if m.tag=='ResultBlockOutcome')
    bounce_step=inv.decode_message(results[bounce_index].findtext('./Step/MessageData'))
    bounce_roll=inv.decode_message(next(results[bounce_index].iter('StringMessage')).findtext('MessageData'))
    assert bounce_step.tag=='BallStep' and bounce_step.findtext('StepType')=='3'
    assert bounce_roll.tag=='ResultRoll' and bounce_roll.findtext('RollType')=='25'
    before=next(b for row in reversed(replay_steps[:number-1]) for b in reversed(list(row)) if b.tag=='BoardState')
    ball=before.find('Ball')
    assert ball.findtext('IsHeld')=='1'
    holder=ball.findtext('Carrier')
    assert holder in [final.findtext('AttackerId'),final.findtext('DefenderId')]
    assert inv.numeric_projection(ball.find('Cell'))==inv.numeric_projection(bounce_step.find('CellFrom'))
    # Preserve the actual direction and coordinates. Do not substitute the
    # tabletop template's numbering/orientation for BB3's serialization.
    start=bounce_step.find('CellFrom'); end=bounce_step.find('CellTo')
    assert max(abs(int(end.findtext('X'))-int(start.findtext('X'))),
               abs(int(end.findtext('Y'))-int(start.findtext('Y'))))==1
    frames=[]
    for rn in range(number-5,number+1):
        children=[]
        for ci,child in enumerate(replay_steps[rn-1]):
            if child.tag=='Clock': continue
            if child.tag=='EventExecuteSequence':
                steps=[]
                for si,result in enumerate(child.iter('StepResult')):
                    step=inv.decode_message(result.findtext('./Step/MessageData'))
                    ms=[inv.decode_message(m.findtext('MessageData')) for m in result.iter('StringMessage')]
                    steps.append(dict(stepIndex=si,step={step.tag:inv.numeric_projection(step)},messages=[{m.tag:inv.numeric_projection(m)} for m in ms]))
                children.append(dict(childIndex=ci,tag=child.tag,steps=steps))
            else:
                projection=physical_board(child,[final.findtext('AttackerId'),final.findtext('DefenderId')]) if child.tag=='BoardState' else inv.numeric_projection(child)
                children.append(dict(childIndex=ci,tag=child.tag,projection=projection))
        frames.append(dict(replayStep=rn,children=children))
    initial=[]
    for team in root.findall('./NotificationGameJoined/InitialBoardState/ListTeams/TeamState'):
        initial.append(dict(teamId=int(team.findtext('./Data/TeamId')),
                            players=[int(p.findtext('Id')) for p in team.findall('./ListPitchPlayers/PlayerState')]))
    cases.append(dict(id=f'{path.stem}-{number}',sourceFile=filename,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                      originalReplayStep=number,bounceStepIndex=bounce_index,holderId=holder,
                      final=inv.numeric_projection(final),fromCell=inv.numeric_projection(start),toCell=inv.numeric_projection(end),
                      initialRosters=initial,frames=frames))

output=dict(scope='Observed first bounce from a source-confirmed prone carrier; no extra dice score, final possession, legal counterfactual or tactical value.',
            rules=dict(edition='BB2020',bouncePage=25,pronePage=27,pairedPlayback='UI-096'),cases=cases)
# Keep source-case headers readable and each machine-evidence frame on one
# line; thousands of one-element numeric arrays need no line-by-line padding.
compact=lambda v:json.dumps(v,separators=(',',':'))
lines=['{', '  "scope":'+compact(output['scope'])+',', '  "rules":'+compact(output['rules'])+',', '  "cases":[']
for index,case in enumerate(cases):
    lines.append('    {')
    lines.extend('      '+json.dumps(k)+':'+compact(v)+',' for k,v in case.items() if k!='frames')
    lines.append('      "frames":[')
    lines.extend('        '+compact(frame)+(',' if i<len(case['frames'])-1 else '') for i,frame in enumerate(case['frames']))
    lines.extend(['      ]','    }'+(',' if index<len(cases)-1 else '')])
rendered='\n'.join(lines+['  ]','}'])+'\n'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
path=Path('tests/fixtures/evidence/bb3-block-ball-release.json')
if args.check: assert path.read_text()==rendered, 'Raw block/ball witnesses changed; review before updating.'
else: path.write_text(rendered)
print([(c['id'],c['holderId']) for c in cases])
