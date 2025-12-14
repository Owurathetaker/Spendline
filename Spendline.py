from __future__ import annotations

from datetime import datetime, date

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client, Client

# =========================================================
# Spendline — Streamlit + Supabase (Auth + Postgres + RLS)
# Mobile-first fix (no Prev/Next month buttons):
#   - Sidebar can be hidden on mobile.
#   - Add "Quick Actions" on the main page (Budget / Expense / Assets)
#   - Month switching happens ONLY in Monthly History (as requested).
# =========================================================

APP_NAME = "Spendline v0.1"

CATEGORIES = [
    "Food & Dining", "Transport", "Entertainment", "Shopping",
    "Bills & Utilities", "Health", "Subscriptions", "Other"
]
WANTS = {"Entertainment", "Shopping", "Subscriptions", "Other"}

CURRENCIES = {"USD": "$", "GHS": "₵", "EUR": "€", "GBP": "£", "NGN": "₦"}


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
  color: #07210f !important;
  border-radius: 12px !important;
  border: 1px solid rgba(0,0,0,0.06) !important;
  font-weight: 750 !important;
  padding: .55rem 1.05rem !important;
  transition: background-color .15s ease, transform .03s ease !important;
  box-shadow: 0 10px 22px rgba(34,197,94,.18) !important;
}}
div[data-testid="stButton"] button:hover {{ background: var(--primaryHover) !important; }}
div[data-testid="stButton"] button:active {{ transform: translateY(1px) !important; }}

