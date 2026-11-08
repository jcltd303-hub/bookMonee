import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Map, Package, Rss, ScanLine } from "lucide-react";
import { libraries } from "@/lib/catalog";
import { DealsTab } from "@/components/deals-tab";
import { DeskTab } from "@/components/desk-tab";
import { RunTab } from "@/components/run-tab";
import { ScanTab } from "@/components/scan-tab";
import { TrainTab } from "@/components/train-tab";
import { useRun } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

type Tab = "route" | "scan" | "desk" | "replace" | "train";

const tabs: { id: Tab; label: string; icon: typeof Map }[] = [
  { id: "route", label: "Route", icon: Map },
  { id: "scan", label: "Scan", icon: ScanLine },
  { id: "desk", label: "Desk", icon: Package },
  { id: "replace", label: "Replace", icon: Rss },
  { id: "train", label: "Train", icon: Brain },
];

function Home() {
  const [tab, setTab] = useState<Tab>("route");
  useEffect(() => {
    void Promise.resolve(useRun.persist.rehydrate()).finally(() => {
      useRun.getState().setReady(true);
      useRun.getState().ensurePretrained();
    });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell is a bonus, not a requirement */
    });
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-lg pb-24">
      <header className="grid gap-1 px-4 pt-5 pb-4">
        <p className="text-sm font-semibold text-primary">Denver micro-libraries</p>
        <h1 className="text-4xl leading-none text-fg">Spine Route</h1>
        <p className="text-sm text-muted">
          {libraries.meta.bookcases} mapped book boxes. Walk the shortest loop that can pay, scan the shelf, and let the desk sort what you take into a prepaid-label shipment.
        </p>
      </header>
      <div className="grid gap-4 px-4">
        {tab === "route" ? <RunTab /> : null}
        {tab === "scan" ? <ScanTab /> : null}
        {tab === "desk" ? <DeskTab /> : null}
        {tab === "replace" ? <DealsTab /> : null}
        {tab === "train" ? <TrainTab /> : null}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((item) => {
            const Icon = item.icon;
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${on ? "text-primary" : "text-muted"}`}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
