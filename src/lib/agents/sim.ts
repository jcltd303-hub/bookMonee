import { buyers } from "@/data/buyers";
import { UNIT_COST_USD } from "@/lib/market/quote";
import { Q_FEATURES, SHIP, SKIP, STAGE, act, makeQ, update, type QAgent } from "@/lib/agents/qlearn";

/**
 * Synthetic wholesale market used to pre-train the trading agent on device.
 *
 * The real world gives you one shelf a day, which is why a naive agent never learns
 * anything: the reward is too sparse to explore against. This simulator draws quote
 * vectors from the same desks and thresholds the desk model uses, so the agent can see
 * thousands of shelves in a second before it ever touches a real one.
 */

/** Flat penalty for shipping a bin that never cleared its prepaid label. */
export const FLUSH_PENALTY = 2.5;
/** A shipment attempt with nothing staged: a wasted trip to the post office. */
export const EMPTY_SHIP_PENALTY = 0.25;
/** Books per simulated shelf. */
export const EPISODE_STEPS = 24;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SimBook = { offers: number[] };

/** One book's quotes across the desks: mostly cheap, occasionally a real textbook. */
export function drawBook(random: () => number): SimBook {
  const fat = random() < 0.18;
  const offers = buyers.map((buyer) => {
    const base = fat ? 6 + random() * 34 : random() * 4.5;
    const tilt = random() < 0.5 ? buyer.textbookFit : buyer.tradeFit;
    const value = base * (0.6 + 0.5 * tilt) * (0.7 + random() * 0.6);
    return Math.max(0, Math.round(value * 100) / 100);
  });
  return { offers };
}

export type SimEnv = {
  bins: number[];
  counts: number[];
  thresholds: number[];
};

export function makeEnv(): SimEnv {
  return {
    bins: buyers.map(() => 0),
    counts: buyers.map(() => 0),
    thresholds: buyers.map((buyer) => buyer.thresholdUsd),
  };
}

export function bestOffer(book: SimBook): { index: number; offerUsd: number } {
  let index = 0;
  for (let i = 1; i < book.offers.length; i += 1) {
    if (book.offers[i] > book.offers[index]) index = i;
  }
  return { index, offerUsd: book.offers[index] ?? 0 };
}

/** The seven features the Q head reads, mirroring the wholesale state space. */
export function featuresOf(book: SimBook, env: SimEnv): number[] {
  const best = bestOffer(book);
  let progress = 0;
  let nearestGap = 0;
  let nearestThreshold = 0;
  for (let i = 0; i < env.bins.length; i += 1) {
    const limit = env.thresholds[i] ?? 0;
    const ratio = limit > 0 ? env.bins[i] / limit : env.bins[i] > 0 ? 1.5 : 0;
    if (ratio > progress) {
      progress = ratio;
      nearestGap = Math.max(0, limit - env.bins[i]);
      nearestThreshold = limit;
    }
  }
  const anyCleared = env.bins.some((value, index) => value >= (env.thresholds[index] ?? 0));
  const x = [
    Math.min(best.offerUsd / 25, 2),
    Math.max(-0.5, Math.min((best.offerUsd - UNIT_COST_USD) / 10, 2)),
    Math.min(progress, 1.5),
    Math.min(env.counts[best.index] / 8, 1),
    Math.min(Math.max(0, ...env.bins) / 20, 1),
    nearestThreshold > 0 ? Math.min(Math.max(0, nearestGap - best.offerUsd) / nearestThreshold, 1) : 0,
    anyCleared ? 1 : 0,
  ];
  return x.slice(0, Q_FEATURES);
}

/** Index of the bin worth shipping: a cleared one first, else the fullest. */
export function shipTarget(env: SimEnv): number {
  let cleared = -1;
  let fullest = 0;
  for (let i = 0; i < env.bins.length; i += 1) {
    if (env.bins[i] <= 0) continue;
    if (env.bins[i] >= (env.thresholds[i] ?? 0) && (cleared < 0 || env.bins[i] > env.bins[cleared])) cleared = i;
    if (env.bins[i] > env.bins[fullest]) fullest = i;
  }
  return cleared >= 0 ? cleared : fullest;
}

