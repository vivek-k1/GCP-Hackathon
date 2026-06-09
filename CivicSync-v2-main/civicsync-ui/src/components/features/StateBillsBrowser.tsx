import { useState, useEffect } from "react";
import { Library, Loader2, Search } from "lucide-react";
import { fetchStateBillsMeta, fetchStateBills, type StateBillsMeta, type StateBillRow } from "@/lib/api";
import { cn } from "@/lib/utils";

export function StateBillsBrowser() {
  const [meta, setMeta] = useState<StateBillsMeta | null>(null);
  const [state, setState] = useState("All States");
  const [yearFrom, setYearFrom] = useState(1961);
  const [yearTo, setYearTo] = useState(2024);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StateBillRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const limit = 100;

  useEffect(() => {
    fetchStateBillsMeta()
      .then((m) => {
        setMeta(m);
        setYearFrom(m.year_from_default);
        setYearTo(m.year_to_default);
        setState(m.states[0] ?? "All States");
      })
      .catch(() => {
        setMessage("Could not load state bills metadata.");
        setMeta(null);
      });
  }, []);

  const load = async (newOffset: number) => {
    setLoading(true);
    setMessage(null);
    try {
      const st = state === "All States" ? undefined : state;
      const res = await fetchStateBills({
        state: st,
        yearFrom,
        yearTo,
        q: q.trim() || undefined,
        limit,
        offset: newOffset,
      });
      setRows(res.rows);
      setTotal(res.total);
      setOffset(newOffset);
      if (res.message) setMessage(res.message);
    } catch {
      setMessage("Failed to load state bills.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (meta) load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only after meta
  }, [meta]);

  const onSearch = () => load(0);
  const hasMore = offset + rows.length < total;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Library className="h-5 w-5 text-amber-400" />
          Browse state bills
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          PRS-style dataset: filter by state, year, and keyword (when <code className="text-zinc-400">data/bills_states.csv</code> is present
          on the server).
        </p>
      </div>

      <div className="glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-2xl font-display font-bold text-zinc-100">
            {meta?.total_count.toLocaleString() ?? "—"}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">State bills in dataset</p>
        </div>
        {meta && (
          <p
            className={cn(
              "text-xs max-w-md",
              meta.dataset_present ? "text-zinc-500" : "text-amber-400/90"
            )}
          >
            {meta.source_note}
          </p>
        )}
      </div>

      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              State
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2.5"
            >
              {(meta?.states ?? ["All States"]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              From year
            </label>
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => setYearFrom(Number(e.target.value))}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              To year
            </label>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => setYearTo(Number(e.target.value))}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              Keyword
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
                placeholder="rent, labour, education…"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs pl-9 pr-3 py-2.5"
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Apply filters
        </button>
      </div>

      {message && (
        <div className="text-sm text-amber-300/90 border border-amber-500/20 rounded-lg p-3 bg-amber-500/5">
          {message}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider text-[10px]">
                <th className="p-3 font-semibold">Bill</th>
                <th className="p-3 font-semibold">State</th>
                <th className="p-3 font-semibold">Date</th>
                <th className="p-3 font-semibold">Legislature</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="p-3 text-zinc-300 max-w-md">{r.bill}</td>
                  <td className="p-3 text-zinc-500 whitespace-nowrap">{r.state}</td>
                  <td className="p-3 text-zinc-500 whitespace-nowrap">{r.date}</td>
                  <td className="p-3 text-zinc-500">{r.legislature ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && total > 0 && (
        <p className="text-[11px] text-zinc-500">
          Showing {offset + 1}–{offset + rows.length} of {total}
        </p>
      )}

      {rows.length > 0 && hasMore && (
        <button
          type="button"
          onClick={() => load(offset + limit)}
          disabled={loading}
          className="text-xs text-cyan-400 hover:text-cyan-300"
        >
          Load more
        </button>
      )}

      {!loading && total === 0 && meta?.dataset_present && (
        <p className="text-sm text-zinc-500">No rows match your filters.</p>
      )}
    </div>
  );
}
