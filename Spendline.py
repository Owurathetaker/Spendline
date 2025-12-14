from __future__ import annotations

from datetime import datetime, date

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client, Client

# =========================================================
# Spendline — Streamlit + Supabase (Auth + Postgres + RLS)
#
# Mobile-first:
#   - Main-page "Start here" actions (Budget / Expense / Assets)
#   - Sidebar still works on desktop, but mobile doesn't depend on it
#
# Month switching:
#   - NO Prev/Next buttons
#   - Month selection ONLY in Monthly History (dropdown)
#
# Safety + UX:
#   - Button text always visible
#   - Guardrails (min/max amounts)
#   - Friendly DB errors
#   - Delete single expense
#   - Delete single asset entry (requires asset_events table)
#   - Reset current month (expenses + asset entries; optionally keep budget)
#
# Streamlit 2025+:
#   - Replaced use_container_width with width="stretch"
# =========================================================

APP_NAME = "Spendline v1.0 (beta)"

CATEGORIES = [
    "Food & Dining", "Transport", "Entertainment", "Shopping",
    "Bills & Utilities", "Health", "Subscriptions", "Other"
]
WANTS = {"Entertainment", "Shopping", "Subscriptions", "Other"}

CURRENCIES = {"USD": "$", "GHS": "₵", "EUR": "€", "GBP": "£", "NGN": "₦"}

MIN_AMOUNT = 0.01
MAX_AMOUNT = 1_000_000.0


# ----------------------------
# Page config
# ----------------------------
st.set_page_config(page_title="Spendline", layout="centered", initial_sidebar_state="expanded")


# ----------------------------
# Theme
# ----------------------------
def inject_theme(theme: str) -> None:
    if theme == "Dark":
        vars_css = """
        :root{
          --bg:#0b1220;
          --panel:#0f172a;
          --card:#111a2e;
          --text:#e5e7eb;
          --muted:#a3b1c6;
          --border:rgba(163,177,198,0.20);
          --primary:#22c55e;
          --primaryHover:#16a34a;
          --radius:14px;
        }
        """
    else:
        vars_css = """
        :root{
          --bg:#ffffff;
          --panel:#ffffff;
          --card:#f8fafc;
          --text:#0f172a;
          --muted:#64748b;
          --border:#e2e8f0;
          --primary:#22c55e;
          --primaryHover:#16a34a;
          --radius:14px;
        }
        """

    st.markdown(
        f"""
<style>
{vars_css}

.stApp {{ background: var(--bg) !important; }}
.block-container {{ padding-top: 0.9rem; padding-bottom: 2rem; max-width: 980px; }}

h1,h2,h3,h4 {{ color: var(--text) !important; letter-spacing:-0.2px; }}
p, label, .stMarkdown {{ color: var(--muted) !important; }}

section[data-testid="stSidebar"] {{
  background: var(--panel) !important;
  border-right: 1px solid var(--border) !important;
}}

input, textarea {{
  border-radius: 10px !important;
  border: 1px solid var(--border) !important;
  background: var(--panel) !important;
  color: var(--text) !important;
}}
div[data-baseweb="select"] > div {{
  border-radius: 10px !important;
  border: 1px solid var(--border) !important;
  background: var(--panel) !important;
  color: var(--text) !important;
}}

div[data-testid="metric-container"] {{
  background: var(--card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius) !important;
  padding: .9rem !important;
}}
div[data-testid="stMetricLabel"] * {{ color: var(--muted) !important; }}
div[data-testid="stMetricValue"] * {{
  color: var(--text) !important;
  font-weight: 850 !important;
  opacity: 1 !important;
}}

div[data-testid="stButton"] button {{
  background: var(--primary) !important;
  color: #ffffff !important;
  border-radius: 12px !important;
  border: 1px solid rgba(0,0,0,0.06) !important;
  font-weight: 800 !important;
  padding: .55rem 1.05rem !important;
  transition: background-color .15s ease, transform .03s ease !important;
  box-shadow: 0 10px 22px rgba(34,197,94,.18) !important;
}}
div[data-testid="stButton"] button:hover {{
  background: var(--primaryHover) !important;
  color: #ffffff !important;
}}
div[data-testid="stButton"] button:active {{
  transform: translateY(1px) !important;
}}

.small-hint {{
  font-size: 0.92rem;
  color: var(--muted);
  background: rgba(100,116,139,0.08);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
}}

.mini-card {{
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: .65rem .75rem;
  background: var(--card);
}}

@media (max-width: 480px) {{
  .block-container {{ padding-top: .7rem; }}
  h1 {{ font-size: 2.05rem !important; }}
}}
</style>
""",
        unsafe_allow_html=True,
    )


