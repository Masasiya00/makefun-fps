// EMBER YARD — an original dusk container yard, 44 x 34 m.
// Two flank lanes, a long mid sightline, and one bomb site (A) at the north
// end. Every box is a collider for players and bots and a surface a bullet
// stops on. Textures are procedural canvases (see textures.js) — no files,
// no network. Waypoints below are the bot nav graph.
import * as THREE from 'three';
import { PALETTE, LIGHT } from './palette.js';
import {
  asphaltTexture,
  concreteTexture,
  corrugatedTexture,
  hazardTexture,
  crateTexture,
} from './textures.js';

const CONTAINER_COLORS = ['#7a4a2b', '#2e5a6b', '#5d6b34', '#8a3b2e', '#4a4a58', '#6b5a2e'];

// Bomb site A: a marked pad at the north end of mid.
export const SITE_A = { x: 0, z: -13.5, radius: 4.2 };

// Team spawns: Ember (player) south, Wardens north.
export const SPAWNS = {
  ember: [
    [0, 14.5],
    [-4, 14],
    [4, 14],
    [-8, 12.5],
  ],
  warden: [
    [0, -12],
    [-10, -11],
    [10, -11],
    [-16, -5],
    [16, -5],
  ],
};

// Bot nav graph: [x, z] nodes; edges link neighbours a bot may walk between.
export const WAYPOINTS = {
  nodes: [
    [0, 14], [-6, 12], [6, 12], // 0-2 south spawn
    [-14, 8], [14, 8], // 3-4 flank starts
    [-14, 0], [14, 0], // 5-6 mid flanks
    [-14, -8], [14, -8], // 7-8 north flanks
    [0, 6], [0, -2], [0, -9], // 9-11 mid spine
    [-6, -4], [6, -4], // 12-13 mid cover
    [-6, -12], [6, -12], [0, -13.5], // 14-16 site A
    [-19, 2], [19, 2], // 17-18 far flanks
  ],
  edges: [
    [0, 1], [0, 2], [1, 3], [2, 4], [1, 9], [2, 9],
    [3, 5], [4, 6], [5, 7], [6, 8], [5, 12], [6, 13],
    [7, 14], [8, 15], [9, 10], [10, 11], [10, 12], [10, 13],
    [11, 16], [12, 14], [13, 15], [14, 16], [15, 16],
    [3, 17], [5, 17], [17, 7], [4, 18], [6, 18], [18, 8],
    [12, 9], [13, 9], [11, 12], [11, 13],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const asphalt = asphaltTexture();
  const concrete = concreteTexture();
  const hazard = hazardTexture();
  const crate = crateTexture();
  const containerMats = CONTAINER_COLORS.map(
    (c) => new THREE.MeshStandardMaterial({ map: corrugatedTexture(c, '#22242a'), roughness: 0.75, metalness: 0.25 }),
  );

  const groundMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, metalness: 0.02 });
  const concreteMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9, metalness: 0.05 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.8, metalness: 0.05 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crate, roughness: 0.85, metalness: 0.02 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.6, metalness: 0.5 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(LIGHT.lamp) });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function container(x, z, rotY, colorIndex, stacked = false) {
    const mat = containerMats[colorIndex % containerMats.length];
    const mesh = box(6.1, 2.6, 2.6, x, 1.3, z, mat);
    mesh.rotation.y = rotY;
    mesh.updateMatrixWorld(true);
    // Recompute the collider after rotation so the box matches the mesh.
    colliders[colliders.length - 1].setFromObject(mesh);
    if (stacked) {
      const top = box(6.1, 2.6, 2.6, x, 3.9, z, containerMats[(colorIndex + 2) % containerMats.length]);
      top.rotation.y = rotY;
      top.updateMatrixWorld(true);
      colliders[colliders.length - 1].setFromObject(top);
    }
    return mesh;
  }

  // Ground + perimeter walls (44 x 34 m, 5 m walls).
  box(44.4, 0.4, 34.4, 0, -0.2, 0, groundMat);
  box(0.5, 5, 34.4, -22.2, 2.5, 0, concreteMat);
  box(0.5, 5, 34.4, 22.2, 2.5, 0, concreteMat);
  box(44.4, 5, 0.5, 0, 2.5, -17.2, concreteMat);
  box(44.4, 5, 0.5, 0, 2.5, 17.2, concreteMat);

  // Bomb site A: hazard pad + low concrete plinth at the north end of mid.
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(9, 8), hazardMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(SITE_A.x, 0.02, SITE_A.z);
  pad.receiveShadow = true;
  group.add(pad);
  box(9, 0.18, 8, SITE_A.x, 0.09, SITE_A.z, concreteMat, false);
  // Site marker: two amber posts with a crossbeam (silhouette, no collision).
  box(0.3, 4.6, 0.3, -4.6, 2.3, -15.6, darkMat, false);
  box(0.3, 4.6, 0.3, 4.6, 2.3, -15.6, darkMat, false);
  box(9.5, 0.3, 0.3, 0, 4.6, -15.6, darkMat, false);

  // --- Mid lane: low cover, one tall stack blocking the direct line ---
  container(-3.4, 2, Math.PI / 2, 0); // vertical stack west of mid
  container(3.4, -2, Math.PI / 2, 1); // vertical stack east of mid
  box(2.2, 1.1, 1.2, 0, 0.55, 6, crateMat); // mid crate, crouch cover
  container(0, -6, 0, 2, true); // stacked pair across mid — the key sightline block
  box(1.2, 1.1, 1.2, -2.6, 0.55, -8.5, crateMat);
  box(1.2, 1.1, 1.2, 2.6, 0.55, -8.5, crateMat);

  // --- West lane: containers + crates ---
  container(-14, 10, 0, 3);
  container(-16.5, 4, Math.PI / 2, 4);
  container(-14, -3, 0, 5, true);
  box(2.4, 1.1, 1.2, -18, 0.55, -1, crateMat);
  box(1.2, 1.1, 1.2, -10.5, 0.55, 8, crateMat);
  box(1.2, 1.1, 2.4, -18.5, 0.55, -9, crateMat);

  // --- East lane: mirrored-ish, different colours/angles ---
  container(14, 10, 0, 1);
  container(16.5, 2, Math.PI / 2, 0, true);
  container(14, -4, 0, 4);
  box(2.4, 1.1, 1.2, 18, 0.55, 0, crateMat);
  box(1.2, 1.1, 1.2, 10.5, 0.55, 8.5, crateMat);
  box(1.2, 1.1, 1.2, 18.5, 0.55, -10, crateMat);

  // --- South spawn cover + north site flanks ---
  box(2.2, 1.1, 1.2, -6, 0.55, 13, crateMat);
  box(2.2, 1.1, 1.2, 6, 0.55, 13, crateMat);
  container(-9, -13, Math.PI / 2, 5);
  container(9, -13, Math.PI / 2, 3);

  // --- Lamp posts (visual) + amber point lights ---
  const lampPositions = [
    [-10, 6], [10, 6], [-10, -6], [10, -6], [0, 13],
  ];
  for (const [x, z] of lampPositions) {
    box(0.18, 5.2, 0.18, x, 2.6, z, lampMat, false);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), bulbMat);
    bulb.position.set(x, 5.2, z);
    group.add(bulb);
    const light = new THREE.PointLight(new THREE.Color(LIGHT.lamp), 30, 17, 1.8);
    light.position.set(x, 5.0, z);
    scene.add(light);
  }
  // One extra amber light over site A so the objective reads at a glance.
  const siteLight = new THREE.PointLight(new THREE.Color(LIGHT.lamp), 42, 20, 1.8);
  siteLight.position.set(0, 6, -13.5);
  scene.add(siteLight);

  // Dusk lighting: cool hemisphere, low warm key (setting sun), faint moon fill.
  const sky = new THREE.HemisphereLight(
    new THREE.Color(LIGHT.duskSky), new THREE.Color(LIGHT.duskGround), 1.25,
  );
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb347'), 2.3);
  sun.position.set(-18, 10, -22);
  sun.target.position.set(4, 0, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const moon = new THREE.DirectionalLight(new THREE.Color('#7a86b8'), 0.5);
  moon.position.set(14, 16, 14);
  scene.add(moon);

  return { colliders, shootables, group, site: SITE_A };
}
