from dataclasses import dataclass
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session


@dataclass
class EngineContext:
    session: Session
    profile_id: int
    llm_factory: Optional[Callable[[], Any]] = None
