const DEFAULT_SEED = 0x6d2b79f5;

export function normalizeSeed(seed = DEFAULT_SEED) {
  if (Number.isFinite(seed)) {
    return Number(seed) >>> 0;
  }

  const text = `${seed ?? DEFAULT_SEED}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createRandomSeed() {
  const timePart = Date.now() >>> 0;
  const randomPart = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return normalizeSeed(timePart ^ randomPart);
}

export class SeededRandom {
  constructor(seed = DEFAULT_SEED) {
    this.initialSeed = normalizeSeed(seed);
    this.state = this.initialSeed || DEFAULT_SEED;
  }

  nextUint32() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  next() {
    return this.nextUint32() / 0x100000000;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  signed(magnitude = 1) {
    return this.range(-magnitude, magnitude);
  }

  int(min, maxInclusive) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(probability) {
    return this.next() < probability;
  }

  choice(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return undefined;
    }

    return values[this.int(0, values.length - 1)];
  }

  fork(label = '') {
    return new SeededRandom(normalizeSeed(`${this.initialSeed}:${label}:${this.nextUint32()}`));
  }
}
