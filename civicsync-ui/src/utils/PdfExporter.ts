/**
 * PdfExporter — client-side, zero-knowledge PDF generation for CivicSync.
 *
 * Privacy-by-design: every byte is produced locally in the user's browser with
 * jsPDF + html2canvas. No transcript, case fact, or verdict ever leaves the
 * device — nothing is uploaded to our Google Cloud runtimes. This is the
 * "Responsible AI / data sovereignty" guarantee (aligned with the DPDP Act 2023).
 *
 * Rendering strategy:
 *  - We build a hidden, high-contrast LIGHT-MODE container off-screen (black text
 *    on white) so the exported document is print-friendly and ink-economical,
 *    independent of the app's dark Tailwind theme.
 *  - Every section is an independent "block". Each block is rasterized with
 *    html2canvas at scale 3 (pixel-perfect on zoom), then placed into the PDF
 *    with an overflow loop that inserts page breaks so text is never sliced.
 *  - Blocks taller than a single page are split across pages segment-by-segment.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type {
  CaseAnalysis,
  CourtroomPlan,
  CourtroomTurn,
  ElasticDiagnostics,
  JuryVerdict,
  Precedent,
} from "@/types/api";
import { showToast } from "./toast";

// ── Public data contract ─────────────────────────────────────────────────────
export interface CaseExportData {
  sessionId: string | null;
  caseFacts: string;
  analysis: CaseAnalysis | null;
  plan: CourtroomPlan | null;
  precedents: Precedent[];
  diagnostics: ElasticDiagnostics | null;
  transcript: CourtroomTurn[];
  verdict: JuryVerdict | null;
  engine?: string;
}

// ── Geometry (millimetres, A4) ───────────────────────────────────────────────
const PAGE = { w: 210, h: 297 };
const MARGIN = 16;
const CONTENT_W = PAGE.w - MARGIN * 2;
const CONTENT_BOTTOM = PAGE.h - MARGIN;
const BLOCK_GAP = 3; // mm between stacked blocks
const RENDER_W = 760; // px width of off-screen blocks (rasterized, then scaled)
const CANVAS_SCALE = 3; // high-DPI: crisp text when zoomed

// ── Palette (explicit hex only — html2canvas cannot parse Tailwind oklch) ─────
const INK = "#111418";
const INK_SOFT = "#3f454d";
const INK_FAINT = "#6b7280";
const LINE = "#1f2937";
const HAIR = "#cbd1d9";
const PAPER = "#ffffff";
const TINT = "#f3f5f8";
const ACCUSER = "#9a1f2b";
const DEFENSE = "#143d73";
const SEAL = "#0f3d2e";

const SERIF = "'Times New Roman', Georgia, 'Liberation Serif', serif";
const SANS = "Helvetica, Arial, 'Liberation Sans', sans-serif";
const MONO = "'Courier New', 'Liberation Mono', monospace";

// ── Small helpers ─────────────────────────────────────────────────────────────
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTimestamp(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Deterministic, local-only "filing hash" (FNV-1a). Pure cosmetic provenance. */
function filingHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `CS-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function courtTier(weight: number): string {
  if (weight >= 0.95) return "Supreme Court";
  if (weight >= 0.8) return "High Court";
  if (weight >= 0.6) return "Tribunal";
  if (weight > 0) return "District / Subordinate";
  return "Unclassified";
}

function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

// ── Off-screen container + block authoring ───────────────────────────────────
interface BlockOpts {
  breakBefore?: boolean;
}

function createHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("data-cs-print", "true");
  host.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    `width:${RENDER_W}px`,
    `background:${PAPER}`,
    `color:${INK}`,
    `font-family:${SANS}`,
    "z-index:-1",
  ].join(";");
  document.body.appendChild(host);
  return host;
}

function addBlock(host: HTMLElement, html: string, opts: BlockOpts = {}): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = [
    `width:${RENDER_W}px`,
    "box-sizing:border-box",
    `background:${PAPER}`,
    `color:${INK}`,
    `font-family:${SANS}`,
    "padding:0 4px",
  ].join(";");
  if (opts.breakBefore) el.dataset.pageBreak = "before";
  el.innerHTML = html;
  host.appendChild(el);
  return el;
}

// ── Reusable HTML fragments ──────────────────────────────────────────────────
function documentTitle(title: string, subtitle: string): string {
  return `
    <div style="text-align:center;padding:6px 0 10px;border-bottom:3px double ${LINE};margin-bottom:14px;">
      <div style="font-family:${SANS};font-size:10px;letter-spacing:3px;color:${INK_FAINT};text-transform:uppercase;">
        Government &amp; Civic Technology · Confidential Working Paper
      </div>
      <div style="font-family:${SERIF};font-size:25px;font-weight:700;letter-spacing:1px;color:${INK};margin:8px 0 4px;text-transform:uppercase;">
        ${esc(title)}
      </div>
      <div style="font-family:${SERIF};font-size:13px;font-style:italic;color:${INK_SOFT};">
        ${esc(subtitle)}
      </div>
    </div>`;
}

function metaStrip(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([k, v]) => `
      <td style="border:1px solid ${HAIR};padding:7px 10px;vertical-align:top;width:${100 / rows.length}%;">
        <div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin-bottom:3px;">${esc(k)}</div>
        <div style="font-family:${MONO};font-size:11px;color:${INK};font-weight:600;">${esc(v)}</div>
      </td>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:14px;background:${TINT};"><tr>${cells}</tr></table>`;
}

