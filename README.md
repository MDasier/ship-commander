# Ship Commander

Ship Commander is a real-time multiplayer space combat game featuring fleet coordination, physics-driven combat, and a server-authoritative architecture. The project is built with a modern TypeScript stack and a clear separation between simulation (server) and rendering (client).

[TRY](https://ship-commander.onrender.com/)

---

## 🚀 Overview

Ship Commander is built around a deterministic server-authoritative model:

- The server handles physics, game state, combat logic, and synchronization.
- The client focuses on rendering, input handling, and UI.
- Gameplay emphasizes team coordination, roles, and tactical space combat.

The latest version introduces a full architectural refactor, migrating the frontend to TypeScript and reorganizing both client and server into modular systems.

---

## 🧱 Architecture

- client/ → Frontend (React + TypeScript)
- server/ → Game server (Node.js + TypeScript)
- docs/ → Technical documentation
- tools/ → Build and utility scripts

### Client
- React-based UI system
- Modular game engine (client/src/game)
- Canvas rendering pipeline
- Real-time HUD and gameplay UI

### Server
- Authoritative simulation loop
- Room-based multiplayer system
- Entity-driven architecture
- WebSocket networking layer

---

## 🎮 Features

### Gameplay
- Real-time multiplayer ship combat
- Physics-based projectiles and movement
- Team and role system
- Fleet coordination mechanics
- Kill feed and combat feedback
- Dynamic room lifecycle

### Client
- React UI system (HUD, DeadPanel, Scoreboard, etc.)
- Real-time rendering engine
- Input handling and prediction
- Internationalization (i18n)
- Audio and effects system

### Server
- Deterministic simulation loop
- Projectile and collision systems
- Room lifecycle management
- AI wave system
- WebSocket synchronization
- Admin/debug tools

---

## 🛠️ Tech Stack

- TypeScript (client + server)
- Node.js
- React
- Vite
- WebSockets
- Custom physics engine
- Tailwind

---

## 📦 Project Structure

client/
  src/
    game/        Core simulation logic
    ui/          React UI components
    hooks/       React hooks
    render/      Rendering pipeline
    fonts/       Font assets

server/
  sim/           Physics & simulation
  net/           Networking layer
  rooms/         Match lifecycle
  entities/      Game entities
  ai/            AI systems
  admin/         Admin tools

docs/
  server/        Architecture documentation

---

## ⚙️ Development

Install dependencies:
pnpm install

Run development server:
pnpm dev

Build:
pnpm build

Lint:
pnpm lint

---

## 🔄 Architecture Notes

This project has undergone a major refactor:

- Migration from JavaScript to TypeScript
- Modular game engine redesign
- Separation of UI and simulation logic
- Server-authoritative architecture improvements
- Removal of legacy client-side game loop

Some legacy files may still exist during transition.

---

## 📡 Networking Model

- WebSocket-based real-time communication
- Server-authoritative state simulation
- Client-side prediction for responsiveness
- Snapshot-based synchronization

---

## 🧪 Status

The project is actively evolving and currently includes:

- Full UI overhaul with React
- New modular game engine
- Improved physics and projectile simulation
- Refactored server architecture
- Enhanced gameplay systems (roles, fleets, AI behavior)
- Real-time chat
- Ship-editor tool

---

## 👤 Author

Powered by MDasier (https://github.com/MDasier)

---

## 📄 License

Add your license here (MIT / private / etc.)
