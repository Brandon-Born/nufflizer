# Skill rules read in the running BB3 UI

Observed 2026-11-10 through the Computer Use skill. This is a paraphrase of functional rule facts displayed by the installed game, not a quotation of its descriptions. No roster, player, account or coach names are preserved.

Navigation: Teams → a Nurgle roster → Players → click a skill icon. The tooltip stays visible for inspection. Rotspawn, Pestigor, Rotter Lineman and Bloater cards supplied the entries below. Reading these screens did not change the roster or spend resources. Screenshots were inspected inline; none were exported. This reference is separate from the numbered replay observations and does not increase their count.

Follow-up navigation: a newly created Human research custom team under Teams exposes a General skill catalogue and unlimited game SPP. It is not a saved team template. GR-024 was read from the Dirty Player(+1) catalogue tooltip. GR-025 was read after adding Pro for6 game SPP and opening Overview → Skills and Improvements → Pro. That experimental player is now level2 with Pro, total SPP spent6 and value70,000; this describes custom-team game resources, not a real-money purchase or a change to an existing competitive roster. The catalogue's tooltip behavior was inconsistent; do not assume hovering always exposes text. Subsequent actual hotseat observations are recorded separately in [HOTSEAT_EXPERIMENTS.md](HOTSEAT_EXPERIMENTS.md).

Numeric IDs below come from the independently extracted `EBB3BoardDataSkill` table in [the installed enum snapshot](../tests/fixtures/evidence/bb3-installed-enums.json). The UI itself supplies names and rule text, not numeric IDs. Source image SHA-256: `590787b522ad4404b2e8a7570993375114a794fa4288d88a8595ab9dfbd7d6ae`. This identifies the installed build; compatibility with every replay version is not implied. The descriptions are manual evidence, not automated verification of the game's implementation.

