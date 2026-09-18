# Hand / Material

IF YOU WANT TO TRY IT CLICK ON THIS LINK https://mmjohnz.github.io/Hand-physics-simulator/

A browser playground with natural, shaded hands, two-hand camera tracking, and physical props.

## Run

```powershell
npm install
npm start
```

Open http://localhost:4173. The physics engine is installed locally. Camera tracking downloads a pinned MediaPipe model on first use; camera frames are processed on the device. Use localhost or HTTPS.

## Objects

- **Glass pane:** strike the mounted sheet with a moving fist. The fracture divides the pane into irregular polygon shards. Each piece falls, rotates and collides with the floor and other pieces. Pinch a fallen piece to pick it up.
- **Banana:** hold the body with one hand. Pinch the stem with your other hand and pull away to remove one of three separate peel strips. Each strip is a chain of physical joints. As you pull, its attachments release progressively; the detached strip bends and falls. Repeat for the remaining strips.
- **Water bottle:** hold the body with one hand. Pinch the cap and turn your other wrist clockwise to unscrew it. Release the cap, grab the bottle, and rotate your wrist to turn its mouth down. Water only leaves an open, inverted bottle with water at the mouth. It starts at 500 ml, loses water and mass while pouring, and stops when empty or upright.

Use **Reset object** (or R) to restore the selected object. Item buttons animate and play quiet sounds; the sound control immediately mutes the audio output.

## Mouse controls

Mouse controls work while the camera is off.

- Glass: click the pane to strike it; drag shards.
- Banana: drag the stem to pull a strip, or drag the fruit body.
- Bottle: hold the cap and scroll down (or press E repeatedly) to unscrew it. Release it, then grab the body. Scroll or use Q/E while holding to rotate.

## Physics and rendering

This is a 2D simulation, with shaded canvas drawings, not a scanned hand mesh or a full 3D fluid solver. Matter.js handles rigid-body collisions, momentum, spring grabs, and articulated joints in the hands and peels. The bottle's fluid uses a volume-conserving horizontal free surface clipped to the rotated vessel; escaping droplets follow gravity and form a splash/puddle.

Hand tracking uses a pretrained MediaPipe model and does not learn or record personal gestures. Up to two detected hands are matched across frames. Turning a wrist in the camera plane rotates a held object. Occlusion and camera angle can affect tracking; tracking loss releases held objects.

## Verification

```powershell
npm run check
npm test
npm run test:browser
```

Node tests cover fracture/settling, individual peel detachment, wrist rotation/release, cap gating, conserved water volume and upright/inverted pouring. Playwright uses installed Chrome for desktop/mobile UI checks, the full mouse bottle sequence, model initialization and synthetic two-hand input. Synthetic hand tests do not replace testing with real hands and a webcam.

