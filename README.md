# Dolphin Drift

A minimal browser endless runner starring a walking Jamaican dolphin. Drift through a futuristic island city with warm skies, neon water, and an ever-quicker pace. All artwork is drawn in Canvas. The original reggae soundtrack combines offbeat guitar and organ, warm bass, one-drop drums, melodica, and gentle dub echo, synthesized in the browser for speakers or headphones.

## Run locally

Requires Node.js 20 or newer. No package installation or API key is needed.

```sh
npm start
```

Open [http://localhost:5173](http://localhost:5173). In VS Code, open this folder and press **F5**, using the included **Play Dolphin Drift** launch configuration, to start the server and open the game automatically.

## Play

Move between three lanes, jump over coral barriers, crates, and buoys, roll under green gates, dodge trams and market carts, and collect golden records. Dub faces the track and tucks into a forward roll when you press down. Ground obstacle counts are 33% higher on average, with more rows blocking two lanes. Every row still leaves a clear route, and row spacing and pickup frequency stay the same. Your best distance is saved locally in the current browser.

Spend **200 records from your current run** using the **surfboard button** or **B** for a **20-second flight** above the track. Dub lies on his back on the board, smoking and trailing wisps into the sky. Steer left and right through the golden sky records while flying over ground obstacles. Jump and roll resume when you land, with a brief grace period to spot the next hazard. A flight cannot be bought again until the current ride ends; records and flight time reset on a new run.

Powerups rotate through four types, with a pickup every **four obstacle rows** (25% fewer regular pickups than before):

| Powerup | Effect | Duration |
| --- | --- | --- |
| Magnet | Attracts nearby records | 10 seconds |
| Shield | Absorbs one hit | 12 seconds |
| Ghost | Passes through ground obstacles, with a brief grace period when it ends | 6 seconds |
| Super jump | Higher jumps; timed jumps can clear green hurdles, carts, and trams | 12 seconds |

Small progress bars on the left show active powerup time and surfboard savings or flight time. The surfboard control shows only its name, price, and progress. Gameplay has no popup messages or decorative cards. Sky records are only reachable on the surfboard, including with a magnet; ground records and powerups are collected on foot. Every record is worth one.

Speed increases with active playing time, from **12 m/s** by **0.18 m/s each second**, up to **42 m/s** after about **2 minutes 47 seconds**. The live speed readout makes the ramp visible. Later obstacle rows preserve at least 1.25 seconds of reaction time; sky routes scale their spacing with speed. Pausing freezes speed progression and all gameplay timers.

## New ways to drift

- **Score and combos:** distance earns points, and each record earns 10 points. Collect again within 6 seconds to keep the streak alive. Every 12 records increases the score multiplier, up to ×5. Your best streak is saved. Currency remains one record per pickup.
- **Close dodges:** passing close beside a ground hazard while on foot and unprotected earns 50 points multiplied by your current combo multiplier, with a small sound and particle effect.
- **Three missions per run:** travel 750 m, collect 50 records, and make 5 near misses. Pause or finish to see your progress.
- **Nine achievements and career stats:** open the **Logbook** for unlocked milestones, runs completed, total records, best score, and best streak. Completed runs and settings save in this browser, with graceful fallback when storage is unavailable.
- **Daily route:** select it on the title screen for a repeatable track based on your local calendar date, with a separate daily best score. Retry the same route as often as you like. This is a local challenge, with no online leaderboard.
- **One more wave:** after a crash, spend **75 records from that run** to revive once. Keep your distance, score, and speed, with two seconds of protection and nearby hazards cleared. The continued run counts as a single run in your career stats.
- **Three districts:** Palm Line, Sunset Market, and Neon Harbour cycle every 750 m, with smooth palette transitions, market stalls, lanterns, stars, boats, and harbour cranes.
- **Speed effects and personal best chase:** subtle wind trails build as the pace rises, and a compact readout shows how far remains to your best distance.
- **Comfort controls:** the Logbook offers reduced effects and full screen where supported. Reduced motion follows your system preference initially. Your motion and mute choices are remembered.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lanes | Left / Right arrows or A / D | Swipe left / right |
| Jump | Up arrow, W, or Space | Swipe up or tap the track |
| Roll | Down arrow or S | Swipe down |
| Buy a surfboard flight | B | Surfboard button (200 records) |
| Pause / resume | Escape or P | Pause button |
| Retry after a crash | R | Drift again |
| Full screen | F | Logbook → Full screen |
| Missions and progress | P to see this run's missions | Pause / Logbook |

Use swipes and taps directly on the track on touchscreens. Press **Space** or select **Let's drift** to begin. Your first start also turns on island radio unless you muted it beforehand; use the sound button in the header to mute or unmute. Switching away from the game pauses the run.

## Check

```sh
npm test
npm run check
```

The automated tests cover movement, obstacle clearance, record collection, surfboard purchases and flight, sky routes, powerups, progressive speed, safe generation, combos, near misses, revives, daily seeds, profile validation, missions, achievements, and daily rollover. The check command validates JavaScript syntax. Open `/test/render-gallery.html` for 16 fixed visual snapshots, including the new districts, high speed, flight, and portrait canvases.

Open `/test/ui-smoke.html` to run the real interface through 16 browser checks for purchase eligibility, button and keyboard handling, four powerup bars, mobile layouts, countdowns, pause/resume, expiry, and reset. It uses isolated test balances and leaves a flight preview below the report; reload the normal game to play a regular run.

Open `/test/feature-smoke.html` for browser checks covering daily mode, score/combo displays, missions, the Logbook, reduced motion, revive accounting, retry, and mobile layouts. Both harnesses use `?debug` to isolate their profiles from your saved progress.

## Files

- `src/game.js` — independent runner simulation and procedural track generation.
- `src/renderer.js` — Canvas scenery, dolphin animation, obstacles, and effects.
- `src/dolphin.js` — articulated 3D dolphin, forward walking, and tucked somersaults.
- `src/audio.js` — browser synthesizer music and sound effects.
- `src/main.js` — controls, game state, interface, and local best score.
- `src/progression.js` — validated profiles, daily seeds, missions, and achievements.
- `src/style.css` and `index.html` — responsive presentation and interface.
- `server.mjs` — dependency-free local web server.
- `test/game.test.js` — simulation tests using Node's built-in test runner.
- `.vscode/launch.json` — F5 launch configuration.