| Reference | UI label / compiled member / ID | Facts read from the tooltip |
| --- | --- | --- |
| GR-001 | Really Stupid / `ReallyStupid` / 51 | At activation, D6 results1–3 end that player's turn and remove their tackle zone; an attempted once-per-turn action is spent. Results4+ permit normal play. An adjacent teammate without this trait gives+2. |
| GR-002 | Disturbing Presence / `DisturbingPresence` / 33 | An opposing passer, teammate-thrower, bomb-thrower, interfering player or catcher takes−1 per opposing holder within3 squares. The holders' states do not remove this effect. |
| GR-003 | Foul Appearance / `FoulAppearance` / 10 | An opposing Block or special action declared against the holder is lost on D6=1. The skill can function while its holder is prone, stunned or without a tackle zone. |
| GR-004 | Loner (4+) / `Loner4` / 44 | A team-reroll attempt requires a D6 meeting the bracketed threshold. Failure retains the original result and spends the team reroll. The trait still applies when prone or without a tackle zone. This card's threshold is4; do not impose4 on other Loner variants. |
| GR-005 | Mighty Blow (+1) / `MightyBlow1` / 13 | After this player's Block knocks an opponent down, the bracketed bonus can modify armor or injury, including a decision after the test. It cannot accompany Stab or Chainsaw. This card's bonus is1. |
| GR-006 | Regeneration / `Regeneration` / 19 | After a casualty, D6=1–3 leaves it applied;4+ cancels it and puts the player in reserves. The trait can apply while prone, stunned or without a tackle zone. |
| GR-007 | Tentacles / `Tentacles` / 69 | When an opponent leaves a square marked by the holder, test D6+holder ST−opponent ST. A total6+ or natural6 holds the opponent in place and ends their movement. |
| GR-008 | Guard / `Guard` / 38 | The holder can give offensive and defensive Block assists despite being marked by other players. |
| GR-009 | Multiple Block / `MultipleBlock` / 70 | A Block, excluding Blitz, can target two marked opponents with the holder's ST reduced by2 for that activation. The two blocks are simultaneous and resolve independently of one another's result. |
| GR-010 | Thick Skull / `ThickSkull` / 63 | An injury result8 becomes Stunned; for a Stunty player this replacement concerns7. Other injury results are unchanged. |
| GR-011 | Plague Ridden / `PlagueRidden` / 1020 | A once-per-match effect can add a new Lineman to reserves after this player's Block or Foul kills an opponent with ST≤4 who lacks Regeneration, Decay and Stunty. |
| GR-012 | Block / `Block` / 30 | The holder avoids being knocked down by a selected Both Down result. |
| GR-013 | Horns / `Horns` / 15 | The holder gains+1 ST for a Block made during a Blitz. |
| GR-014 | Decay / `Decay` / 81 | Casualty-table tests against the holder receive+1. This is not an armor or injury-stage modifier. |
| GR-015 | Diving Tackle / `DivingTackle` / 34 | After an opponent succeeds at an Agility test to leave a marked square, the holder can impose−2 on that test and become prone in the vacated square. |
| GR-016 | Strip Ball / `StripBall` / 1 | A chosen pushback against a carrier makes the ball fall and bounce from the destination square. The tooltip's pronoun is imprecise; it is not evidence that a mere push knocks the player down. |
| GR-017 | Sure Hands / `SureHands` / 61 | Permits a pickup reroll and prevents Strip Ball from being used against the holder. The text does not grant a catch reroll. |
| GR-018 | Tackle / `Tackle` / 57 | Opponents marked by the holder cannot use the Dodge skill. |
| GR-019 | Dodge / `Dodge` / 7 | Grants a failed-dodge reroll limited by player turn/activation. It can also be chosen when the holder is the defender against a Stumble result. The tooltip alone does not specify every resulting push/knockdown interaction. |
| GR-020 | Dauntless / `Dauntless` / 26 | Against a stronger Block/Blitz target, compare D6+own ST strictly greater than target ST, after other modifiers but before assists. Success raises own ST to the target's ST. No natural6 override is stated here. |
| GR-021 | Shadowing / `Shadowing` / 55 | After a marked opponent leaves, D6+holder MA−opponent MA reaching6+, or natural6, permits following into the vacated square without a Dodge test. |
| GR-022 | Claws / `Claws` / 75 | When the holder knocks an opponent down, an unmodified armor result8+ breaks armor. This does not say that a lower result cannot break naturally lower armor, or that a modifier turns raw7 into a Claws success. |
| GR-023 | Wrestle / `Wrestle` / 68 | Attacker or defender can use it on Both Down, placing both prone despite other skills. The text says this causes no turnover; it does not address every separate consequence such as a carrier losing possession. |
| GR-024 | Dirty Player (+1) / `DirtyPlayer1` / 27 | During the holder's Foul, the bracketed amount can modify the armor or injury result. This variant supplies+1; the short description does not establish modifier choice timing or stacking. |
| GR-025 | Pro / `Pro` / 50 | During the holder's activation, a D6 gate of3+ permits rerolling a die. Armor, injury and casualty tests are excluded. This text alone does not establish every frequency, eligibility, failed-gate follow-up or resource policy. |

## What these facts resolve and what remains

Tentacles and Shadowing have an explicit natural6 exception; Dauntless explicitly uses a strict comparison and this tooltip supplies no such exception. These cannot safely share an unconditional generic threshold contract. Disturbing Presence and Foul Appearance can remain relevant after some states remove a tackle zone. Loner spending, Regeneration recovery, post-roll Mighty Blow choice, Thick Skull's Stunty branch and Diving Tackle's timing now have direct in-game explanatory evidence.

Cross-check these descriptions against the source-linked examples in [REPLAY_UI_EVIDENCE.md](REPLAY_UI_EVIDENCE.md), including Loner, Regeneration, Decay, Wrestle and UI-085's reaction pass with Disturbing Presence. A tooltip's wording is not proof of raw field defaults, choice ordering, roll deduplication, full skill precedence, complete distributions or older/newer build behavior. In particular, do not turn short statements such as Wrestle's no-turnover wording into immunity from a separate possession consequence. Preserve any discrepancy for targeted empirical testing.

Further references are still needed for other skills, full ordinary/Stunty injury and casualty tables, referee/bribe/argue-call policies, and the remaining state and natural-roll contracts. No runtime mapping, scoring contract or remediation issue is completed by this document.
