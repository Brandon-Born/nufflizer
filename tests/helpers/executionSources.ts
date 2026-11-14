import { encodedMessage } from "./replay";
export function appendExecutionProbe(
  xml: string,
  subjectId: number,
  applied = 0,
  evaluation = 0
) {
  const cell = "<X>5</X><Y>5</Y>";
  const header = `<DamageStep><Applied>${applied}</Applied><Source>9</Source><PlayerId>${subjectId}</PlayerId><TargetId>${subjectId}</TargetId><IsEvaluation>${evaluation}</IsEvaluation><StepType>2</StepType><Skill>0</Skill><State>2</State><CellFrom>${cell}</CellFrom><CellTo>${cell}</CellTo></DamageStep>`;
  const roll =
    "<ResultRoll><Status>1</Status><Requirement>8</Requirement><Difficulty>8</Difficulty><Modifiers/><Dice><Die><DieType>0</DieType><Value>3</Value></Die><Die><DieType>0</DieType><Value>5</Value></Die></Dice><RollType>10</RollType><Outcome>1</Outcome><NewRoll>1</NewRoll></ResultRoll>";
  return xml.replace(
    "</Replay>",
    `<ReplayStep><EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(header)}</MessageData></Step><Results><StringMessage><MessageData>${encodedMessage(roll)}</MessageData></StringMessage></Results></StepResult></Sequence></EventExecuteSequence></ReplayStep></Replay>`
  );
}
