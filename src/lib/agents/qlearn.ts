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

export type QAgent = {
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
    agent && Array.isArray(agent.w) && agent.w.length === Q_ACTIONS * Q_FEATURES,
  );
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

export function greedy(agent: QAgent, x: number[]): number {
  const values = qValues(agent, x);
  let best = 0;
  for (let a = 1; a < values.length; a += 1) if (values[a] > values[best]) best = a;
  return best;
}

/** Epsilon-greedy choice. Exploration decays with the agent's epsilon. */
export function act(agent: QAgent, x: number[], random: () => number): number {
  if (random() < agent.eps) return Math.floor(random() * Q_ACTIONS);
  return greedy(agent, x);
}

/** One semi-gradient Q-learning step. Mutates the agent's weights in place. */
export function update(agent: QAgent, x: number[], action: number, reward: number, nextX: number[]): void {
  const current = qValues(agent, x)[action] ?? 0;
  const nextBest = Math.max(...qValues(agent, nextX));
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
export function probeStates(): { label: string; x: number[] }[] {
  return [
    { label: "Good book, bins empty", x: [0.6, 1.4, 0, 0, 0, 0.8, 0] },
    { label: "Good book, label nearly clear", x: [0.5, 1.2, 0.85, 0.7, 0.6, 0.1, 0] },
    { label: "Thin book, label already clear", x: [0.08, -0.2, 1, 0.8, 1, 0, 1] },
    { label: "Bad book, bins empty", x: [0.02, -0.6, 0, 0, 0, 0.9, 0] },
  ];
}

export function policyTable(agent: QAgent): { label: string; action: string; value: number }[] {
  return probeStates().map((probe) => {
    const values = qValues(agent, probe.x);
    const best = greedy(agent, probe.x);
    return {
      label: probe.label,
      action: actionLabel(best),
      value: Math.round((values[best] ?? 0) * 100) / 100,
    };
  });
}
