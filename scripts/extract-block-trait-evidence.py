"""Independent numeric source witnesses for continued intrinsic trait instances.
No application imports. Initial complete lists, intervening Data refreshes and
current roster/effect/transformation observations are retained separately.
"""
import argparse,hashlib,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py');inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def codes(node,key,item):
 n=node.find(key)
 return None if n is None else [int(x.text) for x in n.findall(item)]
def traits(node):
 return {k:int(node.findtext(v)) if node.find(v) is not None else None for k,v in [('dataPlayerId','Id'),('playerTypeId','IdPlayerTypes')]}|dict(innateSkills=codes(node,'InnateSkills','InnateSkillsItem'),acquiredSkills=codes(node,'AcquiredSkills','AcquiredSkillsItem'))
def empty(node):return node is not None and not len(node) and not (node.text or '').strip()
selections=[('demo5.bbr','2','46',True),('demo5.bbr','5','44',True),('demo10.bbr','1','39',True),('demo6.bbr','10','45',False),('demo8.bbr','2','47',False)]
cases=[]
for file,actor,target,modeled in selections:
 path=Path('demo-replays')/file;root=inv.parse_xml(inv.decode_replay(path));initial=root.find('./NotificationGameJoined/InitialBoardState');ids=[actor,target]
 seeds={}
 for ti,team in enumerate(initial.findall('./ListTeams/TeamState')):
  assert team.findtext('./Data/TeamId')==str(ti)
  for p in team.findall('./ListPitchPlayers/PlayerState'):
   if p.findtext('Id') in ids:
    t=traits(p.find('Data'));assert p.findtext('./Data/TeamId')==str(ti);assert t['dataPlayerId']==int(p.findtext('Id')) and t['innateSkills'] is not None and t['acquiredSkills'] is not None
    seeds[p.findtext('Id')]=dict(teamId=str(ti),prayersKnownEmpty=empty(team.find('ActivePrayers')),traits=t)
 assert len(seeds)==2
 assert all(empty(t.find('ActivePrayers')) for t in initial.findall('./ListTeams/TeamState'))
 refresh=[];last_board=None;prefix=[];found=None
 for number,outer in enumerate(root.findall('ReplayStep'),1):
  for ci,child in enumerate(outer):
   if child.tag=='BoardState':
    assert empty(child.find('Effects'))
    views=[]
    for ti,team in enumerate(child.findall('./ListTeams/TeamState')):
     for p in team.findall('./ListPitchPlayers/PlayerState'):
      if p.findtext('Id') not in ids:continue
      data=p.find('Data');pid=p.findtext('Id')
      view=dict(playerId=pid,rosterIndex=ti,dataPresent=data is not None,traits=traits(data) if data is not None else None,effectsKnownEmpty=empty(p.find('Effects')),transformationsKnownAbsent=empty(team.find('TransformedPlayers')),teamEffectsKnownEmpty=empty(team.find('Effects')),prayersKnownEmpty=empty(team.find('ActivePrayers')) if team.find('ActivePrayers') is not None else None)
      if data is not None:refresh.append(dict(replayStep=number,childIndex=ci,**view))
      views.append(view)
    last_board=dict(replayStep=number,childIndex=ci,players=views);continue
   if child.tag!='EventExecuteSequence':prefix.append(child.tag);continue
   for si,result in enumerate(child.iter('StepResult')):
    step=inv.decode_message(result.findtext('./Step/MessageData'));prefix.append(step.tag)
    for mi,sm in enumerate(result.iter('StringMessage')):
     message=inv.decode_message(sm.findtext('MessageData'))
     if message.tag=='QuestionBlockDice' and step.findtext('PlayerId')==actor and step.findtext('TargetId')==target:
      assert last_board and all(p['effectsKnownEmpty'] and p['transformationsKnownAbsent'] and p['teamEffectsKnownEmpty'] and p['prayersKnownEmpty'] is not False for p in last_board['players'])
      found=dict(replayStep=number,childIndex=ci,stepIndex=si,messageIndex=mi,step=inv.numeric_projection(step),pool=inv.numeric_projection(message));break
     prefix.append(message.tag)
    if found:break
   if found:break
  if found:break
 assert found
 cases.append(dict(id=file[:-4]+'_'+actor+'_'+target,sourceFile=file,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),attackerId=actor,defenderId=target,modelSupported=modeled,seeds=seeds,refreshes=refresh,current=last_board,prefixTags=prefix,pool=found))
output=dict(scope='Source witnesses, not universal omitted-field defaults or full-match skill/state certification. Continuity uses the explicitly supported non-mutating transition contract; current observations and initial complete seeds remain distinct.',cases=cases)
path=Path('tests/fixtures/evidence/bb3-block-traits.json');rendered=json.dumps(output,indent=2)+'\n';p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:assert path.read_text()==rendered,'Source evidence changed; review before replacing.'
else:path.write_text(rendered)
print([(c['id'],c['pool']['replayStep'],c['seeds']) for c in cases])
