"""
shadcn/ui dark theme for Streamlit.
Inject with: st.markdown(SHADCN_CSS, unsafe_allow_html=True)
"""

SHADCN_CSS = """
<style>
/* ── Fonts: Inter (body) + DM Sans (display) ───────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Sans:wght@500;600;700&display=swap');

/* ── Dark root tokens (shadcn zinc-dark) ───────────────────────────────── */
:root {
  --background:   #09090b;
  --foreground:   #fafafa;
  --card:         #18181b;
  --card-border:  #27272a;
  --muted:        #27272a;
  --muted-fg:     #a1a1aa;
  --accent:       #3f3f46;
  --border:       #27272a;
  --primary:      #e4e4e7;
  --primary-fg:   #09090b;
  --radius:       0.5rem;
  --shadow-sm:    0 1px 2px 0 rgb(0 0 0 / 0.4);
  --shadow:       0 1px 3px 0 rgb(0 0 0 / 0.5);
  --shadow-md:    0 4px 6px -1px rgb(0 0 0 / 0.5);

  /* Semantic colours */
  --info-bg:      #0c1a2e;
  --info-fg:      #93c5fd;
  --info-border:  #1e3a5f;

  --warn-bg:      #1c1000;
  --warn-fg:      #fcd34d;
  --warn-border:  #78350f;

  --err-bg:       #1a0505;
  --err-fg:       #fca5a5;
  --err-border:   #7f1d1d;

  --ok-bg:        #052e16;
  --ok-fg:        #4ade80;
  --ok-border:    #166534;
}

/* ── Base ─────────────────────────────────────────────────────────────── */
html, body,
[data-testid="stAppViewContainer"],
[data-testid="stMain"],
[data-testid="block-container"] {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
  background-color: var(--background) !important;
  color: var(--foreground) !important;
}

/* Kill Streamlit default white flashes */
[data-testid="stApp"],
[data-testid="stHeader"] {
  background-color: var(--background) !important;
}

/* ── Hide chrome ──────────────────────────────────────────────────────── */
#MainMenu, footer, header,
[data-testid="stDecoration"],
[data-testid="stStatusWidget"] { display: none !important; }

/* ── Sidebar ──────────────────────────────────────────────────────────── */
[data-testid="stSidebar"] {
  background-color: #111113 !important;
  border-right: 1px solid var(--card-border) !important;
}
[data-testid="stSidebar"] * {
  color: var(--foreground) !important;
}
[data-testid="stSidebar"] .stSelectbox label,
[data-testid="stSidebar"] .stRadio label,
[data-testid="stSidebar"] p,
[data-testid="stSidebar"] small {
  font-size: 0.8125rem !important;
  color: var(--muted-fg) !important;
}

/* ── Selectbox ────────────────────────────────────────────────────────── */
[data-testid="stSelectbox"] > div > div {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  color: var(--foreground) !important;
  font-size: 0.875rem !important;
}
[data-testid="stSelectbox"] > div > div:hover {
  border-color: var(--accent) !important;
}

/* ── Selectbox dropdown popup ─────────────────────────────────────────── */
[data-testid="stSelectbox"] ul,
[role="listbox"] {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
}
[role="option"]:hover,
[role="option"][aria-selected="true"] {
  background: var(--muted) !important;
}

/* ── Text inputs ──────────────────────────────────────────────────────── */
[data-testid="stTextInput"] input,
[data-testid="stTextArea"] textarea,
[data-testid="stNumberInput"] input {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  color: var(--foreground) !important;
  font-family: 'Inter', sans-serif !important;
  font-size: 0.875rem !important;
  padding: 0.5rem 0.75rem !important;
  caret-color: var(--foreground) !important;
}
[data-testid="stTextInput"] input::placeholder,
[data-testid="stTextArea"] textarea::placeholder {
  color: var(--muted-fg) !important;
}
[data-testid="stTextInput"] input:focus,
[data-testid="stTextArea"] textarea:focus {
  border-color: #52525b !important;
  box-shadow: 0 0 0 2px rgb(82 82 91 / 0.3) !important;
  outline: none !important;
}

/* ── Buttons (Streamlit 1.40 uses data-testid="baseButton-*") ─────────── */
/* Base reset for all buttons */
[data-testid="stButton"] button,
[data-testid="stFormSubmitButton"] button,
[data-testid="stDownloadButton"] button {
  border-radius: var(--radius) !important;
  font-family: 'DM Sans', sans-serif !important;
  font-size: 0.875rem !important;
  font-weight: 600 !important;
  transition: opacity 0.15s, background-color 0.15s !important;
  letter-spacing: 0.01em !important;
}

/* Primary button — bright white on dark so it pops */
[data-testid="baseButton-primary"],
[data-testid="stButton"] button[kind="primary"] {
  background-color: #ffffff !important;
  color: #09090b !important;
  border: 1px solid #ffffff !important;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.4) !important;
}
[data-testid="baseButton-primary"]:hover,
[data-testid="stButton"] button[kind="primary"]:hover {
  background-color: #e4e4e7 !important;
  border-color: #e4e4e7 !important;
}
/* Force inner <p> text colour on primary */
[data-testid="baseButton-primary"] p,
[data-testid="stButton"] button[kind="primary"] p {
  color: #09090b !important;
  font-weight: 600 !important;
}

/* Secondary / plain buttons */
[data-testid="baseButton-secondary"],
[data-testid="stButton"] button[kind="secondary"],
[data-testid="stButton"] button:not([kind]) {
  background-color: #27272a !important;
  color: #fafafa !important;
  border: 1px solid #3f3f46 !important;
}
[data-testid="baseButton-secondary"]:hover,
[data-testid="stButton"] button[kind="secondary"]:hover,
[data-testid="stButton"] button:not([kind]):hover {
  background-color: #3f3f46 !important;
}
[data-testid="baseButton-secondary"] p,
[data-testid="stButton"] button[kind="secondary"] p,
[data-testid="stButton"] button:not([kind]) p {
  color: #fafafa !important;
}

/* ── Download button ──────────────────────────────────────────────────── */
[data-testid="stDownloadButton"] button,
[data-testid="baseButton-secondary"][data-testid*="download"] {
  background-color: #27272a !important;
  color: #fafafa !important;
  border: 1px solid #3f3f46 !important;
  border-radius: var(--radius) !important;
}
[data-testid="stDownloadButton"] button p {
  color: #fafafa !important;
}

/* ── Metric cards ─────────────────────────────────────────────────────── */
[data-testid="stMetric"] {
  background: var(--card) !important;
  border: 1px solid var(--card-border) !important;
  border-radius: var(--radius) !important;
  padding: 1rem 1.25rem !important;
  box-shadow: var(--shadow-sm) !important;
}
[data-testid="stMetricLabel"] {
  font-size: 0.6875rem !important;
  font-weight: 500 !important;
  color: var(--muted-fg) !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
[data-testid="stMetricValue"] {
  font-family: 'DM Sans', sans-serif !important;
  font-size: 1.5rem !important;
  font-weight: 700 !important;
  color: var(--foreground) !important;
}

/* ── Expanders ────────────────────────────────────────────────────────── */
[data-testid="stExpander"] {
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  margin-bottom: 0.375rem !important;
}
[data-testid="stExpander"] summary {
  font-family: 'Inter', sans-serif !important;
  font-size: 0.8125rem !important;
  font-weight: 500 !important;
  color: var(--foreground) !important;
  background: transparent !important;
  padding: 0.75rem 1rem !important;
}
[data-testid="stExpander"] summary:hover {
  background: var(--muted) !important;
  border-radius: var(--radius) !important;
}
[data-testid="stExpander"] > div > div {
  color: var(--foreground) !important;
  padding: 0 1rem 0.875rem !important;
}

/* ── Info / warning / error ───────────────────────────────────────────── */
[data-testid="stInfo"] {
  background: var(--info-bg) !important;
  border: 1px solid var(--info-border) !important;
  border-radius: var(--radius) !important;
  color: var(--info-fg) !important;
  font-size: 0.875rem !important;
}
[data-testid="stWarning"] {
  background: var(--warn-bg) !important;
  border: 1px solid var(--warn-border) !important;
  border-radius: var(--radius) !important;
  color: var(--warn-fg) !important;
  font-size: 0.875rem !important;
}
[data-testid="stError"] {
  background: var(--err-bg) !important;
  border: 1px solid var(--err-border) !important;
  border-radius: var(--radius) !important;
  color: var(--err-fg) !important;
  font-size: 0.875rem !important;
}
[data-testid="stSuccess"] {
  background: var(--ok-bg) !important;
  border: 1px solid var(--ok-border) !important;
  border-radius: var(--radius) !important;
  color: var(--ok-fg) !important;
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */
[data-testid="stTabs"] [role="tablist"] {
  border-bottom: 1px solid var(--border) !important;
  background: transparent !important;
}
[data-testid="stTabs"] [role="tab"] {
  font-family: 'DM Sans', sans-serif !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
  color: var(--muted-fg) !important;
  background: transparent !important;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  border-radius: 0 !important;
  padding: 0.625rem 1rem !important;
  transition: color 0.15s !important;
}
[data-testid="stTabs"] [role="tab"][aria-selected="true"] {
  color: var(--foreground) !important;
  border-bottom-color: var(--primary) !important;
}
[data-testid="stTabs"] [role="tab"]:hover { color: var(--foreground) !important; }
[data-testid="stTabs"] [role="tabpanel"] {
  background: transparent !important;
}

/* ── Dataframe ────────────────────────────────────────────────────────── */
[data-testid="stDataFrame"] {
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
}
[data-testid="stDataFrame"] iframe {
  color-scheme: dark;
}

/* ── Bar chart ────────────────────────────────────────────────────────── */
[data-testid="stArrowVegaLiteChart"] canvas,
[data-testid="stVegaLiteChart"] {
  background: var(--card) !important;
  border-radius: var(--radius) !important;
}

/* ── Progress ─────────────────────────────────────────────────────────── */
[data-testid="stProgress"] > div {
  background: var(--muted) !important;
  border-radius: 9999px !important;
}
[data-testid="stProgress"] > div > div {
  background: var(--primary) !important;
  border-radius: 9999px !important;
}

/* ── Spinner ──────────────────────────────────────────────────────────── */
[data-testid="stSpinner"] > div { border-top-color: var(--primary) !important; }

/* ── Divider ──────────────────────────────────────────────────────────── */
hr { border-color: var(--border) !important; }

/* ── Markdown text ────────────────────────────────────────────────────── */
p, li, span, label, small, div {
  color: var(--foreground);
}
[data-testid="stMarkdownContainer"] p {
  font-size: 0.875rem !important;
  line-height: 1.6 !important;
  color: var(--foreground) !important;
}
[data-testid="stCaptionContainer"] p,
.stCaption p {
  font-size: 0.75rem !important;
  color: var(--muted-fg) !important;
}

/* ── Headings ─────────────────────────────────────────────────────────── */
h1, h2, h3, h4 {
  font-family: 'DM Sans', sans-serif !important;
  color: var(--foreground) !important;
  letter-spacing: -0.02em !important;
}
h1 { font-size: 1.5rem !important; font-weight: 700 !important; }
h2 { font-size: 1.25rem !important; font-weight: 600 !important; }
h3 { font-size: 1rem   !important; font-weight: 600 !important; }

/* ── Radio ────────────────────────────────────────────────────────────── */
[data-testid="stRadio"] label span {
  color: var(--foreground) !important;
  font-size: 0.875rem !important;
}

/* ── Number input arrows ──────────────────────────────────────────────── */
[data-testid="stNumberInput"] button {
  background: var(--muted) !important;
  color: var(--foreground) !important;
  border-color: var(--border) !important;
}

/* ── Text area disabled (source text) ────────────────────────────────── */
[data-testid="stTextArea"] textarea:disabled {
  background: #111113 !important;
  color: #a1a1aa !important;
  border-color: var(--border) !important;
  font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
  font-size: 0.8125rem !important;
  line-height: 1.7 !important;
}

/* ── Scrollbar ────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--background); }
::-webkit-scrollbar-thumb { background: var(--muted); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }

/* ── Utility classes ──────────────────────────────────────────────────── */
.sh-card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.25rem 1.5rem;
  margin-bottom: 0.75rem;
}
.sh-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.sh-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0.1875rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.sh-badge-green  { background: #052e16; color: #4ade80; }
.sh-badge-amber  { background: #1c0f00; color: #fbbf24; }
.sh-badge-red    { background: #1a0505; color: #f87171; }
.sh-badge-zinc   { background: #27272a; color: #a1a1aa; }
.sh-badge-blue   { background: #0c1a2e; color: #60a5fa; }
</style>
"""

