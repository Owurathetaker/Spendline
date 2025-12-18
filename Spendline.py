import io
import time
import zipfile
from datetime import datetime, date
from typing import Any, Callable, Optional

import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client
from supabase.lib.client_options import ClientOptions

# =========================================================
# Spendline.py
# Run: streamlit run Spendline.py
#
# FIX: Password reset works by using PKCE flow.
# - Supabase sends recovery redirect with ?code=... (not #access_token...)
# - We exchange code -> session, then allow password update.
#
# Policy:
# ✅ Explicit login required (no auto restore for casual visitors)
# =========================================================

APP_NAME = "Spendline"
APP_TAGLINE = "quiet wealth in motion."

CATEGORIES = [
    "Food & Dining", "Transport", "Entertainment", "Shopping",
    "Bills & Utilities", "Health", "Subscriptions", "Other"
]
CURRENCIES = {"USD": "$", "GHS": "₵", "EUR": "€", "GBP": "£", "NGN": "₦"}

MIN_AMOUNT = 0.01
MAX_AMOUNT = 1_000_000.0

st.set_page_config(page_title=APP_NAME, layout="centered", initial_sidebar_state="expanded")


# ----------------------------
# Theme
# ----------------------------
def inject_theme(theme: str) -> None:
    theme = theme or "Light"
    if theme == "Dark":
        vars_css = """
        :root{
          --bg:#0b1220; --panel:#0f172a; --card:#111a2e;
          --text:#e5e7eb; --muted:#a3b1c6; --border:rgba(163,177,198,0.22);
          --primary:#22c55e; --primaryHover:#16a34a; --radius:14px;
        }"""
    else:
        vars_css = """
        :root{
          --bg:#ffffff; --panel:#ffffff; --card:#f8fafc;
          --text:#0f172a; --muted:#64748b; --border:#e2e8f0;
          --primary:#22c55e; --primaryHover:#16a34a; --radius:14px;
        }"""

    st.markdown(
        f"""
<style>
{vars_css}
.stApp {{ background: var(--bg) !important; }}
.block-container {{ padding-top: .85rem; padding-bottom: 2rem; max-width: 980px; }}
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
  font-weight: 900 !important;
  opacity: 1 !important;
}}

div[data-testid="stButton"] button {{
  background: var(--primary) !important;
  color: #ffffff !important;
  border-radius: 12px !important;
  border: 1px solid rgba(0,0,0,0.06) !important;
  font-weight: 800 !important;
  padding: .55rem 1.05rem !important;
  box-shadow: 0 10px 22px rgba(34,197,94,.18) !important;
}}
div[data-testid="stButton"] button:hover {{
  background: var(--primaryHover) !important;
  color: #ffffff !important;
}}

.hero {{
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--card);
  padding: 1.0rem 1.05rem;
}}
</style>
""",
        unsafe_allow_html=True,
    )


# ----------------------------
# Supabase client (PKCE)
# ----------------------------
@st.cache_resource
def supabase_client():
    url = st.secrets.get("SUPABASE_URL", "")
    key = st.secrets.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        st.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Streamlit secrets.")
        st.stop()

    # PKCE flow is the important bit for recovery links to become ?code=...
    opts = ClientOptions(flow_type="pkce")
    return create_client(url, key, options=opts)


sb = supabase_client()


def apply_db_auth(access_token: Optional[str]) -> None:
    if not access_token:
        return
    try:
        pg = getattr(sb, "postgrest", None)
        if pg and hasattr(pg, "auth"):
            pg.auth(access_token)
    except Exception:
        pass


def sb_exec(call: Callable[[], Any], retries: int = 2, delay: float = 0.6):
    last_err: Optional[Exception] = None
    for i in range(retries + 1):
        try:
            return call()
        except Exception as e:
            last_err = e
            if i < retries:
                time.sleep(delay * (i + 1))
            else:
                raise last_err


# ----------------------------
# Helpers
# ----------------------------
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


def month_key(d: date) -> str:
    return d.strftime("%Y-%m")


# ----------------------------
# Session helpers (explicit login)
# ----------------------------
def get_user():
    return st.session_state.get("sb_user")


