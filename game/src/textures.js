// Procedural textures, drawn once on offscreen canvases — no image files, no
// network, and every surface in the yard is original. Each maker returns a
// THREE.CanvasTexture with repeat wrapping; callers set .repeat per mesh.
import * as THREE from 'three';

function canvas(size) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return [element, element.getContext('2d')];
}

function finish(element, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, count, colors, alpha) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

// Weathered asphalt yard floor with faint painted lane lines.
export function asphaltTexture() {
  const [el, ctx] = canvas(512);
  ctx.fillStyle = '#2b2f38';
  ctx.fillRect(0, 0, 512, 512);
  speckle(ctx, 512, 5200, ['#33373f', '#23262d', '#3a3f4a', '#414654'], 0.55);
  // expansion joints
  ctx.strokeStyle = 'rgba(12,13,17,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  // faded amber lane dashes
  ctx.fillStyle = 'rgba(240,168,48,0.28)';
  for (let y = 0; y < 512; y += 64) ctx.fillRect(250, y, 12, 34);
  return finish(el, 8, 8);
}

// Poured concrete for walls and the site pad.
export function concreteTexture() {
  const [el, ctx] = canvas(256);
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 2600, ['#454b58', '#31353f', '#4d5361', '#2b2f38'], 0.5);
  ctx.strokeStyle = 'rgba(20,22,28,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, 30 + Math.random() * 200);
    ctx.lineTo(256, 20 + Math.random() * 210);
    ctx.stroke();
  }
  return finish(el, 2, 2);
}

// Corrugated steel, tinted per container. Vertical ribs + rust streaks.
export function corrugatedTexture(base, rib) {
  const [el, ctx] = canvas(256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.10)');
    grad.addColorStop(0.65, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 16, 256);
  }
  // rust streaks from the top edge
  for (let i = 0; i < 26; i += 1) {
    const x = Math.random() * 256;
    const len = 20 + Math.random() * 90;
    const grad = ctx.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(120,62,20,0.5)');
    grad.addColorStop(1, 'rgba(120,62,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 2 + Math.random() * 4, len);
  }
  ctx.fillStyle = rib;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, 0, 256, 10);
  ctx.fillRect(0, 246, 256, 10);
  ctx.globalAlpha = 1;
  return finish(el, 2, 1);
}

// Hazard chevrons for the bomb-site pad edge and container doors.
export function hazardTexture() {
  const [el, ctx] = canvas(256);
  ctx.fillStyle = '#15161a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#f0a830';
  for (let x = -256; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 64, 0);
    ctx.lineTo(x + 32, 256);
    ctx.closePath();
    ctx.fill();
  }
  speckle(ctx, 256, 500, ['#000000', '#3a3a3a'], 0.4);
  return finish(el, 3, 1);
}

// Wooden crate planks.
export function crateTexture() {
  const [el, ctx] = canvas(256);
  ctx.fillStyle = '#6b5232';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    ctx.fillStyle = y % 84 === 0 ? '#755c38' : '#63502f';
    ctx.fillRect(0, y, 256, 40);
    ctx.strokeStyle = 'rgba(20,12,4,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-2, y, 260, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 14; i += 1) {
      ctx.fillRect(Math.random() * 256, y + 4 + Math.random() * 32, 14 + Math.random() * 30, 1.5);
    }
  }
  ctx.strokeStyle = 'rgba(30,20,8,0.9)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);
  return finish(el, 1, 1);
}
