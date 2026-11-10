/**
 * On-device Q-learning trading agent.
 *
 * Three actions, not eleven:
 *   SKIP   — leave the copy in the box
 *   STAGE  — take it and add it to the desk that pays most (the packer decides which)
 *   SHIP   — send the bin that is closest to a prepaid label
 *
 * An earlier version had one action per desk per verb. It could not learn, and for a
 * good reason: the state features describe the *best* quote and the bins' progress, so
 * "stage to BooksRun" and "stage to Valore" were indistinguishable to a linear Q head
 * and their weights drifted apart at random. Splitting the problem — the agent chooses
 * skip/stage/ship, the packer solves the multi-desk assignment — makes the policy
 * learnable and keeps the optimisation where it belongs.
 *
 * Values are linear in seven state features, small enough to train thousands of shelves
 * in the browser and to persist as a plain array of numbers in localStorage.
 */
export const Q_FEATURES = 7;
export const Q_ACTIONS = 3;

export const SKIP = 0;
export const STAGE = 1;
export const SHIP = 2;

/**
 * Bumped whenever the action semantics or feature layout change, so weights trained
 * under the old rules are discarded rather than silently kept. Version 2 added action
 * masking: version 1 agents learned that "ship an empty bin" was a free action.
 */
export const Q_VERSION = 2;

export type QAgent = {
  version: number;
  /** actions × Q_FEATURES weights, row-major. */
  w: number[];
  eps: number;
  episodes: number;
  steps: number;
  avgReward: number;
  alpha: number;
  gamma: number;
};

export function makeQ(): QAgent {
  return {
    version: Q_VERSION,
    w: new Array(Q_ACTIONS * Q_FEATURES).fill(0),
    eps: 0.9,
    episodes: 0,
    steps: 0,
    avgReward: 0,
    alpha: 0.08,
    gamma: 0.9,
  };
}

export function qShapeOk(agent: QAgent | undefined): agent is QAgent {
  return Boolean(
    agent &&
      agent.version === Q_VERSION &&
      Array.isArray(agent.w) &&
      agent.w.length === Q_ACTIONS * Q_FEATURES,
  );
}

/**
 * Which actions are physically possible in a state.
 *
 * Shipping is legal only when a bin has cleared its prepaid label — "ready" means ready,
 * not merely non-empty. Two degenerate policies are ruled out by that one line: shipping
 * an empty bin (free, and inherits the credit of the good books that preceded it — the
 * policy had collapsed to "ship" in every state after 84,000 shelves), and shipping an
 * uncleared bin, which is a guaranteed loss once the desk rejects it.
 */
export function legalActions(hasReady: boolean): boolean[] {
  return [true, true, hasReady];
}

export const ACTION_LABELS = ["Skip", "Stage to the best desk", "Ship the ready bin"] as const;

export function actionLabel(action: number): string {
  return ACTION_LABELS[action] ?? "Skip";
}

export function qValues(agent: QAgent, x: number[]): number[] {
  const out: number[] = new Array(Q_ACTIONS);
  for (let a = 0; a < Q_ACTIONS; a += 1) {
    let sum = 0;
    const base = a * Q_FEATURES;
    for (let f = 0; f < Q_FEATURES; f += 1) sum += agent.w[base + f] * (x[f] ?? 0);
    out[a] = sum;
  }
  return out;
}

/** Best legal action; illegal actions are never chosen however high their value. */
export function greedy(agent: QAgent, x: number[], allowed?: boolean[]): number {
  const values = qValues(agent, x);
  let best = -1;
  for (let a = 0; a < values.length; a += 1) {
    if (allowed && !allowed[a]) continue;
    if (best < 0 || values[a] > values[best]) best = a;
  }
  return best < 0 ? 0 : best;
}

/** Epsilon-greedy choice. Exploration decays with the agent's epsilon. */
export function act(agent: QAgent, x: number[], random: () => number, allowed?: boolean[]): number {
  if (random() < agent.eps) {
    const options: number[] = [];
    for (let a = 0; a < Q_ACTIONS; a += 1) if (!allowed || allowed[a]) options.push(a);
    return options.length ? options[Math.floor(random() * options.length)] : 0;
  }
  return greedy(agent, x, allowed);
}

/** One semi-gradient Q-learning step. Mutates the agent's weights in place. */
export function update(
  agent: QAgent,
  x: number[],
  action: number,
  reward: number,
  nextX: number[],
  nextAllowed?: boolean[],
): void {
  const current = qValues(agent, x)[action] ?? 0;
  // The bootstrap target is the best *legal* continuation, so an illegal ship cannot
  // leak value backwards into the current state.
  const nextValues = qValues(agent, nextX);
  let nextBest = Number.NEGATIVE_INFINITY;
  for (let a = 0; a < nextValues.length; a += 1) {
    if (nextAllowed && !nextAllowed[a]) continue;
    if (nextValues[a] > nextBest) nextBest = nextValues[a];
  }
  if (!Number.isFinite(nextBest)) nextBest = 0;
  const target = reward + agent.gamma * nextBest;
  const delta = agent.alpha * (target - current);
  const base = action * Q_FEATURES;
  for (let f = 0; f < Q_FEATURES; f += 1) {
    agent.w[base + f] += delta * (x[f] ?? 0);
  }
  agent.steps += 1;
}

/** Terminal step: a real shipment, where the reward is final and there is nothing to bootstrap. */
export function updateTerminal(agent: QAgent, x: number[], action: number, reward: number): void {
  const current = qValues(agent, x)[action] ?? 0;
  const delta = agent.alpha * (reward - current);
  const base = action * Q_FEATURES;
  for (let f = 0; f < Q_FEATURES; f += 1) {
    agent.w[base + f] += delta * (x[f] ?? 0);
  }
  agent.steps += 1;
}

/** Canonical probe states, so the Train tab can show what the policy actually prefers. */
export function probeStates(): { label: string; x: number[]; staged: boolean }[] {
  return [
    { label: "Good book, bins empty", x: [0.6, 1.4, 0, 0, 0, 0.8, 0], staged: false },
    { label: "Good book, label nearly clear", x: [0.5, 1.2, 0.85, 0.7, 0.6, 0.1, 0], staged: false },
    { label: "Thin book, label already clear", x: [0.08, -0.2, 1, 0.8, 1, 0, 1], staged: true },
    { label: "Bad book, bins empty", x: [0.02, -0.6, 0, 0, 0, 0.9, 0], staged: false },
  ];
}

export function policyTable(agent: QAgent): { label: string; action: string; value: number }[] {
  return probeStates().map((probe) => {
    const values = qValues(agent, probe.x);
    const best = greedy(agent, probe.x, legalActions(probe.staged));
    return {
      label: probe.label,
      action: actionLabel(best),
      value: Math.round((values[best] ?? 0) * 100) / 100,
    };
  });
}
