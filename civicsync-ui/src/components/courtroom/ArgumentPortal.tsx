import { useState } from "react";
import { Bot, Loader2, Scale, Send, ShieldHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourtroomSide } from "@/types/api";

export function ArgumentPortal({
  busy,
  onSubmitManual,
  onAutomate,
}: {
  busy: boolean;
  onSubmitManual: (side: CourtroomSide, argument: string) => void;
  onAutomate: (side: CourtroomSide) => void;
}) {
  const [side, setSide] = useState<CourtroomSide>("accuser");
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim() || busy) return;
    onSubmitManual(side, text.trim());
    setText("");
  };

  return (
    <div className="glass-panel-strong rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
          Argument portal
        </p>
        <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
          <button
            onClick={() => setSide("accuser")}
            disabled={busy}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors",
              side === "accuser"
                ? "bg-rose-500/20 text-rose-300"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Scale className="h-3 w-3" /> Prosecution
          </button>
          <button
            onClick={() => setSide("defense")}
            disabled={busy}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors",
              side === "defense"
                ? "bg-blue-500/20 text-blue-300"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <ShieldHalf className="h-3 w-3" /> Defence
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={3}
        disabled={busy}
        placeholder={`Argue as ${side === "accuser" ? "Prosecution" : "Defence"} — the opposing AI attorney will rebut with precedents. (Cmd/Ctrl+Enter to send)`}
        className="w-full rounded-lg bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
            busy || !text.trim()
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-white text-zinc-900 hover:bg-zinc-200"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Challenge opposing counsel
        </button>

        <div className="h-5 w-px bg-zinc-800" />

        <button
          onClick={() => !busy && onAutomate(side)}
          disabled={busy}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border transition-colors",
            busy
              ? "border-zinc-800 text-zinc-600 cursor-not-allowed"
              : "border-zinc-700 text-zinc-300 hover:border-amber-500/40 hover:text-amber-300"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          Automate {side === "accuser" ? "Prosecution" : "Defence"} argument
        </button>
      </div>
    </div>
  );
}
