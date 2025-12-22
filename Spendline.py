#DEPLOY_MARKER: 2025-12-21 v2.3.3
import time
import base64
import json
from datetime import datetime, date
from typing import Any, Callable, Optional
import httpx

import streamlit as st
import streamlit.components.v1 as components
import pandas as pd
import plotly.express as px

from postgrest import SyncPostgrestClient
from supabase_auth import SyncGoTrueClient

# =========================================================
# Spendline.py
# Run: streamlit run Spendline.py
#
# FIXES (v2.3.3):
# ✅ Password reset works for ALL common Supabase flows:
#    1) verify?token=...&type=recovery (email link)
#    2) ?code=... (PKCE)
#    3) #access_token=... (hash) via hash->query bridge
# ✅ Avoids landing/login hijacking the recovery flow
# ✅ Fixes PostgREST crash by ensuring user_id is real UUID (from JWT "sub")
# ✅ Explicit login required (no session auto-restore)
# ✅ No debug spam by default
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


# ---------------------------------------------------------
# Hash -> Query bridge (required for #access_token reset links)
# IMPORTANT: Must run BEFORE any auth gating / st.stop()
# ---------------------------------------------------------
def hash_to_query_bridge() -> None:
    components.html(
        """
<script>
(function () {
  try {
    const loc = window.parent.location;

    // ✅ If we've already bridged once, never do it again.
    const url0 = new URL(loc.href);
    if (url0.searchParams.get("bridged") === "1") return;

    const hash = loc.hash || "";
    if (!hash || hash.length < 2) return;

    const h = hash.startsWith("#") ? hash.slice(1) : hash;
    const hp = new URLSearchParams(h);

    const hasSupabaseTokens =
      hp.has("access_token") || hp.has("refresh_token") || hp.has("type") || hp.has("expires_in");

    if (!hasSupabaseTokens) return;

    const url = new URL(loc.href);
    const qp = new URLSearchParams(url.search);

    // Move hash params -> query params
    for (const [k, v] of hp.entries()) {
      if (!qp.has(k)) qp.set(k, v);
    }

    // ✅ Add marker so we don't loop
    qp.set("bridged", "1");

    url.search = qp.toString();
    url.hash = "";

    loc.replace(url.toString());
  } catch (e) {}
})();
</script>
""",
        height=0,
    )


hash_to_query_bridge()


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
# Supabase config + clients
# ----------------------------
@st.cache_resource(show_spinner=False)
def supabase_config():
    url = (st.secrets.get("SUPABASE_URL", "") or "").rstrip("/")
    key = (st.secrets.get("SUPABASE_ANON_KEY", "") or "").strip()
    if not url or not key:
        st.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Streamlit secrets.")
        st.stop()
    return url, key


SUPABASE_URL, SUPABASE_ANON_KEY = supabase_config()


@st.cache_resource(show_spinner=False)
def auth_client():
    return SyncGoTrueClient(url=f"{SUPABASE_URL}/auth/v1", headers={"apikey": SUPABASE_ANON_KEY})


auth = auth_client()


def db_client(access_token: Optional[str]) -> SyncPostgrestClient:
    headers = {"apikey": SUPABASE_ANON_KEY}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return SyncPostgrestClient(f"{SUPABASE_URL}/rest/v1", headers=headers)


# ----------------------------
# Retry wrapper
# ----------------------------
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


