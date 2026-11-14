"""Recorded activation budgets, selected before any executed step or result."""
import argparse, collections, hashlib, importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/inventory-replay-actions.py');inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
def number(node,key):
    try:return int(node.findtext(key))
    except (ValueError,TypeError,AttributeError):return None
def project(node):
    p=inv.numeric_projection(node)
    if isinstance(p,dict):
        for c in node:
            if not len(c) and not (c.text or '').strip():p[c.tag]=['']
    return p
files=[];totals=collections.Counter()
for path in sorted(Path('demo-replays').glob('*.bbr')):
    root=inv.parse_xml(inv.decode_replay(path));rows=[];counts=collections.Counter()
    for rn,frame in enumerate(root.findall('ReplayStep'),1):
        for ci,child in enumerate(frame):
            if child.tag!='EventExecuteSequence':continue
            for si,entry in enumerate(child.iter('StepResult')):
                step=inv.decode_message(entry.findtext('./Step/MessageData'))
                for mi,encoded in enumerate(entry.iter('StringMessage')):
                    body=inv.decode_message(encoded.findtext('MessageData'))
                    if body.tag!='ResultUseAction':continue
                    code=number(body,'Action');counts[code]+=1;totals[code]+=1
                    if code in [3,4,5,6]:rows.append(dict(locator=dict(replayStep=rn,childIndex=ci,stepIndex=si,messageIndex=mi),stepTag=step.tag,step=project(step),message=project(body)))
    files.append(dict(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),allActionCounts={str(k):v for k,v in sorted(counts.items(),key=lambda x:str(x[0]))},budgetDeclarations=rows))
audit_path=Path('tests/fixtures/evidence/bb3-semantic-contract-audit.json');audit=json.loads(audit_path.read_text());witnesses=[]
for witness in audit['actionWitnesses']:
    if witness['code'] not in [3,4,5,6]:continue
    path=Path('tests/fixtures/evidence')/witness['fixture'];f=json.loads(path.read_text());case=next(c for c in f['cases'] if c['id']==witness['caseId'])
    witnesses.append(dict(witness=witness,fixtureSha256=hashlib.sha256(path.read_bytes()).hexdigest(),records=[r for r in case['rawRecords'] if any(m.get('ResultUseAction',{}).get('Action')==[str(witness['code'])] for m in r['messages'])]))
returns_path=Path('tests/fixtures/evidence/bb3-treatment-returns.json');returns=json.loads(returns_path.read_text());anchor=next(c for c in returns['cases'] if c['file']=='demo1.bbr' and c['subjectId']==37)
result=dict(scope='All public ResultUseAction emissions are counted; codes3-6 retain numeric declarations without selecting on future execution, dice, return tracking or application admission. Header cells are parameters, not evidence of movement. Existing paired UI witnesses and raw treatment-return anchor are separately hashed.',files=files,actionWitnessAuditSha256=hashlib.sha256(audit_path.read_bytes()).hexdigest(),pairedWitnesses=witnesses,treatmentAnchor=dict(fixtureSha256=hashlib.sha256(returns_path.read_bytes()).hexdigest(),file=anchor['file'],sha256=anchor['sha256'],subjectId=anchor['subjectId'],declaration=anchor['declaration']))
text=json.dumps(result,separators=(',',':'))+'\n';target=Path('tests/fixtures/evidence/bb3-action-budgets.json');p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');args=p.parse_args()
if args.check:assert target.read_text()==text,'Raw action-budget evidence differs; inspect hashes, declarations and witnesses.'
else:target.write_text(text)
print(json.dumps(dict(files=len(files),allActionCounts={str(k):v for k,v in sorted(totals.items(),key=lambda x:str(x[0]))},budgetDeclarations=sum(len(f['budgetDeclarations']) for f in files),witnesses=len(witnesses))))