# ----------------------------
# Supabase client
# ----------------------------
@st.cache_resource
def supabase_client() -> Client:
    url = st.secrets.get("SUPABASE_URL", "")
    key = st.secrets.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        st.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Streamlit secrets.")
        st.stop()
    return create_client(url, key)


sb = supabase_client()


def apply_db_auth(access_token: str | None) -> None:
    """Attach the current user's JWT for RLS-protected queries."""
    if not access_token:
        return
    try:
        sb.postgrest.auth(access_token)
    except Exception:
        pass


# ----------------------------
# Helpers
# ----------------------------
def month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def sym(code: str) -> str:
    return CURRENCIES.get(code, "$")


def money(x: float, code: str) -> str:
    return f"{sym(code)}{x:,.2f}"


def guard_amount(x: float) -> tuple[bool, str]:
    if x < MIN_AMOUNT:
        return False, "Amount must be greater than 0."
    if x > MAX_AMOUNT:
        return False, "That amount looks too large. Check for typos."
    return True, ""


def friendly_db_error():
    st.error("Couldn’t save that right now. Please try again.")


def get_user():
    return st.session_state.get("sb_user")


def set_user(user, access_token: str | None):
    st.session_state.sb_user = user
    st.session_state.sb_access_token = access_token
    apply_db_auth(access_token)


def clear_user():
    for k in ("sb_user", "sb_access_token"):
        if k in st.session_state:
            del st.session_state[k]


# ----------------------------
# DB ops (months + expenses + asset_events)
# ----------------------------
def ensure_month_row(user_id: str, month: str):
    res = sb.table("months").select("*").eq("user_id", user_id).eq("month", month).execute()
    if res.data:
        return res.data[0]
    insert = {
        "user_id": user_id,
        "month": month,
        "currency": "USD",
        "budget": 0,
        "assets": 0,
        "liabilities": 0,
        "challenge_start": None,
        "challenge_length": None,
    }
    ins = sb.table("months").insert(insert).execute()
    return ins.data[0] if ins.data else insert


def update_month(user_id: str, month: str, patch: dict):
    patch = dict(patch)
    patch["updated_at"] = datetime.utcnow().isoformat()
    return sb.table("months").update(patch).eq("user_id", user_id).eq("month", month).execute()


def monthly_history(user_id: str):
    """✅ Missing before — returns all month rows for a user."""
    res = (
        sb.table("months")
        .select("month, currency, budget, assets, liabilities")
        .eq("user_id", user_id)
        .order("month", desc=True)
        .execute()
    )
    return res.data or []


def fetch_expenses(user_id: str, month: str):
    res = (
        sb.table("expenses")
        .select("id, occurred_at, amount, category, description")
        .eq("user_id", user_id)
        .eq("month", month)
        .order("occurred_at", desc=True)
        .limit(500)
        .execute()
    )
    return res.data or []


def add_expense(user_id: str, month: str, amount: float, category: str, desc: str | None):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "category": category,
        "description": (desc or "").strip() or None,
        "occurred_at": datetime.utcnow().isoformat(),
    }
    return sb.table("expenses").insert(row).execute()


def delete_expense_row(expense_id: str):
    return sb.table("expenses").delete().eq("id", expense_id).execute()


def fetch_asset_events(user_id: str, month: str):
    # Requires asset_events table
    res = (
        sb.table("asset_events")
        .select("id, created_at, amount, note")
        .eq("user_id", user_id)
        .eq("month", month)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    return res.data or []


def add_asset_event(user_id: str, month: str, amount: float, note: str | None):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "note": (note or "").strip() or None,
        "created_at": datetime.utcnow().isoformat(),
    }
    return sb.table("asset_events").insert(row).execute()