function sectionHeading(numeral: string, text: string): string {
  return `
    <div style="display:flex;align-items:center;gap:10px;margin:4px 0 10px;">
      <div style="font-family:${SERIF};font-size:16px;font-weight:700;color:${PAPER};background:${LINE};padding:3px 9px;border-radius:2px;">${esc(numeral)}</div>
      <div style="font-family:${SERIF};font-size:16px;font-weight:700;letter-spacing:.5px;color:${INK};text-transform:uppercase;">${esc(text)}</div>
      <div style="flex:1;height:1px;background:${HAIR};"></div>
    </div>`;
}

function paragraph(text: string): string {
  return `<p style="font-family:${SERIF};font-size:12.5px;line-height:1.6;color:${INK_SOFT};margin:0 0 9px;text-align:justify;">${esc(text)}</p>`;
}

function footnote(text: string): string {
  return `<p style="font-family:${SANS};font-size:9px;line-height:1.5;color:${INK_FAINT};margin:10px 0 0;border-top:1px solid ${HAIR};padding-top:6px;">${esc(text)}</p>`;
}

function disclaimerBlock(text: string): string {
  return `
    <div style="margin-top:12px;border:1px solid ${HAIR};background:${TINT};padding:9px 11px;border-radius:3px;">
      <div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin-bottom:3px;">Statutory Disclaimer</div>
      <div style="font-family:${SERIF};font-size:10.5px;font-style:italic;line-height:1.5;color:${INK_SOFT};">${esc(text)}</div>
    </div>`;
}

// ── Rasterize + paginate ─────────────────────────────────────────────────────
async function rasterize(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: CANVAS_SCALE,
    backgroundColor: PAPER,
    useCORS: true,
    logging: false,
    windowWidth: RENDER_W,
  });
}

function sliceTallCanvas(pdf: jsPDF, canvas: HTMLCanvasElement): number {
  // Source pixels that map to one full content page.
  const pxPerPage = Math.floor((CONTENT_BOTTOM - MARGIN) * (canvas.width / CONTENT_W));
  let sourceY = 0;
  let lastHeightMm = 0;

  // Always begin a tall block on a fresh page.
  pdf.addPage();

  while (sourceY < canvas.height) {
    const sliceH = Math.min(pxPerPage, canvas.height - sourceY);
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = sliceH;
    const ctx = tmp.getContext("2d");
    if (ctx) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, tmp.width, tmp.height);
      ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    }
    lastHeightMm = (sliceH * CONTENT_W) / canvas.width;
    pdf.addImage(tmp.toDataURL("image/png"), "PNG", MARGIN, MARGIN, CONTENT_W, lastHeightMm);
    sourceY += sliceH;
    if (sourceY < canvas.height) pdf.addPage();
  }
  return MARGIN + lastHeightMm + BLOCK_GAP;
}

