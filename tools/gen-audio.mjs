import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'assets');
const SR = 44100;

function writeWav(path, samples) {
  mkdirSync(dirname(path), { recursive: true });
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, data);
}

const UNIT = 0.12;
function tone(freq, ms, amp = 0.35) {
  const n = Math.round((ms / 1000) * SR);
  const out = new Array(n);
  const fade = Math.round(0.008 * SR);
  for (let i = 0; i < n; i++) {
    const envelope = Math.min(1, i / fade, (n - i) / fade);
    out[i] = amp * envelope * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return out;
}
function silence(ms) {
  return new Array(Math.round((ms / 1000) * SR)).fill(0);
}
function concat(...parts) {
  return [].concat(...parts);
}

function morseSignal(text, freq = 620, charSpace = 3) {
  const map = {
    a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.',
    h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.',
    o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-',
    v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', '0': '-----',
    '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
    '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  };
  const parts = [];
  text.toLowerCase().split('').forEach((ch, idx) => {
    if (idx > 0) parts.push(silence(charSpace * UNIT * 1000));
    const code = map[ch];
    if (!code) return;
    code.split('').forEach((sym, si) => {
      if (si > 0) parts.push(silence(UNIT * 1000));
      parts.push(tone(620, (sym === '.' ? UNIT : UNIT * 3) * 1000));
    });
  });
  return concat(...parts);
}

const out = {
  'levels/04/morse-sos.wav': morseSignal('sos'),
  'levels/11/count-342.wav': concat(
    tone(880, 60), silence(60), tone(880, 60), silence(60), tone(880, 60),
    silence(260),
    tone(880, 60), silence(60), tone(880, 60), silence(60), tone(880, 60), silence(60), tone(880, 60),
    silence(260),
    tone(880, 60), silence(60), tone(880, 60),
  ),
  'levels/15/echo-reversed.wav': morseSignal('echo').reverse(),
};

function ambientDrone(seconds) {
  const n = seconds * SR;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const slow = Math.sin(2 * Math.PI * 55 * t) * 0.12;
    const detune = Math.sin(2 * Math.PI * 55.8 * t) * 0.08;
    const pulse = 0.03 * Math.sin(2 * Math.PI * 0.5 * t);
    const hiss = (Math.random() * 2 - 1) * 0.004;
    out[i] = (slow + detune + pulse) * 0.5 + hiss;
  }
  return out;
}

out['audio/ambient/server-ambient.wav'] = ambientDrone(16);

for (const [rel, samples] of Object.entries(out)) {
  writeWav(join(OUT, rel), samples);
  console.log('wrote', rel, samples.length / SR, 's');
}