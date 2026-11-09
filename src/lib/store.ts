import { create } from "zustand";
import { persist } from "zustand/middleware";
import { makeNet, netOk, replay, type Net } from "@/lib/agents/net";
import { SHELF_INPUT, WALKER_INPUT, type BoxMemory } from "@/lib/agents/decide";
import { FLUSH_PENALTY, pretrainedAgent, trainSlices } from "@/lib/agents/sim";
import { SHIP, makeQ, qShapeOk, updateTerminal, type QAgent } from "@/lib/agents/qlearn";
import { buyers } from "@/data/buyers";
import { binCash } from "@/lib/market/pack";
import { supersedes } from "@/lib/scan/dedupe";
import type { BuyerQuote, DeskItem, Judgement, PlannedLeg, Payout } from "@/lib/types";

type Sample = { x: number[]; y: number };

type RunState = {
  ready: boolean;
  maxStops: number;
  mileBudget: number;
  leaveCount: number;
  showMutual: boolean;
  offline: boolean;
  region: string;
  condition: "good" | "fair" | "poor";
  startLabel: string;
  route: PlannedLeg[];
  picks: Judgement[];
  activeStopId: string;
  payouts: Payout[];
  memory: Record<string, BoxMemory>;
  walker: Net;
  shelf: Net;
  walkerReplay: Sample[];
  shelfReplay: Sample[];
  /** Quotes for the book on the scan bench, from every desk. */
  quotes: BuyerQuote[];
  /** Books staged per desk, waiting for a prepaid label to clear. */
  desk: Record<string, DeskItem[]>;
  /** Books taken from the box currently open, so replacements stay honest. */
  boxTakes: number;
  /** On-device trading agent. */
  q: QAgent;
  qProgress: number;
  qRunning: boolean;
  setReady: (ready: boolean) => void;
  setMaxStops: (n: number) => void;
  setMileBudget: (n: number) => void;
  setLeaveCount: (n: number) => void;
  setShowMutual: (on: boolean) => void;
  setOffline: (on: boolean) => void;
  setRegion: (region: string) => void;
  setCondition: (condition: "good" | "fair" | "poor") => void;
  setStartLabel: (label: string) => void;
  setRoute: (route: PlannedLeg[]) => void;
  setActiveStopId: (id: string) => void;
  pushPick: (pick: Judgement) => void;
  setQuotes: (quotes: BuyerQuote[]) => void;
  noteTake: () => void;
  resetBox: () => void;
  stage: (buyerId: string, item: DeskItem) => void;
  unstage: (buyerId: string, isbn: string) => void;
  clearDesk: () => void;
  flushBin: (buyerId: string) => void;
  trainQ: (episodes: number) => Promise<void>;
  ensurePretrained: () => void;
  logPayout: (input: {
    isbn: string;
    title: string;
    usd: number;
    buyerId: string;
    accepted: boolean;
    stopId: string;
    miles: number;
    features?: number[];
    heuristicUsd?: number;
    walkerFeatures?: number[];
    walkerHeuristic?: number;
  }) => void;
};

