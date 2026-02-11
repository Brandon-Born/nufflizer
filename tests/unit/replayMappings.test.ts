import { describe, expect, it } from "vitest";

import {
  ACTION_CODE_MAP,
  END_TURN_REASON_MAP,
  ROLL_TYPE_MAP,
  STEP_TYPE_MAP,
  labelForCode
} from "@/domain/replay/mappings";

describe("replay mappings", () => {
  it("contains critical known mappings", () => {
    expect(ACTION_CODE_MAP[2]).toBe("blitz");
    expect(ACTION_CODE_MAP[6]).toBe("foul");
    expect(STEP_TYPE_MAP[1]).toBe("dodge");
    expect(ROLL_TYPE_MAP[3]).toBe("roll_family_3");
    expect(ROLL_TYPE_MAP[10]).toBe("armor_chain_check_2d6");
    expect(ROLL_TYPE_MAP[30]).toBe("special_event_30");
    expect(ROLL_TYPE_MAP[74]).toBe("bomb_scatter");
    expect(END_TURN_REASON_MAP[2]).toBe("turnover");
  });

  it("labels unknown codes predictably", () => {
    expect(labelForCode(ACTION_CODE_MAP, 999, "action")).toBe("action_unknown_999");
    expect(labelForCode(STEP_TYPE_MAP, undefined, "step")).toBe("step");
  });
});
