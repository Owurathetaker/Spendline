# Spendline.py  (v3 clean bootstrap)
import streamlit as st

APP_NAME = "Spendline"

st.set_page_config(page_title=APP_NAME, layout="centered", initial_sidebar_state="expanded")

st.title("💰 Spendline (v3)")
st.caption("Clean rebuild — Phase 1 (auth shell)")

st.write("✅ App is running.")
st.write("Query params:", dict(st.query_params))

# Temporary placeholder UI (we’ll wire auth in Phase 1 Step 2)
st.divider()
st.info("Next: wire Supabase secrets + Login/Signup/Forgot screens (no reset hacks yet).")