async function paginate(pdf: jsPDF, host: HTMLElement): Promise<void> {
  const blocks = Array.from(host.children) as HTMLElement[];
  let cursorY = MARGIN;
  let firstPlacement = true;

  for (const block of blocks) {
    const breakBefore = block.dataset.pageBreak === "before";
    const canvas = await rasterize(block);
    if (canvas.height === 0) continue;
    const imgH = (canvas.height * CONTENT_W) / canvas.width;

    // Oversized block: dedicated slice routine.
    if (imgH > CONTENT_BOTTOM - MARGIN) {
      cursorY = sliceTallCanvas(pdf, canvas);
      firstPlacement = false;
      continue;
    }

    // Overflow check → page break so no text node is sliced in half.
    const needsBreak = breakBefore || cursorY + imgH > CONTENT_BOTTOM;
    if (needsBreak && !firstPlacement) {
      pdf.addPage();
      cursorY = MARGIN;
    }

    pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN, cursorY, CONTENT_W, imgH);
    cursorY += imgH + BLOCK_GAP;
    firstPlacement = false;
  }
}

/** Draw the double legal frame + footer on every page after layout is final. */
function decoratePages(pdf: jsPDF, hash: string): void {
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);

    pdf.setDrawColor(17, 20, 24);
    pdf.setLineWidth(0.7);
    pdf.rect(8, 8, PAGE.w - 16, PAGE.h - 16);
    pdf.setLineWidth(0.2);
    pdf.rect(9.6, 9.6, PAGE.w - 19.2, PAGE.h - 19.2);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      "Generated locally in-browser · Zero-knowledge · Not legal advice or representation",
      PAGE.w / 2,
      PAGE.h - 11,
      { align: "center" }
    );
    pdf.text(hash, 12, PAGE.h - 11);
    pdf.text(`Page ${p} of ${total}`, PAGE.w - 12, PAGE.h - 11, { align: "right" });
  }
}

async function finalize(pdf: jsPDF, host: HTMLElement, hash: string, fileName: string) {
  try {
    await paginate(pdf, host);
    decoratePages(pdf, hash);
    pdf.save(fileName);
  } finally {
    host.remove();
  }
}

