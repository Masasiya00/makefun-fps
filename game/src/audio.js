// Procedural WebAudio: every sound is synthesized — short noise bursts and
// oscillators, no audio files. The context is created on the first user
// gesture (pointer lock); calls before that are no-ops.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.12, freq = 1200, type = 'lowpass', gain = 0.5, at = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    source.connect(filter);
    filter.connect(g);
    g.connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  }

  function tone({ freq = 440, to = null, duration = 0.12, type = 'square', gain = 0.2, at = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shot(kind) {
      if (kind === 'rifle') {
        burst({ duration: 0.11, freq: 900, gain: 0.55 });
        tone({ freq: 160, to: 55, duration: 0.1, type: 'sine', gain: 0.5 });
      } else if (kind === 'smg') {
        burst({ duration: 0.08, freq: 1400, gain: 0.4 });
        tone({ freq: 190, to: 70, duration: 0.07, type: 'sine', gain: 0.35 });
      } else {
        burst({ duration: 0.1, freq: 1100, gain: 0.5 });
        tone({ freq: 140, to: 50, duration: 0.09, type: 'sine', gain: 0.45 });
      }
    },
    enemyShot(distance) {
      const gain = Math.max(0.06, 0.4 - distance * 0.012);
      burst({ duration: 0.09, freq: 800, gain });
    },
    reload() {
      tone({ freq: 900, duration: 0.05, type: 'square', gain: 0.12 });
      tone({ freq: 600, duration: 0.05, type: 'square', gain: 0.12, at: 0.25 });
      tone({ freq: 1100, duration: 0.05, type: 'square', gain: 0.12, at: 0.55 });
    },
    hitmarker(killed) {
      tone({ freq: killed ? 1400 : 1000, duration: 0.05, type: 'sine', gain: 0.25 });
      if (killed) tone({ freq: 1800, duration: 0.07, type: 'sine', gain: 0.2, at: 0.05 });
    },
    hurt() {
      tone({ freq: 220, to: 90, duration: 0.18, type: 'sawtooth', gain: 0.25 });
    },
    plantBeep() {
      tone({ freq: 1250, duration: 0.06, type: 'square', gain: 0.18 });
    },
    explosion() {
      burst({ duration: 0.9, freq: 300, gain: 0.9 });
      tone({ freq: 90, to: 30, duration: 0.8, type: 'sine', gain: 0.8 });
    },
    grenadeThrow() {
      burst({ duration: 0.06, freq: 2000, type: 'highpass', gain: 0.15 });
    },
    roundWin() {
      tone({ freq: 523, duration: 0.14, type: 'triangle', gain: 0.25 });
      tone({ freq: 659, duration: 0.14, type: 'triangle', gain: 0.25, at: 0.14 });
      tone({ freq: 784, duration: 0.3, type: 'triangle', gain: 0.25, at: 0.28 });
    },
    roundLose() {
      tone({ freq: 392, duration: 0.16, type: 'triangle', gain: 0.25 });
      tone({ freq: 330, duration: 0.16, type: 'triangle', gain: 0.25, at: 0.16 });
      tone({ freq: 262, duration: 0.35, type: 'triangle', gain: 0.25, at: 0.32 });
    },
    buy() {
      tone({ freq: 880, duration: 0.06, type: 'sine', gain: 0.2 });
      tone({ freq: 1320, duration: 0.08, type: 'sine', gain: 0.18, at: 0.06 });
    },
    denied() {
      tone({ freq: 220, duration: 0.09, type: 'square', gain: 0.15 });
    },
  };
}
