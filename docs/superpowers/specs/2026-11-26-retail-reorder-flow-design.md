# Weekly Inventory & Reorder Flow — Design Spec

**Date:** 2026-11-26
**Status:** Approved

## 1. Core Problem & Solution
Retail owners lose hours every week manually combining POS Sales CSVs and Warehouse Stock spreadsheets in Excel to figure out what is about to stock out, what needs reordering, and what dead stock is tying up cash.

**Solution:** A simplified, repeatable **5-Node Visual Flow** inspired by Parabola.io:
1. **`input_csv` (Sales CSV & Warehouse Stock CSV):** Upload/swap CSV/TSV/Excel/Parquet files with automatic column mapping.
2. **`clean_sales`:** Toggleable deduplication of transaction IDs, return filtering (`quantity <= 0`), and whitespace/casing normalization.
3. **`merge_sku`:** Joins cleaned Sales with Warehouse Stock on SKU/product key with live match-rate reporting.
4. **`reorder_rules`:** Computes `avg_daily_sales`, `days_of_cover`, `stock_status` (`Critical`, `Low`, `Healthy`, `Dead Stock`), `stock_value`, and `suggested_reorder_qty` using configurable thresholds.
5. **`action_output`:** Filters and outputs actionable Reorder PO lists and Dead Stock clearance lists as CSV or printable briefings.

## 2. Backend (`backend/app/`)
- `schemas/flow.py` — 5 node parameter schemas, `FlowGraph`, `NodeExecutionResult`, and `FlowRunResponse`.
- `engine/ingestion.py` — File reading, smart column auto-mapping, and preview profiling.
- `engine/flow_runner.py` — Linear/DAG executor running the 5 nodes in Polars, returning per-node row counts, summary badges, errors, and 25-row previews.
- `routers/flow.py` — `/api/v1/flow/upload`, `/api/v1/flow/sample`, `/api/v1/flow/run`, `/api/v1/flow/export`.

## 3. Frontend (`ui/src/`)
Styled via **UI/UX Pro Max** (`Data-Dense Dashboard`: Cobalt `#1E40AF`, Warm Amber `#D97706`, Fira Sans + Fira Code) and **Anti-Slop UI**:
- `components/FlowCanvas.jsx` — Interactive 5-node left-to-right visual flow with SVG connectors, live node badges, and error/selection highlighting.
- `components/NodeInspector.jsx` — Context-aware settings panel + live step output table for the selected node, plus Reorder PO & Dead Stock CSV export actions on the final output node.
- `App.jsx` — Header with Load Sample Flow, localStorage rule persistence, Run Flow CTA, and Light/Dark toggle.