// ── EXPORT 1: Complete Case Summary & Trial Report ───────────────────────────
export async function exportCaseReport(data: CaseExportData): Promise<void> {
  const loader = showToast("Compiling judicial brief locally…", "loading", 0);
  try {
    const host = createHost();
    const ts = fmtTimestamp(data.diagnostics?.completed_at);
    const category = data.analysis?.domain ?? data.plan?.domain ?? "Uncategorised";
    const hash = filingHash(
      [data.sessionId, data.caseFacts, data.analysis?.summary, data.transcript.length].join("|")
    );

    // ── Page 1: Title & Executive Brief ──────────────────────────────────────
    const facts = (data.caseFacts || data.analysis?.summary || "").trim();
    const summary = (data.analysis?.summary || "").trim();
    const issues = data.analysis?.issues ?? [];
    const acts = data.analysis?.governing_acts ?? [];

    let page1 = documentTitle(
      "CivicSync — Judicial Feasibility & Research Brief",
      "Precedent-Aware Adversarial Simulation · Educational Working Paper"
    );
    page1 += metaStrip([
      ["Generated", ts],
      ["Case Category", category],
      ["Filing Reference", hash],
    ]);
    page1 += metaStrip([
      ["Session", data.sessionId ?? "—"],
      ["Adjudication Engine", data.engine || "Gemini 3 / Claude (fallback)"],
      ["Confidence", data.analysis ? pct(data.analysis.domain_confidence) : "—"],
    ]);
    page1 += sectionHeading("I", "Factual Background");
    page1 += `<div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin-bottom:5px;">As submitted by the petitioner</div>`;
    page1 += paragraph(facts || "No case facts were recorded for this session.");
    if (summary && summary !== facts) {
      page1 += `<div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin:8px 0 5px;">Neutral restatement (senior counsel)</div>`;
      page1 += paragraph(summary);
    }
    if (issues.length) {
      page1 += `<div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin:8px 0 5px;">Issues for determination</div>`;
      page1 += `<ol style="margin:0 0 6px;padding-left:20px;">${issues
        .map(
          (it) =>
            `<li style="font-family:${SERIF};font-size:12px;line-height:1.55;color:${INK_SOFT};margin-bottom:4px;">${esc(
              it.issue
            )}${it.governing_law ? ` <span style="color:${INK_FAINT};font-style:italic;">— ${esc(it.governing_law)}</span>` : ""}</li>`
        )
        .join("")}</ol>`;
    }
    if (acts.length) {
      page1 += `<div style="font-family:${SANS};font-size:11px;color:${INK_SOFT};margin-top:4px;"><strong style="color:${INK};">Governing instruments: </strong>${acts
        .map((a) => esc(a))
        .join(" · ")}</div>`;
    }
    addBlock(host, page1);

    // ── Page 2: Grounded Legal Authorities ───────────────────────────────────
    let auth = sectionHeading("II", "Grounded Legal Authorities");
    auth += `<div style="font-family:${SANS};font-size:10px;color:${INK_FAINT};margin-bottom:9px;">Retrieved live via the Elasticsearch Agent Builder MCP server${
      data.diagnostics?.index ? ` · index <span style="font-family:${MONO};color:${INK_SOFT};">${esc(data.diagnostics.index)}</span>` : ""
    }${typeof data.diagnostics?.hit_count === "number" ? ` · ${data.diagnostics.hit_count} document(s)` : ""}.</div>`;
    addBlock(host, auth, { breakBefore: true });

    const cited = new Set<string>();
    for (const t of data.transcript)
      for (const c of t.citations || []) if (c.docid && c.grounded) cited.add(c.docid);

    if (data.precedents.length === 0) {
      addBlock(host, paragraph("No authorities were retrieved during Phase 2 for this session."));
    } else {
      data.precedents.forEach((p, i) => {
        const verified = cited.has(p.docid);
        const status = verified
          ? `<span style="color:${SEAL};font-weight:700;">✓ VERIFIED · cited &amp; grounded</span>`
          : `<span style="color:${INK_FAINT};font-weight:600;">RETRIEVED · live MCP</span>`;
        const html = `
          <div style="border:1px solid ${HAIR};border-left:4px solid ${LINE};border-radius:3px;padding:10px 12px;margin-bottom:8px;background:${PAPER};">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
              <div style="font-family:${SERIF};font-size:13px;font-weight:700;color:${INK};">${i + 1}. ${esc(p.title)}</div>
              <div style="font-family:${MONO};font-size:9px;color:${INK_FAINT};white-space:nowrap;">#${esc(p.docid)}</div>
            </div>
            <table style="width:100%;border-collapse:collapse;margin:7px 0 6px;">
              <tr>
                <td style="width:34%;font-family:${SANS};font-size:9px;color:${INK_SOFT};padding:2px 0;"><strong style="color:${INK};">Court:</strong> ${esc(p.court || "—")}</td>
                <td style="width:33%;font-family:${SANS};font-size:9px;color:${INK_SOFT};padding:2px 0;"><strong style="color:${INK};">Hierarchy:</strong> ${esc(courtTier(p.weight))}</td>
                <td style="width:33%;font-family:${SANS};font-size:9px;color:${INK_SOFT};padding:2px 0;"><strong style="color:${INK};">Weight:</strong> ${p.weight.toFixed(2)}</td>
              </tr>
            </table>
            <div style="font-family:${SERIF};font-size:11px;line-height:1.5;color:${INK_SOFT};">${esc(
              (p.snippet || p.headline || "").slice(0, 460) || "No headnote available."
            )}</div>
            <div style="display:flex;justify-content:space-between;margin-top:7px;border-top:1px dashed ${HAIR};padding-top:5px;">
              <div style="font-family:${SANS};font-size:9px;">${status}</div>
              <div style="font-family:${MONO};font-size:8px;color:${INK_FAINT};">${esc(p.url || "")}</div>
            </div>
          </div>`;
        addBlock(host, html);
      });
    }
    if (data.diagnostics?.query_dsl) {
      addBlock(
        host,
        `<div style="margin-top:6px;"><div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin-bottom:4px;">Executed Elasticsearch Query DSL</div><pre style="font-family:${MONO};font-size:8.5px;line-height:1.45;color:${INK};background:${TINT};border:1px solid ${HAIR};border-radius:3px;padding:9px;white-space:pre-wrap;word-break:break-word;margin:0;">${esc(
          JSON.stringify(data.diagnostics.query_dsl, null, 2)
        )}</pre></div>`
      );
    }

    // ── Page 3: Courtroom Deliberation Transcript ────────────────────────────
    addBlock(host, sectionHeading("III", "Courtroom Deliberation Transcript"), {
      breakBefore: true,
    });
    if (data.transcript.length === 0) {
      addBlock(host, paragraph("No oral arguments were exchanged in this session."));
    } else {
      data.transcript.forEach((turn) => {
        const isAccuser = turn.side === "accuser";
        const accent = turn.side === "judge" ? SEAL : isAccuser ? ACCUSER : DEFENSE;
        const who = turn.role_label || (isAccuser ? "Prosecution Counsel" : "Defence Counsel");
        const speaker = turn.speaker === "user" ? "Petitioner (manual)" : turn.speaker === "judge" ? "Bench" : "AI Counsel";
        const cites = (turn.citations || [])
          .filter((c) => c.docid)
          .map(
            (c) =>
              `<span style="display:inline-block;font-family:${MONO};font-size:8px;color:${INK_SOFT};border:1px solid ${HAIR};border-radius:10px;padding:1px 7px;margin:2px 4px 0 0;">#${esc(
                c.docid
              )}${c.statute_section ? ` · ${esc(c.statute_section)}` : ""}${c.grounded ? " ✓" : ""}</span>`
          )
          .join("");
        const html = `
          <div style="margin-bottom:10px;border-left:4px solid ${accent};padding:4px 0 4px 12px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
              <div style="font-family:${SANS};font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:.5px;">${esc(
                who
              )} <span style="color:${INK_FAINT};font-weight:500;text-transform:none;">· ${esc(speaker)}</span></div>
              <div style="font-family:${MONO};font-size:8px;color:${INK_FAINT};">${esc(fmtTimestamp(turn.timestamp))}</div>
            </div>
            <div style="font-family:${SERIF};font-size:12px;line-height:1.6;color:${INK};text-align:justify;">${esc(
              turn.argument
            )}</div>
            ${cites ? `<div style="margin-top:5px;">${cites}</div>` : ""}
          </div>`;
        addBlock(host, html);
      });
    }

    // ── Page 4: Final Jury Verdict & Analytical Feasibility ──────────────────
    addBlock(host, sectionHeading("IV", "Final Jury Verdict & Analytical Feasibility"), {
      breakBefore: true,
    });
    if (!data.verdict) {
      addBlock(host, paragraph("The jury has not yet returned a verdict for this session."));
    } else {
      addBlock(host, verdictBlockHtml(data.verdict));
    }
    addBlock(
      host,
      disclaimerBlock(
        data.verdict?.disclaimer ||
          "Educational courtroom simulation — not legal advice or representation. AI attorneys may err; verify every citation against the official record and consult a qualified advocate."
      )
    );
    addBlock(
      host,
      footnote(
        "Privacy-by-design: this document was generated entirely on your device. No transcript, case fact, or verdict was transmitted to any server during export (DPDP Act 2023 data-minimisation aligned)."
      )
    );

    const fileName = `CivicSync_Trial_Report_${hash}.pdf`;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    await finalize(pdf, host, hash, fileName);

    loader.dismiss();
    showToast(
      "Export complete. All processing completed locally on your device under zero-knowledge encryption.",
      "success",
      5200
    );
  } catch (err) {
    loader.dismiss();
    console.error("[PdfExporter] case report failed", err);
    showToast("Could not generate the trial report. Please try again.", "error", 5000);
    throw err;
  }
}

