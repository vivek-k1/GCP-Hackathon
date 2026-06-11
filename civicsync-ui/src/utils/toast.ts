/**
 * Dependency-free toast notifications.
 *
 * Intentionally framework-agnostic (no React context/provider) so it can be
 * fired from plain async utilities like the client-side PDF exporter. All
 * styling is inline hex so it never depends on the app's Tailwind theme.
 */

export type ToastType = "success" | "error" | "info" | "loading";

const HOST_ID = "cs-toast-host";

const PALETTE: Record<ToastType, { bg: string; border: string; fg: string; accent: string }> = {
  success: { bg: "#04231a", border: "#10b981", fg: "#d1fae5", accent: "#34d399" },
  error: { bg: "#2a0d12", border: "#f43f5e", fg: "#ffe4e6", accent: "#fb7185" },
  info: { bg: "#0b1b2b", border: "#3b82f6", fg: "#dbeafe", accent: "#60a5fa" },
  loading: { bg: "#161616", border: "#52525b", fg: "#e4e4e7", accent: "#a1a1aa" },
};

const ICON: Record<ToastType, string> = {
  success: "✓",
  error: "!",
  info: "i",
  loading: "↻",
};

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "bottom:22px",
      "right:22px",
      "display:flex",
      "flex-direction:column",
      "gap:10px",
      "pointer-events:none",
      "font-family:'Inter',Helvetica,Arial,sans-serif",
    ].join(";");
    document.body.appendChild(host);
  }
  return host;
}

export interface ToastHandle {
  dismiss: () => void;
  update: (message: string, type?: ToastType) => void;
}

/**
 * Show a toast. Pass `duration: 0` to keep it on screen until you call
 * `dismiss()` (useful for loading states).
 */
export function showToast(
  message: string,
  type: ToastType = "info",
  duration = 4200
): ToastHandle {
  const host = ensureHost();
  const card = document.createElement("div");
  const palette = PALETTE[type];

  card.style.cssText = [
    "pointer-events:auto",
    "min-width:280px",
    "max-width:380px",
    "display:flex",
    "align-items:flex-start",
    "gap:10px",
    "padding:12px 14px",
    "border-radius:12px",
    `background:${palette.bg}`,
    `border:1px solid ${palette.border}`,
    "box-shadow:0 12px 32px rgba(0,0,0,0.45)",
    "transform:translateY(12px)",
    "opacity:0",
    "transition:transform .28s cubic-bezier(.16,1,.3,1),opacity .28s ease",
  ].join(";");

  const badge = document.createElement("div");
  badge.style.cssText = [
    "flex:0 0 auto",
    "width:20px",
    "height:20px",
    "border-radius:999px",
    `background:${palette.accent}`,
    "color:#0a0a0a",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-size:12px",
    "font-weight:700",
    "margin-top:1px",
  ].join(";");
  badge.textContent = ICON[type];
  if (type === "loading") {
    badge.style.animation = "cs-toast-spin 0.9s linear infinite";
    ensureSpinKeyframes();
  }

  const text = document.createElement("div");
  text.style.cssText = [
    `color:${palette.fg}`,
    "font-size:12.5px",
    "line-height:1.45",
    "font-weight:500",
  ].join(";");
  text.textContent = message;

  card.appendChild(badge);
  card.appendChild(text);
  host.appendChild(card);

  // Animate in on next frame.
  requestAnimationFrame(() => {
    card.style.transform = "translateY(0)";
    card.style.opacity = "1";
  });

  let timer: number | undefined;
  const dismiss = () => {
    if (timer) window.clearTimeout(timer);
    card.style.transform = "translateY(12px)";
    card.style.opacity = "0";
    window.setTimeout(() => card.remove(), 300);
  };

  if (duration > 0) {
    timer = window.setTimeout(dismiss, duration);
  }

  const update = (newMessage: string, newType?: ToastType) => {
    text.textContent = newMessage;
    if (newType && newType !== type) {
      const p = PALETTE[newType];
      card.style.background = p.bg;
      card.style.borderColor = p.border;
      text.style.color = p.fg;
      badge.style.background = p.accent;
      badge.textContent = ICON[newType];
      badge.style.animation =
        newType === "loading" ? "cs-toast-spin 0.9s linear infinite" : "none";
    }
  };

  return { dismiss, update };
}

function ensureSpinKeyframes() {
  if (document.getElementById("cs-toast-spin-style")) return;
  const style = document.createElement("style");
  style.id = "cs-toast-spin-style";
  style.textContent =
    "@keyframes cs-toast-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
}