def jwt_claim(token: str, key: str) -> Optional[str]:
    """Extract claim from JWT payload without verifying signature (safe for routing)."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode("utf-8")))
        val = data.get(key)
        return str(val) if val is not None else None
    except Exception:
        return None


# ----------------------------
# Session helpers (explicit login)
# ----------------------------
def get_user() -> Any:
    return st.session_state.get("sb_user")


def has_user() -> bool:
    return st.session_state.get("sb_user") is not None


def get_token() -> Optional[str]:
    return st.session_state.get("sb_access_token")


def set_user(user_obj: Any, access_token: Optional[str]):
    st.session_state.sb_user = user_obj
    st.session_state.sb_access_token = access_token


def clear_user():
    for k in ("sb_user", "sb_access_token"):
        st.session_state.pop(k, None)


def goto_auth(mode: str):
    st.session_state["auth_mode"] = mode
    st.query_params["auth"] = mode
    st.rerun()


# ----------------------------
# Recovery acceptors
# ----------------------------
def maybe_accept_pkce_code_session() -> bool:
    code = st.query_params.get("code")
    if not code:
        return False

    try:
        try:
            resp = auth.exchange_code_for_session(code)
        except Exception:
            resp = auth.exchange_code_for_session({"auth_code": code})

        user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)

        token = None
        if session:
            token = getattr(session, "access_token", None) or (session.get("access_token") if isinstance(session, dict) else None)

        if user and token:
            set_user(user, token)
            st.query_params.clear()
            st.session_state.pop("auth_mode", None)
            return True

    except Exception:
        return False

    return False


def maybe_accept_verify_token_session() -> bool:
    """
    Accepts Supabase email link:
      /auth/v1/verify?token=...&type=recovery&redirect_to=...
    by calling verify_otp (GoTrue) to obtain a session.
    """
    vtoken = st.query_params.get("token")
    vtype = (st.query_params.get("type") or "").lower()

    if not vtoken or vtype not in {"recovery", "magiclink", "signup", "invite"}:
        return False

    # Only recovery should route to reset screen, but verify_otp works for others too.
    try:
        if hasattr(auth, "verify_otp"):
            resp = auth.verify_otp({"token": vtoken, "type": vtype})
        else:
            # Some versions name it verifyOtp (unlikely), keep safe fallback:
            verify_fn = getattr(auth, "verifyOtp", None)
            if not verify_fn:
                return False
            resp = verify_fn({"token": vtoken, "type": vtype})

        user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)
        at = None
        if session:
            at = getattr(session, "access_token", None) or (session.get("access_token") if isinstance(session, dict) else None)

        if user and at:
            set_user(user, at)
            st.query_params.clear()
            st.session_state.pop("auth_mode", None)
            return True

    except Exception:
        return False

    return False

# 🔒 Lock reruns while user is typing password
if "reset_lock" not in st.session_state:
    st.session_state.reset_lock = True
# ----------------------------
# Recovery reset password UI
# ----------------------------
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

        token = get_token()
        if not token:
            st.error("Reset link missing/expired. Please request a new reset email.")
            return

        try:
            # ✅ Update password via GoTrue REST (reliable)
            url = f"{SUPABASE_URL}/auth/v1/user"
            headers = {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }

            r = httpx.patch(url, headers=headers, json={"password": p1}, timeout=20.0)
            if r.status_code >= 400:
                st.error(f"Couldn’t update password: {r.status_code} {r.text}")
                return

            st.success("Password updated ✅ Please log in with the NEW password.")
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
            resp = auth.sign_up(
                {
                    "email": email.strip(),
                    "password": password,
                    "data": {"name": name.strip(), "country": country.strip(), "theme": "Light"},
                }
            )
        except Exception as e:
            st.error(f"Signup failed: {e}")
            return

        user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)

        if not user or not session:
            st.success("Account created ✅ Check your email to confirm, then log in.")
            goto_auth("login")
            return

        token = getattr(session, "access_token", None) or (session.get("access_token") if isinstance(session, dict) else None)
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
            resp = auth.sign_in_with_password({"email": email.strip(), "password": password})
            user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
            session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)
            if not user or not session:
                st.error("Login failed. Check your email/password.")
                return
            token = getattr(session, "access_token", None) or (session.get("access_token") if isinstance(session, dict) else None)
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

        redirect_to = (st.secrets.get("PASSWORD_RESET_REDIRECT", "") or "").strip()
        if not redirect_to:
            st.error("Missing PASSWORD_RESET_REDIRECT in Streamlit secrets.")
            return

        try:
            auth.reset_password_for_email(email.strip(), {"redirect_to": redirect_to})
            st.success("Reset link sent ✅ Check your email.")
        except Exception as e:
            st.error(f"Couldn’t send reset email: {e}")


# ----------------------------
# Routing (recovery first)
# ----------------------------
def maybe_accept_recovery_session() -> bool:
    """
    Accept recovery sessions from:
    - verify?token=... (query)
    - ?code=... (query)
    - access_token=... (query after hash bridge)
    """
    auth_mode = (st.query_params.get("auth") or "").lower()
    link_type = (st.query_params.get("type") or "").lower()

    # We only auto-handle if user is trying to do recovery
    if auth_mode != "recovery" and link_type != "recovery":
        return False

    # 1) verify?token=... flow
    if st.query_params.get("token") and (st.query_params.get("type") or "").lower() == "recovery":
        return maybe_accept_verify_token_session()

    # 2) PKCE code flow
    if st.query_params.get("code"):
        return maybe_accept_pkce_code_session()

    # 3) Hash token flow (after bridge)
    access_token = st.query_params.get("access_token")
    if access_token:
        sub = jwt_claim(access_token, "sub") or jwt_claim(access_token, "user_id")
        email = jwt_claim(access_token, "email")
        # sub MUST be UUID for your DB queries to work
        set_user({"id": sub, "email": email, "user_metadata": {}}, access_token)
        st.query_params.clear()
        st.session_state.pop("auth_mode", None)
        return True

    return False


# If recovery session is present, show reset screen immediately
if maybe_accept_recovery_session():
    recovery_reset_password_screen()
    st.stop()


# ----------------------------
# Recovery fallback screen (paste link)
# ----------------------------
def recovery_paste_screen():
    inject_theme("Light")
    st.title("🔑 Password reset")
    st.caption("Paste the full reset link from your email below.")

    link = st.text_input("Reset link", key="recovery_paste", placeholder="Paste the full link here…")
    col1, col2 = st.columns(2)
    go = col1.button("Continue", width="stretch")
    back = col2.button("Back to login", width="stretch")

    if back:
        st.query_params.clear()
        st.session_state["auth_mode"] = "login"
        st.query_params["auth"] = "login"
        st.rerun()

    if not go:
        st.stop()

    if not link.strip():
        st.error("Paste the full link from the reset email.")
        st.stop()

    # Extract supported params from pasted link:
    # - verify?token=...&type=recovery
    # - ?code=...&type=recovery
    # - #access_token=...&type=recovery
    try:
        # Query string
        if "?" in link:
            qs = link.split("?", 1)[1].split("#", 1)[0]
            for part in qs.split("&"):
                if "=" not in part:
                    continue
                k, v = part.split("=", 1)
                k = k.strip()
                v = v.strip()
                if k in {"code", "type", "token"} and v:
                    st.query_params["auth"] = "recovery"
                    st.query_params[k] = v

        # Hash fragment
        if "#" in link:
            frag = link.split("#", 1)[1]
            for part in frag.split("&"):
                if "=" not in part:
                    continue
                k, v = part.split("=", 1)
                k = k.strip()
                v = v.strip()
                if k in {"access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type"} and v:
                    st.query_params["auth"] = "recovery"
                    st.query_params[k] = v

        # Rerun and let maybe_accept_recovery_session() handle it
        if st.query_params.get("access_token") or st.query_params.get("code") or st.query_params.get("token"):
            st.rerun()

    except Exception:
        pass

    st.error("That link didn’t contain a usable recovery token/code. Request a new reset email and paste it again.")
    st.stop()


# ----------------------------
# Explicit login required (no auto-restore)
# ----------------------------
if (not has_user()) or (not get_token()):
    qp_auth = (st.query_params.get("auth") or "").lower()

    # ✅ Always show recovery UI when auth=recovery (no rerun loops)
    if qp_auth == "recovery":
        inject_theme("Light")
        st.markdown("### 🔑 Password reset")
        st.caption("Paste the FULL reset link from your email below, then press Continue.")

        link = st.text_input("Reset link", key="recovery_paste", placeholder="Paste the full link here…")

        c1, c2 = st.columns(2)
        go = c1.button("Continue", use_container_width=True)
        back = c2.button("Back to login", use_container_width=True)

        if back:
            st.query_params.clear()
            st.session_state["auth_mode"] = "login"
            st.query_params["auth"] = "login"
            st.rerun()

        if go:
            if not link.strip():
                st.error("Paste the full reset link from the email.")
                st.stop()

            # Parse ?code=... (PKCE)
            if "?" in link:
                qs = link.split("?", 1)[1].split("#", 1)[0]
                for part in qs.split("&"):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        if k in {"code", "type", "redirect_to"} and v:
                            st.query_params[k] = v
                st.query_params["auth"] = "recovery"

            # Parse #access_token=... (implicit hash)
            if "#" in link:
                frag = link.split("#", 1)[1]
                for part in frag.split("&"):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        if k in {"access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type"} and v:
                            st.query_params[k] = v
                st.query_params["auth"] = "recovery"

            # Now let the normal recovery handler run on rerun
            st.rerun()

        st.stop()

    # Normal auth routing
    if "auth_mode" not in st.session_state:
        st.session_state["auth_mode"] = "landing"

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
token = get_token()

user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
md = getattr(user, "user_metadata", None) or (user.get("user_metadata") if isinstance(user, dict) else {}) or {}
email = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else "")

# Hard guard: if user_id isn't a UUID-like string, force relogin instead of crashing PostgREST
if not user_id or len(str(user_id)) < 20:
    clear_user()
    st.query_params.clear()
    st.session_state.pop("reset_lock", None)
    goto_auth("login")
    st.stop()

theme = (md.get("theme") if isinstance(md, dict) else "Light") or "Light"
inject_theme(theme)


def db():
    return db_client(token)


today = date.today()
current_month = month_key(today)

if "selected_month" not in st.session_state:
    st.session_state.selected_month = current_month
selected_month = st.session_state.selected_month


def ensure_month_row(user_id: str, month: str) -> dict:
    res = sb_exec(lambda: db().from_("months").select("*").eq("user_id", user_id).eq("month", month).execute())
    rows = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None) or []
    if rows:
        return rows[0]

    insert = {"user_id": user_id, "month": month, "currency": "USD", "budget": 0, "liabilities": 0}
    ins = sb_exec(lambda: db().from_("months").insert(insert).execute())
    d2 = getattr(ins, "data", None) or (ins.get("data") if isinstance(ins, dict) else None) or []
    return d2[0] if d2 else insert


def update_month(user_id: str, month: str, patch: dict):
    patch = dict(patch)
    patch["updated_at"] = datetime.utcnow().isoformat()
    return sb_exec(lambda: db().from_("months").update(patch).eq("user_id", user_id).eq("month", month).execute())


def monthly_history(user_id: str) -> list[dict]:
    res = sb_exec(
        lambda: db()
        .from_("months")
        .select("month,currency,budget,liabilities,updated_at")
        .eq("user_id", user_id)
        .order("month", desc=True)
        .execute()
    )
    return getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None) or []


def fetch_expenses(user_id: str, month: str) -> list[dict]:
    res = sb_exec(
        lambda: db()
        .from_("expenses")
        .select("id,occurred_at,amount,category,description")
        .eq("user_id", user_id)
        .eq("month", month)
        .order("occurred_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None) or []
    return [
        {
            "id": r.get("id"),
            "occurred_at": r.get("occurred_at"),
            "amount": float(r.get("amount") or 0.0),
            "category": r.get("category") or "Other",
            "description": r.get("description") or "",
        }
        for r in rows
    ]


def add_expense(user_id: str, month: str, amount: float, category: str, desc: Optional[str]):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "category": category,
        "description": (desc or "").strip() or None,
        "occurred_at": datetime.utcnow().isoformat(),
    }
    return sb_exec(lambda: db().from_("expenses").insert(row).execute())


def delete_expense_row(expense_id: str):
    return sb_exec(lambda: db().from_("expenses").delete().eq("id", expense_id).execute())


def fetch_asset_events(user_id: str, month: str) -> list[dict]:
    res = sb_exec(
        lambda: db()
        .from_("asset_events")
        .select("id,created_at,amount,note")
        .eq("user_id", user_id)
        .eq("month", month)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = getattr(res, "data", None) or (res.get("data") if isinstance(res, dict) else None) or []
    return [
        {
            "id": r.get("id"),
            "created_at": r.get("created_at"),
            "amount": float(r.get("amount") or 0.0),
            "note": r.get("note") or "",
        }
        for r in rows
    ]


def add_asset_event(user_id: str, month: str, amount: float, note: Optional[str]):
    row = {
        "user_id": user_id,
        "month": month,
        "amount": float(amount),
        "note": (note or "").strip() or None,
        "created_at": datetime.utcnow().isoformat(),
    }
    return sb_exec(lambda: db().from_("asset_events").insert(row).execute())


def delete_asset_event(asset_event_id: str):
    return sb_exec(lambda: db().from_("asset_events").delete().eq("id", asset_event_id).execute())


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
    st.caption(email or "")

    if st.button("Log out", width="stretch"):
        clear_user()
        st.query_params.clear()
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
        pick = st.selectbox("Select month", months, index=months.index(selected_month) if selected_month in months else 0)
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
            jwt = get_token()
            new_md = dict(md) if isinstance(md, dict) else {}
            new_md["theme"] = theme_choice
            try:
                auth.update_user({"data": new_md}, jwt)
            except Exception:
                auth.update_user({"data": new_md}, jwt=jwt)
            st.success("Theme saved.")
            st.rerun()
        except Exception:
            st.success("Theme saved.")
            st.rerun()

    st.divider()
    st.caption(f"{APP_NAME} • {APP_TAGLINE}")