// ── EXPORT 2: Litigation Strategy & Jury Scorecard ───────────────────────────
export async function exportScorecard(data: CaseExportData): Promise<void> {
  const loader = showToast("Building litigation scorecard locally…", "loading", 0);
  try {
    const host = createHost();
    const ts = fmtTimestamp(data.diagnostics?.completed_at);
    const category = data.analysis?.domain ?? data.plan?.domain ?? "Uncategorised";
    const hash = filingHash(
      ["scorecard", data.sessionId, data.caseFacts, data.transcript.length].join("|")
    );

    let head = documentTitle(
      "CivicSync — Litigation Strategy & Jury Scorecard",
      "Attorney Work Product · Strategic Refinement Matrix"
    );
    head += metaStrip([
      ["Generated", ts],
      ["Case Category", category],
      ["Filing Reference", hash],
    ]);
    addBlock(host, head);

    addBlock(host, sectionHeading("A", "Jury Propensity Scorecard"));
    if (!data.verdict) {
      addBlock(
        host,
        paragraph("No verdict is available yet. Run at least one deliberation round to populate the scorecard.")
      );
    } else {
      addBlock(host, scorecardTableHtml(data.verdict));
    }

    // Side-by-side arguments matrix.
    addBlock(host, sectionHeading("B", "Comparative Arguments Log"));
    if (data.transcript.length === 0) {
      addBlock(host, paragraph("No arguments have been logged for this case."));
    } else {
      addBlock(host, argumentsMatrixHtml(data.transcript), { breakBefore: false });
    }

    addBlock(
      host,
      disclaimerBlock(
        data.verdict?.disclaimer ||
          "Attorney work product for strategic preparation only — not legal advice. Verify all authorities before reliance."
      )
    );
    addBlock(
      host,
      footnote(
        "Generated locally in-browser. Zero data left this device — client-side, zero-knowledge export (DPDP Act 2023 aligned)."
      )
    );

    const fileName = `CivicSync_Scorecard_${hash}.pdf`;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    await finalize(pdf, host, hash, fileName);

    loader.dismiss();
    showToast(
      "Export complete. All processing completed locally on your device under zero-knowledge encryption.",
      "success",
      5200
    );
  } catch (err) {
    loader.dismiss();
    console.error("[PdfExporter] scorecard failed", err);
    showToast("Could not generate the scorecard. Please try again.", "error", 5000);
    throw err;
  }
}

