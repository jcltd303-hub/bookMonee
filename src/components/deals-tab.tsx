import { dealsByKind } from "@/data/deals";

export function DealsTab() {
  const replacement = dealsByKind("replacement");
  const maps = dealsByKind("map");
  const boards = dealsByKind("board");

  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h2 className="text-xl">Replace what you take</h2>
        <p className="text-sm text-muted">
          The loop only works if a book goes back in the box. These sources are bundled with the app, so they load with no network and no server call. Food pantries are not on this list on purpose.
        </p>
      </section>
      <DealList title="Free and cheap stock" deals={replacement} />
      <DealList title="Maps that fill the gaps" deals={maps} />
      <DealList title="Boards worth opening yourself" deals={boards} />
    </div>
  );
}

function DealList({ title, deals }: { title: string; deals: ReturnType<typeof dealsByKind> }) {
  if (!deals.length) return null;
  return (
    <section className="grid gap-2">
      <h3 className="text-lg">{title}</h3>
      <ul className="grid gap-2">
        {deals.map((deal) => (
          <li key={deal.url} className="rounded-xl border border-border bg-surface p-3">
            <a href={deal.url} className="font-semibold text-fg">
              {deal.title}
            </a>
            <p className="text-sm text-primary">{deal.source}</p>
            {deal.note ? <p className="text-sm text-muted">{deal.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
