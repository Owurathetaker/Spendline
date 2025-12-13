import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta

# Clean light theme with orange buttons
st.set_page_config(page_title="Spendline", layout="centered", initial_sidebar_state="expanded")
st.markdown("""
<style>
    /* White background */
    .main {background-color: #ffffff;}
    .stApp {background-color: #ffffff;}

    /* Clean text */
    h1, h2, h3, h4 {color: #1e293b !important;}
    .stMarkdown, p, label {color: #475569 !important;}

    /* Orange buttons with white text */
    .stButton > button {
        background-color: #f97316;  /* Orange */
        color: white;
        border-radius: 12px;
        border: none;
        font-weight: 600;
        padding: 0.6rem 1.2rem;
    }
    .stButton > button:hover {
        background-color: #ea580c;  /* Darker orange on hover */
    }

    /* Orange progress bar */
    .stProgress > div > div > div > div {
        background-color: #f97316;
    }

    /* Clean inputs */
    .stTextInput > div > div > input {border-radius: 8px; border: 1px solid #e2e8f0;}
    .stNumberInput > div > div > input {border-radius: 8px; border: 1px solid #e2e8f0;}
</style>
""", unsafe_allow_html=True)

st.title("💰 Spendline")
st.markdown("**Spend less on liabilities. Stack more on assets.**  \nQuiet money control.")

# Initialize session state
if 'budget' not in st.session_state:
    st.session_state.budget = 0.0
if 'expenses' not in st.session_state:
    st.session_state.expenses = []
if 'savings' not in st.session_state:
    st.session_state.savings = 0.0
if 'assets' not in st.session_state:
    st.session_state.assets = 0.0
if 'liabilities' not in st.session_state:
    st.session_state.liabilities = 0.0
if 'investments' not in st.session_state:
    st.session_state.investments = []
if 'goals' not in st.session_state:
    st.session_state.goals = []
if 'subscriptions' not in st.session_state:
    st.session_state.subscriptions = []
if 'challenge_length' not in st.session_state:
    st.session_state.challenge_length = None
if 'challenge_start' not in st.session_state:
    st.session_state.challenge_start = None

CATEGORIES = ["Food & Dining", "Transport", "Entertainment", "Shopping", "Bills & Utilities", "Health", "Subscriptions", "Other"]
WANTS_CATS = ["Entertainment", "Shopping", "Subscriptions"]

with st.sidebar:
    st.header("📊 Monthly Budget")
    budget_input = st.number_input("Set budget ($)", min_value=0.0, value=st.session_state.budget)
    if st.button("Save Budget"):
        st.session_state.budget = budget_input
        st.success("Locked 🔒")

    st.divider()
    st.header("💸 Log Expense")
    exp_amount = st.number_input("Amount ($)", min_value=0.0, key="exp_amt")
    exp_desc = st.text_input("Description (optional)", key="exp_desc")
    exp_category = st.selectbox("Category", CATEGORIES, key="exp_cat")
    if st.button("Log Expense"):
        if exp_amount > 0:
            st.session_state.expenses.append({
                'date': datetime.now().strftime("%Y-%m-%d %H:%M"),
                'amount': exp_amount,
                'desc': exp_desc or "Expense",
                'category': exp_category
            })
            if exp_category in WANTS_CATS or exp_category == "Other":
                if st.session_state.challenge_start:
                    st.session_state.challenge_start = None
                    st.session_state.challenge_length = None
                    st.warning("Challenge reset — Wants expense logged.")
            st.success("Logged")

    st.divider()
    st.header("💪 Add to Savings/Assets")
    asset_add = st.number_input("Add ($)", min_value=0.0, key="asset_add")
    if st.button("Stack It"):
        if asset_add > 0:
            st.session_state.assets += asset_add
            st.session_state.savings += asset_add
            st.success(f"+${asset_add:,.2f}")

# Dashboard
total_expenses = sum(e['amount'] for e in st.session_state.expenses)
remaining = st.session_state.budget - total_expenses
net_worth = st.session_state.assets - st.session_state.liabilities

st.markdown("### 📈 Dashboard")
col1, col2, col3, col4 = st.columns(4)
col1.metric("Budget", f"${st.session_state.budget:,.2f}")
col2.metric("Spent", f"${total_expenses:,.2f}")
col3.metric("Remaining", f"${remaining:,.2f}")
col4.metric("Net Worth", f"${net_worth:,.2f}")

# No-Spend Challenge
st.divider()
st.subheader("🛑 No-Spend Challenge")

if st.session_state.challenge_start:
    start_date = datetime.strptime(st.session_state.challenge_start, "%Y-%m-%d")
    days_passed = (datetime.now().date() - start_date.date()).days
    days_left = max(0, st.session_state.challenge_length - days_passed)
    progress = days_passed / st.session_state.challenge_length

    st.progress(progress)
    st.markdown(f"<h2 style='text-align: center; color: #f97316;'>{days_left} days left</h2>", unsafe_allow_html=True)
    if days_left > 0:
        st.markdown(f"<p style='text-align: center; font-size: 1.2rem;'>Day <strong>{days_passed + 1}</strong> — stay strong 🔥</p>", unsafe_allow_html=True)
    else:
        st.balloons()
        st.success("Challenge complete! Discipline built 💪")
else:
    st.info("Build discipline with a no-spend challenge")
    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("7-Day Challenge", use_container_width=True):
            st.session_state.challenge_length = 7
            st.session_state.challenge_start = datetime.now().strftime("%Y-%m-%d")
            st.rerun()
    with col2:
        if st.button("14-Day Challenge", use_container_width=True):
            st.session_state.challenge_length = 14
            st.session_state.challenge_start = datetime.now().strftime("%Y-%m-%d")
            st.rerun()
    with col3:
        if st.button("30-Day Challenge", use_container_width=True):
            st.session_state.challenge_length = 30
            st.session_state.challenge_start = datetime.now().strftime("%Y-%m-%d")
            st.rerun()

st.caption("Spendline — quiet wealth in motion.")