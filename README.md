[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Masasiya00/makefun-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Masasiya00/makefun-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# EMBER YARD — a three.js tactical FPS

A round-based tactical FPS in a dusk container yard, built for make.fun's
`threejs-fps-02` bounty ("Make the best three.js tactical FPS").

You are Ember Crew. Plant the charge at Site A — or wipe the Dock Wardens.
First to 5 rounds takes the match.

## Play

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Open the page, click to play (pointer lock), and fight:

- **WASD** move · **Mouse** look · **Click** fire · **R** reload
- **1 / 2 / 3** pistol / SMG / rifle · **G** throw frag grenade
- **E** (hold, inside Site A) plant the charge · **B** buy menu
- **Ctrl** crouch · **Space** jump · **M** mute

## The game

- **Map** — an original 44 × 34 m container yard: two flank lanes, a long
  mid sightline, and one bomb site (A) with a marked plant zone. Dusk
  blue-grey steel under amber work lights; all textures are procedural
  canvases, all art and sounds original — nothing downloaded, no network.
- **Gunplay** — hitscan vs bodies, headshots deal more damage, recoil and
  spread punish firing on the move, acceleration + crouch + collision.
- **Tactics** — bomb plant (3.5 s) / 35 s fuse / 5 s defuse; money per
  round (kill $300, win $3,250, loss $1,900) spent in a buy menu on three
  weapons, frag grenades and armour; 4v4 + player, bots follow a waypoint
  graph, hold positions, see (FOV + line-of-sight) and hear gunfire, and
  rush Site A to defuse once the charge is planted.
- **Rounds** — 100 s timer, elimination / detonation / defusal wins, first
  to 5 rounds takes the match.

## Layout

- `game/` — the static game (ES modules, three.js 0.187.0 vendored)
  - `game/src/` — `main.js` (loop + rounds), `world.js` (map),
    `bots.js` (AI), `player.js` (movement + shared collision),
    `weapon.js` (3 weapons + grenade), `bomb.js`, `economy.js`,
    `audio.js` (procedural WebAudio), `hud.js`, `input.js`,
    `textures.js` (procedural), `palette.js`
- `main.ts` — copies `game/` + `screenshots/` to `/output` and writes
  `dossier.json` (run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`)
- `screenshots/` — 4 real renders: menu, mid-fight, buy menu, round won
- `serve.ts` — static dev server for `game/` on port 8080
- `shots.json` — the deterministic capture list (`?shot=start|play|buy|end`)

Deterministic captures: `?shot=<name>&seed=1` renders a fixed frame and
sets `window.__shotReady`; `window.__ember.snapshot()` reports live state
for automated playtests.

## License

MIT — see `LICENSE`.