/** Apply an action, returning the immediate reward per the 99¢ reward function. */
export function step(env: SimEnv, book: SimBook, action: number): number {
  if (action === SKIP) return 0;
  if (action === STAGE) {
    const best = bestOffer(book);
    if (best.offerUsd <= 0) return 0;
    env.bins[best.index] += best.offerUsd;
    env.counts[best.index] += 1;
    return -UNIT_COST_USD;
  }
  const target = shipTarget(env);
  const staged = env.bins[target] ?? 0;
  if (staged <= 0) return -EMPTY_SHIP_PENALTY; // nothing staged: a wasted trip
  const threshold = env.thresholds[target] ?? 0;
  const friction = buyers[target]?.frictionUsd ?? 0;
  env.bins[target] = 0;
  env.counts[target] = 0;
  return staged >= threshold ? staged - friction : -FLUSH_PENALTY;
}

export type EpisodeResult = { reward: number; steps: number };

export function runEpisode(
  agent: QAgent,
  random: () => number,
  opts: { learn: boolean; epsilon?: number; steps?: number },
): EpisodeResult {
  const env = makeEnv();
  const steps = opts.steps ?? EPISODE_STEPS;
  const probe: QAgent = { ...agent, eps: opts.epsilon ?? agent.eps };
  let total = 0;
  let book = drawBook(random);
  let x = featuresOf(book, env);
  for (let t = 0; t < steps; t += 1) {
    const action = act(probe, x, random);
    const reward = step(env, book, action);
    total += reward;
    book = drawBook(random);
    const nextX = featuresOf(book, env);
    if (opts.learn) update(agent, x, action, reward, nextX);
    x = nextX;
  }
  return { reward: Math.round(total * 100) / 100, steps };
}

/**
 * Exploration and learning-rate decay.
 *
 * Without the alpha decay the linear Q head drifts once exploration stops paying:
 * the same state gets re-weighted by noise and a long run can end up worse than a
 * short one. Both schedules settle, so 400 shelves and 6,000 shelves agree.
 */
export function decay(agent: QAgent): void {
  agent.eps = Math.max(0.03, 0.9 * Math.exp(-agent.episodes / 900));
  agent.alpha = Math.max(0.02, 0.08 / (1 + agent.episodes / 3000));
}

/** Train in slices so the main thread stays responsive; progress is reported per slice. */
export async function trainSlices(
  agent: QAgent,
  episodes: number,
  onProgress?: (agent: QAgent, done: number, total: number) => void,
  opts: { seed?: number; slice?: number; steps?: number } = {},
): Promise<QAgent> {
  const random = mulberry32(opts.seed ?? 20261108);
  const slice = opts.slice ?? 150;
  let done = 0;
  let rewardSum = 0;
  while (done < episodes) {
    const batch = Math.min(slice, episodes - done);
    for (let i = 0; i < batch; i += 1) {
      const result = runEpisode(agent, random, { learn: true, steps: opts.steps });
      rewardSum += result.reward;
      agent.episodes += 1;
      done += 1;
      decay(agent);
    }
    agent.avgReward = Math.round((rewardSum / done) * 100) / 100;
    onProgress?.(agent, done, episodes);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return agent;
}

/** Fresh agent with a warm start — used on first load so the policy is not blank. */
export function pretrainedAgent(episodes = 400): QAgent {
  const agent = makeQ();
  const random = mulberry32(7);
  for (let i = 0; i < episodes; i += 1) {
    runEpisode(agent, random, { learn: true });
    agent.episodes += 1;
    decay(agent);
  }
  return agent;
}

export { SHIP, SKIP, STAGE };