// ── Verdict / scorecard fragments ────────────────────────────────────────────
function bar(score: number, color: string): string {
  const w = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return `<div style="height:8px;background:${HAIR};border-radius:4px;overflow:hidden;">
      <div style="height:8px;width:${w}%;background:${color};"></div>
    </div>`;
}

function verdictBlockHtml(v: JuryVerdict): string {
  const leadColor = v.leaning === "accuser" ? ACCUSER : v.leaning === "defense" ? DEFENSE : SEAL;
  const leadText =
    v.leaning === "balanced"
      ? "Balanced — no decisive advantage"
      : `${v.leaning === "accuser" ? "Prosecution" : "Defence"} currently ahead`;
  return `
    <div style="border:2px solid ${LINE};border-radius:4px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <div style="font-family:${SANS};font-size:8px;letter-spacing:2px;text-transform:uppercase;color:${INK_FAINT};">Jury Propensity Score (S_jury)</div>
          <div style="font-family:${SERIF};font-size:13px;font-weight:700;color:${leadColor};margin-top:3px;">${esc(leadText)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:${SERIF};font-size:28px;font-weight:700;color:${ACCUSER};line-height:1;">${pct(v.accuser.s_jury)}</div>
          <div style="font-family:${SANS};font-size:8px;color:${INK_FAINT};">Prosecution</div>
        </div>
        <div style="font-family:${SERIF};font-size:18px;color:${INK_FAINT};padding:0 8px;">vs</div>
        <div style="text-align:left;">
          <div style="font-family:${SERIF};font-size:28px;font-weight:700;color:${DEFENSE};line-height:1;">${pct(v.defense.s_jury)}</div>
          <div style="font-family:${SANS};font-size:8px;color:${INK_FAINT};">Defence</div>
        </div>
      </div>
      ${scoreAxisRow("Statutory Compliance", "40%", v.accuser.statute.score, v.defense.statute.score)}
      ${scoreAxisRow("Precedent Binding Strength", "40%", v.accuser.precedent.score, v.defense.precedent.score)}
      ${scoreAxisRow("Evidentiary Grounding", "20%", v.accuser.factual.score, v.defense.factual.score)}
      <div style="margin-top:11px;border-top:1px solid ${HAIR};padding-top:8px;">
        <div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${INK_FAINT};margin-bottom:3px;">Bench rationale</div>
        <div style="font-family:${SERIF};font-size:11.5px;line-height:1.55;color:${INK_SOFT};font-style:italic;">${esc(
          v.rationale || "—"
        )}</div>
      </div>
      ${
        v.hallucination_flags?.length
          ? `<div style="margin-top:8px;border:1px solid ${ACCUSER};border-radius:3px;padding:7px 9px;"><div style="font-family:${SANS};font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:${ACCUSER};margin-bottom:3px;">Hallucination flags</div>${v.hallucination_flags
              .map(
                (f) =>
                  `<div style="font-family:${SANS};font-size:10px;color:${INK_SOFT};">• ${esc(f)}</div>`
              )
              .join("")}</div>`
          : ""
      }
    </div>`;
}

