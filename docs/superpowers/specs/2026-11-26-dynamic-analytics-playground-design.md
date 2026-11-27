# Dynamic Retail Analytics Playground — Design Spec

**Date:** 2026-11-26
**Status:** Approved

## 1. Core Concept
Unify the manual workflow retail data analysts perform across **Excel → SQL → Power BI** into one schema-agnostic, dynamic playground. Works on *any* uploaded CSV/TSV/Excel/Parquet files (1 or multiple tables) without requiring fixed schemas.

## 2. Backend Architecture (`backend/app/`)
- **`engine/playground.py`:**
  - **Multi-table Upload & Profiling:** Stores files in `workspace_data/data/` and computes column stats (`dtype`, `null_count`, `unique_count`, `min`, `max`, `mean`, `sample_values`) plus automatic cleaning suggestions (duplicates, untrimmed/mixed-case strings, negative values, unparsed dates).
  - **Dynamic Prepare & Join Engine (`prepare_workspace`):** Applies ordered, toggleable steps (`deduplicate`, `filter_rows`, `trim_case`, `fill_null`, `parse_date`, `calc_column`) and optional table joins (`LEFT` / `INNER` / `FULL`) to produce a unified `workspace_data` view alongside raw table aliases.
  - **DuckDB Query & Pivot Engine (`execute_playground_query`):**
    - Registers prepared `workspace_data` and raw tables inside an isolated DuckDB connection with `enable_external_access = false`.
    - **Visual Query Mode:** Compiles `group_by` (0, 1, or 2 columns), `aggregations` (`SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `PCT_TOTAL`), `filters`, `sort_by`, and `limit` into DuckDB SQL; optionally builds a 2D `pivot_matrix`.
    - **SQL Mode:** Strictly validates read-only `SELECT` / `WITH` queries (blocking DDL/DML/external functions) and executes them directly against DuckDB.
- **`routers/playground.py`:**
  - `POST /api/v1/playground/upload` — Upload and profile any tabular file.
  - `GET /api/v1/playground/sample` — Seed realistic multi-table `sales` + `inventory` demo workspace.
  - `POST /api/v1/playground/prepare` — Run toggleable cleaning steps, joins, and calculated columns; return schema, profiler stats, live preview rows, and dynamic starter recipes.
  - `POST /api/v1/playground/query` — Execute visual pivot/query or custom DuckDB SQL.
  - `POST /api/v1/playground/export` — Export any query result as CSV.

## 3. Frontend Architecture (`ui/src/`)
Follows **UI/UX Pro Max** (`Data-Dense Dashboard`: Cobalt `#1E40AF`, Warm Amber `#D97706`, Fira Sans + Fira Code) and **Anti-Slop UI** rules:
- `SourcesView.jsx` — Upload 1+ spreadsheets or open the Sample Store Workspace.
- `WorkbenchShell.jsx` — Unified 3-stage analyst navigation (`Prepare & Join` → `Query & Chart Playground` → `Pinned Report`), Light/Dark toggle, and Print/PDF export.
- `stages/PrepareStage.jsx` — Interactive data grid, column profiler, toggleable cleaning & formula steps, and visual join builder with live match rate.
- `stages/PlaygroundStage.jsx` — Dynamic Visual Query/Pivot Builder + live editable DuckDB SQL drawer + instant Table / 2D Pivot / Bar / Line / Scatter visualizer + `+ Pin to Report`.
- `stages/ReportStage.jsx` — Curated executive briefing of pinned analyses with editable owner notes and Print/PDF + CSV export.
