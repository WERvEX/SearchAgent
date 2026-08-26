from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    version: int
    format: str
    content_md: str
    content_text: str | None = None
    file_path: str | None
    created_at: datetime
