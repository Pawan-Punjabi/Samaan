"""Upload preview response contracts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ColumnProfile(BaseModel):
    name: str
    inferred_type: Literal["INT64", "FLOAT64", "STRING", "DATE"]
    null_count: int
    null_ratio: float


class DoubleCountingCheck(BaseModel):
    has_both_sources: bool
    disagreement_count: int = 0
    tolerance: float = 0.01
    recommended_source: Literal["qty_x_price", "total_sales"] = "qty_x_price"


class WeekdayAuditSummary(BaseModel):
    has_entered_weekday: bool
    mismatch_count: int = 0


class UploadPreviewResponse(BaseModel):
    file_id: str
    filename: str
    stored_path: str
    row_count: int
    sheets: list[str] = Field(default_factory=list)
    selected_sheet: str | None = None
    columns: list[ColumnProfile]
    suggested_column_map: dict[str, str]
    double_counting: DoubleCountingCheck
    weekday_audit: WeekdayAuditSummary
    preview_rows: list[dict[str, Any]]
