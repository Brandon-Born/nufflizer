"""Independent numeric reroll draw prefixes, not an admission/legality oracle.

Selects raw question/used/replacement and direct/skill/replacement shapes.
A later fallout suffix never selects a success or failure for this inventory.
"""
import argparse, hashlib, importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def n(node,key):
 try:return int(node.findtext(key))
 except (ValueError,TypeError,AttributeError):return None
def project(node):
 value=inv.numeric_projection(node)
 if isinstance(value,dict):
  for child in node:
   if not len(child) and not (child.text or '').strip() and child.tag in {'Modifiers'}:value[child.tag]=['']
 return value
def die(node):
 dice=node.findall('./Dice/Die') if node is not None else []
 return n(dice[0],'Value') if len(dice)==1 and n(dice[0],'DieType')==0 else None
def original(node):
 target=n(node,'Difficulty');face=die(node)
 return n(node,'RollType') in {1,2,4,7} and n(node,'Status')==1 and n(node,'NewRoll')==1 and n(node,'Outcome')==0 and target is not None and 2<=target<=6 and face is not None and 1<=face<target

def replacement(first,last):
 target=n(first,'Difficulty');face=die(last)
 return n(last,'RollType')==n(first,'RollType') and n(last,'Status')==2 and n(last,'NewRoll')==1 and face is not None and 1<=face<=6 and n(last,'Outcome')==int(face>=target) and n(last,'Difficulty')==target and n(last,'Requirement')==n(first,'Requirement') and project(last).get('Modifiers')==project(first).get('Modifiers')
def record(node,locator,step=None):return dict(node=node,locator=locator,step=step)
def receipt(r):return dict(locator=r['locator'],tag=r['node'].tag,payload=project(r['node']),step=project(r['step']) if r['step'] is not None else None)
files=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
 root=inv.parse_xml(inv.decode_replay(path));records=[];questions=0;emitted_matches=0
 for rn,outer in enumerate(root.findall('ReplayStep'),1):
  for ci,node in enumerate(outer):
   if node.tag=='EventExecuteSequence':
    for si,entry in enumerate(node.iter('StepResult')):
     step=inv.decode_message(entry.findtext('./Step/MessageData'));where=dict(replayStep=rn,childIndex=ci,stepIndex=si)
     records.append(record(step,where,step));messages=[]
     for mi,msg in enumerate(entry.iter('StringMessage')):
      body=inv.decode_message(msg.findtext('MessageData'));r=record(body,dict(where,messageIndex=mi),step);records.append(r)
      if body.tag=='QuestionTeamRerollUsage':
       questions+=1;info=body.find('RollInfos')
       if info is not None and n(info,'RollType') in {1,2,4,7} and any(m.tag=='ResultRoll' and n(m,'RollType')==n(info,'RollType') for m in messages):emitted_matches+=1
      messages.append(body)
   elif node.tag.startswith(('Event','Question','Result')):records.append(record(node,dict(replayStep=rn,childIndex=ci)))
 cases=[]
 for i,r in enumerate(records):
  node=r['node'];step=r['step']
  if step is None:continue
  if node.tag=='QuestionTeamRerollUsage':
   first=node.find('RollInfos')
   if not original(first) or n(node,'CanUseTeamReroll')!=1:continue
   j=i+1
   if j<len(records) and records[j]['node'].tag=='PlayerStep':j+=1
   if j+1>=len(records):continue
   choice,last=records[j],records[j+1]
   if choice['node'].tag!='ResultTeamRerollUsage' or n(choice['node'],'Used')!=1 or n(choice['node'],'GamerId')!=n(node,'GamerId'):continue
   if last['node'].tag!='ResultRoll' or not replacement(first,last['node']):continue
   if any(n(x['step'],'PlayerId')!=n(step,'PlayerId') or n(x['step'],'TargetId')!=n(step,'TargetId') or n(x['step'],'StepType')!=n(step,'StepType') for x in [choice,last]):continue
   cases.append(dict(kind='team',initial=receipt(r),initialRoll=project(first),choice=receipt(choice),replacement=receipt(last)))
  elif node.tag=='ResultRoll' and original(node) and i+2<len(records):
   choice,last=records[i+1],records[i+2];rule={2:7,4:61,7:6}.get(n(node,'RollType'))
   if not rule or choice['node'].tag!='ResultSkillUsage' or n(choice['node'],'Skill')!=rule or n(choice['node'],'Used')!=1 or n(choice['node'],'PlayerId')!=n(step,'PlayerId'):continue
   if last['node'].tag!='ResultRoll' or not replacement(node,last['node']):continue
   if choice['step'] is not step or last['step'] is not step:continue
   cases.append(dict(kind='skill',initial=receipt(r),initialRoll=project(node),choice=receipt(choice),replacement=receipt(last)))
 files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),questionCount=questions,emittedNumericPrefixes=emitted_matches,cases=cases))
result=dict(scope='Raw candidate prefixes and original/replacement dice facts. Fixed effective targets and recorded used choices are preserved; current ownership, source-specific modifiers/eligibility and application admission need separate evidence. No future success/fallout selection.',files=files)
compact=lambda x:json.dumps(x,separators=(',',':'))
text='{\n"scope":'+compact(result['scope'])+',\n"files":[\n'+',\n'.join(compact(f) for f in files)+'\n]\n}\n'
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args();target=Path('tests/fixtures/evidence/bb3-numeric-reroll-scores.json')
if args.check:assert target.read_text()==text,'Numeric reroll evidence differs; regenerate and review'
else:target.write_text(text)
print(dict(files=len(files),questions=sum(f['questionCount'] for f in files),emittedNumericPrefixes=sum(f['emittedNumericPrefixes'] for f in files),rawTeamCandidates=sum(c['kind']=='team' for f in files for c in f['cases']),rawSkillCandidates=sum(c['kind']=='skill' for f in files for c in f['cases'])))
