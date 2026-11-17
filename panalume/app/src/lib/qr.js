// A small QR Code encoder (byte mode), written for the guest WiFi card so the
// code is drawn in the card without a dependency or a network request.
//
// `encode(text)` returns { size, modules } where modules[y][x] is 1 for a dark
// module. Anything longer than version 40 can hold returns null and the caller
// says so instead of drawing a broken code.

// Error correction level order used by the tables below: L, M, Q, H.
const LEVELS = ['L', 'M', 'Q', 'H'];
// The two format bits the spec assigns to each level.
const FORMAT_BITS = [1, 0, 3, 2];
// Error correction codewords per block, indexed [level][version].
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// Number of blocks, indexed [level][version].
const BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

// Modules that can hold data or error correction, before blocks are split.
function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const capacity = (ver, level) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[level][ver] * BLOCKS[level][ver];

// --- Reed–Solomon over GF(256) ------------------------------------------------

function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function generator(degree) {
  const poly = new Uint8Array(degree);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = mul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = mul(root, 0x02);
  }
  return poly;
}

function remainder(data, gen) {
  const out = new Uint8Array(gen.length);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.copyWithin(0, 1);
    out[out.length - 1] = 0;
    for (let i = 0; i < out.length; i++) out[i] ^= mul(gen[i], factor);
  }
  return out;
}

function addEcc(data, ver, level) {
  const blocks = BLOCKS[level][ver];
  const eccLen = ECC_PER_BLOCK[level][ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const shortCount = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const out = [];
  for (let i = 0, at = 0; i < blocks; i++) {
    const len = shortLen - eccLen + (i < shortCount ? 0 : 1);
    const dat = Array.from(data.slice(at, at + len));
    at += len;
    const ecc = remainder(dat, generator(eccLen));
    // Short blocks get a placeholder so every block lines up for interleaving.
    const block = i < shortCount ? [...dat, 0, ...ecc] : [...dat, ...ecc];
    out.push(block);
  }
  const interleaved = [];
  for (let i = 0; i < out[0].length; i++) {
    for (let j = 0; j < out.length; j++) {
      // The placeholder is skipped, never drawn.
      if (i !== shortLen - eccLen || j >= shortCount) interleaved.push(out[j][i]);
    }
  }
  return interleaved;
}

// --- Symbols ------------------------------------------------------------------

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const count = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = ver * 4 + 10; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

function bch(data, poly, checkBits) {
  let rem = data;
  for (let i = 0; i < checkBits; i++) rem = (rem << 1) ^ ((rem >>> (checkBits - 1)) * poly);
  return ((data << checkBits) | rem) & ((1 << (checkBits * 2)) - 1);
}

function build(ver, level, codewords) {
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Uint8Array(size));
  const fn = Array.from({ length: size }, () => new Uint8Array(size));
  const set = (x, y, dark) => {
    mod[y][x] = dark ? 1 : 0;
    fn[y][x] = 1;
  };

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns and their separators.
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  // Alignment patterns, everywhere except under the finders.
  const align = alignmentPositions(ver);
  const last = align.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format areas (written for real once the mask is chosen) and the
  // version blocks, and mark the one module that is always dark.
  const drawFormat = (mask) => {
    const bits = bch((FORMAT_BITS[level] << 3) | mask, 0x537, 10) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, (bits >>> i) & 1);
    set(8, 7, (bits >>> 6) & 1);
    set(8, 8, (bits >>> 7) & 1);
    set(7, 8, (bits >>> 8) & 1);
    for (let i = 9; i < 15; i++) set(14 - i, 8, (bits >>> i) & 1);
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, (bits >>> i) & 1);
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, (bits >>> i) & 1);
    set(8, size - 8, 1);
  };
  drawFormat(0);
  if (ver >= 7) {
    const bits = bch(ver, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  // Data, in the upward/downward zigzag from the bottom right.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        if (i < codewords.length * 8) {
          mod[y][x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
          i++;
        }
      }
    }
  }

  const MASK = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!fn[y][x] && MASK[mask](x, y)) mod[y][x] ^= 1;
      }
    }
  };

  // Four rules, as in the spec: runs, 2x2 blocks, finder lookalikes, and the
  // light/dark balance.
  const penalty = () => {
    let score = 0;
    const run = (get) => {
      for (let a = 0; a < size; a++) {
        let last = -1;
        let len = 0;
        for (let b = 0; b < size; b++) {
          const v = get(a, b);
          if (v === last) len++;
          else {
            if (len >= 5) score += 3 + (len - 5);
            last = v;
            len = 1;
          }
          // 1:1:3:1:1 patterns with four light modules beside them.
          if (b >= 10) {
            const w = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => get(a, b - 10 + k));
            const core = w.slice(0, 11).join('');
            if (core === '10111010000' || core === '00001011101') score += 40;
          }
        }
        if (len >= 5) score += 3 + (len - 5);
      }
    };
    run((a, b) => mod[a][b]);
    run((a, b) => mod[b][a]);
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const v = mod[y][x];
        if (v === mod[y][x + 1] && v === mod[y + 1][x] && v === mod[y + 1][x + 1]) score += 3;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dark += mod[y][x];
    const total = size * size;
    score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  };

  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const p = penalty();
    if (p < bestScore) {
      bestScore = p;
      best = mask;
    }
    applyMask(mask); // XOR again to undo it
  }
  applyMask(best);
  drawFormat(best);
  return { size, modules: mod };
}

const utf8 = (s) =>
  Array.from(new TextEncoder().encode(String(s)));

export function encode(text, levelName = 'M') {
  const asked = LEVELS.indexOf(String(levelName || 'M').toUpperCase());
  const level = asked < 0 ? 1 : asked;
  const bytes = utf8(text);
  let ver = 0;
  for (let v = 1; v <= 40; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const need = 4 + countBits + bytes.length * 8;
    if (need <= capacity(v, level) * 8) {
      ver = v;
      break;
    }
  }
  if (!ver || bytes.length > 0xffff) return null;

  const bits = [];
  const push = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(4, 4); // byte mode
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const dataBytes = capacity(ver, level);
  const term = Math.min(4, dataBytes * 8 - bits.length);
  push(0, term);
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < dataBytes * 8; pad ^= 0xec ^ 0x11) push(pad, 8);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }
  return build(ver, level, addEcc(codewords, ver, level));
}

// The payload a phone needs to join a network. The spec escapes \\ ; , : and ".
export function wifiPayload({ ssid = '', password = '', security = 'WPA', hidden = false }) {
  const esc = (s) => String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
  const type = /^(nopass|none|open)$/i.test(security) ? 'nopass' : security || 'WPA';
  const parts = [`T:${type}`, `S:${esc(ssid)}`];
  if (type !== 'nopass' && password) parts.push(`P:${esc(password)}`);
  if (hidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}
