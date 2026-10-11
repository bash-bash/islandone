import { PointerEventTypes, Vector3, type AbstractMesh, type ArcRotateCamera, type Scene } from "@babylonjs/core";
import type { Character } from "./character";

// Player input for the beach test:
//   WASD / arrow keys  walk, relative to the camera view
//   Shift              run
//   click on the sand  walk there
// The camera follows the character once it moves, keeping the framing the player chose;
// orbit, zoom and pan stay on the mouse.

const FOLLOW_RATE = 5; // 1/s, how quickly the camera catches up

export function attachPlayerControl(
  scene: Scene,
  camera: ArcRotateCamera,
  character: Character,
  isGround: (mesh: AbstractMesh) => boolean,
) {
  // The orbit camera turns with the arrow keys by default; they move the character now.
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

  const held = new Set<string>();
  const onKey = (e: KeyboardEvent, down: boolean) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const code = e.code;
    if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(code)) return;
    if (down) held.add(code);
    else held.delete(code);
    e.preventDefault();
  };
  const keydown = (e: KeyboardEvent) => onKey(e, true);
  const keyup = (e: KeyboardEvent) => onKey(e, false);
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  // Losing focus while a key is down would otherwise keep the character walking.
  const blur = () => held.clear();
  window.addEventListener("blur", blur);

  scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERTAP || info.event.button !== 0) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY, isGround);
    if (pick?.hit && pick.pickedPoint) {
      character.goTo(pick.pickedPoint);
      following = true;
    }
  });

  let following = false;
  const offset = new Vector3();
  const lastTarget = camera.target.clone();
  const forward = new Vector3();
  const right = new Vector3();

  const update = (dt: number) => {
    // Camera-relative input: forward is where the camera looks, flattened onto the ground.
    camera.target.subtractToRef(camera.position, forward);
    forward.y = 0;
    forward.normalize();
    // Babylon is left-handed: right = up × forward.
    right.set(forward.z, 0, -forward.x);
    const f = +(held.has("KeyW") || held.has("ArrowUp")) - +(held.has("KeyS") || held.has("ArrowDown"));
    const r = +(held.has("KeyD") || held.has("ArrowRight")) - +(held.has("KeyA") || held.has("ArrowLeft"));
    const run = held.has("ShiftLeft") || held.has("ShiftRight");
    if (f || r) {
      const dir = forward.scale(f).addInPlace(right.scale(r));
      character.drive(dir.normalize(), run);
      following = true;
    } else character.drive(null, run);

    // Follow: keep the offset between camera focus and character that the player had when
    // it started moving; a pan (the focus moved without us) changes that offset.
    const pos = character.root.position;
    if (!following) camera.target.subtractToRef(pos, offset);
    else {
      offset.addInPlace(camera.target.subtract(lastTarget));
      const k = 1 - Math.exp(-FOLLOW_RATE * dt);
      camera.target.addInPlace(pos.add(offset).subtractInPlace(camera.target).scaleInPlace(k));
    }
    lastTarget.copyFrom(camera.target);
  };

  return {
    update,
    dispose() {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    },
  };
}
