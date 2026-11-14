import { encodedMessage } from "./replay";
import { skillBlockXml } from "./skillBlock";

// A synthetic continuity prefix with complete intrinsic seeds. Physical state
// comes from the following checkpoint, never from these earlier skill lists.
export function mentalNotificationXml(
  tag: "ResultAddPlayerEffect" | "ResultEndPlayerEffect",
  o: {
    holder?: number;
    face?: number;
    outcome?: number;
    missingZone?: boolean;
    suffix?: string;
  } = {}
) {
  const holder = o.holder ?? 99;
  let xml = skillBlockXml([], [], [o.face ?? 4], [o.outcome ?? 6]);
  const third =
    "<PlayerState><Id>99</Id><Cell><X>10</X><Y>10</Y></Cell><Effects/><Data><Id>99</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills/><AcquiredSkills/></Data></PlayerState>";
  xml = xml.replace(
    "<PlayerState><Id>42</Id>",
    third + "<PlayerState><Id>42</Id>"
  );
  const board = xml.match(
    /<InitialBoardState>([\s\S]*?)<\/InitialBoardState>/
  )![1]!;
  let current = board.replace(/<Data><Id>[\s\S]*?<\/Data>/g, "");
  if (o.missingZone)
    current = current.replaceAll("<TackleZone>1</TackleZone>", "");
  const header = `<PlayerStep><PlayerId>${holder}</PlayerId><TargetId>-1</TargetId><IsEvaluation>0</IsEvaluation><StepType>0</StepType><CellFrom><X>${holder === 99 ? 10 : holder === 42 ? 5 : 6}</X><Y>${holder === 99 ? 10 : 5}</Y></CellFrom><CellTo><X>${holder === 99 ? 10 : holder === 42 ? 5 : 6}</X><Y>${holder === 99 ? 10 : 5}</Y></CellTo><Skill>0</Skill><State>3</State></PlayerStep>`;
  const message = `<${tag}><PlayerId>${holder}</PlayerId><Effect><EffectId>44</EffectId><ProviderType>4</ProviderType><ProviderId>51</ProviderId><Durations><DurationsItem>6</DurationsItem><DurationsItem>1</DurationsItem></Durations><CharacModifiers/><AdditionalSkills/></Effect></${tag}>`;
  const sequence = `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(header)}</MessageData></Step><Results><StringMessage><MessageData>${encodedMessage(message)}</MessageData></StringMessage></Results></StepResult></Sequence></EventExecuteSequence>`;
  return xml
    .replace(
      "</InitialBoardState></NotificationGameJoined>",
      "</InitialBoardState></NotificationGameJoined><ReplayStep>" +
        sequence +
        "<BoardState>" +
        current +
        "</BoardState></ReplayStep>"
    )
    .replace("</Replay>", (o.suffix ?? "") + "</Replay>");
}
