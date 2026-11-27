"""Pydantic schemas for the Parabola-style Retail Flow prototype."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

NodeType = Literal[
    "input_csv",
    "clean_sales",
    "filter_rows",
    "formula",
    "summarize",
    "merge_sku",
    "reorder_rules",
    "action_output",
]


class FlowNode(BaseModel):
    id: str
    type: NodeType
    label: str
    x: float = 0.0
    y: float = 0.0
    enabled: bool = True
    params: dict[str, Any] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    from_node: str
    to_node: str


class FlowGraph(BaseModel):
    nodes: list[FlowNode]
    edges: list[FlowEdge]


class ColumnMeta(BaseModel):
    name: str
    dtype: str
    null_count: int
    unique_count: int


class NodeExecutionResult(BaseModel):
    node_id: str
    status: Literal["ok", "warning", "error", "skipped"]
    row_count: int = 0
    summary: str = ""
    error_message: str | None = None
    columns: list[str] = Field(default_factory=list)
    column_stats: list[ColumnMeta] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    duration_ms: float = 0.0


class FlowRunResponse(BaseModel):
    run_id: str
    ok: bool
    nodes: dict[str, NodeExecutionResult] = Field(default_factory=dict)
    summary_metrics: dict[str, Any] = Field(default_factory=dict)
    duration_ms: float = 0.0


class FlowExportRequest(BaseModel):
    graph: FlowGraph
    node_id: str | None = None
    export_type: Literal["reorder", "dead_stock", "all"] = "all"
