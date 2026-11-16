// The look plan, in one place. Dusk in a container yard: blue-grey steel and
// concrete under amber work lights. The same six names are the CSS custom
// properties in index.html, so the HUD and the 3D scene share one palette.
export const PALETTE = {
  canvas: '#1a1d26',
  surface: '#2a2f3a',
  hairline: '#3a4152',
  ink: '#efe8d8',
  muted: '#8b93a5',
  accent: '#f0a830',
};

export function shade(name) {
  return PALETTE[name];
}

// Extra scene colours (not CSS): team colours and light tints.
export const TEAM = {
  ember: '#f0a830', // the player's crew — amber
  warden: '#5fb8c9', // Dock Wardens — cold teal
};
export const LIGHT = {
  duskSky: '#2c3550',
  duskGround: '#14161c',
  lamp: '#ffb347',
  muzzle: '#ffd27a',
};
