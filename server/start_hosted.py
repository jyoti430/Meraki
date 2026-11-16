"""Render start command: python -m server.start_hosted.

Migrate shared tables before app import. Use a single supervised API process;
the internal jobs are database-backed and remain queued across a process stop.
"""
import os
from pathlib import Path
import subprocess
import sys

from .hosted import configure_environment


def main():
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    configure_environment()
    subprocess.run([sys.executable, "-m", "alembic", "-c", "server/alembic.ini", "upgrade", "head"], check=True)
    import uvicorn
    uvicorn.run("server.hosted:create_hosted_app", factory=True, host="0.0.0.0",
                port=int(os.getenv("PORT", "10000")), workers=1)


if __name__ == "__main__":
    main()
