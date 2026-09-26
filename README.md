# Dolphin Drift

A browser runner set in futuristic Neo Kingston, with animated sea creatures, golden records, and an original synthesized reggae soundtrack. All artwork is drawn in Canvas; no API keys or package installation are required.

## Run locally

Requires Node.js 20 or newer:

```sh
npm start
```

Open [http://localhost:5173](http://localhost:5173). In VS Code, **F5** starts the server and opens the game. Refresh the page after changing source files.

## Choose a mode

| Mode | How it plays |
| --- | --- |
| Endless | Dodge obstacles, collect records, and chase your best distance as the pace increases. |
| Daily route | A repeatable course based on your local calendar date, with a separate daily score. Uses Dub and classic rules. |
| Island Tour | A 2,250 m obstacle course through three districts. Checkpoints award 60, 90, and 150 banked records. |
| Story | Six connected chapters with objectives, dialogue, patrol enemies, sonic weapons, and bosses. |

**Bosses, enemies, shooting, and Tidal blast are exclusive to Story.** The other modes focus on running, collecting records, and avoiding obstacles. Zen, 90s Sprint, and Hardcore have been removed. Existing career progress, purchases, character unlocks, and historical run data are retained.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lanes | Left / Right or A / D | Swipe left / right |
| Jump | Up, W, or Space | Swipe up or tap the track |
| Roll | Down or S | Swipe down |
| Character ability | C | Ability button |
| Dub dash | E | Dash button |
| Buy a surfboard flight | B | Surfboard button |
| Fire sonic weapon — Story only | Q | Fire button |
| Tidal blast — Story only | X | Tidal blast button |
| Pause / resume | Escape or P | Pause button |
| Retry after a crash | R | Retry button |
| Full screen | F | Logbook → Full screen |

Optional movement buttons are available in the Logbook. Switching away from the game pauses the run, and all gameplay timers freeze while paused.

## Running and progression

- Jump over coral, crates and buoys; roll under gates; steer around carts and trams. Super jump can clear taller obstacles. Every generated row has a clear lane marked by records.
- Speed starts at 12 m/s and increases by 0.18 m/s each active second. Later rows use speed-scaled spacing.
- Spend **200 records from the current run** for a **20-second surfboard flight**. Steer through sky records while flying above ground hazards.
- Magnet attracts records for 10 seconds; Shield absorbs one hit within 12 seconds; Ghost passes through obstacles for 6 seconds; Super jump lasts 12 seconds. Shop upgrades can extend durations.
- Collect **25 records** to charge a free three-second Dub dash, which protects you and attracts records. Dash extender upgrades can increase its duration to 4.5 seconds outside Daily.
- Keep collecting within six seconds to build a combo. Every 12 records increases the score multiplier, up to ×5. Clean jumps and rolls build stunt chains; close dodges award bonus points.
- After a crash, **75 run records** buy one revive. Completed routes and failed chapter objectives cannot be revived.
- Finishing a run or returning home banks records, XP, mission rewards, and contract progress. Reviving recalculates that run without counting it twice.
- The shop offers skins, hats, boards, trails, duration upgrades, and starter supplies. **Try on** previews cosmetics before purchase.
- The Logbook contains achievements, career stats, contracts, recent runs, mode records, graphics preferences, audio sliders, reduced effects, touch controls, and postcard downloads.
- Save data stays in this browser. The game remains playable when storage is unavailable. Debug pages use an isolated profile and do not overwrite normal progress.

## Rewards and pacing

Every run has three milestone tracks. Each track pays **20, then 30, then 50 banked records**, plus **50 XP per milestone**. The next goal appears during play, and pause/results show all tracks. Crashes and returning home keep every reached milestone; an empty run earns nothing.

| Track | First goal | Second goal | Final goal |
| --- | --- | --- | --- |
| Distance | 250 m | 750 m | 1,500 m |
| Collection | 20 records | 50 records | 100 records |
| Clean jump/roll clears | 2 hazards | 5 hazards | 10 hazards |

The results receipt separates collection, run milestones, route/boss bonuses, career contracts, and first chapter clears. Its total is the amount added to the bank. Run records still pay for flights and revives; spending them never reduces lifetime collection or bank earnings. Reviving replaces the prior crash settlement from the original run baseline.

| Permanent upgrade | Level 1 | Level 2 | Level 3 | Max benefit |
| --- | --- | --- | --- | --- |
| Magnet amplifier | 90 | 150 | 210 | Magnet: 10 → 16 seconds |
| Groove keeper | 105 | 165 | 225 | Classic combo window: 6 → 9 seconds |
| Longboard battery | 120 | 195 | 270 | Flight: 20 → 26 seconds |
| Bubble stabilizer | 90 | 143 | 195 | Shield: 12 → 18 seconds; one hit |
| Phase tuner | 120 | 188 | 255 | Ghost: 6 → 9 seconds |
| Spring coils | 90 | 143 | 195 | Super jump: 12 → 18 seconds; same height |
| Dash extender | 135 | 210 | 285 | Dub dash: 3 → 4.5 seconds; same 25-record charge |

Permanent upgrade prices are 50% higher than the previous build, rounded up to whole records at each level. The original three tracks now cost 1,530 records to max; all seven cost 3,579. Owned levels retain their effects. Power duration upgrades also apply to starter supplies. Starter supplies cost 15 records (20 for Shield); cosmetics retain their 70–420 prices. A 250 m / 20-record run now banks 60 instead of 20 before contracts. Ten such runs bank 740 including contracts, versus 340 previously. These are fixed-stat pacing examples, not assumptions about player skill. Cosmetic purchases become reachable sooner through earnings; existing purchases keep their full effects.

Contracts retain their first targets and rewards, but their targets stop growing after tier three: at most 4,500 m, 300 records, or 36 clean clears. On loading an old save, any progress beyond a new target pays the completed tiers once and carries the remainder. Wallet balances, XP, equipment, supplies, Story progress, scores, and historical runs are retained. No reset is required.

**Daily fairness:** bank rewards and lifetime unlock progress are awarded after play. Daily uses a date seed, the same route choices and scoring rules for everyone, Dub, base durations, and no supplies or modifiers. The new 25% encounter-pressure increase applies to Daily too; historical bests remain saved. A developed profile gains no competitive advantage.

## Story: Bring back the beat

Choose **Story → Open island map**. Each chapter has a briefing, an in-run transmission, a required objective, and an ending. Complete the objective and reach the exit to unlock the next chapter. First-clear rewards pay once; replays still earn ordinary run rewards and can improve chapter scores.

| Chapter | Objective | First-clear reward |
| --- | --- | --- |
| The missing beat | Collect 20 records; reach 450 m | Inky + 100 records |
| Market takeover | Defeat 5 patrols; reach 600 m | Reef chorus + 150 records |
| Jailbreak at the docks | Collect 3 rescue rings; reach 700 m | Riff + 200 records |
| Break the bass line | Defeat Clawbreaker; reach 850 m | Bass lance + 250 records |
| Wings over Kingston | Defeat Scarlet Manta; reach 950 m | Shelly + 300 records |
| The last frequency | Defeat Overlord Static; reach 1,200 m | Island liberated + 500 records |

## Your crew

Choose a runner from the title screen or the island map. Inky unlocks at **100 lifetime records**, Riff at **300**, and Shelly at **600**, or through their existing Story chapters, whichever comes first. There is no record cost; spent records still count, and older collections apply automatically. Collection unlocks do not skip Story chapters or unlock weapons. Your crew can also join Endless and Island Tour. Daily always uses Dub.

| Runner | Ability on C | Cooldown |
| --- | --- | --- |
| Dub, dolphin | Attract records for four seconds and gain five dash charge. | 14 seconds |
| Inky, octopus | Sweep up nearby ground records and launch a protected vault. In Story, grapple the nearest patrol within 45 m. | 12 seconds |
| Riff, shark | Smash ground hazards for three seconds, including patrols in Story. | 16 seconds |
| Shelly, turtle | Block hazards for five seconds. In Story, reflect incoming enemy fire. | 18 seconds |

All shop skins, hats, boards and trails dress every crew member. The fitting room previews your selected runner. Career level looks are available in Shop → Skins; the Logbook contains progress and settings. Equipping a skin switches off the mastery outfit, which can be restored from the crew screen.

## Story combat

Patrol drones, sentries, and armored brutes appear between bosses. Dodge them, jump over them, or use **Q / Fire**. Sentries show a warning beam before firing at your locked position.

- **Sonic pulse:** fast shots seek the nearest enemy.
- **Reef chorus:** hit up to three enemies across the track.
- **Bass lance:** pierce enemies in the target lane for three damage. During a boss fight, spend two energy to deal two armor damage.
- **Tidal blast:** records and patrol defeats charge a special attack. At 100%, press X to clear nearby enemies and hostile shots and deal three boss damage.

Boss shots track your position during the warning, then lock when fired. Move after the lock, jump, or roll. Firing in the mint impact window deflects the volley, refunds the shot, and awards a score bonus. Boss energy recharges every 3.5 active seconds, up to three; diamonds add energy sooner.

Bosses enter overdrive at half armor or late in the encounter. Break every armor plate before the chapter exit. A knockout awards 100 banked records, plus 50 for a flawless fight. The final boss, Overlord Static, has ten armor plates and cycles between cannonballs, missiles, and plasma fans.

## New routes, mastery and celebrations

Encounter pressure is **25% higher than the previous build**: ordinary obstacle rows and Story boss volleys arrive 1.25 times as often. The 80 m opening warm-up, movement, collision sizes and individual shot warning/travel times stay predictable. Denser boss fights reward timed deflections; keep an energy charge in reserve.

Endless, Daily and Island Tour offer a fork in each 750 m district. Watch the on-screen countdown: occupy the **left lane when it reaches zero** to select the detour, or the centre/right lane for the main road. Normal keyboard and swipe controls both work. The selection locks 90 m before the detour begins, giving obstacles time to appear. Each detour lasts 180 m:

| District detour | Mechanic | Completion bonus |
| --- | --- | --- |
| Reef tunnel | Lower gravity, longer jumps and coral hurdles under glowing arches | 40 records |
| Market rooftops | Alternating crates and overhead beams; optional aerial records | 50 records |
| Cargo docks | Weave between paired cargo obstacles | 60 records |

Story retains its chapter routes and objectives. Route bonuses pay once and appear in the normal reward receipt, including after a revive.

Open **Choose your runner** to view each crew member's permanent mastery challenge. Dub collects 150 records during Echo pulse; Inky collects 100 during Reef grapple; Riff smashes 40 ground hazards during Shark rush; Shelly blocks 40 ground hazards during Shell guard. Progress banks with each run; Daily does not advance mastery. Complete a challenge to unlock a character-coloured outfit with a gold-trimmed mastery band, then use the outfit button beneath the crew cards to wear it or switch back to classic.

Close dodges have a distinct whoosh and rising tone. A first ×5 combo and a new personal distance best trigger a brief celebration. Completed routes/chapters show a unique crew victory dance in the results screen. Reduced-motion settings suppress animated celebration effects.

With the radio enabled, each combo tier adds a musical layer, up to four additional layers at ×5. Active Story bosses add drums and bass accents. Pausing drops the reactive layers; Music and Effects sliders still control their respective sounds.

## Development

`src/game.js` contains the rendering-independent simulation. `src/renderer.js`, `src/dolphin.js`, and `src/bosses.js` draw the world and characters. Campaign definitions, combat logic, and map UI live in `src/adventure.js`, `src/combat.js`, and `src/adventure-ui.js`. `src/progression.js` validates and saves profiles.

Use `npm test` for the simulation and progression suite, and `npm run check` for JavaScript syntax validation. `test/polish.test.js` covers generated Story objectives, rescue chapter completion, flight endpoints, and combat state regressions.

With the local server running, open [the polish regression checks](http://localhost:5173/test/polish-smoke.html) for real-control, save/revive, touch, and responsive-layout tests, or [the feature checks](http://localhost:5173/test/feature-smoke.html) for daily-route and progression integration tests. Both use isolated debug profiles. Other historical browser harnesses under `test/` may refer to the earlier mode lineup.

[Economy browser checks](http://localhost:5173/test/economy-smoke.html) exercise purchases, receipt totals, crew collection unlocks, early exits, revives, Daily normalization, and result layouts from 320 px phones to desktop. `test/economy.test.js` covers migration, milestone boundaries, pricing caps, payout reconciliation, and identical Daily simulation for new and fully upgraded profiles.

[New feature visual checks](http://localhost:5173/test/additions-smoke.html) exercise milestone messages, route scenes, mastery outfit selection, victory dances and phone layouts with an isolated profile.

[Route rendering checks](http://localhost:5173/test/routes-render.html) provide entrance, interior and exit views for every detour, including motion, phone width, flight and reduced effects. Route scenery uses fixed world positions and shares the obstacle depth order; the reef atmosphere fades at both boundaries.