# ── Colour constants for inline HTML ──────────────────────────────────────
BG       = "#09090b"
CARD     = "#18181b"
BORDER   = "#27272a"
FG       = "#fafafa"
MUTED_FG = "#a1a1aa"
ACCENT   = "#3f3f46"


def notice_html(text: str, kind: str = "info") -> str:
    colours = {
        "info":    ("#0c1a2e", "#93c5fd", "#1e3a5f"),
        "warning": ("#1c1000", "#fcd34d", "#78350f"),
        "error":   ("#1a0505", "#fca5a5", "#7f1d1d"),
        "success": ("#052e16", "#4ade80", "#166534"),
    }
    bg, fg, border = colours.get(kind, colours["info"])
    return (
        f'<div style="background:{bg};color:{fg};border:1px solid {border};'
        f'border-radius:0.5rem;padding:0.875rem 1rem;font-size:0.8125rem;'
        f'font-family:Inter,sans-serif;line-height:1.5;margin:0.5rem 0;">'
        f'{text}</div>'
    )


def badge_html(text: str, kind: str = "zinc") -> str:
    return f'<span class="sh-badge sh-badge-{kind}">{text}</span>'


def label_html(text: str) -> str:
    return (
        f'<p class="sh-label" style="margin:1rem 0 0.4rem;">{text}</p>'
    )


def verdict_card_html(icon: str, label: str, headline: str, bg: str, fg: str) -> str:
    return (
        f'<div class="sh-card" style="border-left:3px solid {fg};padding:1rem 1.25rem;">'
        f'<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.375rem;">'
        f'<span style="font-size:1rem;">{icon}</span>'
        f'<span style="font-family:DM Sans,sans-serif;font-weight:600;'
        f'font-size:0.8125rem;color:{fg};">{label}</span></div>'
        f'<p style="margin:0;font-size:0.875rem;color:{FG};">{headline}</p>'
        f'</div>'
    )
