"""Independent raw committed Mighty Blow armor prefixes, not an admission oracle.

Uses only the stdlib inventory decoder. Selects observed uses and retains every
field of their typed damage step, use, armor and following result; no application
normalization, ownership, trait-continuity or probability code is imported.
"""
import argparse, hashlib, importlib.util, json
from fractions import Fraction
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py')
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
cases=[]
for path in sorted(Path('demo-replays').glob('*.bbr')):
 root=inv.parse_xml(inv.decode_replay(path))
 for rn,row in enumerate(root.findall('ReplayStep'),1):
  for ci,sequence in enumerate(row):
   if sequence.tag!='EventExecuteSequence':continue
   for si,step in enumerate(sequence.iter('StepResult')):
    damage=inv.decode_message(step.findtext('./Step/MessageData'))
    if damage.tag!='DamageStep' or damage.findtext('Source')!='1':continue
    messages=[inv.decode_message(m.findtext('MessageData')) for m in step.iter('StringMessage')]
    if len(messages)<2:continue
    use,armor=messages[:2]
    if use.tag!='ResultSkillUsage' or use.findtext('Skill')!='13' or use.findtext('Used')!='1':continue
    if armor.tag!='ResultRoll' or armor.findtext('RollType')!='10':continue
    modifier=armor.find('./Modifiers/Modifier')
    if modifier is None or modifier.findtext('Skill')!='13' or modifier.findtext('Value')!='1':continue
    cases.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),locator=dict(replayStep=rn,childIndex=ci,stepIndex=si),
      damage=inv.numeric_projection(damage),messages=[dict(messageIndex=i,tag=m.tag,payload=inv.numeric_projection(m)) for i,m in enumerate(messages)]))
# Rule: the +1 is used on either armor or injury for this damage, not both.
# Independently enumerate the fair ordinary initial injury following that spend.
counts=[0,0,0]
for a in range(1,7):
 for b in range(1,7):counts[0 if a+b<=7 else 1 if a+b<=9 else 2]+=1
math=[]
for tier,name in enumerate(['stunned','ko','casualty']):
 less=Fraction(sum(counts[:tier]),36);same=Fraction(counts[tier],36);more=Fraction(sum(counts[tier+1:]),36)
 math.append(dict(outcome=name,less=str(less),same=str(same),more=str(more),delta=str(more-less),weighted=str((more-less)*Fraction(3,2))))
assert sum(Fraction(c)*Fraction(r['delta']) for c,r in zip(counts,math))==0
result=dict(scope='Observed same-step Mighty Blow13 +1 armor prefixes. Raw evidence only; current traits, legal applicability, stage policy and final state must be qualified separately.',
 rule=dict(primaryPdfSha256='8598ecc9283f7e5f49a5566392ae5cbbec55c0a5f994b1eba4dec0414e2982e3',printedPage=80,pdfPage=81,available=1,spentOnArmor=1,remainingForThisInjury=0),ordinaryCounts=counts,math=math,cases=cases)
compact=lambda x:json.dumps(x,separators=(',',':'))
serialized='{\n'+',\n'.join(json.dumps(k)+':'+('['+'\n'+',\n'.join(compact(c) for c in v)+'\n]' if k=='cases' else compact(v)) for k,v in result.items())+'\n}\n'
target=Path('tests/fixtures/evidence/bb3-mighty-blow-armor.json')
p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:
 assert target.read_text()==serialized,'Mighty Blow armor evidence differs; regenerate and review raw source changes'
else:target.write_text(serialized)
print(dict(cases=len(cases),ordinaryCounts=counts))
