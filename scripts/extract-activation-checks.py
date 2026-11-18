"""Read recorded Bone Head, Really Stupid, and Animal Savagery from the BBRs."""

from fractions import Fraction
import importlib.util
import json
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "inventory", Path(__file__).with_name("inventory-replay-actions.py")
)
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


def observed_roster(board):
    return {
        p.findtext("Id"): team.findtext("./Data/TeamId") or str(side)
        for side, team in enumerate(board.findall("./ListTeams/TeamState"))
        for p in team.findall("./ListPitchPlayers/PlayerState")
    }

def decoded_step(step):
    header = inventory.decode_message(step.findtext("./Step/MessageData"))
    messages = [
        inventory.decode_message(msg.findtext("MessageData"))
        for msg in step.iter("StringMessage")
    ]
    return header, messages


def animal_continuation(frames, step, child, player, team, following):
    # The two paths use different final frames. Confirm the recorded board and
    # next declaration directly from the XML, without consuming report labels.
    frame = frames[step - 1]
    before = frames[step - 2].find("BoardState")
    victim = None
    after_step = step
    if following.tag == "QuestionAnimalSavagery":
        before = frame.find("BoardState")
        after_step += 1
        frame = frames[after_step - 1]
        _, selection = decoded_step(next(frame[child].iter("StepResult")))
        assert selection[0].tag == "ResultAnimalSavagery"
        victim = selection[0].findtext("VictimId")
        assert victim in [item.text for item in following.findall("VictimsIds/VictimsIdsItem")]
    else:
        assert following.tag == "ResultAddPlayerEffect"
        assert following.findtext("PlayerId") == player
        assert following.findtext("Effect/ProviderId") == "84"
    after = frame.find("BoardState")
    wait_slot = next(i for i, e in enumerate(frame) if e.tag == "EventRulesEngineStandBy")
    assert frame[wait_slot].findtext("ActiveGamer") == team
    assert frame[wait_slot + 1] is after
    assert after.findtext("IsStable") == "1"
    rosters = []
    for board in (before, after):
        assert board.findtext("ActivePlayer") == player
        assert board.findtext("ActiveGamer") == team
        assert board.findtext("ActiveTeam") == team
        roster = board.findall("./ListTeams/TeamState")[int(team)]
        assert roster.findtext("Data/TeamId") == team
        rosters.append(roster)
    turn = rosters[0].findtext("GameTurn")
    assert rosters[1].findtext("GameTurn") == turn

    def at(roster, player_id):
        return next(p for p in roster.findall("ListPitchPlayers/PlayerState")
                    if p.findtext("Id") == player_id)

    def flag(p):
        f = p.findtext("CanAct")
        return None if f is None else f == "1"

    def int_or_none(p, key):
        x = p.findtext(key)
        return None if x is None else int(x)

    next_frame = frames[after_step]
    i, sequence = next((i, e) for i, e in enumerate(next_frame)
                       if e.tag == "EventExecuteSequence")
    header, messages = decoded_step(next(sequence.iter("StepResult")))
    assert messages[0].tag == "ResultUseAction"
    following_player = header.findtext("PlayerId")
    assert following_player != player and flag(at(rosters[1], following_player))
    victim_state = None
    if victim is not None:
        earlier, later = (at(r, victim) for r in rosters)
        point = [int(later.findtext(f"Cell/{key}")) for key in ("X", "Y")]
        assert point == [-1, -1] or (0 <= point[0] <= 25 and 0 <= point[1] <= 14)
        victim_state = {
            "beforeRecordedCanAct": flag(earlier),
            "afterRecordedCanAct": flag(later),
            "afterPitchLocation": "off_pitch" if point == [-1, -1] else "on_pitch",
            "afterStatusCode": int_or_none(later, "Status"),
            "afterSituationCode": int_or_none(later, "Situation"),
        }
    return {
        "standBy": [after_step, wait_slot],
        "following": [after_step + 1, i, 0, 0],
        "followingPlayerId": following_player,
        "teamTurn": int(turn),
        "actorRecordedCanAct": flag(at(rosters[1], player)),
        "victim": victim_state,
    }