def delete_asset_event(asset_event_id: str):
    return sb.table("asset_events").delete().eq("id", asset_event_id).execute()


def sum_spent(expenses: list[dict]) -> float:
    return float(sum(float(e["amount"]) for e in expenses))


def month_spent_total(user_id: str, mk: str) -> float:
    ex = sb.table("expenses").select("amount").eq("user_id", user_id).eq("month", mk).execute()
    return float(sum(float(e["amount"]) for e in (ex.data or [])))


def reset_current_month(user_id: str, month: str, keep_budget: bool):
    sb.table("expenses").delete().eq("user_id", user_id).eq("month", month).execute()
    sb.table("asset_events").delete().eq("user_id", user_id).eq("month", month).execute()

    patch = {"challenge_start": None, "challenge_length": None, "assets": 0}
    if not keep_budget:
        patch["budget"] = 0

    sb.table("months").update(patch).eq("user_id", user_id).eq("month", month).execute()


# =========================================================
# AUTH SCREEN
# =========================================================
def auth_screen():
    inject_theme("Light")
    st.title("💰 Spendline")
    st.caption("A quiet budget tracker for people who want clarity, not motivation.")
    st.caption("Built for personal use. Shared as-is. Your data stays private.")

    tab_login, tab_signup = st.tabs(["Log in", "Sign up"])

    with tab_signup:
        st.subheader("Create account")
        with st.form("signup_form", clear_on_submit=False):
            name = st.text_input("Full name")
            email = st.text_input("Email")
            country = st.text_input("Country (optional)")
            password = st.text_input("Password", type="password")
            password2 = st.text_input("Confirm password", type="password")
            submit = st.form_submit_button("Create account", width="stretch")

        if submit:
            if not name.strip():
                st.error("Please enter your name.")
                return
            if len(password) < 6:
                st.error("Password must be at least 6 characters.")
                return
            if password != password2:
                st.error("Passwords do not match.")
                return

            try:
                resp = sb.auth.sign_up({"email": email.strip(), "password": password})
            except Exception as e:
                st.error(f"Signup failed: {e}")
                return

            user = getattr(resp, "user", None)
            session = getattr(resp, "session", None)

            if not user:
                st.success("Check your email to confirm your account, then log in.")
                return

            try:
                sb.auth.update_user({"data": {"name": name.strip(), "country": country.strip(), "theme": "Light"}})
            except Exception:
                pass

            token = getattr(session, "access_token", None) if session else None
            set_user(user, token)
            st.success("Account created ✅")
            st.rerun()

    with tab_login:
        st.subheader("Welcome back")
        with st.form("login_form", clear_on_submit=False):
            email = st.text_input("Email", key="login_email")
            password = st.text_input("Password", type="password", key="login_pwd")
            submit = st.form_submit_button("Log in", width="stretch")

        if submit:
            try:
                resp = sb.auth.sign_in_with_password({"email": email.strip(), "password": password})
                user = getattr(resp, "user", None)
                session = getattr(resp, "session", None)
                if not user:
                    st.error("Login failed. Check your email/password.")
                    return
                token = getattr(session, "access_token", None) if session else None
                set_user(user, token)
                st.success("Logged in ✅")
                st.rerun()
            except Exception as e:
                st.error(f"Login failed: {e}")


# Restore session if available
if not get_user():
    try:
        sess = sb.auth.get_session()
        if sess:
            user = getattr(sess, "user", None)
            token = getattr(sess, "access_token", None)
            if user and token:
                set_user(user, token)
    except Exception:
        pass

if not get_user():
    auth_screen()
    st.stop()


# =========================================================
# APP
# =========================================================
user = get_user()
user_id = user.id

# Theme from metadata
theme = "Light"
md = {}
try:
    md = getattr(user, "user_metadata", {}) or {}
    theme = md.get("theme", "Light") or "Light"
except Exception:
    theme = "Light"

inject_theme(theme)

today = date.today()
current_month = month_key(today)
if "selected_month" not in st.session_state:
    st.session_state.selected_month = current_month
selected_month = st.session_state.selected_month

month_row = ensure_month_row(user_id, selected_month)
expenses = fetch_expenses(user_id, selected_month)

asset_events: list[dict] = []
asset_events_error = False
try:
    asset_events = fetch_asset_events(user_id, selected_month)
