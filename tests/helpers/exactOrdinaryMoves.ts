// Add explicit synthetic eligibility only to the named players in the
// source-derived fixture. Keeping all other fields preserves its reroll chain.
export function withExactOrdinaryMoves(
  xml: string,
  candidates: readonly string[],
  available: readonly string[]
) {
  return xml.replace(
    /<PlayerState><Id>(\d+)<\/Id>([^]*?)<\/PlayerState>/g,
    (record, id: string, body: string) => {
      if (!candidates.includes(id)) return record;
      const fields = body.replace(
        /<(CanAct|MovePoint|Status|Situation)>[^<]*<\/\1>/g,
        ""
      );
      return `<PlayerState><Id>${id}</Id>${fields}<Status>0</Status><Situation>0</Situation><CanAct>${Number(available.includes(id))}</CanAct><MovePoint>4</MovePoint><Data><Id>${id}</Id><InnateSkills/><AcquiredSkills/></Data><Effects/></PlayerState>`;
    }
  );
}
