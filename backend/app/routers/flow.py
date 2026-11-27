"""API routes for the Parabola-style Retail Flow prototype."""

from __future__ import annotations

import io
from typing import Any

import polars as pl
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile

from app.engine.flow_runner import create_sample_flow, run_flow
from app.engine.ingestion import ingest_and_profile_upload
from app.schemas.api import UploadPreviewResponse
from app.schemas.flow import FlowExportRequest, FlowGraph, FlowRunResponse

router = APIRouter(prefix="/flow", tags=["flow"])


@router.post("/upload", response_model=UploadPreviewResponse)
async def upload_csv(
    file: UploadFile = File(...),  # noqa: B008
    sheet: str | None = Form(default=None),  # noqa: B008
    header_offset: int = Form(default=0),  # noqa: B008
) -> UploadPreviewResponse:
    """Upload a CSV/Excel/Parquet file and return auto-mapped columns."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")
    content = await file.read()
    try:
        return ingest_and_profile_upload(
            file.filename,
            content,
            sheet=sheet or None,
            header_offset=max(0, header_offset),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/sample")
def sample_flow(template: str = "reorder_po") -> dict[str, Any]:
    """Return a pre-wired Parabola showcase flow template with initial execution."""
    return create_sample_flow(template)


@router.post("/run", response_model=FlowRunResponse)
def execute_flow(graph: FlowGraph) -> FlowRunResponse:
    """Execute the visual flow graph and return per-node previews and PO metrics."""
    try:
        response, _ = run_flow(graph)
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/export")
def export_flow_csv(req: FlowExportRequest) -> Response:
    """Export any node's table, Reorder PO, or Dead Stock Clearance as CSV."""
    try:
        _, node_dfs = run_flow(req.graph)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target_id = req.node_id or next(
        (n.id for n in reversed(req.graph.nodes) if n.id in node_dfs), None
    )
    df = node_dfs.get(target_id or "", pl.DataFrame())
    filename = "flow_output.csv"

    if not df.is_empty() and "status" in df.columns:
        if req.export_type == "reorder":
            df = df.filter(pl.col("status").is_in(["Critical", "Low"]))
            filename = "reorder_purchase_order.csv"
        elif req.export_type == "dead_stock":
            df = df.filter(pl.col("status") == "Dead Stock")
            filename = "dead_stock_clearance.csv"

    buf = io.StringIO()
    if not df.is_empty():
        df.write_csv(buf)
    else:
        buf.write("message\nNo matching rows for this export.\n")

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