def set_user(user, access_token: Optional[str]):
    st.session_state.sb_user = user
    st.session_state.sb_access_token = access_token
    apply_db_auth(access_token)


def clear_user():
    for k in ("sb_user", "sb_access_token"):
        st.session_state.pop(k, None)


def goto_auth(mode: str):
    st.session_state["auth_mode"] = mode
    st.query_params["auth"] = mode
    st.rerun()


# ----------------------------
# PKCE recovery handler
# ----------------------------
def maybe_accept_pkce_code_session() -> bool:
    code = st.query_params.get("code")
    link_type = (st.query_params.get("type") or st.query_params.get("auth") or "").lower()

    # Supabase recovery redirects commonly include type=recovery or you can route via ?auth=recovery
    if not code:
        return False
    if link_type not in {"recovery"} and st.query_params.get("auth") != "recovery":
        # still allow exchange if code exists; but keep conservative
        pass

    try:
        # Per Supabase Python docs, exchange_code_for_session expects {"auth_code": "..."}
        resp = sb.auth.exchange_code_for_session({"auth_code": code})
        user = getattr(resp, "user", None)
        session = getattr(resp, "session", None)
        token = getattr(session, "access_token", None) if session else None
        if user:
            set_user(user, token)
            return True
    except Exception:
        return False

    return False


def recovery_reset_password_screen():
    inject_theme("Light")
    st.title("🔑 Reset password")
    st.caption("Set a new password for your Spendline account.")

    with st.form("reset_pw_form"):
        p1 = st.text_input("New password", type="password")
        p2 = st.text_input("Confirm new password", type="password")
        submit = st.form_submit_button("Update password", width="stretch")

    if submit:
        if len(p1) < 6:
            st.error("Password must be at least 6 characters.")
            return
        if p1 != p2:
            st.error("Passwords do not match.")
            return
        try:
            sb.auth.update_user({"password": p1})
            st.success("Password updated ✅ Please log in.")
            try:
                sb.auth.sign_out()
            except Exception:
                pass
            clear_user()
            st.query_params.clear()
            goto_auth("login")
        except Exception as e:
            st.error(f"Couldn’t update password: {e}")


# ----------------------------
# Auth UI
# ----------------------------
def landing_screen():
    inject_theme("Light")
    st.title(f"💰 {APP_NAME}")
    st.markdown(
        f"""
<div class="hero">
  <h3 style="margin-top:0; margin-bottom:.25rem; color: var(--text);">
    Spend less on liabilities. Stack more on assets.
  </h3>
  <p style="margin-top:0;">A simple budget tracker built for clarity — not complexity.</p>
  <p style="margin-top:.35rem; color: var(--muted);"><b>{APP_TAGLINE}</b></p>
</div>
""",
        unsafe_allow_html=True,
    )
    st.markdown("")
    c1, c2 = st.columns(2)
    with c1:
        st.button("Log in", width="stretch", on_click=goto_auth, args=("login",))
    with c2:
        st.button("Sign up", width="stretch", on_click=goto_auth, args=("signup",))
    st.caption("No demo mode. You’ll always need an account to access Spendline.")


def signup_view():
    inject_theme("Light")
    st.title(f"💰 {APP_NAME}")
    st.caption("Create an account to start tracking your money.")
    if st.button("← Back", width="stretch"):
        goto_auth("landing")

    st.subheader("Sign up")
    with st.form("signup_form", clear_on_submit=False):
        name = st.text_input("Full name")
        email = st.text_input("Email")
        country = st.text_input("Country (optional)", value="gh")
        password = st.text_input("Password", type="password")
        password2 = st.text_input("Confirm password", type="password")
        submit = st.form_submit_button("Create account", width="stretch")

    if st.button("Already have an account? Log in", width="stretch"):
        goto_auth("login")

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
            goto_auth("login")
            return

        try:
            sb.auth.update_user({"data": {"name": name.strip(), "country": country.strip(), "theme": "Light"}})
        except Exception:
            pass

        token = getattr(session, "access_token", None) if session else None
        set_user(user, token)
        st.success("Account created ✅")
        st.rerun()


