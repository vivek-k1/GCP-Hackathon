import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gavel, Scale, ShieldHalf, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation, CourtroomTurn } from "@/types/api";
import type { StreamingTurn } from "@/hooks/useCourtroom";

const SIDE_STYLE = {
  accuser: {
    border: "border-l-rose-500",
    ring: "ring-rose-500/20",
    text: "text-rose-300",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    icon: Scale,
    name: "Prosecution",
  },
  defense: {
    border: "border-l-blue-500",
    ring: "ring-blue-500/20",
    text: "text-blue-300",
    chip: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    icon: ShieldHalf,
    name: "Defence",
  },
  judge: {
    border: "border-l-amber-500",
    ring: "ring-amber-500/20",
    text: "text-amber-300",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    icon: Gavel,
    name: "Bench",
  },
} as const;

function CitationChips({ citations }: { citations: Citation[] }) {
  if (!citations?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {citations.map((c, i) => (
        <a
          key={i}
          href={c.url || undefined}
          target={c.url ? "_blank" : undefined}
          rel="noreferrer"
          className={cn(
            "inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border",
            c.grounded
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-300 border-amber-500/20"
          )}
          title={c.quote || c.label}
        >
          {c.grounded ? "✓" : "?"} {c.label || c.docid}
          {c.statute_section ? ` · ${c.statute_section}` : ""}
        </a>
      ))}
    </div>
  );
}

function LawyerCard({ turn }: { turn: CourtroomTurn }) {
  const style = SIDE_STYLE[turn.side];
  const Icon = style.icon;
  const isUser = turn.speaker === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-lg border-l-2 bg-zinc-900/50 p-3.5", style.border)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={cn(
            "h-6 w-6 rounded-full flex items-center justify-center border",
            style.chip
          )}
        >
          {isUser ? <User className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
        </div>
        <span className={cn("text-[11px] font-semibold", style.text)}>{turn.role_label}</span>
        <span className="text-[9px] text-zinc-600 font-mono ml-auto">#{turn.turn_id}</span>
      </div>
      <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">
        {turn.argument}
      </p>
      <CitationChips citations={turn.citations} />
    </motion.div>
  );
}

function StreamingCard({ turn }: { turn: StreamingTurn }) {
  const style = SIDE_STYLE[turn.side];
  const Icon = style.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-lg border-l-2 bg-zinc-900/50 p-3.5 ring-1", style.border, style.ring)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn("h-6 w-6 rounded-full flex items-center justify-center border", style.chip)}>
          <Icon className="h-3 w-3" />
        </div>
        <span className={cn("text-[11px] font-semibold", style.text)}>
          {turn.roleLabel || style.name}
        </span>
        <span className="text-[9px] text-zinc-500 ml-auto animate-pulse">arguing…</span>
      </div>
      <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap typing-cursor">
        {turn.text}
      </p>
    </motion.div>
  );
}

export function TranscriptFeed({
  transcript,
  streaming,
}: {
  transcript: CourtroomTurn[];
  streaming: StreamingTurn | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, streaming?.text]);

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {transcript.map((t) => (
          <LawyerCard key={t.turn_id} turn={t} />
        ))}
      </AnimatePresence>
      {streaming && <StreamingCard turn={streaming} />}
      {transcript.length === 0 && !streaming && (
        <div className="text-center py-10">
          <Gavel className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">The court is in session.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Open the floor below — argue a side yourself, or let the attorneys debate.
          </p>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
