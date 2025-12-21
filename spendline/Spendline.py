# Proxy runner so Streamlit Cloud works no matter which main path is configured.
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1] / "Spendline.py"
runpy.run_path(str(ROOT), run_name="__main__")