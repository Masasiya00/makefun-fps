// Bots: 3 Ember allies + 5 Dock Wardens. Each bot walks a waypoint graph,
// holds positions, sees through FOV + line-of-sight, hears gunfire, and
// reacts with a human-ish delay before firing in bursts. Wardens rush site A
// to defuse once the bomb is planted; Ember bots defend it. One shared
// raycaster (passed in as ctx.los) keeps vision cheap.
import * as THREE from 'three';
import { moveBody, BODY_RADIUS } from './player.js';
import { TEAM } from './palette.js';

const ALLY_NAMES = ['Rook', 'Vex', 'Mira'];
const ENEMY_NAMES = ['Holt', 'Bram', 'Kessler', 'Dove', 'Yara'];
const BOT_HEIGHT = 1.72;
const BOT_SPEED = 3.6;
const SIGHT_RANGE = 30;
const HEAR_RANGE = 13; // gunfire pulls nearby bots in; spawn shots should not drag the whole defence south
const FOV_COS = Math.cos((75 * Math.PI) / 180);

function bfsPath(nodes, edges, from, to) {
  if (from === to) return [to];
  const adj = new Map();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const prev = new Array(nodes.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const next of adj.get(cur) ?? []) {
      if (prev[next] === -1) {
        prev[next] = cur;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return [to];
  const path = [];
  let cur = to;
  while (cur !== from) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

export function createBots(scene, colliders, shootables, waypoints, spawns) {
  const nodes = waypoints.nodes;
  const hitMeshes = [];
  const bots = [];
  const tmp = new THREE.Vector3();

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i][0] - x) ** 2 + (nodes[i][1] - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function makeBot(team, name, index) {
    const color = team === 'ember' ? TEAM.ember : TEAM.warden;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.26), darkMat);
    legs.position.y = 0.36;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.32), bodyMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
    head.position.y = 1.58;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    helmet.position.y = 1.6;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.22, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
    );
    marker.position.y = 1.98;
    marker.rotation.x = Math.PI;
    group.add(legs, torso, head, helmet, gun, marker);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });
    scene.add(group);

    const bot = {
      id: `${team}-${index}`,
      team,
      name,
      group,
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: 0,
      health: 100,
      alive: true,
      speed: BOT_SPEED * (0.9 + Math.random() * 0.25),
      path: [],
      node: 0,
      holdUntil: 0,
      thinkAt: Math.random() * 0.15,
      target: null, // { kind: 'player' | 'bot', ref, lastSeen }
      reactionAt: 0,
      burstLeft: 0,
      shootAt: 0,
      strafeDir: 1,
      strafeUntil: 0,
      defuseAt: 0,
      investigate: null,
      kills: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    bot.torso = torso;
    bot.head = head;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < ALLY_NAMES.length; i += 1) makeBot('ember', ALLY_NAMES[i], i);
  for (let i = 0; i < ENEMY_NAMES.length; i += 1) makeBot('warden', ENEMY_NAMES[i], i);

  function reset() {
    for (const bot of bots) {
      const spawnList = bot.team === 'ember' ? spawns.ember : spawns.warden;
      const idx = bot.team === 'ember'
        ? (ALLY_NAMES.indexOf(bot.name) + 1) % spawnList.length
        : ENEMY_NAMES.indexOf(bot.name) % spawnList.length;
      const [x, z] = spawnList[idx];
      bot.position.set(x, 0, z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'ember' ? 0 : Math.PI;
      bot.health = 100;
      bot.alive = true;
      bot.group.visible = true;
      bot.group.rotation.set(0, 0, 0);
      bot.path = [];
      bot.node = nearestNode(x, z);
      bot.holdUntil = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.defuseAt = 0;
      bot.investigate = null;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.defuseAt = 0; // damage interrupts a defuse
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.health = 0;
    bot.group.rotation.x = -Math.PI / 2;
    bot.group.position.y = -0.15;
    return true;
  }

  function pickDestination(bot, ctx) {
    // Wardens converge on site A once the bomb is planted; otherwise roam
    // the graph with a bias toward mid / the site.
    if (ctx.bombPlanted && bot.team === 'warden') return nearestNode(ctx.site.x, ctx.site.z);
    if (ctx.bombPlanted && bot.team === 'ember') {
      const near = [11, 12, 13, 14, 15, 16];
      return near[(Math.random() * near.length) | 0];
    }
    if (bot.investigate !== null) {
      const node = bot.investigate;
      bot.investigate = null;
      return node;
    }
    if (bot.team === 'warden') {
      const pool = [9, 10, 11, 12, 13, 14, 15, 16, 5, 6, 7, 8];
      return pool[(Math.random() * pool.length) | 0];
    }
    const pool = [9, 10, 12, 13, 3, 4, 5, 6];
    return pool[(Math.random() * pool.length) | 0];
  }

  function think(bot, ctx) {
    // --- Vision: nearest living enemy inside FOV + range + LOS ---
    const enemies = [];
    if (ctx.playerAlive && bot.team === 'warden') {
      enemies.push({ kind: 'player', ref: ctx.player, pos: ctx.playerPos });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      enemies.push({ kind: 'bot', ref: other, pos: other.position });
    }
    let seen = null;
    let seenDist = Infinity;
    const eyeY = bot.position.y + 1.55;
    for (const enemy of enemies) {
      const dx = enemy.pos.x - bot.position.x;
      const dy = (enemy.pos.y + 1.3) - eyeY;
      const dz = enemy.pos.z - bot.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > SIGHT_RANGE || dist >= seenDist) continue;
      const fwdX = -Math.sin(bot.yaw);
      const fwdZ = -Math.cos(bot.yaw);
      const dot = (dx * fwdX + dz * fwdZ) / (Math.hypot(dx, dz) || 1);
      if (dot < FOV_COS && dist > 3) continue; // outside the cone (unless point blank)
      tmp.set(bot.position.x, eyeY, bot.position.z);
      const target = new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.3, enemy.pos.z);
      if (!ctx.los(tmp, target)) continue;
      seen = enemy;
      seenDist = dist;
    }
    if (seen) {
      if (!bot.target || bot.target.ref !== seen.ref) {
        bot.reactionAt = ctx.time + 0.5 + Math.random() * 0.5;
        bot.burstLeft = 0;
      }
      bot.target = { ...seen, lastSeen: ctx.time, dist: seenDist };
    } else if (bot.target && ctx.time - bot.target.lastSeen > 1.2) {
      bot.target = null;
    }

    // --- Hearing: gunfire pulls bots toward the noise ---
    for (const noise of ctx.noises) {
      const d = Math.hypot(noise.x - bot.position.x, noise.z - bot.position.z);
      if (d < HEAR_RANGE && (!bot.target || d < 8)) {
        bot.investigate = nearestNode(noise.x, noise.z);
      }
    }

    // --- Defuse: a warden standing on a planted site starts the 5 s defuse ---
    if (ctx.bombPlanted && bot.team === 'warden') {
      const d = Math.hypot(ctx.site.x - bot.position.x, ctx.site.z - bot.position.z);
      if (d < 2.6 && !bot.target) {
        if (bot.defuseAt === 0) bot.defuseAt = ctx.time;
        else if (ctx.time - bot.defuseAt >= 5) ctx.onDefused(bot);
      } else {
        bot.defuseAt = 0;
      }
    }

    // --- Routing: pick a new destination when the path is empty ---
    if (!bot.target && bot.path.length === 0 && ctx.time >= bot.holdUntil) {
      const dest = pickDestination(bot, ctx);
      bot.path = bfsPath(nodes, waypoints.edges, bot.node, dest);
      if (bot.path.length === 0) bot.holdUntil = ctx.time + 1.5;
    }
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) return;
    bot.thinkAt -= dt;
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 0.15;
      think(bot, ctx);
    }

    const eyeY = bot.position.y + 1.55;
    let moveX = 0;
    let moveZ = 0;
    let wantSpeed = 0;

    if (bot.target) {
      // Face the target; strafe sideways while firing in bursts.
      const t = bot.target;
      const dx = t.pos.x - bot.position.x;
      const dz = t.pos.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      if (ctx.time > bot.strafeUntil) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeUntil = ctx.time + 0.8 + Math.random() * 1.2;
      }
      const dist = t.dist ?? Math.hypot(dx, dz);
      if (dist > 14) {
        moveX = dx / (dist || 1);
        moveZ = dz / (dist || 1);
        wantSpeed = bot.speed * 0.7;
      } else if (dist < 4) {
        moveX = -dx / (dist || 1);
        moveZ = -dz / (dist || 1);
        wantSpeed = bot.speed * 0.5;
      } else {
        const px = -dz / (dist || 1);
        const pz = dx / (dist || 1);
        moveX = px * bot.strafeDir;
        moveZ = pz * bot.strafeDir;
        wantSpeed = bot.speed * 0.45;
      }
      // Fire in bursts once the reaction time has passed.
      if (ctx.time >= bot.reactionAt) {
        if (bot.burstLeft <= 0 && ctx.time >= bot.shootAt) {
          bot.burstLeft = 3 + ((Math.random() * 3) | 0);
          bot.shootAt = ctx.time + 0.9 + Math.random() * 0.6;
        }
        if (bot.burstLeft > 0 && ctx.time >= bot.shootAt - 0.6) {
          if (ctx.time >= (bot.nextShotAt ?? 0)) {
            bot.nextShotAt = ctx.time + 0.11;
            bot.burstLeft -= 1;
            const from = new THREE.Vector3(bot.position.x, eyeY, bot.position.z);
            ctx.shoot(bot, from, t);
          }
        }
      }
    } else if (bot.path.length > 0) {
      const node = nodes[bot.path[0]];
      const dx = node[0] - bot.position.x;
      const dz = node[1] - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        bot.node = bot.path.shift();
        if (bot.path.length === 0) bot.holdUntil = ctx.time + 1 + Math.random() * 2.5;
      } else {
        moveX = dx / dist;
        moveZ = dz / dist;
        wantSpeed = bot.speed;
        bot.yaw = Math.atan2(-dx, -dz);
      }
    } else if (ctx.time < bot.holdUntil) {
      // Holding: slow scan so the bot looks alive and can spot the player.
      bot.yaw += Math.sin(ctx.time * 0.7 + bot.node) * dt * 0.5;
    }

    bot.velocity.x += (moveX * wantSpeed - bot.velocity.x) * Math.min(1, dt * 8);
    bot.velocity.z += (moveZ * wantSpeed - bot.velocity.z) * Math.min(1, dt * 8);
    bot.velocity.y -= 20 * dt;
    moveBody(bot.position, bot.velocity, dt, colliders, BOT_HEIGHT, BODY_RADIUS);
    bot.group.rotation.y = bot.yaw;
    // Walk bob: subtle, only while moving.
    const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
    bot.group.position.y = bot.position.y + Math.abs(Math.sin(ctx.time * 9)) * 0.03 * Math.min(1, speed / 3);
  }

  return {
    list: bots,
    hitMeshes,
    reset,
    damage,
    nearestNode,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
  };
}