except Exception:
    asset_events_error = True
    asset_events = []

currency = month_row.get("currency", "USD")


# =========================================================
# SIDEBAR (desktop-friendly)
# =========================================================
with st.sidebar:
    name = md.get("name", "") if isinstance(md, dict) else ""
    st.header(f"👤 {name or 'User'}")
    st.caption(user.email)

    if st.button("Log out", width="stretch", key="logout_sidebar"):
        try:
            sb.auth.sign_out()
        except Exception:
            pass
        clear_user()
        st.rerun()

    st.divider()

    st.header("📊 Monthly Budget")
    bcol1, bcol2 = st.columns([0.65, 0.35])
    with bcol1:
        budget_input_s = st.number_input(
            "Budget",
            min_value=0.0,
            step=10.0,
            value=float(month_row.get("budget", 0.0)),
            key="budget_sidebar",
        )
    with bcol2:
        currency_input_s = st.selectbox(
            "Cur",
            list(CURRENCIES.keys()),
            index=list(CURRENCIES.keys()).index(currency) if currency in CURRENCIES else 0,
            key="cur_sidebar",
        )

    if st.button("Save Budget", width="stretch", key="save_budget_sidebar"):
        ok, msg = guard_amount(float(budget_input_s))
        if not ok:
            st.error(msg)
        else:
            try:
                update_month(user_id, selected_month, {"budget": float(budget_input_s), "currency": currency_input_s})
                st.success("Saved 🔒")
                st.rerun()
            except Exception:
                friendly_db_error()

    st.divider()

    st.header("💸 Log Expense")
    exp_amount_s = st.number_input("Amount", min_value=0.0, step=1.0, key="exp_amt_sidebar")
    exp_desc_s = st.text_input("Description (optional)", key="exp_desc_sidebar")
    exp_category_s = st.selectbox("Category", CATEGORIES, key="exp_cat_sidebar")

    if st.button("Log Expense", width="stretch", key="log_exp_sidebar"):
        ok, msg = guard_amount(float(exp_amount_s))
        if not ok:
            st.error(msg)
        else:
            try:
                add_expense(user_id, selected_month, float(exp_amount_s), exp_category_s, exp_desc_s)
                if exp_category_s in WANTS and month_row.get("challenge_start"):
                    update_month(user_id, selected_month, {"challenge_start": None, "challenge_length": None})
                    st.warning("Challenge reset (wants/other expense logged).")
                st.success("Logged ✅")
                st.rerun()
            except Exception:
                friendly_db_error()

    st.divider()

    st.header("💪 Savings / Assets")
    asset_add_s = st.number_input("Add to assets", min_value=0.0, step=1.0, key="asset_add_sidebar")
    asset_note_s = st.text_input("Note (optional)", key="asset_note_sidebar")
    if st.button("Stack It", width="stretch", key="stack_sidebar"):
        ok, msg = guard_amount(float(asset_add_s))
        if not ok:
            st.error(msg)
        else:
            if asset_events_error:
                st.error("Assets delete needs the `asset_events` table in Supabase.")
            else:
                try:
                    add_asset_event(user_id, selected_month, float(asset_add_s), asset_note_s)
                    new_assets_total = float(month_row.get("assets", 0.0)) + float(asset_add_s)
                    update_month(user_id, selected_month, {"assets": new_assets_total})
                    st.success(f"+{money(asset_add_s, currency)}")
                    st.rerun()
                except Exception:
                    friendly_db_error()


# =========================================================
# MAIN (mobile-first)
# =========================================================
st.title("💰 Spendline")
st.caption("Set budget → log expenses → stack assets. Then check your numbers.")

st.markdown(
    "<div class='small-hint'>On phone: tap <strong>Start here</strong> → Budget / Expense / Assets. "
    "The sidebar menu can be easy to miss.</div>",
    unsafe_allow_html=True,
)

st.write(f"**Month:** {selected_month}")

budget_val = float(month_row.get("budget", 0.0))
no_expenses = len(expenses) == 0

if budget_val <= 0:
    tab_order = ["📊 Budget", "💸 Expense", "💪 Assets"]
elif no_expenses:
    tab_order = ["💸 Expense", "📊 Budget", "💪 Assets"]
