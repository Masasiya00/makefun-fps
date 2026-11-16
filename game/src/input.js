// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only: the game asks the canvas for pointer lock and
// reads movementX/Y while it holds it. pressed() gives edge-triggered keys
// (buy, grenade, weapon switch) that main.js consumes once per frame.
// If pointer lock is refused (headless, iframe, permission), onLockError
// fires so the game can still start — keyboard play works without the mouse.
export function createInput(canvas, onLockChange, onLockError) {
  const keys = new Set();
  const pressedQueue = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressedQueue.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });
  document.addEventListener('pointerlockerror', () => {
    if (typeof onLockError === 'function') onLockError();
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // True once for each keydown since the last call; main.js drains it.
    takePressed() {
      const out = new Set(pressedQueue);
      pressedQueue.clear();
      return out;
    },
    // Synthetic input for the ?shot= captures: pretend keys are held.
    press(code) {
      keys.add(code);
      pressedQueue.add(code);
    },
    release(code) {
      keys.delete(code);
    },
  };
}