def login_view():
    inject_theme("Light")
    st.title(f"💰 {APP_NAME}")
    st.caption("Welcome back. Log in to continue.")
    if st.button("← Back", width="stretch"):
        goto_auth("landing")

    st.subheader("Log in")
    with st.form("login_form", clear_on_submit=False):
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_pwd")
        submit = st.form_submit_button("Log in", width="stretch")

    cols = st.columns(2)
    with cols[0]:
        if st.button("Create account", width="stretch"):
            goto_auth("signup")
    with cols[1]:
        if st.button("Forgot password?", width="stretch"):
            goto_auth("forgot")

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


def forgot_password_view():
    inject_theme("Light")
    st.title("🔑 Password reset")
    st.caption("Enter your email. We’ll send you a reset link.")
    if st.button("← Back", width="stretch"):
        goto_auth("login")

    with st.form("forgot_pw_form"):
        email = st.text_input("Email")
        submit = st.form_submit_button("Send reset link", width="stretch")

    if submit:
        if not email.strip():
            st.error("Enter your email.")
            return
        try:
            redirect_to = (st.secrets.get("PASSWORD_RESET_REDIRECT", "") or "").strip() or None
            if redirect_to:
                sb.auth.reset_password_for_email(email.strip(), {"redirect_to": redirect_to})
            else:
                sb.auth.reset_password_for_email(email.strip())
            st.success("Reset link sent ✅ Check your email.")
        except Exception as e:
            st.error(f"Couldn’t send reset email: {e}")


# ----------------------------
# Routing (recovery first)
# ----------------------------
if maybe_accept_pkce_code_session() and (st.query_params.get("auth") == "recovery" or (st.query_params.get("type") or "").lower() == "recovery"):
    recovery_reset_password_screen()
    st.stop()

# Normal visitors: explicit login required, no auto restore
if not get_user():
    if "auth_mode" not in st.session_state:
        st.session_state["auth_mode"] = "landing"

    qp_auth = (st.query_params.get("auth") or "").lower()
    if qp_auth in {"landing", "login", "signup", "forgot"}:
        st.session_state["auth_mode"] = qp_auth

    mode = st.session_state.get("auth_mode", "landing")
    if mode == "signup":
        signup_view()
    elif mode == "login":
        login_view()
    elif mode == "forgot":
        forgot_password_view()
    else:
        landing_screen()
    st.stop()

# =========================================================
# APP (db + UI)
# =========================================================
user = get_user()
user_id = getattr(user, "id", None)
if not user_id:
    st.error("Session issue. Please log in again.")
    try:
        sb.auth.sign_out()
    except Exception:
        pass
    clear_user()
    goto_auth("login")
    st.stop()

md = getattr(user, "user_metadata", {}) or {}
theme = (md.get("theme") if isinstance(md, dict) else "Light") or "Light"
inject_theme(theme)

today = date.today()
current_month = month_key(today)

if "selected_month" not in st.session_state:
    st.session_state.selected_month = current_month
selected_month = st.session_state.selected_month


def ensure_month_row(user_id: str, month: str) -> dict:
    res = sb_exec(lambda: sb.table("months").select("*").eq("user_id", user_id).eq("month", month).execute())
    if res.data:
        return res.data[0]
    insert = {
        "user_id": user_id,
        "month": month,
        "currency": "USD",
        "budget": 0,
        "liabilities": 0,
    }
    ins = sb_exec(lambda: sb.table("months").insert(insert).execute())
    return ins.data[0] if ins.data else insert


def update_month(user_id: str, month: str, patch: dict):
    patch = dict(patch)
    patch["updated_at"] = datetime.utcnow().isoformat()
    return sb_exec(lambda: sb.table("months").update(patch).eq("user_id", user_id).eq("month", month).execute())


def monthly_history(user_id: str) -> list[dict]:
    res = sb_exec(
        lambda: sb.table("months")
        .select("month,currency,budget,liabilities,updated_at")
        .eq("user_id", user_id)
        .order("month", desc=True)
        .execute()
    )
    return res.data or []


