# Spendline.py  (v3 Phase 1 - Step 2: clean auth shell)
import time
from typing import Any, Optional

import streamlit as st
from supabase_auth import SyncGoTrueClient

APP_NAME = "Spendline"

st.set_page_config(page_title=APP_NAME, layout="centered", initial_sidebar_state="expanded")


# ----------------------------
# Config
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


# ----------------------------
# Session
# ----------------------------
def get_user() -> Any:
    return st.session_state.get("sb_user")


def get_token() -> Optional[str]:
    return st.session_state.get("sb_access_token")


def set_session(user: Any, token: str):
    st.session_state["sb_user"] = user
    st.session_state["sb_access_token"] = token


def clear_session():
    st.session_state.pop("sb_user", None)
    st.session_state.pop("sb_access_token", None)


def goto(mode: str):
    st.session_state["mode"] = mode
    st.query_params["auth"] = mode
    st.rerun()


# ----------------------------
# UI Screens
# ----------------------------
def landing():
    st.title("💰 Spendline")
    st.caption("Clean rebuild (v3). Phase 1: Auth shell.")
    c1, c2 = st.columns(2)
    c1.button("Log in", use_container_width=True, on_click=goto, args=("login",))
    c2.button("Sign up", use_container_width=True, on_click=goto, args=("signup",))


def signup():
    st.title("Create account")
    if st.button("← Back", use_container_width=True):
        goto("landing")

    with st.form("signup"):
        name = st.text_input("Full name")
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        password2 = st.text_input("Confirm password", type="password")
        submit = st.form_submit_button("Create account", use_container_width=True)

    if st.button("Already have an account? Log in", use_container_width=True):
        goto("login")

    if not submit:
        return

    if not name.strip():
        st.error("Enter your name.")
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
                "data": {"name": name.strip()},
            }
        )
    except Exception as e:
        st.error(f"Signup failed: {e}")
        return

    # Some projects require email confirmation; session may be None.
    user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
    session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)

    if not session:
        st.success("Account created ✅ Check your email to confirm, then log in.")
        goto("login")
        return

    token = getattr(session, "access_token", None) or (session.get("access_token") if isinstance(session, dict) else None)
    if user and token:
        set_session(user, token)
        st.success("Logged in ✅")
        st.rerun()

    st.success("Account created ✅ Please log in.")
    goto("login")


def login():
    st.title("Log in")
    if st.button("← Back", use_container_width=True):
        goto("landing")

    with st.form("login"):
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_pwd")
        submit = st.form_submit_button("Log in", use_container_width=True)

    c1, c2 = st.columns(2)
    c1.button("Create account", use_container_width=True, on_click=goto, args=("signup",))
    c2.button("Forgot password?", use_container_width=True, on_click=goto, args=("forgot",))

    if not submit:
        return

    try:
        resp = auth.sign_in_with_password({"email": email.strip(), "password": password})
        user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)
        token = None
        if session:
            token = getattr(session, "access_token", None) or (session.get("access_token") if isinstance(session, dict) else None)

        if not user or not token:
            st.error("Login failed. Check your email/password.")
            return

        set_session(user, token)
        st.success("Logged in ✅")
        st.rerun()

    except Exception as e:
        st.error(f"Login failed: {e}")


def forgot():
    st.title("Password reset")
    st.caption("We’ll email you a reset link.")
    if st.button("← Back", use_container_width=True):
        goto("login")

    with st.form("forgot"):
        email = st.text_input("Email")
        submit = st.form_submit_button("Send reset link", use_container_width=True)

    if not submit:
        return

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


def app_home():
    user = get_user()
    st.title("✅ Logged in")
    st.write("User:", user)
    if st.button("Log out", use_container_width=True):
        clear_session()
        goto("landing")


# ----------------------------
# Router
# ----------------------------
# If logged in, show app placeholder
if get_token():
    app_home()
    st.stop()

# Otherwise route auth screens
qp_auth = (st.query_params.get("auth") or "").lower()
if "mode" not in st.session_state:
    st.session_state["mode"] = "landing"
if qp_auth in {"landing", "login", "signup", "forgot"}:
    st.session_state["mode"] = qp_auth

mode = st.session_state.get("mode", "landing")
if mode == "signup":
    signup()
elif mode == "login":
    login()
elif mode == "forgot":
    forgot()
else:
    landing()