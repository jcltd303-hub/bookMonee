/** Small MLP used as a residual Q head. Weights persist on device. */

export type Net = {
  input: number;
  hidden: number;
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
  w3: number[];
  b3: number;
  steps: number;
  lastLoss: number;
};

function fill(n: number, fan: number): number[] {
  const span = Math.sqrt(1 / fan) * 0.05;
  return Array.from({ length: n }, () => (Math.random() * 2 - 1) * span);
}

export function makeNet(input: number, hidden = 12): Net {
  return {
    input,
    hidden,
    w1: fill(hidden * input, input),
    b1: Array(hidden).fill(0),
    w2: fill(hidden * hidden, hidden),
    b2: Array(hidden).fill(0),
    w3: fill(hidden, hidden),
    b3: 0,
    steps: 0,
    lastLoss: 0,
  };
}

export function netOk(net: Net | undefined, input: number): net is Net {
  return Boolean(
    net &&
      net.input === input &&
      net.hidden > 0 &&
      net.w1?.length === net.hidden * input &&
      net.w2?.length === net.hidden * net.hidden &&
      net.w3?.length === net.hidden,
  );
}

function relu(z: number): number {
  return z > 0 ? z : 0;
}

function drelu(z: number): number {
  return z > 0 ? 1 : 0;
}

export function forward(net: Net, x: number[]) {
  const h = net.hidden;
  const z1: number[] = [];
  const a1: number[] = [];
  for (let i = 0; i < h; i += 1) {
    let sum = net.b1[i] ?? 0;
    for (let j = 0; j < net.input; j += 1) sum += net.w1[i * net.input + j] * (x[j] ?? 0);
    z1.push(sum);
    a1.push(relu(sum));
  }
  const z2: number[] = [];
  const a2: number[] = [];
  for (let i = 0; i < h; i += 1) {
    let sum = net.b2[i] ?? 0;
    for (let j = 0; j < h; j += 1) sum += net.w2[i * h + j] * a1[j];
    z2.push(sum);
    a2.push(relu(sum));
  }
  let q = net.b3;
  for (let i = 0; i < h; i += 1) q += net.w3[i] * a2[i];
  return { q, z1, a1, z2, a2 };
}

export function train(net: Net, x: number[], target: number, lr = 0.035): Net {
  const next: Net = {
    ...net,
    w1: net.w1.slice(),
    b1: net.b1.slice(),
    w2: net.w2.slice(),
    b2: net.b2.slice(),
    w3: net.w3.slice(),
  };
  const { q, z1, a1, z2, a2 } = forward(next, x);
  const dQ = Math.max(-4, Math.min(4, q - target));
  const h = next.hidden;
  const g2 = next.w3.map((w) => dQ * w);
  for (let i = 0; i < h; i += 1) next.w3[i] -= lr * dQ * a2[i];
  next.b3 -= lr * dQ;
  const dz2 = g2.map((g, i) => g * drelu(z2[i]));
  const g1 = Array(h).fill(0);
  for (let j = 0; j < h; j += 1) {
    let sum = 0;
    for (let i = 0; i < h; i += 1) sum += dz2[i] * next.w2[i * h + j];
    g1[j] = sum;
  }
  for (let i = 0; i < h; i += 1) {
    next.b2[i] -= lr * dz2[i];
    for (let j = 0; j < h; j += 1) next.w2[i * h + j] -= lr * dz2[i] * a1[j];
  }
  const dz1 = g1.map((g, i) => g * drelu(z1[i]));
  for (let i = 0; i < h; i += 1) {
    next.b1[i] -= lr * dz1[i];
    for (let j = 0; j < next.input; j += 1) {
      next.w1[i * next.input + j] -= lr * dz1[i] * (x[j] ?? 0);
    }
  }
  next.steps += 1;
  next.lastLoss = 0.5 * dQ * dQ;
  return next;
}

export function replay(
  net: Net,
  samples: { x: number[]; y: number }[],
  lr = 0.035,
): Net {
  return samples.reduce((current, sample) => train(current, sample.x, sample.y, lr), net);
}
