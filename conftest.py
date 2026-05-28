# Root conftest.py — ensures pytest can resolve the backend package
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
