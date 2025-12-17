import io
import time
import zipfile
from datetime import datetime, date
from typing import Any, Callable, Optional

import httpx
import pandas as pd
import plotly.express as px
import streamlit as st
from supabase import create_client

# =========================================================
# Spendline.py
# Run: streamlit run Spendline.py
#
# Phase 2.2:
# ✅ Password reset flow (email + recovery link handling)
# ✅ Optional resend confirmation (graceful if unsupported)
# ✅ NO auto session restore for normal visitors
# =========================================================

APP_NAME = "Spendline"
APP_TAGLINE = "quiet wealth in motion."

CATEGORIES = [
    "Food & Dining", "Transport", "Entertainment", "Shopping",
    "Bills & Utilities", "Health", "Subscriptions", "Other"
]
WANTS = {"Entertainment", "Shopping", "Subscriptions", "Other"}
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

.hero {{
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--card);
  padding: 1.0rem 1.05rem;
}}

@media (max-width: 480px) {{
  .block-container {{ padding-top: .65rem; }}
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
def supabase_client():
    url = st.secrets.get("SUPABASE_URL", "")
    key = st.secrets.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        st.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Streamlit secrets.")
        st.stop()
    return create_client(url, key)


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


def get_user():
    return st.session_state.get("sb_user")


def set_user(user, access_token: Optional[str]):
    st.session_state.sb_user = user
    st.session_state.sb_access_token = access_token
    apply_db_auth(access_token)


def clear_user():
    for k in ("sb_user", "sb_access_token"):
        if k in st.session_state:
            del st.session_state[k]


def goto_auth(mode: str):
    # mode: "landing" | "login" | "signup"
    st.session_state["auth_mode"] = mode
    st.query_params["auth"] = mode
    st.rerun()


# ----------------------------
# Recovery link handling (Password Reset)
# ----------------------------
def maybe_accept_recovery_tokens() -> bool:
    """
    Accept session ONLY when the user arrives from Supabase recovery/signup/invite link
    that contains access_token & refresh_token in the URL.
    This is NOT auto-restore — it's only for the explicit email link flow.
    """
    qp = st.query_params
    link_type = (qp.get("type") or "").lower()
    access_token = qp.get("access_token")
    refresh_token = qp.get("refresh_token")

    if link_type not in {"recovery", "invite", "signup"}:
        return False
    if not access_token or not refresh_token:
        return False

    # Create a temporary session from link tokens
    try:
        # supabase-py v2+ supports set_session
        resp = sb.auth.set_session(access_token, refresh_token)  # type: ignore[attr-defined]
        user = getattr(resp, "user", None)
        session = getattr(resp, "session", None)
        token = getattr(session, "access_token", None) if session else access_token
        if user:
            set_user(user, token)
            return True
        return False
    except Exception:
        # If set_session isn't available, we can't safely complete reset in-app.
        return False


def recovery_reset_password_screen():
    inject_theme("Light")
    st.title(f"🔑 Reset password")
    st.caption("Choose a new password for your Spendline account.")

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
            # Clear session + return to login
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
# DB ops
# ----------------------------
def ensure_month_row(user_id: str, month: str) -> dict:
    res = sb_exec(lambda: sb.table("months").select("*").eq("user_id", user_id).eq("month", month).execute())
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
    ins = sb_exec(lambda: sb.table("months").insert(insert).execute())
    return ins.data[0] if ins.data else insert


def update_month(user_id: str, month: str, patch: dict):
    patch = dict(patch)
    patch["updated_at"] = datetime.utcnow().isoformat()
    return sb_exec(lambda: sb.table("months").update(patch).eq("user_id", user_id).eq("month", month).execute())


def monthly_history(user_id: str) -> list[dict]:
    try:
        res = sb_exec(
            lambda: sb.table("months")
            .select("month,currency,budget,assets,liabilities")
            .eq("user_id", user_id)
            .order("month", desc=True)
            .execute()
        )
        return res.data or []
    except Exception:
        return []


def fetch_expenses(user_id: str, month: str) -> list[dict]:
    try:
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
            try:
                amount = float(r.get("amount") or 0.0)
            except Exception:
                amount = 0.0
            out.append(
                {
                    "id": r.get("id"),
                    "occurred_at": r.get("occurred_at"),
                    "amount": amount,
                    "category": r.get("category") or "Other",
                    "description": r.get("description") or "",
                }
            )
        return out
    except Exception:
        return []


def add_expense(user_id: str, month: str, amount: float, category: str, desc: str | None):
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
        try:
            amount = float(r.get("amount") or 0.0)
        except Exception:
            amount = 0.0
        out.append(
            {
                "id": r.get("id"),
                "created_at": r.get("created_at"),
                "amount": amount,
                "note": r.get("note") or "",
            }
        )
    return out


def add_asset_event(user_id: str, month: str, amount: float, note: str | None):
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
    return float(sum(float(e.get("amount", 0.0) or 0.0) for e in expenses))


def month_spent_total(user_id: str, mk: str) -> float:
    try:
        res = sb_exec(lambda: sb.table("expenses").select("amount").eq("user_id", user_id).eq("month", mk).execute())
        return float(sum(float(r.get("amount") or 0.0) for r in (res.data or [])))
    except Exception:
        return 0.0


def reset_current_month(user_id: str, month: str, keep_budget: bool):
    sb_exec(lambda: sb.table("expenses").delete().eq("user_id", user_id).eq("month", month).execute())
    sb_exec(lambda: sb.table("asset_events").delete().eq("user_id", user_id).eq("month", month).execute())

    patch = {"challenge_start": None, "challenge_length": None, "assets": 0, "liabilities": 0}
    if not keep_budget:
        patch["budget"] = 0
    sb_exec(lambda: sb.table("months").update(patch).eq("user_id", user_id).eq("month", month).execute())


def delete_all_my_data():
    return sb_exec(lambda: sb.rpc("delete_user_data", {}).execute())


def submit_feedback(user_id: str, message: str):
    row = {"user_id": user_id, "message": message.strip()}
    return sb_exec(lambda: sb.table("feedback").insert(row).execute())


def build_export_zip(user_id: str) -> tuple[bytes, list[str]]:
    months_rows = sb_exec(
        lambda: sb.table("months").select("*").eq("user_id", user_id).order("month", desc=False).execute()
    ).data or []
    expenses_rows = sb_exec(
        lambda: sb.table("expenses").select("*").eq("user_id", user_id).order("occurred_at", desc=False).execute()
    ).data or []

    included = []
    asset_rows = []
    asset_ok = True
    try:
        asset_rows = sb_exec(
            lambda: sb.table("asset_events").select("*").eq("user_id", user_id).order("created_at", desc=False).execute()
        ).data or []
    except Exception:
        asset_ok = False

    def to_csv_bytes(rows: list[dict]) -> bytes:
        return pd.DataFrame(rows).to_csv(index=False).encode("utf-8")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("months.csv", to_csv_bytes(months_rows)); included.append("months.csv")
        z.writestr("expenses.csv", to_csv_bytes(expenses_rows)); included.append("expenses.csv")
        if asset_ok:
            z.writestr("asset_events.csv", to_csv_bytes(asset_rows)); included.append("asset_events.csv")
        meta = f"exported_at_utc,{datetime.utcnow().isoformat()}\nuser_id,{user_id}\n"
        z.writestr("export_meta.csv", meta.encode("utf-8")); included.append("export_meta.csv")

    return buf.getvalue(), included


def call_delete_account_edge() -> httpx.Response:
    base = (st.secrets.get("SUPABASE_URL", "") or "").rstrip("/")
    if not base:
        raise RuntimeError("Missing SUPABASE_URL")
    token = st.session_state.get("sb_access_token")
    if not token:
        raise RuntimeError("Missing access token")
    url = f"{base}/functions/v1/delete-account"
    return httpx.post(url, headers={"Authorization": f"Bearer {token}"}, timeout=20.0)


# =========================================================
# Landing + Auth
# =========================================================
def landing_screen():
    inject_theme("Light")
    st.title(f"💰 {APP_NAME}")
    st.markdown(
        f"""
<div class="hero">
  <h3 style="margin-top:0; margin-bottom:.25rem; color: var(--text);">
    Spend less on liabilities. Stack more on assets.
  </h3>
  <p style="margin-top:0;">
    A simple budget tracker built for people who want clarity — not complexity.
  </p>
  <ul style="margin-top:.35rem; color: var(--muted);">
    <li>Set a monthly budget</li>
    <li>Log expenses in seconds</li>
    <li>Track assets to build net worth</li>
  </ul>
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

    st.markdown("")
    st.caption("No demo mode. You’ll always need an account to access Spendline.")


def signup_view():
    inject_theme("Light")
    st.title(f"💰 {APP_NAME}")
    st.caption("Create an account to start tracking your money.")
    if st.button("← Back", width="stretch", key="back_from_signup"):
        goto_auth("landing")

    st.subheader("Sign up")
    with st.form("signup_form", clear_on_submit=False):
        name = st.text_input("Full name")
        email = st.text_input("Email")
        country = st.text_input("Country (optional)")
        password = st.text_input("Password", type="password")
        password2 = st.text_input("Confirm password", type="password")
        submit = st.form_submit_button("Create account", width="stretch")

    st.caption("Already have an account?")
    if st.button("Go to Log in", width="stretch", key="goto_login_from_signup"):
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
    if st.button("← Back", width="stretch", key="back_from_login"):
        goto_auth("landing")

    st.subheader("Log in")
    with st.form("login_form", clear_on_submit=False):
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_pwd")
        submit = st.form_submit_button("Log in", width="stretch")

    cols = st.columns(2)
    with cols[0]:
        if st.button("Create account", width="stretch", key="goto_signup_from_login"):
            goto_auth("signup")
    with cols[1]:
        if st.button("Forgot password?", width="stretch", key="forgot_pw_btn"):
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

            # Optional: resend confirmation if they haven't confirmed email yet.
            with st.expander("Having trouble?"):
                st.write("If you signed up recently, you may need to confirm your email.")
                if st.button("Resend confirmation email", width="stretch", key="resend_confirm"):
                    try:
                        # Some supabase-py versions expose resend()
                        sb.auth.resend({"type": "signup", "email": email.strip()})  # type: ignore[attr-defined]
                        st.success("Confirmation email resent. Check your inbox.")
                    except Exception:
                        st.info("Resend not available in this client version. You can also try signing up again with the same email.")


def forgot_password_view():
    inject_theme("Light")
    st.title(f"🔑 Password reset")
    st.caption("Enter your email. We’ll send you a reset link.")
    if st.button("← Back", width="stretch", key="back_from_forgot"):
        goto_auth("login")

    with st.form("forgot_pw_form"):
        email = st.text_input("Email")
        submit = st.form_submit_button("Send reset link", width="stretch")

    if submit:
        if not email.strip():
            st.error("Enter your email.")
            return
        try:
            redirect_to = st.secrets.get("PASSWORD_RESET_REDIRECT", "").strip() or None
            # If you set PASSWORD_RESET_REDIRECT in secrets, use it; otherwise Supabase uses site URL.
            if redirect_to:
                sb.auth.reset_password_for_email(email.strip(), {"redirect_to": redirect_to})
            else:
                sb.auth.reset_password_for_email(email.strip())
            st.success("Reset link sent ✅ Check your email.")
            st.caption("After you set a new password, come back and log in.")
        except Exception as e:
            st.error(f"Couldn’t send reset email: {e}")


# =========================================================
# ROUTING (no auto-restore; only recovery link is accepted)
# =========================================================
if "auth_mode" not in st.session_state:
    st.session_state["auth_mode"] = "landing"

# If arriving from Supabase recovery link, accept tokens and show reset screen.
accepted = maybe_accept_recovery_tokens()
if (st.query_params.get("type") or "").lower() == "recovery" and accepted:
    recovery_reset_password_screen()
    st.stop()

# Normal visitors: landing/auth, no auto restore.
if not get_user():
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
# APP
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

month_row = ensure_month_row(user_id, selected_month)
currency = month_row.get("currency", "USD") or "USD"

expenses = fetch_expenses(user_id, selected_month)

asset_events_error = False
asset_events: list[dict] = []
try:
    asset_events = fetch_asset_events(user_id, selected_month)
except Exception:
    asset_events_error = True
    asset_events = []


# Sidebar
with st.sidebar:
    name = md.get("name", "") if isinstance(md, dict) else ""
    st.header(f"👤 {name or 'User'}")
    st.caption(getattr(user, "email", ""))

    if st.button("Log out", width="stretch", key="logout_sidebar"):
        try:
            sb.auth.sign_out()
        except Exception:
            pass
        clear_user()
        goto_auth("landing")

    st.divider()

    st.header("📊 Monthly Budget")
    bcol1, bcol2 = st.columns([0.65, 0.35])
    with bcol1:
        budget_input_s = st.number_input(
            "Budget",
            min_value=0.0,
            step=10.0,
            value=float(month_row.get("budget", 0.0) or 0.0),
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
        ok, msg = guard_amount(float(budget_input_s)) if float(budget_input_s) > 0 else (True, "")
        if not ok:
            st.error(msg)
        else:
            try:
                update_month(user_id, selected_month, {"budget": float(budget_input_s), "currency": currency_input_s})
                st.success("Saved 🔒")
                st.rerun()
            except Exception:
                st.error("Couldn’t save that right now. Try again.")

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
                st.error("Couldn’t log that expense. Try again.")

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
                st.error("Assets add/remove needs the `asset_events` table in Supabase.")
            else:
                try:
                    add_asset_event(user_id, selected_month, float(asset_add_s), asset_note_s)
                    st.success(f"+{money(asset_add_s, currency)}")
                    st.rerun()
                except Exception:
                    st.error("Couldn’t add that asset. Try again.")


# Main
st.title("💰 Spendline")
st.caption("Quiet money control — track what leaves, stack what stays.")

has_budget = float(month_row.get("budget", 0.0) or 0.0) > 0
has_expense = len(expenses) > 0
if not (has_budget and has_expense):
    st.markdown(
        "<div class='small-hint'><strong>Quick flow:</strong> set budget → log an expense → stack assets.</div>",
        unsafe_allow_html=True,
    )

st.write(f"**Month:** {selected_month}")

budget_val = float(month_row.get("budget", 0.0) or 0.0)
no_expenses = len(expenses) == 0

if budget_val <= 0:
    tab_order = ["📊 Budget", "💸 Expense", "💪 Assets"]
elif no_expenses:
    tab_order = ["💸 Expense", "📊 Budget", "💪 Assets"]
else:
    tab_order = ["💸 Expense", "📊 Budget", "💪 Assets"]

st.markdown("### This month")
t1, t2, t3 = st.tabs(tab_order)
tabs = {tab_order[0]: t1, tab_order[1]: t2, tab_order[2]: t3}

with tabs["📊 Budget"]:
    q1c1, q1c2 = st.columns([0.7, 0.3])
    with q1c1:
        budget_input_m = st.number_input(
            "Monthly budget",
            min_value=0.0,
            step=10.0,
            value=float(month_row.get("budget", 0.0) or 0.0),
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
        ok, msg = guard_amount(float(budget_input_m)) if float(budget_input_m) > 0 else (True, "")
        if not ok:
            st.error(msg)
        else:
            update_month(user_id, selected_month, {"budget": float(budget_input_m), "currency": currency_input_m})
            st.success("Budget saved 🔒")
            st.rerun()

with tabs["💸 Expense"]:
    exp_amount_m = st.number_input("Amount", min_value=0.0, step=1.0, key="exp_amt_main")
    exp_category_m = st.selectbox("Category", CATEGORIES, key="exp_cat_main")
    exp_desc_m = st.text_input("Description (optional)", key="exp_desc_main")
    if st.button("Log Expense", width="stretch", key="log_exp_main"):
        ok, msg = guard_amount(float(exp_amount_m))
        if not ok:
            st.error(msg)
        else:
            add_expense(user_id, selected_month, float(exp_amount_m), exp_category_m, exp_desc_m)
            st.success("Expense logged ✅")
            st.rerun()

with tabs["💪 Assets"]:
    asset_add_m = st.number_input("Add to assets", min_value=0.0, step=1.0, key="asset_add_main")
    asset_note_m = st.text_input("Note (optional)", key="asset_note_main")
    if st.button("Stack It", width="stretch", key="stack_main"):
        ok, msg = guard_amount(float(asset_add_m))
        if not ok:
            st.error(msg)
        else:
            if asset_events_error:
                st.error("Assets add/remove needs the `asset_events` table in Supabase.")
            else:
                add_asset_event(user_id, selected_month, float(asset_add_m), asset_note_m)
                st.success(f"Added {money(asset_add_m, currency)} ✅")
                st.rerun()

total_spent = sum_spent(expenses)
assets_total = float(sum(float(a.get("amount", 0.0) or 0.0) for a in asset_events)) if not asset_events_error else float(month_row.get("assets", 0.0) or 0.0)
remaining = float(month_row.get("budget", 0.0) or 0.0) - total_spent
liabilities = float(month_row.get("liabilities", 0.0) or 0.0)
net_worth = assets_total - liabilities

st.markdown("### 📈 Overview")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Budget", money(float(month_row.get("budget", 0.0) or 0.0), currency))
c2.metric("Spent", money(float(total_spent), currency))
c3.metric("Remaining", money(float(remaining), currency))
c4.metric("Net Worth", money(float(net_worth), currency))

st.markdown("### 📊 Breakdown")
if expenses:
    df = pd.DataFrame(expenses)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["category"] = df["category"].fillna("Other")
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
else:
    st.info("Log an expense to see charts.")

st.caption(f"{APP_NAME} • {APP_TAGLINE}")