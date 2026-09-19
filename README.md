# Hand / Material

IF YOU WANT TO TRY IT CLICK ON THIS LINK https://mmjohnz.github.io/Hand-physics-simulator/

A browser playground with natural, shaded hands, two-hand camera tracking, and physical props.

## Run

```powershell
npm install
npm start
```

Open http://localhost:4173. An animated **Hand Physics Simulator — made by MMZ** introduction plays on launch. The physics engine is installed locally. Camera tracking downloads the MediaPipe hand model on first use and processes camera frames on the device. Use localhost or HTTPS.

## Objects

- **Glass pane:** strike the mounted sheet with a moving fist. The fracture divides the pane into irregular polygon shards. Each piece falls, rotates and collides with the floor and other pieces. Pinch a fallen piece to pick it up.
- **Banana:** hold the body with one or two hands. Pinch the stem with your other hand and pull away to remove one of three separate peel strips. Squeeze the fruit to make it compress under your grip; a hard squeeze leaves a subtle bruise. Each strip is a chain of physical joints. As you pull, its attachments release progressively; the detached strip bends and falls. Repeat for the remaining strips.
- **Water bottle:** hold the body with one or two hands. Pinch the cap and turn your other wrist clockwise to unscrew it. Release the cap, grab the bottle, and rotate your wrist to turn its mouth down. The plastic dents under a squeeze. An open, hard-squeezed bottle also forces a small amount of water from its mouth; inversion gives a normal gravity pour. It starts at 500 ml, loses water and mass while pouring, and stops when empty.

Use **Reset object** (or R) to restore the selected object. Item buttons animate and play quiet sounds; the sound control immediately mutes the audio output.

## Material cards

The right-side Glass, Banana, and Water bottle controls are separate physical **cards** (also commonly called buttons, menu items, or a control panel).

- Point at a card, then pinch once to click it immediately—there is no hold delay. The card and icon spring, flash, and play a click sound.
- Pinch and carry a card completely out of the sidebar and across the main stage; it is rendered in the same free interaction layer as the scene instead of being clipped inside the menu.
- Catch the floating card with your second tracked hand, then pull your hands apart. It stretches, narrows, bends, and wobbles like rubber before ripping into two jagged physical pieces.
- Each half follows the hand holding it, then drops when released.
- Select **Undo torn cards** to rebuild every ripped card.

Camera-tracked hands render above the cards, so fingers stay visible while pointing, pinching, dragging, or tearing.

## Physics and rendering

This is a 2D simulation, with shaded canvas drawings, not a scanned hand mesh or a full 3D fluid solver. Matter.js handles rigid-body collisions, momentum, spring grabs, and articulated joints in the hands and peels. A soft-material response layer adds localized banana compression, persistent bruising, and bottle dents without breaking those stable collisions. The bottle's fluid uses a volume-conserving horizontal free surface clipped to the rotated vessel; escaping droplets follow gravity and form a splash/puddle.

Hand tracking uses a pretrained MediaPipe hand model. Up to two detected hands are matched across frames. Turning a wrist in the camera plane rotates a held object. Occlusion and camera angle can affect tracking; tracking loss releases held objects.

## Hands-only selection

After enabling the camera, point your index fingertip at Glass pane, Banana, or Water bottle. Pinch after briefly hovering to select. A light-blue ring shows selection progress. Release an object before selecting another. Reset and sound also work with your hand; resets use a longer hold. Browser security still requires a real click/tap to enable the camera or enter fullscreen.

The hands have fuller fingers, wrists, and subtle palm shading. The banana stem has a forgiving grab area; pulling about 190 logical stage units removes a strip. Small pinch-detection interruptions are buffered for 90 ms. Re-grab a partly peeled strip at its loose end.

## Verification

```powershell
npm run check
npm test
npm run test:browser
```

Node tests cover fracture/settling, individual peel detachment, soft squeezing, wrist rotation/release, cap gating, conserved water volume and upright/inverted pouring. Playwright uses installed Chrome for desktop/mobile UI checks, hand model initialization, card tearing, undo, and synthetic two-hand input. Synthetic camera tests do not replace testing with real hands and a webcam.
