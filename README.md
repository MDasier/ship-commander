# Ship Commander

> **Alpha** — Multiplayer browser dogfighting game built to practice team-based combat for Star Citizen.

A real-time, team-based space combat game running entirely in the browser. No installs, no plugins — just open the client and fly.

---

## Features

### Gameplay
- **2-team dogfighting** — Green vs Red, up to 6 players per room
- **Authoritative server** — all physics and collision run server-side; no client-side cheating
- **Homing missiles** with lock-on targeting (Tab to cycle) and flare countermeasures
- **Asteroids** as destructible terrain with collision damage
- **Fuel system** — slow passive regeneration; thrust and reverse consume fuel
- **Self-destruct sequence** — hold Delete 2 s to initiate a 5-second countdown; press again to cancel

### Multiplayer & Rooms
- Lobby with room creation, join, team switch and ready system
- **Room restart** — host can reset the match without disbanding
- Player names with persistence via `localStorage`
- **In-game chat** — press T, type, Enter to send

### HUD & UI
- Live HP / Fuel / Speed / K-D / Missile cooldown
- **Kill feed** — colour-coded, weapon-tagged, fades after 5 s
- **Spectator mode** — follow living players with Tab after death
- **MobiGlass** (F1) inspired by Star Citizen:
  - *PILOTO* tab — structural integrity bars, stats grid
  - *PARTIDA* tab — per-team scoreboard, alive count
  - *CONTROLES* tab — full keybinding reference

### Visuals & Audio
- Parallax star field (3 depth layers)
- Particle explosions (team-coloured) and engine thrust trail
- Screen shake on damage and nearby explosions
- Hit flash on impacted ships
- Elongated missiles with exhaust glow
- Procedural audio via **Web Audio API** (no external files):
  - Ambient space drone with random high-note pings
  - SFX: cannon, explosion, missile launch, missile-lock warning, victory fanfare, self-destruct countdown beeps

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js + [`ws`](https://github.com/websockets/ws) WebSocket library |
| Client | Vanilla JS, HTML5 Canvas |
| Rendering | Canvas 2D API |
| Audio | Web Audio API |
| Styles | CSS (no framework) |
| Build | None — plain files, no bundler |

No third-party libraries on the client. The only dependency is `ws` on the server.

---

## Getting Started

### Requirements
- Node.js 18+

### Run locally

```bash
# Install server dependency
cd server
npm install

# Start the game server
node server.js
# → Server running on ws://localhost:8080
```

Then open `client/index.html` directly in your browser (`file://` works — no HTTP server needed).

Open multiple tabs to test multiplayer locally.

### Play with friends (quick)

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 8080
```

Change the WebSocket URL in `client/game.js` line 14:

```js
// Replace with your ngrok URL (use wss://)
const ws = new WebSocket("wss://your-id.ngrok-free.app");
```

Share `client/index.html` with your friends. Everyone connects to your local server through the tunnel.

---

## Controls

| Key | Action |
|---|---|
| `W` | Thrust forward |
| `S` | Reverse thrust (slower) |
| `A` / `D` | Rotate |
| `E` | Fire cannon |
| `Q` | Launch missile (requires target) |
| `Tab` | Cycle target (or spectator when dead) |
| `F` | Deploy flare (missile countermeasure) |
| `T` | Open chat |
| `Del` | Self-destruct (hold 2 s → 5 s countdown · Del cancels) |
| `F1` | Toggle MobiGlass |

---

## Project Structure

```
ship-commander/
├── client/
│   ├── index.html      # Menu, HUD, MobiGlass, Game Over overlays
│   ├── game.js         # WebSocket client, rendering loop, input, UI logic
│   ├── particles.js    # Star field, explosion & thrust particle system
│   ├── sounds.js       # Procedural music and sound effects (Web Audio API)
│   └── styles.css      # All UI styles
└── server/
    ├── server.js       # Authoritative game server — physics, collision, rooms
    └── package.json
```

---

## Architecture Notes

- **Authoritative server at 30 fps** — clients send input only; the server runs all physics, collision detection, win condition, scoring, and kill attribution.
- **Client is render-only** — it interpolates received state and handles local UI (particles, sound, self-destruct timer).
- **Anti-cheat surface** — bullet/missile rate limiting, name sanitisation, action validation (dead players can't shoot, only host can restart).

---

## Roadmap

- [ ] Persistent stats across sessions
- [ ] Deployable build (serve client from the same Node process)
- [ ] Configurable room settings (time limit, asteroid count)
- [ ] Respawn in team mode

---

## Alpha Disclaimer

This project is in **early alpha**. Expect rough edges, missing features, and breaking changes between sessions. It is primarily a learning and practice tool.