def fetch_expenses(user_id: str, month: str) -> list[dict]:
    res = sb_exec(
        lambda: sb.table("expenses")
        .select("id,occurred_at,amount,category,description")
        .eq("user_id", user_id)
        .eq("month", month)
        .order("occurred_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = res.data or []
    out = []
    for r in rows:
        out.append(
            {
                "id": r.get("id"),
                "occurred_at": r.get("occurred_at"),
                "amount": float(r.get("amount") or 0.0),
                "category": r.get("category") or "Other",
                "description": r.get("description") or "",
            }
        )
    return out


def add_expense(user_id: str, month: str, amount: float, category: str, desc: Optional[str]):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "category": category,
        "description": (desc or "").strip() or None,
        "occurred_at": datetime.utcnow().isoformat(),
    }
    return sb_exec(lambda: sb.table("expenses").insert(row).execute())


def delete_expense_row(expense_id: str):
    return sb_exec(lambda: sb.table("expenses").delete().eq("id", expense_id).execute())


def fetch_asset_events(user_id: str, month: str) -> list[dict]:
    res = sb_exec(
        lambda: sb.table("asset_events")
        .select("id,created_at,amount,note")
        .eq("user_id", user_id)
        .eq("month", month)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = res.data or []
    out = []
    for r in rows:
        out.append(
            {
                "id": r.get("id"),
                "created_at": r.get("created_at"),
                "amount": float(r.get("amount") or 0.0),
                "note": r.get("note") or "",
            }
        )
    return out


def add_asset_event(user_id: str, month: str, amount: float, note: Optional[str]):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "note": (note or "").strip() or None,
        "created_at": datetime.utcnow().isoformat(),
    }
    return sb_exec(lambda: sb.table("asset_events").insert(row).execute())


def delete_asset_event(asset_event_id: str):
    return sb_exec(lambda: sb.table("asset_events").delete().eq("id", asset_event_id).execute())


def sum_spent(expenses: list[dict]) -> float:
    return float(sum(float(e.get("amount") or 0.0) for e in expenses))


month_row = ensure_month_row(user_id, selected_month)
currency = month_row.get("currency") or "USD"

expenses = fetch_expenses(user_id, selected_month)
asset_events = fetch_asset_events(user_id, selected_month)

total_spent = sum_spent(expenses)
assets_total = float(sum(float(a.get("amount") or 0.0) for a in asset_events))
liabilities = float(month_row.get("liabilities") or 0.0)
budget_val = float(month_row.get("budget") or 0.0)
remaining = budget_val - total_spent
net_worth = assets_total - liabilities


with st.sidebar:
    name = md.get("name", "") if isinstance(md, dict) else ""
    st.header(f"👤 {name or 'User'}")
    st.caption(getattr(user, "email", ""))

    if st.button("Log out", width="stretch"):
        try:
            sb.auth.sign_out()
        except Exception:
            pass
        clear_user()
        goto_auth("landing")

    st.divider()
    st.header("📊 Monthly Budget")

    b1, b2 = st.columns([0.65, 0.35])
    with b1:
        budget_input = st.number_input("Budget", min_value=0.0, step=10.0, value=float(budget_val), key="budget_in")
    with b2:
        cur_input = st.selectbox(
            "Cur",
            list(CURRENCIES.keys()),
            index=list(CURRENCIES.keys()).index(currency) if currency in CURRENCIES else 0,
            key="cur_in",
        )

    if st.button("Save Budget", width="stretch"):
        update_month(user_id, selected_month, {"budget": float(budget_input), "currency": cur_input})
        st.success("Saved 🔒")
        st.rerun()

    st.divider()
    st.header("💸 Log Expense")
    exp_amt = st.number_input("Amount", min_value=0.0, step=1.0, key="exp_amt")
    exp_cat = st.selectbox("Category", CATEGORIES, key="exp_cat")
    exp_desc = st.text_input("Description (optional)", key="exp_desc")
    if st.button("Log Expense", width="stretch"):
        ok, msg = guard_amount(float(exp_amt))
        if not ok:
            st.error(msg)
        else:
            add_expense(user_id, selected_month, float(exp_amt), exp_cat, exp_desc)
            st.success("Logged ✅")
            st.rerun()

    st.divider()
    st.header("💪 Assets")
    a_amt = st.number_input("Add", min_value=0.0, step=1.0, key="a_amt")
    a_note = st.text_input("Note (optional)", key="a_note")
    if st.button("Stack It", width="stretch"):
        ok, msg = guard_amount(float(a_amt))
        if not ok:
            st.error(msg)
        else:
            add_asset_event(user_id, selected_month, float(a_amt), a_note)
            st.success(f"+{money(a_amt, currency)}")
            st.rerun()


st.title("💰 Spendline")
st.caption("Quiet money control — track what leaves, stack what stays.")

st.markdown("### 📈 Overview")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Budget", money(budget_val, currency))
c2.metric("Spent", money(total_spent, currency))
c3.metric("Remaining", money(remaining, currency))
c4.metric("Net Worth", money(net_worth, currency))

st.markdown("### 📊 Breakdown")
if expenses:
    df = pd.DataFrame(expenses)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["category"] = df["category"].fillna("Other")
    by_cat = df.groupby("category", as_index=False)["amount"].sum().sort_values("amount", ascending=False)

    left, right = st.columns([1.2, 0.8])
    with left:
        pie = px.pie(by_cat, values="amount", names="category", hole=0.55)
        pie.update_layout(margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(pie, use_container_width=True)
    with right:
        bar = px.bar(by_cat.head(8), x="category", y="amount", text_auto=".2s")
        bar.update_layout(xaxis_title="", yaxis_title="", margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(bar, use_container_width=True)
else:
    st.info("Log an expense to see charts.")

tab_recent, tab_history, tab_settings = st.tabs(["Recent", "Monthly History", "Settings"])

with tab_recent:
    st.markdown("### Recent expenses")
    if not expenses:
        st.caption("No expenses yet.")
    else:
        for e in expenses[:15]:
            cols = st.columns([0.16, 0.50, 0.22, 0.12])
            cols[0].caption((e.get("occurred_at") or "")[:10])
            cols[1].write(f"**{e.get('category','Other')}**  \n{e.get('description','')}")
            cols[2].write(money(float(e.get("amount") or 0.0), currency))
            if cols[3].button("🗑️", key=f"del_exp_{e['id']}"):
                delete_expense_row(e["id"])
                st.rerun()

    st.markdown("### Recent assets")
    if not asset_events:
        st.caption("No assets yet.")
    else:
        for a in asset_events[:15]:
            cols = st.columns([0.16, 0.56, 0.20, 0.08])
            cols[0].caption((a.get("created_at") or "")[:10])
            cols[1].write(a.get("note") or "Asset add")
            cols[2].write(money(float(a.get("amount") or 0.0), currency))
            if cols[3].button("🗑️", key=f"del_asset_{a['id']}"):
                delete_asset_event(a["id"])
                st.rerun()

with tab_history:
    st.markdown("### Monthly History")
    rows = monthly_history(user_id)
    if not rows:
        st.caption("No history yet.")
    else:
        months = [r["month"] for r in rows]
        pick = st.selectbox(
            "Select month",
            months,
            index=months.index(selected_month) if selected_month in months else 0,
        )
        if pick != selected_month:
            st.session_state.selected_month = pick
            st.rerun()

        show = []
        for r in rows[:24]:
            show.append({
                "Month": r["month"],
                "Currency": r.get("currency") or "USD",
                "Budget": float(r.get("budget") or 0.0),
                "Liabilities": float(r.get("liabilities") or 0.0),
            })
        st.dataframe(pd.DataFrame(show), use_container_width=True)

with tab_settings:
    st.markdown("### Settings")
    theme_choice = st.selectbox("Theme", ["Light", "Dark"], index=0 if theme != "Dark" else 1)
    if st.button("Save theme", width="stretch"):
        try:
            sb.auth.update_user({"data": {**(md if isinstance(md, dict) else {}), "theme": theme_choice}})
        except Exception:
            pass
        st.success("Theme saved.")
        st.rerun()

    st.divider()
    st.caption(f"{APP_NAME} • {APP_TAGLINE}")