# Dolphin Drift

A minimal browser endless runner starring a walking Jamaican dolphin. Drift through a futuristic island city with warm skies, neon water, and a relaxed pace. All artwork is drawn in Canvas. The original reggae soundtrack combines offbeat guitar and organ, warm bass, one-drop drums, melodica, and gentle dub echo, synthesized in the browser for speakers or headphones.

## Run locally

Requires Node.js 20 or newer. No package installation or API key is needed.

```sh
npm start
```

Open [http://localhost:5173](http://localhost:5173). In VS Code, open this folder and press **F5**, using the included **Play Dolphin Drift** launch configuration, to start the server and open the game automatically.

## Play

Move between three lanes, jump over coral barriers, roll under green gates, avoid trams, and collect golden records. Dub faces the track and tucks into a forward roll when you press down. The pace gradually increases, and every obstacle row leaves a clear route. Your best distance is saved locally in the current browser.

Collect **eight consecutive records** to trigger **10 seconds of Dub Mode**, when each record counts double. Missing a record resets your streak while Dub Mode is inactive.

Pick up **Magnet** to attract nearby records for 10 seconds, **Shield** to survive one hit within 12 seconds, or **2× Records** for 10 seconds of double rewards. Active badges show time remaining. Double-record pickups refresh Dub Mode; the multiplier never exceeds 2×.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Change lanes | Left / Right arrows or A / D | Swipe left / right |
| Jump | Up arrow, W, or Space | Swipe up or tap the track |
| Roll | Down arrow or S | Swipe down |
| Pause / resume | Escape or P | Pause button |

Touch controls are also available on screen. Press **Space** or select **Let's drift** to begin. Your first start also turns on island radio unless you muted it beforehand; use the sound button in the header to mute or unmute. Switching away from the game pauses the run.

## Check

```sh
npm test
npm run check
```

The gameplay tests cover movement, obstacle clearance, record collection, Dub Mode, powerups, adjacent obstacle collisions, pause/restart, safe route generation, and frame timing. The check command validates JavaScript syntax.

## Files

- `src/game.js` — independent runner simulation and procedural track generation.
- `src/renderer.js` — Canvas scenery, dolphin animation, obstacles, and effects.
- `src/dolphin.js` — articulated 3D dolphin, forward walking, and tucked somersaults.
- `src/audio.js` — browser synthesizer music and sound effects.
- `src/main.js` — controls, game state, interface, and local best score.
- `src/style.css` and `index.html` — responsive presentation and interface.
- `server.mjs` — dependency-free local web server.
- `test/game.test.js` — simulation tests using Node's built-in test runner.
- `.vscode/launch.json` — F5 launch configuration.
