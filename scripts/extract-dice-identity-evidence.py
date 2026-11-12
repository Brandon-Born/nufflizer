"""Independent XML witnesses for copied casualty dice and retained accuracy dice.
No runtime/parser/scorer imports and no new game-rule or treatment claims.
"""
import argparse,hashlib,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('raw','scripts/inventory-replay-actions.py');raw=importlib.util.module_from_spec(spec);spec.loader.exec_module(raw)
cases=[]
for file,choice_step,kind in [('demo-goblins1.bbr',45,'casualty_copy'),('demo1.bbr',645,'casualty_copy'),('demo3.bbr',354,'retained_accuracy')]:
 path=Path('demo-replays')/file;root=raw.parse_xml(raw.decode_replay(path));frames=[];question=None;choice=None;terminal=None
 for rs,outer in enumerate(root.findall('ReplayStep'),1):
  for ci,child in enumerate(outer):
   if child.tag!='EventExecuteSequence':continue
   for si,result in enumerate(child.iter('StepResult')):
    step=raw.decode_message(result.findtext('./Step/MessageData'));messages=[raw.decode_message(m.findtext('MessageData'))for m in result.iter('StringMessage')]
    frame=dict(replayStep=rs,childIndex=ci,stepIndex=si,step={step.tag:raw.numeric_projection(step)},messages=[{m.tag:raw.numeric_projection(m)}for m in messages]);frames.append(frame)
    for mi,m in enumerate(messages):
     loc=dict(replayStep=rs,childIndex=ci,stepIndex=si,messageIndex=mi)
     if kind=='casualty_copy':
      if rs<choice_step and m.tag=='QuestionApothecaryCasualtyUsage' and m.findtext('./RollInfos/Source')=='7':question=(loc,step,m)
      if rs==choice_step and m.tag=='QuestionApothecaryCasualtyChoice':choice=(loc,step,m)
     else:
      if rs==choice_step-1 and m.tag=='QuestionTeamRerollUsage' and m.findtext('./RollInfos/RollType')=='45':question=(loc,step,m)
      if rs==choice_step and m.tag=='ResultTeamRerollUsage':choice=(loc,step,m)
      if rs==choice_step and m.tag=='ResultRoll' and m.findtext('RollType')=='45':terminal=(loc,step,m)
 assert question and choice
 qloc,qstep,q=question;cloc,cstep,c=choice
 subject=qstep.findtext('PlayerId');assert subject==cstep.findtext('PlayerId')
 owners=[]
 for team in root.findall('./NotificationGameJoined/InitialBoardState/ListTeams/TeamState'):
  if any(p.findtext('Id')==subject for p in team.findall('./ListPitchPlayers/PlayerState')):owners.append(team.findtext('./Data/TeamId'))
 assert len(owners)==1 and q.findtext('GamerId')==owners[0]
 if kind=='casualty_copy':
  a=q.find('RollInfos');b=c.find('OriginalRoll');assert a is not None and b is not None
  assert a.findtext('Source')==b.findtext('Source')=='7' and a.findtext('RollType')==b.findtext('RollType')=='12'
  assert raw.numeric_projection(a.find('Dice'))==raw.numeric_projection(b.find('Dice'))
  assert qstep.findtext('TargetId')==cstep.findtext('TargetId')==subject
  assert raw.numeric_projection(qstep.find('CellFrom'))==raw.numeric_projection(cstep.find('CellFrom'))==raw.numeric_projection(qstep.find('CellTo'))==raw.numeric_projection(cstep.find('CellTo'))
  assert q.findtext('GamerId')==c.findtext('GamerId')
  original=int(a.findtext('./Dice/Die/Value'));final=None
 else:
  assert terminal and c.findtext('Used')=='0'
  tloc,tstep,t=terminal;a=q.find('RollInfos');assert a is not None
  assert a.findtext('./Dice/Die/Value')==t.findtext('./Dice/Die/Value')=='1'
  assert raw.numeric_projection(qstep.find('CellFrom'))==raw.numeric_projection(cstep.find('CellFrom'))
  assert raw.numeric_projection(qstep.find('CellTo'))==raw.numeric_projection(cstep.find('CellTo'))
  assert raw.numeric_projection(qstep.find('FinalCell'))==raw.numeric_projection(qstep.find('CellTo'))
  assert raw.numeric_projection(cstep.find('FinalCell'))==raw.numeric_projection(qstep.find('CellFrom'))
  assert t.findtext('Status')=='1' and t.findtext('NewRoll')=='0' and t.findtext('Outcome')=='0'
  original=final=1
 cases.append(dict(id=file[:-4]+'_'+kind,sourceFile=file,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),kind=kind,subjectId=int(subject),ownerId=owners[0],originalDie=original,finalDie=final,question=qloc,choice=cloc,terminal=terminal[0]if terminal else None,rawRecords=[f for f in frames if qloc['replayStep']<=f['replayStep']<=cloc['replayStep']]))
result=dict(scope='Independent raw identity facts only. Original public sources preserve treatment/odds uncertainty; fragment tests use an explicitly synthetic owner roster. FinalCell changes are not a complete accuracy or tactical contract.',cases=cases)
p=argparse.ArgumentParser();p.add_argument('--output',default='tests/fixtures/evidence/bb3-dice-identities.json');args=p.parse_args();Path(args.output).write_text(json.dumps(result,indent=2)+'\n');print([(c['id'],c['originalDie'],len(c['rawRecords']))for c in cases])
