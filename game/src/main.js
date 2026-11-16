// EMBER YARD — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. Phases: menu -> buy (20 s) -> round (100 s)
// -> round end -> next buy, first to 5 rounds takes the match. The player
// (Ember Crew) carries the bomb and plants it at Site A; the Dock Wardens
// defend, then rush to defuse once it is planted.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITE_A, SPAWNS, WAYPOINTS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE } from './weapon.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME } from './bomb.js';
import { createEconomy, REWARDS } from './economy.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BUY_TIME = 20;
const WIN_ROUNDS = 5;
const ARMOR_PRICE = 650;
const ARMOR_VALUE = 50;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange, onLockError);
const bots = createBots(scene, world.colliders, world.shootables, WAYPOINTS, SPAWNS);
const bomb = createBomb(SITE_A);
const economy = createEconomy();
const audio = createAudio();
const bombMesh = bomb.makeMesh(scene);

const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const losRaycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const closestVec = new THREE.Vector3();

// --- Tracers: a pool of fading lines, one per shot ---
const tracers = [];
for (let i = 0; i < 16; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const tracer = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  const pos = tracer.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  tracer.line.visible = true;
  tracer.line.material.opacity = 0.85;
  tracer.life = 0.09;
}

// --- Particles: one Points cloud, pooled bursts of sparks ---
const PARTICLE_COUNT = 240;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(PARTICLE_COUNT * 3);
const particleVel = new Float32Array(PARTICLE_COUNT * 3);
const particleLife = new Float32Array(PARTICLE_COUNT);
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });
const particles = new THREE.Points(particleGeo, particleMat);
particles.frustumCulled = false;
scene.add(particles);
let particleIndex = 0;
function spawnBurst(at, count, speed, up = 2) {
  for (let i = 0; i < count; i += 1) {
    const p = particleIndex;
    particleIndex = (particleIndex + 1) % PARTICLE_COUNT;
    particlePos[p * 3] = at.x;
    particlePos[p * 3 + 1] = at.y;
    particlePos[p * 3 + 2] = at.z;
    const angle = random() * Math.PI * 2;
    const r = (0.3 + random() * 0.7) * speed;
    particleVel[p * 3] = Math.cos(angle) * r;
    particleVel[p * 3 + 1] = random() * up + 0.5;
    particleVel[p * 3 + 2] = Math.sin(angle) * r;
    particleLife[p] = 0.4 + random() * 0.4;
  }
  particleGeo.attributes.position.needsUpdate = true;
}

function stepParticles(dt) {
  let anyAlive = false;
  for (let p = 0; p < PARTICLE_COUNT; p += 1) {
    if (particleLife[p] <= 0) continue;
    particleLife[p] -= dt;
    if (particleLife[p] <= 0) {
      particlePos[p * 3 + 1] = -100;
      continue;
    }
    anyAlive = true;
    particleVel[p * 3 + 1] -= 9 * dt;
    particlePos[p * 3] += particleVel[p * 3] * dt;
    particlePos[p * 3 + 1] += particleVel[p * 3 + 1] * dt;
    particlePos[p * 3 + 2] += particleVel[p * 3 + 2] * dt;
  }
  if (anyAlive) particleGeo.attributes.position.needsUpdate = true;
}

// --- Grenades ---
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2a, roughness: 0.6, metalness: 0.3 });
function throwGrenade() {
  if (weapon.state.grenades <= 0 || phase !== 'round') return;
  weapon.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(camera.position);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: GRENADE.fuse,
  });
  audio.grenadeThrow();
  hud.setGrenades(weapon.state.grenades);
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  spawnBurst(g.mesh.position, 60, 7, 5);
  audio.explosion();
  addNoise(g.mesh.position.x, g.mesh.position.z);
  const center = g.mesh.position;
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - center.x, bot.position.z - center.z);
    if (d < GRENADE.radius) {
      const dmg = Math.round(GRENADE.maxDamage * (1 - d / GRENADE.radius) + 10);
      if (bots.damage(bot, dmg)) onBotKilled(bot, 'You', false);
    }
  }
  const pd = Math.hypot(player.state.position.x - center.x, player.state.position.z - center.z);
  if (pd < GRENADE.radius && phase === 'round') {
    damagePlayer(Math.round(GRENADE.maxDamage * (1 - pd / GRENADE.radius) * 0.5 + 5), null);
  }
  // Flash: a quick expanding amber sphere.
  const flashGeo = new THREE.SphereGeometry(1, 12, 10);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.55, depthWrite: false });
  const flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.position.copy(center);
  scene.add(flashMesh);
  flashMeshes.push({ mesh: flashMesh, life: 0.25 });
}
const flashMeshes = [];

