# gesture-3d-scene

An interactive 3D Solar System controlled entirely by **hand gestures** via your webcam — no mouse, no keyboard. Built with Three.js for rendering and MediaPipe Hands for real-time gesture recognition.

> Course project — **TP25216** *Real-Time 3D Object Placement and Manipulation Using Hand Gestures*.

---

## Features

- **5 hand gestures** drive the entire experience: orbit, zoom, drag-and-drop, focus, and reset.
- **8-planet solar system** with Kepler-style orbital speeds and self-rotation.
- **Drag-to-orbit snapping**: pull a planet to any orbit and it adopts that orbit's speed.
- **Focus mode**: zoom into any planet and the camera follows it through its orbit.
- **Camera-facing 3D labels** for each planet (auto-billboard sprites).
- **Cinematic visuals**: ACES tone mapping, Unreal-style bloom, sun lensflare, starfield skybox.
- **Looping background music** (Interstellar theme) with autoplay fallback.
- **Hysteresis + EMA smoothing** for stable, jitter-free gesture recognition.

---

## Demo
Live demo avaiable at: https://poetic-crostata-aeb4d6.netlify.app/

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| 3D rendering | [three.js](https://threejs.org/) `^0.183.2` |
| Hand tracking | [@mediapipe/hands](https://www.npmjs.com/package/@mediapipe/hands) `^0.4` + [@mediapipe/camera_utils](https://www.npmjs.com/package/@mediapipe/camera_utils) `^0.3` |
| 3D text labels | [three-spritetext](https://www.npmjs.com/package/three-spritetext) `^1.10` |
| Post-processing | Three.js `EffectComposer` / `UnrealBloomPass` / `Lensflare` |
| Build tool | [Vite](https://vitejs.dev/) `^8.0` |
| Language | Vanilla JavaScript (ES Modules), no TypeScript |

---

## Project Structure

```
gesture-3d-scene/
├── index.html              # HTML shell: hidden <video>, hand overlay canvas, HUD
├── main.js                 # App entry: wiring + command routing + render loop + BGM
├── package.json
├── src/
│   ├── scene.js            # Builds the 3D world (planets, lights, sky, post-processing)
│   ├── gesture.js          # MediaPipe pipeline + gesture detection + command emission
│   ├── picking.js          # Hand-position → planet selection (raycast + fallback)
│   ├── drag.js             # Drag controller (pinch-to-grab + snap-to-orbit)
│   ├── focus.js            # Focus controller (fly-in, planet-follow, reset)
│   ├── cameraGestures.js   # Pure functions: orbitCamera() + zoomCamera()
│   └── overlay.js          # Draws the 21-landmark hand skeleton on canvas
└── textures/               # Planet/sun/star textures + interstellar.mp3 (BGM)
```

Each `src/` module has one clear responsibility. `main.js` is just **wiring** — it should stay short and easy to read.

---

## Installation

### Requirements

- [Node.js](https://nodejs.org) **v18+**
- A modern browser with webcam permission (Chrome / Edge recommended)

### Steps

```bash
git clone https://github.com/<your-username>/gesture-3d-scene.git
cd gesture-3d-scene
npm install
```

---

## Running the Project

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server with HMR. Open [http://localhost:5173](http://localhost:5173). |
| `npm run build` | Production build to `dist/`. |
| `npm run preview` | Serve the production build locally for QA. |

Then **allow webcam access** when prompted.

### Running the built bundle on another machine

```bash
# inside dist/
python -m http.server 8080
# open http://localhost:8080
```

---

## Usage

All interaction happens with **your hand in front of the webcam**. The HUD in the top-left always shows the currently detected gesture state.

| Gesture | Action |
|---------|--------|
| ✋ **One hand, open palm** | Orbit the camera around the current target |
| 👌👌 **Both hands pinching** | Zoom in / out (move hands apart = closer, together = farther) |
| 👌 **Right-hand pinch** on a planet | Grab and drag the planet; release to snap it onto the nearest orbit |
| 🤏 **Left-hand pinch** on a planet | Fly the camera into focus on that planet (camera follows it through its orbit) |
| ✊ **Left-hand fist** | Exit focus and zoom back out to the initial overview |

