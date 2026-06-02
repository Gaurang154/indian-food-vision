"""Pytest configuration — makes the backend importable as `app.*`."""
import os
import sys
from pathlib import Path

# Clear external API keys during testing to force local/offline execution fallbacks
os.environ["OPENAI_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
os.environ["SARVAM_API_KEY"] = ""
os.environ["ELEVENLABS_API_KEY"] = ""

# Add the backend/ directory to sys.path so `import app.*` works when
# pytest is invoked from either the project root or from backend/.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
