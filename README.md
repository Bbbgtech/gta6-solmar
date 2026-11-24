# gta6-solmar

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Bbbgtech/gta6-solmar/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Bbbgtech/gta6-solmar/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar is a 2D top-down open-world crime game: steal cars, outrun the police, and run three missions across a living coastal city.

## How to play

You are Leo Mar, a courier who owes money to the wrong people. Walk the streets of Solmar, steal a car when you need one, and work through the three missions to earn your way out.

**Controls**

- **WASD / Arrow keys** — walk on foot, drive when in a car
- **E** — enter a car (walk up to a parked car to take it, or a driven car to carjack it — the driver bails out and runs); press **E** again while driving to get out
- **Space** — handbrake while driving
- **F** — punch
- **Click** — shoot the pistol
- **M** — start the next mission (and retry a failed one)
- **P / Esc** — pause, **R** — restart, **Enter** — start the game

**Missions**

Press **M** to start the next job; they run in order and each pays cash on completion:

1. **The Package (+$500)** — pick up a package at the marina and deliver it to the Hotel Mirador downtown. No time limit.
2. **Lose the Heat (+$800)** — you start with three wanted stars. Break line of sight, stay out of trouble, and wait until the stars fade to zero.
3. **The Getaway (+$1,500)** — grab a car and reach the North Gate in 75 seconds, cops included. Run out of time and the crew leaves without you.

**Wanted stars and the police**

Every crime raises your heat (0–100), and your wanted level is one star per 20 heat, up to five. Stealing a parked car adds 20, carjacking a driven car 25, and stealing a police cruiser 35; punching, shooting, and speeding past a police car add heat too. Stay clean for a while with no police car nearby and the heat cools down until the stars disappear. While you are wanted, police interceptors spawn (up to three) and chase and ram you, and on-foot cops try to grab you — if one holds you for a moment, you are BUSTED and the game ends.

## Run it

```sh
Open game/index.html in desktop Chrome (or run `node serve.ts` and open http://localhost:8080) — no build step, no network.
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=fpbb2zn4&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
