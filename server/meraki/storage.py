import os
from pathlib import Path
from uuid import uuid4


class LocalStorage:
    """Local development adapter; production object storage must be configured separately."""
    def __init__(self, root=None):
        self.root = Path(root or os.getenv("MERAKI_DOCUMENT_ROOT", "./var/documents")).resolve()

    def put(self, content: bytes, suffix: str = "") -> str:
        key = f"{uuid4().hex}{suffix[:16]}"
        target = (self.root / key).resolve()
        if self.root not in target.parents:
            raise ValueError("Invalid storage key")
        self.root.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return key

    def get(self, key: str) -> bytes:
        target = (self.root / key).resolve()
        if self.root not in target.parents or not target.is_file():
            raise FileNotFoundError(key)
        return target.read_bytes()
