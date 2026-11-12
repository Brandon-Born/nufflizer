"""Read-only offline source triage; output omits private paths and arbitrary text.

Pass --source FILE_OR_ZIP repeatedly. BBR members are read in memory, not
extracted or modified. Numeric step/message equivalence is not whole-replay
identity, independent match count, game-rule validation or policy admission.
"""
import argparse
import hashlib
import importlib.util
import json
import types
import zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('inventory-replay-actions.py'))
inv=importlib.util.module_from_spec(spec);spec.loader.exec_module(inv)
class Input:
    def __init__(self,data):self.data=data
    def stat(self):return types.SimpleNamespace(st_size=len(self.data))
    def read_bytes(self):return self.data

def rows(root):
    for number,outer in enumerate(root.findall('ReplayStep'),1):
        for child_index,child in enumerate(outer):
            if child.tag!='EventExecuteSequence':continue
            sequence=[]
            for step_index,result in enumerate(child.iter('StepResult')):
                step=inv.decode_message(result.findtext('./Step/MessageData'))
                messages=[inv.decode_message(m.findtext('MessageData')) for m in result.iter('StringMessage')]
                sequence.append((step,messages,step_index))
            yield number,child_index,outer,sequence

def fingerprint(root):
    numeric=[[number,child,[[s.tag,inv.numeric_projection(s),[[m.tag,inv.numeric_projection(m)] for m in ms]] for s,ms,_ in sequence]] for number,child,_,sequence in rows(root)]
    return hashlib.sha256(json.dumps(numeric,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def inspect(data,public,historical):
    digest=hashlib.sha256(data).hexdigest();root=inv.parse_xml(inv.decode_replay(Input(data),max_xml=32*1024*1024))
    current=None;question=None;actions={};failures=[]
    for number,outer in enumerate(root.findall('ReplayStep'),1):
        for child_index,child in enumerate(outer):
            if child.tag=='BoardState':current=child;continue
            if child.tag!='EventExecuteSequence':continue
            for step_index,r in enumerate(child.iter('StepResult')):
                step=inv.decode_message(r.findtext('./Step/MessageData'))
                messages=[inv.decode_message(m.findtext('MessageData')) for m in r.iter('StringMessage')]
                for message_index,m in enumerate(messages):
                    actor=step.findtext('PlayerId')
                    if m.tag=='ResultUseAction':actions[actor]=m.findtext('Action')
                    if m.tag=='QuestionTeamRerollUsage' and m.findtext('./RollInfos/RollType')=='1':question=(number,actor,current)
                    if m.tag!='ResultRoll' or any(m.findtext(k)!=v for k,v in {'RollType':'1','Status':'2','NewRoll':'1','Outcome':'0'}.items()):continue
                    q=question if question and question[1]==actor else None;board=q[2] if q else None
                    held=board.findtext('./Ball/IsHeld') if board is not None else None
                    carrier=board.findtext('./Ball/Carrier') if board is not None else None
                    failures.append(dict(replayStep=number,childIndex=child_index,stepIndex=step_index,messageIndex=message_index,
                                         actorId=int(actor) if actor is not None else None,stepType=int(step.findtext('StepType')),lastAction=int(actions[actor]) if actor in actions else None,
                                         questionStep=q[0] if q else None,used=[int(x.findtext('Used')) for x in messages if x.tag=='ResultTeamRerollUsage'],
                                         recordedCarrier=held=='1' and carrier==actor,knownNonCarrier=held=='0' or held=='1' and carrier is not None and carrier!=actor,
                                         endReason=int(outer.findtext('./EventEndTurn/Reason')) if outer.findtext('./EventEndTurn/Reason') is not None else None))
    key=fingerprint(root)
    return dict(sha256=digest,replayVersion=root.findtext('ReplayVersion'),encodedNumericFingerprint=key,
                publicNumericCounterpart=public.get(key),historicalSourceAuditHashMatch=digest in historical,
                failedCommittedRushEmissions=failures)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',action='append',required=True,type=Path)
    parser.add_argument('--public-dir',type=Path,default=Path('demo-replays'));parser.add_argument('--output',type=Path)
    args=parser.parse_args();public={}
    for path in sorted(args.public_dir.glob('*.bbr')):
        public[fingerprint(inv.parse_xml(inv.decode_replay(path,max_xml=32*1024*1024)))]=path.name
    historical=(Path('tests/fixtures/evidence')/'bb3-action-team-audit.json').read_text()
    results={};errors=0;oversized=0
    for path in args.source:
        try:
            if path.suffix.lower()=='.zip':
                with zipfile.ZipFile(path) as archive:
                    for entry in archive.infolist():
                        if not entry.filename.lower().endswith('.bbr'):continue
                        if entry.file_size>4_000_000:oversized+=1;continue
                        data=archive.read(entry);result=inspect(data,public,historical);results[result['sha256']]=result
            else:
                if path.stat().st_size>4_000_000:oversized+=1;continue
                result=inspect(path.read_bytes(),public,historical);results[result['sha256']]=result
        except (OSError,ValueError,zipfile.BadZipFile):errors+=1
    output=dict(scope='Read-only raw direct Status2/NewRoll1/Outcome0/RollType1 emissions; not deduplicated opportunities or accepted negative-policy chains. Private filenames, member paths and arbitrary text omitted. Fingerprint covers decoded numeric encoded steps/messages only, not board/header equivalence or independent matches.',
                offlineDecodedByteCap=32*1024*1024,rawInputByteCap=4_000_000,unreadableInputs=errors,oversizedInputs=oversized,sources=sorted(results.values(),key=lambda r:r['sha256']))
    rendered=json.dumps(output,indent=2)+'\n'
    if args.output:args.output.write_text(rendered)
    else:print(rendered,end='')
if __name__=='__main__':main()