.small-hint {{
  font-size: 0.92rem;
  color: var(--muted);
  background: rgba(100,116,139,0.08);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.6rem 0.75rem;
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


# ----------------------------
# Attach user JWT to PostgREST (CRITICAL for RLS)
# ----------------------------
def apply_db_auth(access_token: str | None) -> None:
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
# DB operations
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


def add_expense(user_id: str, month: str, amount: float, category: str, desc: str | None):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "category": category,
        "description": desc or None,
        "occurred_at": datetime.utcnow().isoformat(),
    }
    return sb.table("expenses").insert(row).execute()


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


def monthly_history(user_id: str):
    res = (
        sb.table("months")
        .select("month, currency, budget, assets, liabilities")
        .eq("user_id", user_id)
        .order("month", desc=True)
        .execute()
    )
    return res.data or []


def sum_spent(expenses: list[dict]) -> float:
    return float(sum(float(e["amount"]) for e in expenses))


def month_spent_total(user_id: str, mk: str) -> float:
    ex = (
        sb.table("expenses")
        .select("amount")
        .eq("user_id", user_id)
        .eq("month", mk)
        .execute()
    )
    return float(sum(float(e["amount"]) for e in (ex.data or [])))


# =========================================================
# AUTH SCREEN (Supabase Auth)
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
            submit = st.form_submit_button("Create account", use_container_width=True)

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
            submit = st.form_submit_button("Log in", use_container_width=True)

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

# Selected month: default current month; switching happens ONLY in History tab
today = date.today()
current_month = month_key(today)
if "selected_month" not in st.session_state:
    st.session_state.selected_month = current_month

selected_month = st.session_state.selected_month

# Load data
month_row = ensure_month_row(user_id, selected_month)
expenses = fetch_expenses(user_id, selected_month)
currency = month_row.get("currency", "USD")


# =========================================================
# SIDEBAR (desktop-friendly)
# =========================================================
with st.sidebar:
    name = md.get("name", "") if isinstance(md, dict) else ""
    st.header(f"👤 {name or 'User'}")
    st.caption(user.email)

    if st.button("Log out", use_container_width=True, key="logout_sidebar"):
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

    if st.button("Save Budget", use_container_width=True, key="save_budget_sidebar"):
        update_month(user_id, selected_month, {"budget": float(budget_input_s), "currency": currency_input_s})
        st.success("Saved 🔒")
        st.rerun()

    st.divider()

    st.header("💸 Log Expense")
    exp_amount_s = st.number_input("Amount", min_value=0.0, step=1.0, key="exp_amt_sidebar")
    exp_desc_s = st.text_input("Description (optional)", key="exp_desc_sidebar")
    exp_category_s = st.selectbox("Category", CATEGORIES, key="exp_cat_sidebar")

    if st.button("Log Expense", use_container_width=True, key="log_exp_sidebar"):
        if exp_amount_s > 0:
            add_expense(
                user_id, selected_month, float(exp_amount_s),
                exp_category_s, exp_desc_s.strip() if exp_desc_s else ""
            )
            if exp_category_s in WANTS and month_row.get("challenge_start"):
                update_month(user_id, selected_month, {"challenge_start": None, "challenge_length": None})
                st.warning("Challenge reset (wants/other expense logged).")
            st.success("Logged ✅")
            st.rerun()
        else:
            st.info("Enter an amount above 0.")

    st.divider()

    st.header("💪 Savings / Assets")
    asset_add_s = st.number_input("Add to assets", min_value=0.0, step=1.0, key="asset_add_sidebar")
    if st.button("Stack It", use_container_width=True, key="stack_sidebar"):
        if asset_add_s > 0:
            new_assets = float(month_row.get("assets", 0.0)) + float(asset_add_s)
            update_month(user_id, selected_month, {"assets": new_assets})
            st.success(f"+{money(asset_add_s, currency)}")
            st.rerun()
        else:
            st.info("Enter an amount above 0.")


# =========================================================
# MAIN (mobile-first Quick Actions)
# =========================================================
st.title("💰 Spendline")
st.caption("Set budget → log expenses → stack assets. Then check your numbers.")

# Mobile hint (quick + direct)
st.markdown(
    "<div class='small-hint'>On phone: use <strong>Quick Actions</strong> below. "
    "The sidebar menu can be easy to miss.</div>",
    unsafe_allow_html=True,
)

# Current month label (no prev/next buttons)
st.write(f"**Month:** {selected_month}")

st.markdown("### ⚡ Quick Actions")
qa1, qa2, qa3 = st.tabs(["📊 Budget", "💸 Expense", "💪 Assets"])

with qa1:
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

    if st.button("Save Budget", use_container_width=True, key="save_budget_main"):
        update_month(user_id, selected_month, {"budget": float(budget_input_m), "currency": currency_input_m})
        st.success("Budget saved 🔒")
        st.rerun()

with qa2:
    exp_amount_m = st.number_input("Amount", min_value=0.0, step=1.0, key="exp_amt_main")
    exp_category_m = st.selectbox("Category", CATEGORIES, key="exp_cat_main")
    exp_desc_m = st.text_input("Description (optional)", key="exp_desc_main")

    if st.button("Log Expense", use_container_width=True, key="log_exp_main"):
        if exp_amount_m > 0:
            add_expense(
                user_id, selected_month, float(exp_amount_m),
                exp_category_m, exp_desc_m.strip() if exp_desc_m else ""
            )
            if exp_category_m in WANTS and month_row.get("challenge_start"):
                update_month(user_id, selected_month, {"challenge_start": None, "challenge_length": None})
                st.warning("Challenge reset (wants/other expense logged).")
            st.success("Expense logged ✅")
            st.rerun()
        else:
            st.info("Enter an amount above 0.")

with qa3:
    asset_add_m = st.number_input("Add to assets", min_value=0.0, step=1.0, key="asset_add_main")
    if st.button("Stack It", use_container_width=True, key="stack_main"):
        if asset_add_m > 0:
            new_assets = float(month_row.get("assets", 0.0)) + float(asset_add_m)
            update_month(user_id, selected_month, {"assets": new_assets})
            st.success(f"Added {money(asset_add_m, currency)} ✅")
            st.rerun()
        else:
            st.info("Enter an amount above 0.")


# =========================================================
# Subtle first-time nudges (no big walkthrough)
# =========================================================
if "onboarding_done" not in st.session_state:
    st.session_state.onboarding_done = False

budget_val = float(month_row.get("budget", 0.0))
if budget_val <= 0:
    st.info("Start: set your **monthly budget** in Quick Actions → **Budget**, then press **Save Budget**.")
elif len(expenses) == 0:
    st.info("Next: log your first expense in Quick Actions → **Expense** to unlock your breakdown.")
elif not st.session_state.onboarding_done:
    st.session_state.onboarding_done = True
    st.toast("You’re set. Keep it simple.", icon="✅")


# =========================================================
# Dashboard
# =========================================================
total_spent = sum_spent(expenses)
remaining = float(month_row.get("budget", 0.0)) - total_spent
net_worth = float(month_row.get("assets", 0.0)) - float(month_row.get("liabilities", 0.0))

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
        st.plotly_chart(pie, use_container_width=True)
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
        show = df.sort_values("occurred_at", ascending=False).head(30)[
            ["occurred_at", "category", "description", "amount"]
        ].copy()
        show["occurred_at"] = show["occurred_at"].dt.strftime("%Y-%m-%d %H:%M")
        show["amount"] = show["amount"].apply(lambda x: money(float(x), currency))
        show = show.rename(columns={"occurred_at": "date", "description": "desc"})
        st.dataframe(show, use_container_width=True, hide_index=True)

with tab_challenge:
    st.markdown("### No-Spend Challenge")
    st.caption("Logging a wants/other expense resets the challenge automatically.")

    if month_row.get("challenge_start"):
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
    else:
        b1, b2, b3 = st.columns(3)
        if b1.button("7 days", use_container_width=True, key="ch7"):
            update_month(user_id, selected_month, {"challenge_length": 7, "challenge_start": date.today().isoformat()})
            st.rerun()
        if b2.button("14 days", use_container_width=True, key="ch14"):
            update_month(user_id, selected_month, {"challenge_length": 14, "challenge_start": date.today().isoformat()})
            st.rerun()
        if b3.button("30 days", use_container_width=True, key="ch30"):
            update_month(user_id, selected_month, {"challenge_length": 30, "challenge_start": date.today().isoformat()})
            st.rerun()

with tab_history:
    st.markdown("### Monthly History")
    rows = monthly_history(user_id)

    # Month picker is the ONLY navigation (as requested)
    months = [r["month"] for r in rows] if rows else []
    if current_month not in months:
        months = [current_month] + months

    if not months:
        st.info("No history yet.")
    else:
        # Pick month
        try:
            idx = months.index(selected_month)
        except ValueError:
            idx = 0

        picked = st.selectbox("View month", months, index=idx, key="month_picker")
        if picked != selected_month:
            st.session_state.selected_month = picked
            st.rerun()

        # Table summary
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
        if st.button("Export current month (CSV)", use_container_width=True, key="export_csv"):
            if not expenses:
                st.info("No expenses to export for this month.")
            else:
                csv_df = pd.DataFrame(expenses).copy()
                csv_df["occurred_at"] = pd.to_datetime(csv_df["occurred_at"], errors="coerce")
                csv_df = csv_df.rename(columns={"occurred_at": "date", "description": "desc"})
                st.download_button(
                    "Download CSV",
                    csv_df.to_csv(index=False).encode("utf-8"),
                    file_name=f"spendline_{selected_month}_expenses.csv",
                    mime="text/csv",
                    use_container_width=True,
                )

with tab_settings:
    st.markdown("### Settings")

    theme_choice = st.radio("Theme", ["Light", "Dark"], index=0 if theme == "Light" else 1, key="theme_radio")

    if st.button("Apply Theme", use_container_width=True, key="apply_theme"):
        try:
            # Preserve other metadata (name/country) while updating theme
            new_md = dict(md) if isinstance(md, dict) else {}
            new_md["theme"] = theme_choice
            sb.auth.update_user({"data": new_md})
        except Exception as e:
            st.error(f"Could not update theme: {e}")
        st.rerun()

    st.divider()
    if st.button("Log out", use_container_width=True, key="logout_settings"):
        try:
            sb.auth.sign_out()
        except Exception:
            pass
        clear_user()
        st.rerun()


st.caption(f"{APP_NAME} • quiet wealth in motion.")
