import { useRef, useState, useCallback } from "react";
import { Upload, Loader2, X, FileUp } from "lucide-react";
import { uploadBill, deleteUploadedBill, fetchBills } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BillInfo } from "@/types/api";

const MAX_BYTES = 200 * 1024 * 1024;

interface BillUploadZoneProps {
  disabled?: boolean;
  bills: Record<string, BillInfo>;
  onBillsUpdated: (next: Record<string, BillInfo>, selectKey?: string) => void;
}

export function BillUploadZone({
  disabled,
  bills,
  onBillsUpdated,
}: BillUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadedEntries = Object.entries(bills).filter(([k]) => k.startsWith("upload_"));

  const processFile = useCallback(
    async (file: File) => {
      setLocalError(null);
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setLocalError("Please choose a PDF file.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalError("File exceeds 200 MB limit.");
        return;
      }
      setUploading(true);
      try {
        const res = await uploadBill(file);
        const next = await fetchBills();
        onBillsUpdated(next, res.bill_key);
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onBillsUpdated]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const f = e.dataTransfer.files[0];
    if (f) void processFile(f);
  };

  const remove = async (billKey: string) => {
    setLocalError(null);
    try {
      await deleteUploadedBill(billKey);
      const next = await fetchBills();
      const keys = Object.keys(next);
      const fallback = keys.find((k) => k !== billKey) ?? "";
      onBillsUpdated(next, fallback);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
        Upload a bill
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed px-3 py-5 text-center transition-colors",
          dragOver ? "border-blue-500/50 bg-blue-500/5" : "border-zinc-600 bg-zinc-900/50",
          (disabled || uploading) && "opacity-50 pointer-events-none"
        )}
      >
        <FileUp className="h-6 w-6 mx-auto text-zinc-500 mb-2" />
        <p className="text-sm text-zinc-200">Drag and drop file here</p>
        <p className="text-[11px] text-zinc-500 mt-1">Limit 200MB per file · PDF</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="mt-3 w-full sm:w-auto rounded-lg border border-zinc-500 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-400 hover:bg-zinc-800/80 transition-colors"
        >
          {uploading ? (
            <span className="inline-flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Parsing…
            </span>
          ) : (
            "Browse files"
          )}
        </button>
      </div>

      {localError && (
        <p className="text-[11px] text-rose-400" role="alert">
          {localError}
        </p>
      )}

      {uploadedEntries.length > 0 && (
        <ul className="space-y-1.5">
          {uploadedEntries.map(([key, info]) => (
            <li
              key={key}
              className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-2.5 py-1.5 text-[11px]"
            >
              <span className="text-zinc-300 truncate" title={info.display_name}>
                {info.display_name}
                <span className="text-zinc-500 ml-1">· {info.num_sections} sections</span>
              </span>
              <button
                type="button"
                onClick={() => void remove(key)}
                className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-rose-400 rounded"
                aria-label="Remove uploaded bill"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-zinc-600 flex items-start gap-1.5">
        <Upload className="h-3 w-3 mt-0.5 flex-shrink-0" />
        Image-only PDFs cannot be parsed — use a text-based PDF.
      </p>
    </div>
  );
}