for path in sorted(Path("demo-replays").glob("*.bbr")):
    root = inventory.parse_xml(inventory.decode_replay(path))
    roster = observed_roster(root.find(".//InitialBoardState"))
    rows = []
    questions = {}
    frames = root.findall("ReplayStep")
    for replay_step, frame in enumerate(frames, 1):
        for child_index, sequence in enumerate(frame):
            if sequence.tag == "BoardState":
                roster.update(observed_roster(sequence))
            if sequence.tag != "EventExecuteSequence":
                continue
            for step_index, step in enumerate(sequence.iter("StepResult")):
                header, messages = decoded_step(step)
                for mi, msg in enumerate(messages):
                    roll = msg.find("RollInfos") if msg.tag == "QuestionTeamRerollUsage" else msg
                    if roll is None or roll.findtext("RollType") not in ("33", "34", "36"):
                        continue
                    roll_type = int(roll.findtext("RollType"))
                    player = header.findtext("PlayerId")
                    dice = roll.findall("./Dice/Die")
                    assert len(dice) == 1 and dice[0].findtext("DieType") == "0"
                    face = int(dice[0].findtext("Value"))
                    target = int(roll.findtext("Difficulty"))
                    outcome = int(roll.findtext("Outcome"))
                    assert outcome == (face >= target)
                    if roll_type == 36:
                        assert roll.findtext("Requirement") == "4"
                        modifier = roll.find("Modifiers/Modifier")
                        if target == 2:
                            assert modifier is not None
                            assert [modifier.findtext(field) for field in
                                    ("PlayerId", "ModifierType", "Value", "Skill", "Effect")] == [
                                        "-1", "18", "2", "-1", "-1"]
                        else:
                            assert target == 4 and modifier is None
                        if messages[0].tag == "ResultUseAction":
                            declared = int(messages[0].findtext("Action"))
                            assert declared in (1, 2, 3)
                            assert target == (4 if declared == 1 else 2)
                            if declared in (2, 3):
                                assert roster[header.findtext("TargetId")] != roster[player]
                    chance = Fraction(sum(result >= target for result in range(1, 7)), 6)
                    location = [replay_step, child_index, step_index, mi]
                    if msg.tag == "QuestionTeamRerollUsage":
                        questions[(replay_step, child_index)] = (location, header, roll)
                    continuation = None
                    if msg.tag == "ResultRoll" and messages[0].tag == "ResultTeamRerollUsage":
                        before, prior_header, first = questions[(replay_step - 1, child_index)]
                        for field in ("PlayerId", "TargetId", "CellFrom/X", "CellFrom/Y", "CellTo/X", "CellTo/Y"):
                            assert header.findtext(field) == prior_header.findtext(field)
                        for field in ("RollType", "Requirement", "Difficulty", "Modifiers/Modifier/PlayerId"):
                            assert roll.findtext(field) == first.findtext(field)
                        used = int(messages[0].findtext("Used"))
                        gamer = messages[0].findtext("GamerId")
                        assert gamer == roster[player] and used in (0, 1)
                        gate = None
                        if used:
                            usage, test = messages[1:3]
                            assert usage.tag == "ResultSkillUsage" and test.tag == "ResultRoll"
                            assert usage.findtext("PlayerId") == player and test.findtext("RollType") == "71"
                            skill = int(usage.findtext("Skill"))
                            test_target = int(test.findtext("Difficulty"))
                            test_die = int(test.findtext("Dice/Die/Value"))
                            passed = test_die >= test_target
                            assert {44: 4, 1008: 3}[skill] == test_target
                            assert test.findtext("Outcome") == str(int(passed))
                            # Enumerate the fixed policy with every fair triple.
                            outcomes = [
                                (loner, loner >= test_target and retry >= target)
                                for loner in range(1, 7)
                                for retry in range(1, 7)
                            ]
                            prior_rescue = Fraction(sum(ok for _, ok in outcomes), 36)
                            seen_rescue = Fraction(sum(ok for loner, ok in outcomes if loner == test_die), 6)
                            delta = seen_rescue - prior_rescue
                            policy = Fraction(
                                sum(face >= target or ok
                                    for face in range(1, 7)
                                    for _, ok in outcomes), 216
                            )
                            gate = {
                                "skill": skill, "target": test_target, "face": test_die,
                                "passed": passed,
                                "accessDelta": [delta.numerator, delta.denominator],
                                "policyChance": [policy.numerator, policy.denominator],
                            }
                        replaced = bool(gate and gate["passed"])
                        assert roll.findtext("Status") == ("2" if replaced else "1")
                        assert roll.findtext("NewRoll") == ("1" if replaced else "0")
                        if not replaced:
                            assert face == int(first.findtext("Dice/Die/Value"))
                        continuation = {"original": before, "teamUsed": bool(used), "gate": gate}
                    animal = None
                    if roll_type == 36 and continuation:
                        assert not continuation["teamUsed"]
                        animal = animal_continuation(
                            frames, replay_step, child_index, player, roster[player], messages[mi + 1]
                        )
                    rows.append({
                        "locator": location,
                        "sourceTag": msg.tag,
                        "rollType": roll_type,
                        "status": int(roll.findtext("Status")),
                        "newRoll": int(roll.findtext("NewRoll")),
                        "actor": player,
                        "team": roster[player],
                        "assistant": roll.findtext("./Modifiers/Modifier/PlayerId") if roll_type == 34 else None,
                        "assistantTeam": roster.get(roll.findtext("./Modifiers/Modifier/PlayerId")),
                        "prefix": [part.tag for part in messages[:mi]],
                        "skillId": int(messages[mi - 1].findtext("Skill", "-1")),
                        "face": face,
                        "target": target,
                        "outcome": outcome,
                        "successFaces": int(chance * 6),
                        "numerator": int(outcome * 6 - chance * 6),
                        "continuation": continuation,
                        "animalContinuation": animal,
                    })
    print(json.dumps({"file": path.name, "rows": rows}))
