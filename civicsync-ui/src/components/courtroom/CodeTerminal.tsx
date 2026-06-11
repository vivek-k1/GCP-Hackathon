import { useState } from "react";
import { Check, Copy, TerminalSquare } from "lucide-react";

export function CodeTerminal({
  title,
  code,
  language = "json",
}: {
  title: string;
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-[#0c0c0f] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/60">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
          <TerminalSquare className="h-3 w-3 text-emerald-400" />
          {title}
          <span className="text-zinc-700">·</span>
          <span className="text-emerald-500/70">{language}</span>
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="p-3 text-[11px] leading-relaxed font-mono text-emerald-200/90 overflow-x-auto max-h-[260px] overflow-y-auto whitespace-pre">
        {code || "// (empty)"}
      </pre>
    </div>
  );
}
