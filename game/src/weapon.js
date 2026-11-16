// Three hitscan weapons + a frag grenade. Each weapon owns its numbers —
// damage, fire rate, magazine, spread, recoil, reload time — and its view
// model. main.js owns the ray, the damage application and the grenade arc.
// Spread grows with movement and with sustained fire, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, damage: 38, headDamage: 95, mag: 12, reserve: 48,
    fireGap: 0.22, reloadTime: 1.4, spreadStill: 0.003, spreadMoving: 0.03,
    recoil: 0.011, auto: false, range: 60,
  },
  smg: {
    name: 'VK-9 Ripper', price: 1500, damage: 24, headDamage: 72, mag: 32, reserve: 96,
    fireGap: 0.075, reloadTime: 1.7, spreadStill: 0.006, spreadMoving: 0.038,
    recoil: 0.007, auto: true, range: 55,
  },
  rifle: {
    name: 'AR-77 Longshot', price: 2700, damage: 34, headDamage: 100, mag: 30, reserve: 90,
    fireGap: 0.096, reloadTime: 1.9, spreadStill: 0.0022, spreadMoving: 0.028,
    recoil: 0.013, auto: true, range: 90,
  },
};

export const GRENADE = {
  name: 'Frag Grenade', price: 300, radius: 6.5, maxDamage: 110, fuse: 1.6,
};

const MUZZLE_TIME = 0.06;

function buildViewModel(def, key) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  if (key === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), body);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.07), grip);
    gripMesh.position.set(0, -0.08, 0.08);
    gripMesh.rotation.x = 0.25;
    model.add(slide, gripMesh);
  } else if (key === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), grip);
    barrel.position.set(0, 0.02, -0.26);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), accent);
    mag.position.set(0, -0.11, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), grip);
    stock.position.set(0, -0.01, 0.24);
    model.add(receiver, barrel, mag, stock);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), accent);
    sight.position.set(0, 0.08, -0.05);
    model.add(receiver, barrel, stock, sight);
  }
  model.position.set(0.32, -0.3, -0.7);
  model.scale.setScalar(0.62);
  model.rotation.y = 0.15; // angled in, so the side — not just the top — reads
  model.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = false; });
  return model;
}

export function createWeapon(camera) {
  const models = {};
  for (const key of Object.keys(WEAPONS)) {
    models[key] = buildViewModel(WEAPONS[key], key);
    models[key].visible = false;
    camera.add(models[key]);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.27, -0.28, -1.05);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.27, -0.25, -0.8);
  camera.add(flashLight);

  const state = {
    current: 'rifle',
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    heat: 0, // sustained-fire bloom, decays when not firing
    grenades: 0,
    owned: { pistol: true, smg: false, rifle: true },
    ammo: {
      pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
      smg: { mag: 0, reserve: 0 },
      rifle: { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve },
    },
  };

  function currentDef() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const key of Object.keys(models)) models[key].visible = key === state.current;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.7 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const def = currentDef();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = state.ammo[state.current];
        const need = def.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
        state.mag = slot.mag;
        state.reserve = slot.reserve;
      }
    }
  }

  return {
    state,
    step,
    def() {
      return currentDef();
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const def = currentDef();
      state.cooldown = def.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + (def.auto ? 0.09 : 0.05));
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      state.ammo[state.current].mag = state.mag;
      return true;
    },
    reload() {
      const def = currentDef();
      const slot = state.ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed) {
      const def = currentDef();
      const move = Math.min(1, speed / 5.2);
      return def.spreadStill + move * def.spreadMoving + state.heat * 0.012;
    },
    recoilAmount() {
      return currentDef().recoil;
    },
    select(key) {
      if (!state.owned[key] || key === state.current || state.reloadLeft > 0) return false;
      state.current = key;
      state.mag = state.ammo[key].mag;
      state.reserve = state.ammo[key].reserve;
      state.cooldown = 0.25; // switch delay
      showModel();
      return true;
    },
    buy(key) {
      if (state.owned[key]) return false;
      state.owned[key] = true;
      state.ammo[key] = { mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
      return true;
    },
    buyGrenade() {
      state.grenades += 1;
      return true;
    },
    refillAmmo() {
      for (const key of Object.keys(WEAPONS)) {
        if (!state.owned[key]) continue;
        state.ammo[key] = { mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
      }
      state.mag = state.ammo[state.current].mag;
      state.reserve = state.ammo[state.current].reserve;
      state.grenades = 0;
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
    syncHud() {
      return { mag: state.mag, reserve: state.reserve, name: currentDef().name, grenades: state.grenades };
    },
  };
}
