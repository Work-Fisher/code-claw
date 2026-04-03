import {
  type Companion,
  type CompanionBones,
  EYES,
  HATS,
  RARITIES,
  RARITY_WEIGHTS,
  type Rarity,
  SPECIES,
  STAT_NAMES,
  type StatName,
} from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const rarity of RARITIES) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return 'common';
}

const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50,
};

function rollStats(rng: () => number, rarity: Rarity): Record<StatName, number> {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);

  const stats = {} as Record<StatName, number>;
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }
  return stats;
}

const SALT = 'claw-buddy-2026';

const RANDOM_NAMES = [
  '小爪', '豆丁', '墨墨', '团子', '芋圆', '麻薯', '年糕', '布丁',
  '奶昔', '可乐', '泡芙', '曲奇', '抹茶', '芒果', '西瓜', '柠檬',
  '花卷', '饺子', '汤圆', '冰沙',
];

const RANDOM_PERSONALITIES = [
  '总是假装很忙但其实在偷看你写代码',
  '喜欢在 bug 修好的瞬间做出夸张的庆祝动作',
  '对缩进问题有强迫症，看到 tab 混 space 会抖',
  '会在你 commit 之前偷偷检查有没有忘记删 console.log',
  '深夜 coding 时会默默给你泡一杯虚拟咖啡',
  '看到 TODO 注释就会焦虑地来回踱步',
  '坚信所有 bug 都是上游的问题',
  '遇到 merge conflict 会激动地跳起来',
];

export type Roll = {
  bones: CompanionBones;
  inspirationSeed: number;
};

function rollFrom(rng: () => number): Roll {
  const rarity = rollRarity(rng);
  const bones: CompanionBones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  };
  return { bones, inspirationSeed: Math.floor(rng() * 1e9) };
}

let rollCache: { key: string; value: Roll } | undefined;
export function roll(userId: string): Roll {
  const key = userId + SALT;
  if (rollCache?.key === key) return rollCache.value;
  const value = rollFrom(mulberry32(hashString(key)));
  rollCache = { key, value };
  return value;
}

export function hatchCompanion(userId: string): Companion {
  const { bones, inspirationSeed } = roll(userId);
  const rng = mulberry32(inspirationSeed);
  return {
    ...bones,
    name: pick(rng, RANDOM_NAMES),
    personality: pick(rng, RANDOM_PERSONALITIES),
    hatchedAt: Date.now(),
  };
}