function remember(samples: Sample[], sample: Sample): Sample[] {
  return [...samples, sample].slice(-40);
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export const useRun = create<RunState>()(
  persist(
    (set, get) => ({
      ready: false,
      maxStops: 4,
      mileBudget: 6,
      leaveCount: 2,
      showMutual: true,
      offline: false,
      region: "denver",
      condition: "good",
      startLabel: "Civic Center",
      route: [],
      picks: [],
      activeStopId: "",
      payouts: [],
      memory: {},
      walker: makeNet(WALKER_INPUT),
      shelf: makeNet(SHELF_INPUT),
      walkerReplay: [],
      shelfReplay: [],
      quotes: [],
      desk: {},
      boxTakes: 0,
      q: makeQ(),
      qProgress: 0,
      qRunning: false,
      setReady: (ready) => set({ ready }),
      setMaxStops: (maxStops) => set({ maxStops }),
      setMileBudget: (mileBudget) => set({ mileBudget }),
      setLeaveCount: (leaveCount) => set({ leaveCount }),
      setShowMutual: (showMutual) => set({ showMutual }),
      setOffline: (offline) => set({ offline }),
      setRegion: (region) => set({ region }),
      setCondition: (condition) => set({ condition }),
      setStartLabel: (startLabel) => set({ startLabel }),
      setRoute: (route) => set({ route, activeStopId: route[0]?.stop.id ?? "" }),
      setActiveStopId: (activeStopId) => set({ activeStopId }),
      pushPick: (pick) =>
        set((state) => ({
          // Panning and re-reading the same spine must not become two copies of the book,
          // and a barcode scan should replace the OCR guess it confirms.
          picks: [pick, ...state.picks.filter((item) => !supersedes(pick, item))].slice(0, 24),
        })),
      setQuotes: (quotes) => set({ quotes }),
      noteTake: () => set((state) => ({ boxTakes: state.boxTakes + 1 })),
      resetBox: () => set({ boxTakes: 0 }),
      stage: (buyerId, item) =>
        set((state) => {
          const list = state.desk[buyerId] ?? [];
          if (list.some((entry) => entry.isbn === item.isbn)) return state;
          return { desk: { ...state.desk, [buyerId]: [...list, item] } };
        }),
      unstage: (buyerId, isbn) =>
        set((state) => {
          const list = (state.desk[buyerId] ?? []).filter((entry) => entry.isbn !== isbn);
          const desk = { ...state.desk };
          if (list.length) desk[buyerId] = list;
          else delete desk[buyerId];
          return { desk };
        }),
      clearDesk: () => set({ desk: {} }),
      flushBin: (buyerId) => {
        const state = get();
        const items = state.desk[buyerId] ?? [];
        if (!items.length) return;
        const buyer = buyers.find((entry) => entry.id === buyerId);
        const stagedUsd = cents(items.reduce((sum, item) => sum + item.offerUsd, 0));
        const thresholdUsd = buyer?.thresholdUsd ?? 0;
        const clearsThreshold = stagedUsd >= thresholdUsd;
        const { cashUsd, netUsd } = binCash({
          buyerId,
          buyerName: buyer?.name ?? buyerId,
          items,
          stagedUsd,
          thresholdUsd,
          costUsd: cents(items.length * 0.99),
          frictionUsd: clearsThreshold ? buyer?.frictionUsd ?? 0 : 0,
          netUsd: 0,
          clearsThreshold,
          gapUsd: Math.max(0, cents(thresholdUsd - stagedUsd)),
        });
        const reward = clearsThreshold ? cents(stagedUsd - (buyer?.frictionUsd ?? 0)) : -FLUSH_PENALTY;
        const q = qShapeOk(state.q) ? state.q : makeQ();
        const qNext: QAgent = { ...q, w: [...q.w] };
        const x = [0, 0, 1, Math.min(items.length / 8, 1), Math.min(stagedUsd / 20, 1), 0, 1];
        updateTerminal(qNext, x, SHIP, reward);

        const prev = state.memory[state.activeStopId];
        const payout: Payout = {
          id: `${Date.now()}`,
          at: Date.now(),
          isbn: items.map((item) => item.isbn).join(","),
          title: `${items.length} book${items.length === 1 ? "" : "s"} to ${buyer?.name ?? buyerId}`,
          usd: cashUsd,
          buyerId,
          accepted: clearsThreshold,
          stopId: state.activeStopId,
          miles: 0,
        };
        const memory = state.activeStopId && cashUsd > 0
          ? {
              ...state.memory,
              [state.activeStopId]: {
                visits: (prev?.visits ?? 0) + 1,
                reward: cents((prev?.reward ?? 0) + netUsd),
                lastAt: Date.now(),
              },
            }
          : state.memory;

        const desk = { ...state.desk };
        delete desk[buyerId];
        set({
          desk,
          q: qNext,
          memory,
          payouts: [payout, ...state.payouts].slice(0, 40),
        });
      },
      trainQ: async (episodes) => {
        if (get().qRunning) return;
        set({ qRunning: true, qProgress: 0 });
        const agent = qShapeOk(get().q) ? { ...get().q, w: [...get().q.w] } : makeQ();
        await trainSlices(agent, episodes, (snapshot, done, total) => {
          set({ q: { ...snapshot, w: [...snapshot.w] }, qProgress: Math.round((done / total) * 100) });
        });
        set({ qRunning: false, qProgress: 100 });
      },
      ensurePretrained: () => {
        const state = get();
        if (qShapeOk(state.q) && state.q.episodes > 0) return;
        // 400 simulated shelves is a few milliseconds on the main thread.
        set({ q: pretrainedAgent(400) });
      },
      logPayout: (input) =>
        set((state) => {
          const usd = input.accepted ? input.usd : 0;
          const shelfFeatures = input.features ?? [];
          const walkerFeatures = input.walkerFeatures ?? [];
          let shelf = netOk(state.shelf, SHELF_INPUT) ? state.shelf : makeNet(SHELF_INPUT);
          let walker = netOk(state.walker, WALKER_INPUT) ? state.walker : makeNet(WALKER_INPUT);
          let shelfReplay = state.shelfReplay;
          let walkerReplay = state.walkerReplay;
          if (shelfFeatures.length === SHELF_INPUT) {
            const y = usd - (input.heuristicUsd ?? 0);
            shelfReplay = remember(shelfReplay, { x: shelfFeatures, y });
            shelf = replay(shelf, shelfReplay.slice(-8));
          }
          if (walkerFeatures.length === WALKER_INPUT) {
            const y = usd - 0.25 * input.miles - (input.walkerHeuristic ?? 0);
            walkerReplay = remember(walkerReplay, { x: walkerFeatures, y });
            walker = replay(walker, walkerReplay.slice(-8));
          }
          const prev = state.memory[input.stopId];
          const memory = input.stopId
            ? {
                ...state.memory,
                [input.stopId]: {
                  visits: (prev?.visits ?? 0) + 1,
                  reward: (prev?.reward ?? 0) + usd,
                  lastAt: Date.now(),
                },
              }
            : state.memory;
          const payout: Payout = {
            id: `${Date.now()}`,
            at: Date.now(),
            isbn: input.isbn,
            title: input.title,
            usd,
            buyerId: input.buyerId,
            accepted: input.accepted,
            stopId: input.stopId,
            miles: input.miles,
          };
          return {
            shelf,
            walker,
            shelfReplay,
            walkerReplay,
            memory,
            payouts: [payout, ...state.payouts].slice(0, 40),
          };
        }),
    }),
    {
      name: "spine-route",
      skipHydration: true,
      partialize: (state) => ({
        maxStops: state.maxStops,
        mileBudget: state.mileBudget,
        leaveCount: state.leaveCount,
        showMutual: state.showMutual,
        offline: state.offline,
        region: state.region,
        condition: state.condition,
        payouts: state.payouts,
        memory: state.memory,
        walker: state.walker,
        shelf: state.shelf,
        walkerReplay: state.walkerReplay,
        shelfReplay: state.shelfReplay,
        picks: state.picks,
        desk: state.desk,
        quotes: state.quotes,
        q: state.q,
      }),
    },
  ),
);
