// The bomb: carried by the player, planted at site A (hold E in the zone),
// then a 35 s fuse the Wardens can defuse in 5 s. One state machine, owned
// here; main.js renders the progress and the beeps.
import * as THREE from 'three';

export const PLANT_TIME = 3.5;
export const FUSE_TIME = 35;
export const DEFUSE_TIME = 5;

export function createBomb(site) {
  const state = {
    status: 'carried', // carried | planting | planted | detonated | defused
    progress: 0,
    fuseLeft: FUSE_TIME,
    beepAt: 0,
  };

  function inSite(x, z) {
    return Math.hypot(x - site.x, z - site.z) <= site.radius;
  }

  return {
    state,
    inSite,
    // Called every fixed step while the round runs. Returns an event string
    // ('planted' | 'detonated' | null) for main.js to act on.
    step(dt, { planting, playerAlive }) {
      if (state.status === 'carried') {
        if (planting && playerAlive) {
          state.status = 'planting';
          state.progress = 0;
        }
        return null;
      }
      if (state.status === 'planting') {
        if (!planting || !playerAlive) {
          state.status = 'carried';
          state.progress = 0;
          return null;
        }
        state.progress += dt / PLANT_TIME;
        if (state.progress >= 1) {
          state.status = 'planted';
          state.fuseLeft = FUSE_TIME;
          state.progress = 0;
          return 'planted';
        }
        return null;
      }
      if (state.status === 'planted') {
        state.fuseLeft -= dt;
        if (state.fuseLeft <= 0) {
          state.status = 'detonated';
          return 'detonated';
        }
      }
      return null;
    },
    defuse() {
      if (state.status !== 'planted') return;
      state.status = 'defused';
    },
    reset() {
      state.status = 'carried';
      state.progress = 0;
      state.fuseLeft = FUSE_TIME;
      state.beepAt = 0;
    },
    // A small blinking charge mesh, shown once planted.
    makeMesh(scene) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.6, metalness: 0.4 }),
      );
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.06, 0.06),
        new THREE.MeshBasicMaterial({ color: 0xff3020 }),
      );
      light.position.set(0, 0.14, 0);
      group.add(body, light);
      group.position.set(site.x, 0.12, site.z);
      group.visible = false;
      scene.add(group);
      return group;
    },
  };
}
