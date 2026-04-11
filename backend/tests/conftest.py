"""Pytest configuration — makes the backend importable as `app.*`."""
import sys
from pathlib import Path

# Add the backend/ directory to sys.path so `import app.*` works when
# pytest is invoked from either the project root or from backend/.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