else:
    tab_order = ["💸 Expense", "📊 Budget", "💪 Assets"]

st.markdown("### ✅ Start here")
t1, t2, t3 = st.tabs(tab_order)
tabs = {tab_order[0]: t1, tab_order[1]: t2, tab_order[2]: t3}

with tabs["📊 Budget"]:
    q1c1, q1c2 = st.columns([0.7, 0.3])
    with q1c1:
        budget_input_m = st.number_input(
            "Monthly budget",
            min_value=0.0,
            step=10.0,
            value=float(month_row.get("budget", 0.0)),
            key="budget_main",
        )
    with q1c2:
        currency_input_m = st.selectbox(
            "Cur",
            list(CURRENCIES.keys()),
            index=list(CURRENCIES.keys()).index(currency) if currency in CURRENCIES else 0,
            key="cur_main",
        )

    if st.button("Save Budget", width="stretch", key="save_budget_main"):
        ok, msg = guard_amount(float(budget_input_m))
        if not ok:
            st.error(msg)
        else:
            try:
                update_month(user_id, selected_month, {"budget": float(budget_input_m), "currency": currency_input_m})
                st.success("Budget saved 🔒")
                st.rerun()
            except Exception:
                friendly_db_error()

with tabs["💸 Expense"]:
    exp_amount_m = st.number_input("Amount", min_value=0.0, step=1.0, key="exp_amt_main")
    exp_category_m = st.selectbox("Category", CATEGORIES, key="exp_cat_main")
    exp_desc_m = st.text_input("Description (optional)", key="exp_desc_main")

    if st.button("Log Expense", width="stretch", key="log_exp_main"):
        ok, msg = guard_amount(float(exp_amount_m))
        if not ok:
            st.error(msg)
        else:
            try:
                add_expense(user_id, selected_month, float(exp_amount_m), exp_category_m, exp_desc_m)
                if exp_category_m in WANTS and month_row.get("challenge_start"):
                    update_month(user_id, selected_month, {"challenge_start": None, "challenge_length": None})
                    st.warning("Challenge reset (wants/other expense logged).")
                st.success("Expense logged ✅")
                st.rerun()
            except Exception:
                friendly_db_error()

with tabs["💪 Assets"]:
    asset_add_m = st.number_input("Add to assets", min_value=0.0, step=1.0, key="asset_add_main")
    asset_note_m = st.text_input("Note (optional)", key="asset_note_main")

    if st.button("Stack It", width="stretch", key="stack_main"):
        ok, msg = guard_amount(float(asset_add_m))
        if not ok:
            st.error(msg)
        else:
            if asset_events_error:
                st.error("Assets delete needs the `asset_events` table in Supabase.")
            else:
                try:
                    add_asset_event(user_id, selected_month, float(asset_add_m), asset_note_m)
                    new_assets_total = float(month_row.get("assets", 0.0)) + float(asset_add_m)
                    update_month(user_id, selected_month, {"assets": new_assets_total})
                    st.success(f"Added {money(asset_add_m, currency)} ✅")
                    st.rerun()
                except Exception:
                    friendly_db_error()

# Nudges
if "onboarding_done" not in st.session_state:
    st.session_state.onboarding_done = False

if budget_val <= 0:
    st.info("Start: set your **monthly budget** above, then press **Save Budget**.")
elif no_expenses:
    st.info("Next: log your first expense above to unlock your breakdown.")
elif not st.session_state.onboarding_done:
    st.session_state.onboarding_done = True
    st.toast("You’re set. Keep it simple.", icon="✅")


# =========================================================
# Dashboard
# =========================================================
total_spent = sum_spent(expenses)
assets_total = float(month_row.get("assets", 0.0))
remaining = float(month_row.get("budget", 0.0)) - total_spent
net_worth = assets_total - float(month_row.get("liabilities", 0.0))

st.markdown("### 📈 Overview")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Budget", money(float(month_row.get("budget", 0.0)), currency))
c2.metric("Spent", money(float(total_spent), currency))
c3.metric("Remaining", money(float(remaining), currency))
c4.metric("Net Worth", money(float(net_worth), currency))

