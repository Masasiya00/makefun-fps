// The DOM HUD: crosshair (spread grows with movement/fire), hit marker,
// health, ammo, timer, round score, money, alive counts, kill feed, round
// banner, plant/defuse progress and the buy menu. It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'EMBER YARD',
    copy: 'Round-based tactical FPS in a dusk container yard. Plant the charge at Site A — or wipe the Dock Wardens. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBER YARD',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  win: {
    title: 'ROUND WON',
    copy: 'Site secured. The yard is yours.',
    action: 'Next round',
  },
  lose: {
    title: 'ROUND LOST',
    copy: 'The Wardens held the yard.',
    action: 'Next round',
  },
  matchWin: {
    title: 'MATCH WON 5 — 2',
    copy: 'Ember Crew takes the yard. First to 5 rounds.',
    action: 'Play again',
  },
  matchLose: {
    title: 'MATCH LOST',
    copy: 'The Dock Wardens kept the yard.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const timer = $('timer');
  const roundScore = $('round-score');
  const money = $('money');
  const aliveEmber = $('alive-ember');
  const aliveWarden = $('alive-warden');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const hint = $('hint');
  const grenades = $('grenades');

  let hitTimer = 0;
  let bannerTimer = 0;
  const last = { mag: -1, reserve: -1, hp: -1, armor: -1, money: -1, time: '', score: '' };

  function setText(el, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      if (name) weaponName.textContent = name;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      if (hp === last.hp && armor === last.armor) return;
      last.hp = hp;
      last.armor = armor;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      armorValue.textContent = armor > 0 ? `+${armor} ARMOR` : '';
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;
      setText(timer, text, 'time');
      timer.classList.toggle('urgent', s <= 10 && phase === 'round');
    },
    setScore(wins, losses) {
      setText(roundScore, `EMBER ${wins} — ${losses} WARDENS`, 'score');
    },
    setMoney(value) {
      setText(money, `$${value.toLocaleString('en-US')}`, 'money');
      buyMoney.textContent = `$${value.toLocaleString('en-US')}`;
    },
    setAlive(ember, warden) {
      aliveEmber.textContent = `EMBER ${ember}`;
      aliveWarden.textContent = `WARDENS ${warden}`;
    },
    setGrenades(count) {
      grenades.textContent = count > 0 ? `◉ ${count} FRAG` : '';
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killfeed(killer, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = `<b>${killer}</b> ${headshot ? '⌖' : '✕'} <b>${victim}</b>`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
    },
    hideBanner() {
      banner.classList.add('hidden');
    },
    setPlant(progress, label) {
      if (progress === null) {
        plantBar.classList.add('hidden');
        return;
      }
      plantBar.classList.remove('hidden');
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    showBuy(items, moneyValue) {
      buyMenu.classList.remove('hidden');
      buyMoney.textContent = `$${moneyValue.toLocaleString('en-US')}`;
      const rows = buyMenu.querySelectorAll('[data-item]');
      for (const row of rows) {
        const item = items[row.dataset.item];
        const priceEl = row.querySelector('.buy-price');
        const ownedEl = row.querySelector('.buy-owned');
        if (priceEl) priceEl.textContent = item.owned ? 'OWNED' : `$${item.price}`;
        if (ownedEl) ownedEl.textContent = item.owned ? '✓' : '';
        row.classList.toggle('cant', !item.owned && moneyValue < item.price);
      }
    },
    hideBuy() {
      buyMenu.classList.add('hidden');
    },
    setHint(text) {
      hint.textContent = text;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
