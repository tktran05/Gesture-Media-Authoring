# Gesture Media Authoring System
> TP25216 — Real-Time 3D Object Placement and Manipulation Using Hand Gestures

## Requirements

- [Node.js](https://nodejs.org) v18+
- A browser with webcam access (Chrome recommended)

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/gesture-3d-scene.git
cd gesture-3d-scene

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
```

Then open `http://localhost:5173` in your browser and allow webcam access.

## Build for deployment

```bash
npm run build
```

Output will be in the `dist/` folder. To preview the build locally:

```bash
npm run preview
```

To run `dist/` on another machine without internet (e.g. USB demo):

```bash
# Inside the dist/ folder
python -m http.server 8080
# Then open http://localhost:8080
```

> Webcam requires either `localhost` or `HTTPS` to work — do not open `index.html` directly by double-clicking.

## Project Structure

```
gesture-3d-scene/
├── index.html          # Entry point
├── vite.config.js
├── src/
│   ├── main.js         # Connects gesture + scene
│   ├── gesture.js      # Member A — MediaPipe hand tracking
│   └── scene.js        # Member B — Three.js 3D scene
└── public/
```

## Controls (current)

| Input | Action |
|---|---|
| Pinch (thumb + index) | Grab and move object |
| Pinch + spread | Scale object |
| Key `1` `2` `3` | Select object (temporary) |
| Key `Shift` | Toggle move / scale mode (temporary) |

## Team

| Name | ID | Role |
|---|---|---|
| Trần Trung Kiên | 20233859 | 3D scene & object library |
| Dương Văn Kiên | 20233857 | Vision & gesture recognition |