if float(month_row.get("budget", 0.0)) > 0 and remaining < 0:
    st.error(f"Over budget by {money(abs(remaining), currency)}")


# =========================================================
# Breakdown charts
# =========================================================
st.markdown("### 📊 Breakdown")
if not expenses:
    st.info("Log an expense to see charts and recent activity.")
else:
    df = pd.DataFrame(expenses)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["category"] = df["category"].fillna("Other")
    df["description"] = df["description"].fillna("")
    df["occurred_at"] = pd.to_datetime(df["occurred_at"], errors="coerce")

    by_cat = df.groupby("category", as_index=False)["amount"].sum().sort_values("amount", ascending=False)

    ch1, ch2 = st.columns([1.2, 0.8])
    with ch1:
        pie = px.pie(by_cat, values="amount", names="category", hole=0.55)
        pie.update_layout(margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(pie, use_container_width=True)  # plotly chart still uses this param
    with ch2:
        bar = px.bar(by_cat.head(8), x="category", y="amount", text_auto=".2s")
        bar.update_layout(xaxis_title="", yaxis_title="", margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(bar, use_container_width=True)


# =========================================================
# Tabs
# =========================================================
tab_recent, tab_challenge, tab_history, tab_settings = st.tabs(
    ["🧾 Recent", "🛑 Challenge", "🗂️ Monthly History", "⚙️ Settings"]
)

with tab_recent:
    st.markdown("### Recent Expenses")
    if not expenses:
        st.info("No expenses yet.")
    else:
        for e in expenses[:40]:
            left, right = st.columns([0.82, 0.18])
            occurred = e.get("occurred_at")
            when = ""
            try:
                when = pd.to_datetime(occurred).strftime("%b %d, %H:%M") if occurred else ""
            except Exception:
                when = ""

            desc = (e.get("description") or "").strip()
            label = f"**{e.get('category','Other')}** — {money(float(e.get('amount',0.0)), currency)}"
            meta = f"{when}" + (f" • {desc}" if desc else "")
            left.markdown(
                f"<div class='mini-card'>{label}<br/><span style='opacity:.85'>{meta}</span></div>",
                unsafe_allow_html=True,
            )

            if right.button("Delete", key=f"del_exp_{e['id']}", width="stretch"):
                try:
                    delete_expense_row(e["id"])
                    st.toast("Expense deleted", icon="🗑️")
                    st.rerun()
                except Exception:
                    friendly_db_error()

    st.divider()
    st.markdown("### Asset Entries")
    if asset_events_error:
        st.info("Assets delete needs the `asset_events` table in Supabase.")
    elif not asset_events:
        st.info("No asset entries yet.")
    else:
        for a in asset_events[:40]:
            left, right = st.columns([0.82, 0.18])
            when = ""
            try:
                when = pd.to_datetime(a.get("created_at")).strftime("%b %d, %H:%M") if a.get("created_at") else ""
            except Exception:
                when = ""
            note = (a.get("note") or "").strip()
            label = f"**+{money(float(a.get('amount',0.0)), currency)}**"
            meta = f"{when}" + (f" • {note}" if note else "")
            left.markdown(
                f"<div class='mini-card'>{label}<br/><span style='opacity:.85'>{meta}</span></div>",
                unsafe_allow_html=True,
            )

            if right.button("Delete", key=f"del_asset_{a['id']}", width="stretch"):
                try:
                    delete_asset_event(a["id"])
                    deleted_amt = float(a.get("amount") or 0.0)
                    new_assets = max(0.0, float(month_row.get("assets", 0.0)) - deleted_amt)
                    update_month(user_id, selected_month, {"assets": new_assets})
                    st.toast("Asset entry deleted", icon="🗑️")
                    st.rerun()
                except Exception:
                    friendly_db_error()

with tab_challenge:
    st.markdown("### No-Spend Challenge")
    st.caption("Logging a wants/other expense resets the challenge automatically.")

    if month_row.get("challenge_start"):
        try:
            start = datetime.strptime(month_row["challenge_start"], "%Y-%m-%d").date()
            length = int(month_row.get("challenge_length") or 1)
            days_passed = (date.today() - start).days
            days_left = max(0, length - days_passed)
            progress = min(1.0, max(0.0, days_passed / float(length)))

            st.progress(progress)
            st.markdown(f"**{days_left} days left**")
            if days_left <= 0:
                st.balloons()
                st.success("Challenge complete 💪")
        except Exception:
            st.info("Challenge data looks off for this month.")
    else:
        b1, b2, b3 = st.columns(3)
        if b1.button("7 days", width="stretch", key="ch7"):
            try:
                update_month(user_id, selected_month, {"challenge_length": 7, "challenge_start": date.today().isoformat()})
                st.rerun()
            except Exception:
                friendly_db_error()
        if b2.button("14 days", width="stretch", key="ch14"):
            try:
                update_month(user_id, selected_month, {"challenge_length": 14, "challenge_start": date.today().isoformat()})
                st.rerun()
            except Exception:
                friendly_db_error()
        if b3.button("30 days", width="stretch", key="ch30"):
            try:
                update_month(user_id, selected_month, {"challenge_length": 30, "challenge_start": date.today().isoformat()})
                st.rerun()
            except Exception:
                friendly_db_error()

with tab_history:
    st.markdown("### Monthly History")
    rows = monthly_history(user_id)

    months = [r["month"] for r in rows] if rows else []
    if current_month not in months:
        months = [current_month] + months

    if not months:
        st.info("This is your first month here. Set a budget and log expenses above.")
    else:
        try:
            idx = months.index(selected_month)
        except ValueError:
            idx = 0

        picked = st.selectbox("View month", months, index=idx, key="month_picker")
        if picked != selected_month:
            st.session_state.selected_month = picked
            st.rerun()

        out = []
        for r in rows:
            mk = r["month"]
            cur = r.get("currency", "USD")
            spent = month_spent_total(user_id, mk)
            out.append({
                "Month": mk,
                "Cur": cur,
                "Budget": money(float(r.get("budget", 0.0)), cur),
                "Spent": money(spent, cur),
                "Remaining": money(float(r.get("budget", 0.0)) - spent, cur),
            })

        if out:
            st.dataframe(pd.DataFrame(out), use_container_width=True, hide_index=True)

        st.divider()
        if st.button("Export current month (CSV)", width="stretch", key="export_csv"):
            if not expenses:
                st.info("No expenses to export for this month.")
            else:
                df_csv = pd.DataFrame(expenses).copy()
                df_csv["occurred_at"] = pd.to_datetime(df_csv["occurred_at"], errors="coerce")
                df_csv = df_csv.rename(columns={"occurred_at": "date", "description": "desc"})
                st.download_button(
                    "Download CSV",
                    df_csv.to_csv(index=False).encode("utf-8"),
                    file_name=f"spendline_{selected_month}_expenses.csv",
                    mime="text/csv",
                    width="stretch",
                )

with tab_settings:
    st.markdown("### Settings")

    theme_choice = st.radio("Theme", ["Light", "Dark"], index=0 if theme == "Light" else 1, key="theme_radio")

    if st.button("Apply Theme", width="stretch", key="apply_theme"):
        try:
            new_md = dict(md) if isinstance(md, dict) else {}
            new_md["theme"] = theme_choice
            sb.auth.update_user({"data": new_md})
            st.toast("Theme updated", icon="✅")
        except Exception:
            friendly_db_error()
        st.rerun()

    st.divider()
    st.markdown("### Reset data")
    keep_budget = st.checkbox("Keep my budget for this month", value=True, key="keep_budget_reset")
    confirm = st.checkbox(
        "I understand this will delete expenses & asset entries for this month",
        value=False,
        key="confirm_reset",
    )

    if st.button("Reset current month", width="stretch", key="reset_month_btn"):
        if not confirm:
            st.warning("Tick the confirmation box first.")
        elif asset_events_error:
            st.error("Assets table not set up yet. Add the `asset_events` table first, then reset.")
        else:
            try:
                reset_current_month(user_id, selected_month, keep_budget=keep_budget)
                st.success("Current month reset.")
                st.rerun()
            except Exception:
                friendly_db_error()

    st.divider()
    if st.button("Log out", width="stretch", key="logout_settings"):
        try:
            sb.auth.sign_out()
        except Exception:
            pass
        clear_user()
        st.rerun()

st.caption(f"{APP_NAME} • quiet wealth in motion.")
