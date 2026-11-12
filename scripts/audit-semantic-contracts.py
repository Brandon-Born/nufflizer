"""Independent BB3 mapping audit: enum names, paired UI identity, raw families.

Uses stdlib and the independent numeric XML decoder, never runtime maps/scoring.
Field counts are emissions including copies, not independent opportunities.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re

spec=importlib.util.spec_from_file_location('raw','scripts/inventory-replay-actions.py')
raw=importlib.util.module_from_spec(spec);spec.loader.exec_module(raw)
base=Path('tests/fixtures/evidence')
enum_path=base/'bb3-installed-enums.json';enums=json.loads(enum_path.read_text())
def snake(name):
    return re.sub(r'([a-z0-9])([A-Z])',r'\1_\2',re.sub(r'(.)([A-Z][a-z]+)',r'\1_\2',name)).lower()
def names(name, aliases=None):
    table=next(e for e in enums['enums'] if e['name']==name)
    return {str(e['value']):(aliases or {}).get(e['value'],snake(e['member'])) for e in table['entries']}
roll_names=names('EBB3NetGameplayRollType',{1:'rush',6:'interfere',13:'ko_recovery',45:'projectile_vomit'})
step_names=names('EBB3NetGameplayStepType')
end_names=names('EBB3NetGameplayTurnoverReason',{1:'manual_end',2:'turnover'})
# ResultUseAction is independently witnessed. SequenceType7 is deliberately
# absent: UI-034 declares Action4 before a typed ThrowTeamMateStep13.
actions={'1':'move','2':'block','3':'blitz','4':'pass','5':'handoff','6':'foul'}
references={
 1:[('001','UI-008'),('001','UI-009')],2:[('001','UI-006'),('001','UI-008')],
 4:[('001','UI-002'),('002','UI-022')],5:[('001','UI-016')],6:[('003','UI-028'),('015','UI-069')],
 7:[('001','UI-014'),('011','UI-093'),('025','UI-097')],8:[('001','UI-016')],
 10:[('001','UI-009'),('001','UI-015')],11:[('001','UI-015'),('002','UI-025')],
 12:[('004','UI-033'),('004','UI-035')],13:[('007','UI-040')],15:[('016','UI-047'),('008','UI-087')],
 21:[('013','UI-045')],25:[('001','UI-002'),('001','UI-016')],26:[('003','UI-031'),('004','UI-034')],
 29:[('024','UI-055'),('024','UI-056')],30:[('007','UI-039'),('027','UI-053')],31:[('004','UI-032')],
 33:[('002','UI-019'),('003','UI-026')],34:[('001','UI-001'),('001','UI-007')],
 36:[('002','UI-020'),('002','UI-021')],37:[('002','UI-017'),('016','UI-099')],
 41:[('004','UI-034'),('007','UI-041')],42:[('007','UI-041')],43:[('004','UI-034')],
 45:[('007','UI-037')],46:[('027','UI-054'),('001','UI-068')],48:[('013','UI-044'),('018','UI-089')],
 67:[('027','UI-053'),('008','UI-087')],71:[('001','UI-007'),('002','UI-020')],73:[('003','UI-027')],
 74:[('027','UI-052')],87:[('027','UI-051')],88:[('016','UI-050')],89:[('016','UI-049')],
 97:[('016','UI-046'),('016','UI-048')]
}
pairs=[('QuestionKORecovery',11),('EventRoll',13),('QuestionBlockDice',3),('ResultBlockRoll',3),('ResultCasualtyRoll',12),('ResultInjuryRoll',11)]+[('ResultRoll',n) for n in [1,2,4,5,6,7,8,9,10,15,21,25,26,29,30,31,33,34,36,37,41,42,43,45,46,48,67,70,71,73,74,87,88,89,97]]
blocks=[('001','UI-003'),('005','UI-059'),('002','UI-020')]
cache={}
def case(source,identifier):
    path=base/f'bb3-ui-playback-{source}.json'
    if source not in cache:cache[source]=json.loads(path.read_text())
    data=cache[source]
    assert data['source']['replayVersion']=='1-4-0-0'
    return path,data,next(c for c in data['cases'] if c['id']==identifier)
def leaf(value):
    return value[0] if isinstance(value,list) and value else value

def matching(c,tag,code):
    found=[]
    for record in c.get('rawRecords',[]):
        for mi,message in enumerate(record['messages']):
            if tag not in message:continue
            payload=message[tag]
            nested=leaf(payload.get('RollInfos')) if tag=='QuestionKORecovery' else payload
            value=leaf(nested.get('RollType')) if isinstance(nested,dict) else None
            if (tag in ['QuestionBlockDice','ResultBlockRoll'] and code==3) or value==str(code):
                found.append(dict(sequence=record['sequence'],stepIndex=record['stepIndex'],messageIndex=mi))
    for record in c.get('eventRecords',[]):
        if tag in record['projection'] and leaf(record['projection'][tag].get('RollType'))==str(code):
            found.append(dict(replayStep=record['replayStep'],childIndex=record['eventIndex']))
    return found
action_witnesses=[]
for code,source,identifier in [(1,'001','UI-006'),(2,'025','UI-095'),(3,'003','UI-030'),(4,'001','UI-016'),(5,'001','UI-014'),(6,'001','UI-015')]:
    path,data,c=case(source,identifier)
    locators=[]
    for record in c['rawRecords']:
        for mi,message in enumerate(record['messages']):
            if leaf(message.get('ResultUseAction',{}).get('Action'))==str(code):
                locators.append(dict(sequence=record['sequence'],stepIndex=record['stepIndex'],messageIndex=mi))
    assert locators,(code,identifier,'No declaration witness')
    action_witnesses.append(dict(code=code,label=actions[str(code)],fixture=path.name,source=source,caseId=identifier,
                                sourceSha256=data['source']['sha256'],uiLabels=[e['label'] for e in c['ui']['events']],locators=locators))

contracts=[]
for tag,code in pairs:
    refs=blocks if code==3 else [('002','UI-025')] if tag=='QuestionKORecovery' else references.get(code,[])
    witnesses=[]
    for source,identifier in refs:
        path,data,c=case(source,identifier)
        locators=matching(c,tag,code)
        if locators:witnesses.append(dict(fixture=path.name,sourceSha256=data['source']['sha256'],caseId=identifier,
                                         uiLabels=[e['label'] for e in c['ui']['events']],locators=locators))
    assert witnesses or code in [9,70], (tag,code,'No paired source witness')
    label={'QuestionKORecovery':'injury','QuestionBlockDice':'block_pool','ResultBlockRoll':'selected_block_die'}.get(tag,roll_names[str(code)])
    contracts.append(dict(sourceTag=tag,rollType=code,label=label,identityEvidence='ui_paired' if witnesses else 'compiled_only',
                          knowledgeStatus='known' if witnesses else 'ambiguous',witnesses=witnesses))

# Semantic definitions and beneficiary conventions apply only to the admitted
# payload/policy variants. Unsupported named families retain identity evidence.
supported=[
 ('ResultRoll',1,'Rush: extra movement check','roller team; success is favorable',44,'verifiedNumericChecks.test.ts'),
 ('ResultRoll',2,'Dodge: leave a marked square','roller team; success is favorable',45,'verifiedNumericChecks.test.ts'),
 ('ResultRoll',4,'Pick up: secure the ground ball','roller team; success is favorable',46,'verifiedNumericChecks.test.ts'),
 ('ResultRoll',7,'Catch: recipient catches the ball','recipient/roller team, separate from passer/hand-off initiator',51,'verifiedNumericChecks.test.ts'),
 ('ResultRoll',10,'Armor holds: damage subject avoids a break','damage subject team; invert the raw break success',29,'blockAndArmorEvidence.test.ts'),
 ('ResultRoll',46,'Regeneration after casualty','affected subject team; recovery success is favorable',86,'blockAndArmorEvidence.test.ts'),
 ('EventRoll',13,'Direct KO recovery, including verified Kegs +1','affected subject team, explicit ID must match unique roster',66,'koRecovery.test.ts'),
 ('QuestionBlockDice',3,'Fresh categorical raw block pool','step attacker team; chooser and defender are separate roles',57,'blockAndArmorEvidence.test.ts')]
policies=[]
for tag,code,definition,roles,page,test in supported:
    policies.append(dict(sourceTag=tag,rollType=code,definition=definition,beneficiaryConvention=roles,
                         replayVersion='1-4-0-0',rule='BB2020',printedRulePage=page,
                         contractDoc='REPORT_CONTRACT.md',positiveAndNegativeTest='tests/unit/'+test))

# Bind every declared identity to its explicit claim and limits. A named
# unsupported family is not a numeric success or favorable-perspective model.
for contract in contracts:
    policy=next((p for p in policies if p['sourceTag']==contract['sourceTag'] and p['rollType']==contract['rollType']),None)
    contract['semanticDefinition']=policy['definition'] if policy else ('Observed '+contract['label'].replace('_',' ')+' identity; no odds or applied consequence policy') if contract['witnesses'] else 'Compiled name only; replay dice roles and behavior unresolved'
    contract['payloadVariants']=[dict(fixture=w['fixture'],caseId=w['caseId'],locators=w['locators']) for w in contract['witnesses']]
    contract['replayVersion']='1-4-0-0'
    contract['ruleScope']='BB2020 conditional scoped policy in REPORT_CONTRACT.md' if policy else 'Identity only; no probability or game-rule policy is claimed'
    contract['beneficiaryConvention']=policy['beneficiaryConvention'] if policy else 'No favorable beneficiary inferred; raw actor/subject/controller fields remain distinct and unsupported policy stays unscored'
    contract['positiveAndNegativeEvidence']='tests/unit/semanticContractAudit.test.ts; '+policy['positiveAndNegativeTest'] if policy else 'Paired UI/numeric witness above, or explicit unresolved compiled name; generic favorable D6 must stay unscored in semanticContractAudit.test.ts'

# One row per raw dice-bearing parent/family, including no-threshold outcomes.
# Typed block fields are linked by their verified source namespace. Other absent
# RollType fields remain unscoped, never assigned an invented numeric family.
def fields(node,path=(),inherited=None):
    text=node.findtext('RollType')
    code=int(text) if text is not None and re.fullmatch(r'-?\d+',text) else inherited
    groups={}
    for child in node:groups.setdefault(child.tag,[]).append(child)
    for tag,children in groups.items():
        if tag=='Die':yield path+(tag,),code;continue
        for i,child in enumerate(children):
            here=path+(tag,)+((i,) if len(children)>1 else ())
            if tag=='Dice':yield here,code
            else:yield from fields(child,here,code)
known={(c['sourceTag'],c['rollType']):c for c in contracts}
files=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=raw.parse_xml(raw.decode_replay(path));counts=Counter();action_counts=Counter();step_counts=Counter();snapshot_count=0
    for outer in root.findall('ReplayStep'):
        for child in outer:
            if child.tag=='BoardState':snapshot_count+=sum(1 for _ in fields(child));continue
            messages=[child]
            if child.tag=='EventExecuteSequence':
                messages=[]
                for result in child.iter('StepResult'):
                    step=raw.decode_message(result.findtext('./Step/MessageData'));messages.append(step)
                    step_counts[step.tag+'|'+step.findtext('StepType','?')]+=1
                    messages.extend(raw.decode_message(s.findtext('MessageData')) for s in result.iter('StringMessage'))
            for message in messages:
                if message.tag=='ResultUseAction':action_counts[message.findtext('Action','?')]+=1
                for field,code in fields(message):
                    if code is None and message.tag in ['QuestionBlockDice','ResultBlockRoll']:code=3
                    counts[(message.tag,code)]+=1
    final=root.find('./EndGame/BoardState')
    if final is not None:snapshot_count+=sum(1 for _ in fields(final))
    rows=[]
    for (tag,code),count in sorted(counts.items(),key=lambda t:(t[0][0],str(t[0][1]))):
        contract=known.get((tag,code));compiled=str(code) in roll_names
        status=contract['knowledgeStatus'] if contract else 'compiled_only' if compiled else 'unscoped'
        rows.append(dict(sourceTag=tag,rollType=code,fieldCount=count,identityStatus=status,directPolicyScope='qualified_policy' if any(p['sourceTag']==tag and p['rollType']==code for p in policies) else 'linked_or_unmodeled'))
    files.append(dict(file=path.name,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                      families=rows,eventDiceFields=sum(counts.values()),snapshotDiceFields=snapshot_count,
                      stepFamilies=dict(sorted(step_counts.items())),declarationCodes=dict(sorted(action_counts.items()))))
output=dict(scope='Mapping/namespace audit, not full rule/choice/context support. Raw field counts include copies and placeholders; identity confidence is separate from scoring coverage.',
            version='1-4-0-0',enumSnapshotSha256=hashlib.sha256(enum_path.read_bytes()).hexdigest(),
            enumImageSha256=enums['source']['sha256'],rollNames=roll_names,stepNames=step_names,endReasonNames=end_names,
            declaredActions=actions,actionWitnesses=action_witnesses,contracts=contracts,scoredPolicyScope=policies,files=files)
rendered=json.dumps(output,indent=2)+'\n';p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
path=base/'bb3-semantic-contract-audit.json'
if args.check:assert path.read_text()==rendered,'Audit inputs changed; review before replacing.'
else:path.write_text(rendered)
print(dict(contracts=len(contracts),policies=len(policies),files=len(files),eventDiceFields=sum(f['eventDiceFields'] for f in files),snapshotDiceFields=sum(f['snapshotDiceFields'] for f in files)))
