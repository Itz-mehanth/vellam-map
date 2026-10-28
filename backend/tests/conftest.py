import os
import sys
import tempfile
from pathlib import Path

# Use a throwaway database and put the backend on the path before any app import.
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
os.environ.setdefault("META_API_KEY", "test")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