// --- Game state ---
let phase = 'menu'; // menu | buy | round | roundEnd | matchEnd
let phaseTime = 0;
let roundNumber = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let noises = [];
let buyOpen = false;
let lastPlantBeep = 0;

const body = player.state;

function addNoise(x, z) {
  noises.push({ x, z, at: elapsed });
  if (noises.length > 12) noises.shift();
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function los(from, to) {
  tmpVec.copy(to).sub(from);
  const dist = tmpVec.length();
  if (dist < 0.01) return true;
  tmpVec.normalize();
  losRaycaster.set(from, tmpVec);
  losRaycaster.far = dist;
  return losRaycaster.intersectObjects(world.shootables, false).length === 0;
}

function refreshHud() {
  const w = weapon.syncHud();
  hud.setAmmo(w.mag, w.reserve, w.name);
  hud.setHealth(body.health, body.armor);
  hud.setMoney(economy.state.money);
  hud.setScore(economy.state.roundWins, economy.state.roundLosses);
  hud.setAlive(bots.aliveCount('ember') + (body.health > 0 ? 1 : 0), bots.aliveCount('warden'));
  hud.setGrenades(w.grenades);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function onBotKilled(bot, killerName, headshot) {
  hud.killfeed(killerName, bot.name, headshot);
  if (killerName === 'You') {
    economy.earn(REWARDS.kill);
    audio.hitmarker(true);
  }
  checkRoundEnd();
}

function damagePlayer(amount, fromBot) {
  if (phase !== 'round' || body.health <= 0) return;
  let remaining = amount;
  if (body.armor > 0) {
    const absorbed = Math.min(body.armor, Math.round(amount * 0.5));
    body.armor -= absorbed;
    remaining -= absorbed;
  }
  body.health -= remaining;
  audio.hurt();
  refreshHud();
  if (body.health <= 0) {
    body.health = 0;
    hud.banner('YOU ARE DOWN', 'Your crew fights on without you.', 2000);
    checkRoundEnd();
  }
}

// Player fires one round: hitscan against the world and the bots.
function shoot(spread) {
  if (!weapon.takeRound()) return false;
  const def = weapon.def();
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = def.range;
  const targets = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : tmpVec.copy(camera.position).addScaledVector(direction, def.range);
  spawnTracer(camera.position, end);
  if (hit) {
    spawnBurst(hit.point, 6, 2.5, 1.5);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const headshot = hit.object.userData.part === 'head';
      const dmg = headshot ? def.headDamage : def.damage;
      hud.hitMarker(false, shot ? 4000 : 90);
      audio.hitmarker(false);
      if (bots.damage(bot, dmg)) onBotKilled(bot, 'You', headshot);
    }
  }
  weapon.pullTrigger();
  player.recoil(weapon.recoilAmount() + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(weapon.state.current);
  addNoise(body.position.x, body.position.z);
  refreshHud();
  return true;
}

// A bot fires at its target: spread grows with distance and target movement.
function botShoot(bot, from, target) {
  const targetPos = target.kind === 'player'
    ? tmpVec2.set(body.position.x, body.position.y + 1.3, body.position.z)
    : tmpVec2.set(target.ref.position.x, target.ref.position.y + 1.3, target.ref.position.z);
  const dist = from.distanceTo(targetPos);
  const moving = target.kind === 'player' ? player.groundSpeed() : Math.hypot(target.ref.velocity.x, target.ref.velocity.z);
  const spread = 0.03 + dist * 0.0022 + Math.min(1, moving / 5) * 0.025;
  direction.copy(targetPos).sub(from).normalize();
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(from, direction);
  raycaster.far = 60;
  const targets = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : tmpVec.copy(from).addScaledVector(direction, 60);
  spawnTracer(from, end);
  if (hit && hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    if (victim.alive && victim.team !== bot.team) {
      // Ember allies hit a little harder than Wardens: the player's crew is
      // outnumbered 4 to 5, and should not melt in the first seconds.
      const headshot = hit.object.userData.part === 'head';
      const dmg = bot.team === 'ember' ? (headshot ? 100 : 36) : (headshot ? 85 : 28);
      if (bots.damage(victim, dmg)) {
        hud.killfeed(bot.name, victim.name, headshot);
        bot.kills += 1;
        checkRoundEnd();
      }
    }
  } else if (target.kind === 'player' && body.health > 0 && phase === 'round') {
    // The player has no mesh in the raycast, so test the ray's closest
    // approach to their chest: spread makes most bot shots miss by
    // decimetres, and a wall in front still blocks the shot.
    const along = tmpVec.copy(targetPos).sub(from).dot(direction);
    closestVec.copy(from).addScaledVector(direction, along);
    const lateral = closestVec.distanceTo(targetPos);
    if (along > 0 && lateral < 0.55 && (!hit || hit.distance >= along - 0.5)) {
      damagePlayer(8 + ((random() * 6) | 0), bot);
    }
  }
  audio.enemyShot(dist);
  addNoise(bot.position.x, bot.position.z);
}

function checkRoundEnd() {
  if (phase !== 'round') return;
  const emberAlive = bots.aliveCount('ember') + (body.health > 0 ? 1 : 0);
  const wardenAlive = bots.aliveCount('warden');
  if (bomb.state.status === 'planted') return; // fuse decides
  if (wardenAlive === 0) endRound(true, 'Wardens eliminated');
  else if (emberAlive === 0) endRound(false, 'Ember Crew eliminated');
}

function endRound(won, reason) {
  if (phase !== 'round') return;
  phase = 'roundEnd';
  phaseTime = 0;
  economy.roundEnd(won);
  if (won) {
    audio.roundWin();
    hud.banner('ROUND WON', reason, 3200);
  } else {
    audio.roundLose();
    hud.banner('ROUND LOST', reason, 3200);
  }
  bombMesh.visible = false;
  refreshHud();
}

function startBuyPhase() {
  phase = 'buy';
  phaseTime = 0;
  buyOpen = false;
  hud.hideBuy();
  hud.setHint('Press B to open the buy menu — round starts soon');
  refreshHud();
}

function startRound() {
  roundNumber += 1;
  phase = 'round';
  phaseTime = 0;
  bomb.reset();
  bombMesh.visible = false;
  bots.reset();
  player.reset(SPAWNS.ember[0][0], SPAWNS.ember[0][1]);
  weapon.refillAmmo();
  body.health = 100;
  body.armor = body.armor; // armor bought in the buy phase carries over
  hud.hideBuy();
  hud.hideBanner();
  hud.setHint('Plant the charge at Site A — hold E in the marked zone');
  hud.banner(`ROUND ${roundNumber}`, 'Plant the charge at Site A', 2200);
  refreshHud();
}

function endMatch(won) {
  phase = 'matchEnd';
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay(won ? 'matchWin' : 'matchLose', 0);
  if (won) audio.roundWin();
  else audio.roundLose();
}

function resetMatch() {
  economy.reset();
  roundNumber = 0;
  startBuyPhase();
}

function tryBuy(key) {
  if (phase !== 'buy' && !buyOpen) return;
  const catalog = {
    Digit1: { kind: 'weapon', id: 'pistol' },
    Digit2: { kind: 'weapon', id: 'smg' },
    Digit3: { kind: 'weapon', id: 'rifle' },
    Digit4: { kind: 'grenade' },
    Digit5: { kind: 'armor' },
  };
  const item = catalog[key];
  if (!item) return;
  if (item.kind === 'weapon') {
    const def = WEAPONS[item.id];
    if (weapon.state.owned[item.id]) {
      weapon.select(item.id);
      audio.buy();
    } else if (economy.spend(def.price)) {
      weapon.buy(item.id);
      weapon.select(item.id);
      audio.buy();
    } else {
      audio.denied();
    }
  } else if (item.kind === 'grenade') {
    if (economy.spend(GRENADE.price)) {
      weapon.buyGrenade();
      audio.buy();
    } else {
      audio.denied();
    }
  } else if (item.kind === 'armor') {
    if (body.armor >= ARMOR_VALUE) return;
    if (economy.spend(ARMOR_PRICE)) {
      body.armor = ARMOR_VALUE;
      audio.buy();
    } else {
      audio.denied();
    }
  }
  refreshHud();
  if (buyOpen) {
    hud.showBuy(buyItems(), economy.state.money);
  }
}

function buyItems() {
  return {
    pistol: { price: WEAPONS.pistol.price, owned: weapon.state.owned.pistol },
    smg: { price: WEAPONS.smg.price, owned: weapon.state.owned.smg },
    rifle: { price: WEAPONS.rifle.price, owned: weapon.state.owned.rifle },
    grenade: { price: GRENADE.price, owned: false },
    armor: { price: ARMOR_PRICE, owned: body.armor >= ARMOR_VALUE },
  };
}

function handlePressed(pressed) {
  for (const code of pressed) {
    if (code === 'KeyB' && (phase === 'buy' || phase === 'round')) {
      buyOpen = !buyOpen;
      if (buyOpen) hud.showBuy(buyItems(), economy.state.money);
      else hud.hideBuy();
    }
    // While the buy menu is open, number keys buy — they must not also
    // switch weapons or throw a grenade in the same press.
    if (buyOpen && ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
      tryBuy(code);
      continue;
    }
    if (code === 'Digit1') weapon.select('pistol');
    if (code === 'Digit2') weapon.select('smg');
    if (code === 'Digit3') weapon.select('rifle');
    if (code === 'Digit4' || code === 'KeyG') throwGrenade();
    if (code === 'KeyM') audio.toggleMute();
    if (code === 'KeyR') weapon.reload();
  }
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (phase === 'menu') resetMatch();
  } else if (phase !== 'matchEnd') {
    hud.showOverlay('paused', 0);
  }
}

// Pointer lock refused (headless, denied permission): still start the match
// so the game is playable from the keyboard; a click on the canvas retries
// the lock whenever the player wants the mouse back.
function onLockError() {
  if (shot) return;
  if (phase === 'menu') {
    started = true;
    hud.hideOverlay();
    resetMatch();
  } else {
    hud.setHint('Click the game to capture your mouse');
  }
}

renderer.domElement.addEventListener('click', () => {
  if (!shot && (phase === 'round' || phase === 'buy') && !input.state.locked) {
    input.requestLock();
  }
});

hud.onPlay(() => {
  if (shot) return;
  if (phase === 'matchEnd') {
    resetMatch();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function step(dt) {
  elapsed += dt;
  phaseTime += dt;
  noises = noises.filter((n) => elapsed - n.at < 1.5);

  if (phase === 'buy' && phaseTime >= BUY_TIME) {
    startRound();
  } else if (phase === 'roundEnd' && phaseTime >= 4) {
    if (economy.state.roundWins >= WIN_ROUNDS) endMatch(true);
    else if (economy.state.roundLosses >= WIN_ROUNDS) endMatch(false);
    else startBuyPhase();
  }

  if (phase === 'round' || phase === 'buy') {
    // A dead player stops moving: without this the corpse keeps walking
    // wherever the keys point, since input is only cleared on unlock.
    if (body.health > 0) player.step(dt, input.state.keys);
    weapon.step(dt);
    // Mouse look and edge-triggered keys run in both phases: the buy menu
    // (B + number keys) has to work during the buy phase, not only in a round.
    const look = input.takeLook();
    player.look(look.x, look.y);
    handlePressed(input.takePressed());
  }

  if (phase === 'round') {
    // Round timer: defenders win on expiry if the bomb is not planted.
    const timeLeft = ROUND_TIME - phaseTime;
    hud.setTimer(bomb.state.status === 'planted' ? bomb.state.fuseLeft : timeLeft, 'round');
    if (timeLeft <= 0 && bomb.state.status !== 'planted') {
      endRound(false, 'Time expired — the charge was never planted');
    }

    // Bomb planting (hold E inside Site A) and fuse.
    const planting = input.state.keys.has('KeyE') && bomb.inSite(body.position.x, body.position.z) && body.health > 0;
    const event = bomb.step(dt, { planting, playerAlive: body.health > 0 });
    if (event === 'planted') {
      economy.earn(REWARDS.plant);
      hud.banner('CHARGE PLANTED', 'Defend it — 35 seconds to detonation', 2600);
      bombMesh.visible = true;
      addNoise(body.position.x, body.position.z);
      refreshHud();
    } else if (event === 'detonated') {
      audio.explosion();
      spawnBurst(new THREE.Vector3(SITE_A.x, 0.5, SITE_A.z), 80, 9, 6);
      endRound(true, 'The charge detonated at Site A');
    }
    if (bomb.state.status === 'planting') {
      hud.setPlant(bomb.state.progress, `PLANTING… ${Math.ceil((1 - bomb.state.progress) * PLANT_TIME)}s`);
      if (elapsed - lastPlantBeep > 0.5) {
        lastPlantBeep = elapsed;
        audio.plantBeep();
      }
    } else if (bomb.state.status === 'planted') {
      const warden = bots.list.find((b) => b.alive && b.team === 'warden' && b.defuseAt > 0);
      if (warden) {
        hud.setPlant((elapsed - warden.defuseAt) / 5, 'WARDEN DEFUSING — STOP THEM');
      } else {
        hud.setPlant(1 - bomb.state.fuseLeft / 35, `DETONATION IN ${Math.ceil(bomb.state.fuseLeft)}s`);
      }
      // Planted bomb beeps faster as the fuse runs down.
      const interval = bomb.state.fuseLeft > 10 ? 1 : 0.5;
      if (elapsed - bomb.state.beepAt > interval) {
        bomb.state.beepAt = elapsed;
        audio.plantBeep();
      }
    } else {
      hud.setPlant(null);
    }
    if (bomb.state.status === 'planted') bombMesh.visible = true;

    // Bots act.
    bots.step(dt, {
      time: elapsed,
      playerAlive: body.health > 0,
      player: body,
      playerPos: body.position,
      los,
      shoot: botShoot,
      noises,
      bombPlanted: bomb.state.status === 'planted',
      site: SITE_A,
      onDefused: (bot) => {
        bomb.defuse();
        endRound(false, `${bot.name} defused the charge`);
      },
    });

    // Grenades fly and blow.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.vel.y *= -0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      }
      if (g.fuse <= 0) {
        explodeGrenade(g);
        grenades.splice(i, 1);
      }
    }
    for (let i = flashMeshes.length - 1; i >= 0; i -= 1) {
      const f = flashMeshes[i];
      f.life -= dt;
      f.mesh.scale.multiplyScalar(1 + dt * 22);
      f.mesh.material.opacity = Math.max(0, f.life * 2.2);
      if (f.life <= 0) {
        scene.remove(f.mesh);
        flashMeshes.splice(i, 1);
      }
    }

    // Player firing + spread HUD.
    if (input.state.firing && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    hud.setSpread(6 + weapon.spread(player.groundSpeed()) * 900);
  } else if (phase === 'buy') {
    // Buy phase counts down; menu / round end / match end keep the last
    // timer value on screen instead of flashing 0:00.
    hud.setTimer(BUY_TIME - phaseTime, phase);
  }

  // Tracers and particles fade every step, whatever the phase.
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life * 9);
      if (tracer.life <= 0) tracer.line.visible = false;
    }
  }
  stepParticles(dt);

  // Hint line follows the situation.
  if (phase === 'buy') {
    hud.setHint(buyOpen ? 'Buy: 1 pistol · 2 SMG · 3 rifle · 4 frag · 5 armor — B to close' : 'Press B to open the buy menu');
  } else if (phase === 'round') {
    if (bomb.state.status === 'carried') {
      hud.setHint(bomb.inSite(body.position.x, body.position.z) ? 'Hold E to plant the charge' : 'Reach Site A — follow the amber lights');
    } else if (bomb.state.status === 'planted') {
      hud.setHint('Charge planted — defend Site A');
    }
  }

  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    // Menu view: spawn, looking down mid toward Site A.
    player.reset(0, 14.5);
    bots.reset();
    refreshHud();
    hud.setTimer(ROUND_TIME, 'round');
    hud.showOverlay('start', 0);
    aimAt(new THREE.Vector3(0, 1.5, -13.5));
    settle(20);
  } else if (name === 'buy') {
    player.reset(0, 14.5);
    bots.reset();
    phase = 'buy';
    phaseTime = 2;
    economy.state.money = 4200;
    buyOpen = true;
    hud.showBuy(buyItems(), economy.state.money);
    hud.setTimer(BUY_TIME - phaseTime, 'buy');
    refreshHud();
    aimAt(new THREE.Vector3(6, 1.2, 2));
    settle(10);
  } else if (name === 'play') {
    // Mid-fight: round running, player at mid cover engaging a warden in
    // the open — clear line of sight down mid, no container between them.
    startRound();
    phaseTime = 18;
    body.position.set(-1.5, 0, 2);
    body.yaw = 0.35;
    body.pitch = 0.01;
    const warden = bots.list.find((b) => b.team === 'warden');
    warden.position.set(1.5, 0, -3);
    warden.yaw = Math.PI;
    warden.target = { kind: 'player', ref: body, pos: body.position, lastSeen: elapsed, dist: 6 };
    warden.reactionAt = elapsed;
    warden.burstLeft = 3;
    warden.nextShotAt = elapsed;
    settle(30);
    aimAt(new THREE.Vector3(1.5, 1.3, -3));
    shoot(0);
    settle(6);
    aimAt(new THREE.Vector3(1.5, 1.3, -3));
    shoot(0);
    settle(24);
    // Re-aim at the warden where it actually ended up (it strafes while
    // engaging), so the crosshair sits on the enemy in the capture.
    aimAt(new THREE.Vector3(warden.position.x, warden.position.y + 1.3, warden.position.z));
    body.health = 100; // the capture is about the fight, not the damage taken
    refreshHud();
  } else if (name === 'plant') {
    // Planting, captured mid-action: the player holds E inside Site A and
    // the charge goes in — the deterministic check that hold-to-plant works.
    // The Wardens are staged on the far flanks for this capture (rotating),
    // so the player survives the 3.5 s plant uninterrupted.
    startRound();
    phaseTime = 24;
    const flankSpots = [[14, 8], [-14, 8], [14, 0], [-14, 0], [0, 6]];
    let spot = 0;
    for (const bot of bots.list) {
      if (bot.team !== 'warden') continue;
      bot.position.set(flankSpots[spot][0], 0, flankSpots[spot][1]);
      spot += 1;
      bot.target = null;
      bot.path = [];
      bot.holdUntil = elapsed + 10;
    }
    body.position.set(0, 0, -13.5);
    body.yaw = 0.5;
    body.pitch = 0.02;
    input.press('KeyE');
    settle(230); // ~3.8 s: plant (3.5 s) completes, banner shows
    refreshHud();
  } else if (name === 'end') {
    // Round won: charge planted, detonated, banner up. The banner is
    // re-shown with a long duration here because the capture's virtual
    // clock would otherwise hide it before the screenshot is taken.
    startRound();
    phaseTime = 60;
    bomb.state.status = 'planted';
    bomb.state.fuseLeft = 0.05;
    bombMesh.visible = true;
    body.position.set(-3, 0, -8);
    body.yaw = -0.4;
    body.pitch = 0.02;
    settle(10);
    endRound(true, 'The charge detonated at Site A');
    hud.banner('ROUND WON', 'The charge detonated at Site A', 60000);
    hud.setScore(1, 0);
    settle(30);
    refreshHud();
  }
  hud.setScore(economy.state.roundWins, economy.state.roundLosses);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Read-only state snapshot for automated playtests and the finalist review:
// window.__ember.snapshot() reports phase, round, health, money, ammo, bomb
// status and alive counts without letting a page script change the game.
window.__ember = {
  snapshot() {
    return {
      phase,
      round: roundNumber,
      wins: economy.state.roundWins,
      losses: economy.state.roundLosses,
      health: Math.ceil(body.health),
      armor: body.armor,
      money: economy.state.money,
      mag: weapon.state.mag,
      reserve: weapon.state.reserve,
      weapon: weapon.state.current,
      grenades: weapon.state.grenades,
      bomb: bomb.state.status,
      fuseLeft: Math.ceil(bomb.state.fuseLeft),
      emberAlive: bots.aliveCount('ember') + (body.health > 0 ? 1 : 0),
      wardenAlive: bots.aliveCount('warden'),
      playerPos: [Math.round(body.position.x * 10) / 10, Math.round(body.position.z * 10) / 10],
    };
  },
};

syncCamera();
refreshHud();
hud.setTimer(ROUND_TIME, 'round');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