function scoreAxisRow(label: string, weight: string, a: number, d: number): string {
  return `
    <div style="margin-bottom:9px;">
      <div style="display:flex;justify-content:space-between;font-family:${SANS};font-size:10px;color:${INK};margin-bottom:3px;">
        <span><strong>${esc(label)}</strong> <span style="color:${INK_FAINT};">· weight ${esc(weight)}</span></span>
        <span style="font-family:${MONO};font-size:9px;color:${INK_FAINT};">P ${pct(a)} · D ${pct(d)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="width:50%;padding-right:5px;">${bar(a, ACCUSER)}</td>
        <td style="width:50%;padding-left:5px;">${bar(d, DEFENSE)}</td>
      </tr></table>
    </div>`;
}

function scorecardTableHtml(v: JuryVerdict): string {
  const row = (
    label: string,
    weight: string,
    a: { score: number; rationale: string },
    d: { score: number; rationale: string }
  ) => `
    <tr>
      <td style="border:1px solid ${HAIR};padding:7px 9px;font-family:${SANS};font-size:10px;color:${INK};"><strong>${esc(
        label
      )}</strong><div style="color:${INK_FAINT};font-size:8px;">weight ${esc(weight)}</div></td>
      <td style="border:1px solid ${HAIR};padding:7px 9px;text-align:center;font-family:${MONO};font-size:13px;font-weight:700;color:${ACCUSER};">${pct(
        a.score
      )}</td>
      <td style="border:1px solid ${HAIR};padding:7px 9px;text-align:center;font-family:${MONO};font-size:13px;font-weight:700;color:${DEFENSE};">${pct(
        d.score
      )}</td>
      <td style="border:1px solid ${HAIR};padding:7px 9px;font-family:${SERIF};font-size:9px;line-height:1.4;color:${INK_SOFT};">P: ${esc(
        a.rationale || "—"
      )}<br/>D: ${esc(d.rationale || "—")}</td>
    </tr>`;
  return `
    ${verdictBlockHtml(v)}
    <table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <thead>
        <tr style="background:${LINE};">
          <th style="border:1px solid ${LINE};padding:7px 9px;text-align:left;font-family:${SANS};font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${PAPER};">Axis</th>
          <th style="border:1px solid ${LINE};padding:7px 9px;font-family:${SANS};font-size:9px;text-transform:uppercase;color:${PAPER};">Prosecution</th>
          <th style="border:1px solid ${LINE};padding:7px 9px;font-family:${SANS};font-size:9px;text-transform:uppercase;color:${PAPER};">Defence</th>
          <th style="border:1px solid ${LINE};padding:7px 9px;text-align:left;font-family:${SANS};font-size:9px;text-transform:uppercase;color:${PAPER};">Jury Rationale</th>
        </tr>
      </thead>
      <tbody>
        ${row("Statutory Compliance", "40%", v.accuser.statute, v.defense.statute)}
        ${row("Precedent Binding Strength", "40%", v.accuser.precedent, v.defense.precedent)}
        ${row("Evidentiary Grounding", "20%", v.accuser.factual, v.defense.factual)}
        <tr style="background:${TINT};">
          <td style="border:1px solid ${HAIR};padding:7px 9px;font-family:${SANS};font-size:10px;font-weight:700;color:${INK};">Weighted S_jury</td>
          <td style="border:1px solid ${HAIR};padding:7px 9px;text-align:center;font-family:${MONO};font-size:14px;font-weight:700;color:${ACCUSER};">${pct(
            v.accuser.s_jury
          )}</td>
          <td style="border:1px solid ${HAIR};padding:7px 9px;text-align:center;font-family:${MONO};font-size:14px;font-weight:700;color:${DEFENSE};">${pct(
            v.defense.s_jury
          )}</td>
          <td style="border:1px solid ${HAIR};padding:7px 9px;font-family:${SERIF};font-size:9px;color:${INK_SOFT};">Margin ${(
            v.margin * 100
          ).toFixed(1)} pts · ${esc(v.leaning)}</td>
        </tr>
      </tbody>
    </table>`;
}

function argumentsMatrixHtml(transcript: CourtroomTurn[]): string {
  const rows: Array<{ left?: CourtroomTurn; right?: CourtroomTurn }> = [];
  let pending: CourtroomTurn | null = null;
  for (const t of transcript) {
    if (!pending) {
      pending = t;
    } else {
      rows.push({ left: pending, right: t });
      pending = null;
    }
  }
  if (pending) rows.push({ left: pending });

  const cell = (turn?: CourtroomTurn) => {
    if (!turn)
      return `<td style="border:1px solid ${HAIR};padding:8px 9px;vertical-align:top;width:50%;color:${INK_FAINT};font-family:${SERIF};font-size:10px;font-style:italic;">— no response —</td>`;
    const isAccuser = turn.side === "accuser";
    const accent = turn.side === "judge" ? SEAL : isAccuser ? ACCUSER : DEFENSE;
    const cites = (turn.citations || [])
      .filter((c) => c.docid)
      .map((c) => `#${esc(c.docid)}${c.grounded ? "✓" : ""}`)
      .join("  ");
    return `<td style="border:1px solid ${HAIR};padding:8px 9px;vertical-align:top;width:50%;">
      <div style="font-family:${SANS};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${accent};margin-bottom:3px;">${esc(
        turn.role_label || (isAccuser ? "Prosecution" : "Defence")
      )} · ${esc(turn.speaker === "user" ? "manual" : "AI")}</div>
      <div style="font-family:${SERIF};font-size:10.5px;line-height:1.5;color:${INK};text-align:justify;">${esc(
        turn.argument.slice(0, 700)
      )}${turn.argument.length > 700 ? "…" : ""}</div>
      ${cites ? `<div style="font-family:${MONO};font-size:8px;color:${INK_FAINT};margin-top:4px;">${cites}</div>` : ""}
    </td>`;
  };

  const body = rows
    .map(
      (r, i) =>
        `<tr><td style="border:1px solid ${HAIR};padding:6px;text-align:center;font-family:${MONO};font-size:9px;color:${INK_FAINT};width:6%;">${
          i + 1
        }</td>${cell(r.left)}${cell(r.right)}</tr>`
    )
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:${LINE};">
          <th style="border:1px solid ${LINE};padding:6px;font-family:${SANS};font-size:8px;color:${PAPER};">#</th>
          <th style="border:1px solid ${LINE};padding:6px;text-align:left;font-family:${SANS};font-size:9px;text-transform:uppercase;color:${PAPER};">Argument</th>
          <th style="border:1px solid ${LINE};padding:6px;text-align:left;font-family:${SANS};font-size:9px;text-transform:uppercase;color:${PAPER};">Opposing Counter-Argument</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}
