# Deck Claims & Source Traceability (`Group_18_Prototype_Demo.pptx`)

Every factual claim in the slide deck is traced below to an inspected file and line range (or executed command output) in this repository.

## Slide 1 — Title
- **Project name (`DataFlow`) & subtitle (`Interactive Node-Based Data Profiling & Analytics Platform`)**: `ui/src/LandingPage.jsx:127-130, 269-270`; `Group_18_SRS_SDS_v1.1.docx` (Title & Metadata).
- **Group, department, university, and team members (`Group 18, Dept. of CSE, Navrachana University`: Pawan Punjabi, Vatsal Patel, Dhanvin Patel)**: `Group_18_SRS_SDS_v1.1.docx` (Metadata table).
- **Landing page screenshot (`deck/assets/01_landing_page.png`)**: Captured live from `http://127.0.0.1:5173/`.

## Slide 2 — Problem
- **Small and mid-size retailers keep sales and stock/catalog data in separate exports (POS CSVs, multi-sheet Excel workbooks)**: `Group_18_SRS_SDS_v1.1.docx` (§1.2); `docs/superpowers/specs/2026-11-26-retail-reorder-flow-design.md:7`.
- **Manual merging with VLOOKUPs and pivot tables is slow and error-prone**: `Group_18_SRS_SDS_v1.1.docx` (§1.2).
- **Recurring retail data-hygiene hazards (duplicate transaction IDs, return rows with `quantity <= 0`, inconsistent headers/dates, weekday label mismatches, and revenue double-counting risk)**: `backend/app/engine/ingestion.py:23-162, 240-286`; `backend/app/engine/flow_runner.py:128-143`; `Group_18_SRS_SDS_v1.1.docx` (§3 FR-2.4, FR-3.1–3.3).

## Slide 3 — Solution Overview
- **8 supported node types in the visual studio**: `backend/app/schemas/flow.py:9-18`; `ui/src/components/FlowCanvas.jsx:19-28` (`input_csv`, `clean_sales`, `filter_rows`, `formula`, `summarize`, `merge_sku`, `reorder_rules`, `action_output`).
- **Core 5-step retail reorder pipeline**:
  1. **Upload (`input_csv`)**: Ingests CSV, TSV, XLSX/XLSM, and Parquet with auto-mapped canonical columns (`backend/app/engine/ingestion.py:133-162, 186-237`; `flow_runner.py:89-116`).
  2. **Clean (`clean_sales`)**: Excludes returns (`quantity <= 0`), deduplicates by key (`transaction_id`), trims/titlecases text, fills nulls, and computes `net_sales` (`backend/app/engine/flow_runner.py:119-175`).
  3. **Merge (`merge_sku`)**: Joins sales and stock (`left`, `inner`, `full`) and rolls up `units_sold`, `revenue`, `avg_daily_sales`, and match percentage (`backend/app/engine/flow_runner.py:351-440`).
  4. **Rules (`reorder_rules`)**: Classifies SKUs (`Critical`, `Low`, `Dead Stock`, `Healthy`) and calculates `suggested_reorder_qty` (`backend/app/engine/flow_runner.py:442-536`).
  5. **Output (`action_output`)**: Filters by status and exports Reorder PO or Dead Stock clearance CSVs (`backend/app/engine/flow_runner.py:539-544`; `backend/app/routers/flow.py:56-88`).
- **Additional general transforms (`filter_rows`, `formula`, `summarize`)**: `backend/app/engine/flow_runner.py:215-348`; `ui/src/components/NodeInspector.jsx:340-671`.

## Slide 4 — Architecture
- **Frontend SPA**: React 19 (`^19.2.8`) + Vite (`^8.3.0`) with `FlowCanvas`, `NodeInspector`, `LandingPage`, and REST client (`ui/package.json:12-26`; `ui/src/App.jsx`; `ui/src/api/client.js:1-57`).
- **Backend API**: FastAPI (`backend/app/main.py:20-41`), CORS for Vite (`backend/app/config.py:16-19`), routes `/api/v1/health`, `/api/v1/flow/upload`, `/api/v1/flow/sample`, `/api/v1/flow/run`, `/api/v1/flow/export` (`backend/app/main.py:35-41`; `backend/app/routers/flow.py:16-88`).
- **Execution Engine**: Polars DataFrame executor (`backend/app/engine/flow_runner.py:547-640`) using Kahn's topological sort (`_kahn_sort`, `flow_runner.py:48-70`), caching up to 40 preview rows and column metadata per node (`flow_runner.py:610-619`), and marking downstream nodes `skipped` on upstream `error` (`flow_runner.py:564-572`).
- **Database layer**: SQLAlchemy initializes SQLite tables (`users`, `pipelines`, `execution_logs`) on startup (`backend/app/db/database.py:20-28`; `backend/app/db/models.py:20-77`).
- **Cycle handling & DuckDB boundary**: `_kahn_sort` raises `ValueError("Flow graph contains a cycle.")`, which `/api/v1/flow/run` returns as HTTP 400 (`routers/flow.py:52-53`); HTTP 422 on cycles (`Group_18_SRS_SDS_v1.1.docx` §4.4) is **Planned**. `backend/app/engine/nlq.py` imports `duckdb` but is not wired into `flow_runner.py` or `main.py`.

## Slide 5 — Live Prototype Walkthrough
- **Canvas screenshot (`deck/assets/02_studio_canvas.png`)**: Captured live at `http://127.0.0.1:5173/app` showing the 6-node `Reorder PO Flow` (`Sales CSV`, `Warehouse Stock CSV`, `Clean & Dedupe`, `Merge on SKU`, `Reorder Rules`, `PO & Action Output`).
- **Inspector screenshot (`deck/assets/03_reorder_inspector.png`)**: Captured live on `Reorder Rules` showing threshold controls, per-node duration (`ms`), searchable/sortable output table, and column type badges (`str`, `num`).
- **Interactive UI capabilities**: Drag/wire/disconnect/auto-layout nodes (`ui/src/components/FlowCanvas.jsx:61-182`); save graph to `localStorage` (`ui/src/App.jsx:160-165`); sortable/filterable 40-row step preview (`ui/src/components/NodeInspector.jsx:67-93, 843-970`).

## Slide 6 — Data-Quality Features Implemented
- **Column auto-mapping**: `suggest_column_map` (`backend/app/engine/ingestion.py:23-162`) uses Pass 1 exact/alias matching (`CANONICAL_ALIASES`) and Pass 2 `SUBSTRING_HINTS`.
- **Double-counting check**: `_check_double_counting` (`backend/app/engine/ingestion.py:240-262`) compares `quantity * unit_price` vs `total_sales` with `0.01` tolerance and returns `disagreement_count` and `recommended_source="qty_x_price"`.
- **Weekday audit**: `_check_weekday_audit` (`backend/app/engine/ingestion.py:265-286`) compares parsed `transaction_date` (`%A`) against `entered_weekday` (normalizing abbreviations via `WEEKDAY_ABBR`) and counts `mismatch_count`.
- **Return filtering**: `_run_clean_sales` (`backend/app/engine/flow_runner.py:133-136`) drops rows where `quantity <= 0` (`-2 returns` on sample data).
- **Deduplication & normalization**: `_run_clean_sales` (`backend/app/engine/flow_runner.py:138-159`) deduplicates on `transaction_id` keeping first row (`-1 dupes` on sample data), strips string whitespace, titlecases `category` and `product_name`, and optionally fills nulls.
- **UI surfacing note**: Double-counting and weekday audit metrics are computed in `POST /api/v1/flow/upload` (`backend/app/schemas/api.py:29-40`), while `ui/src/components/NodeInspector.jsx:95-117` consumes `columns` and `suggested_column_map` without yet rendering those audit warning fields.

## Slide 7 — Reorder Logic & Sample Flow Output
- **Reorder rules formula & defaults** (`backend/app/engine/flow_runner.py:442-536`):
  - Defaults: `critical_days=7`, `low_days=14`, `dead_days=90`, `target_cover_days=30`, `default_lead_time_days=7`.
  - `avg_daily_sales = units_sold / observation_days` (`observation_days = 60` in sample dataset, `flow_runner.py:377-404, 673`).
  - `days_of_cover = round(stock_on_hand / avg_daily_sales, 1)` when `avg_daily_sales > 0`.
  - Classification: `Dead Stock` (`stock > 0` and (`avg_daily == 0` or `days_cover > 90`)), `Critical` (`avg_daily > 0` and (`stock <= 0` or `days_cover < 7`)), `Low` (`days_cover < 14` or (`reorder_level` set and `stock <= reorder_level` and `avg_daily > 0`)), else `Healthy`.
  - `suggested_reorder_qty = max(1, ceil(avg_daily * (target_cover + lead_time) - stock))` for `Critical` / `Low`.
- **Verified sample-flow metrics & exports** (via `create_sample_flow('reorder_po')` and `export_flow_csv`):
  - `summary_metrics`: `total_skus: 8`, `critical_count: 2`, `low_count: 1`, `dead_stock_count: 3`, `total_reorder_units: 251`, `estimated_po_cost: $3,871`, `dead_stock_value: $5,788`, `total_inventory_value: $9,248`.
  - `reorder_purchase_order.csv` (3 rows): `SKU-3019` (Ceremonial Matcha 100g, 4.3d cover, +88), `SKU-5021` (Cold Brew Concentrate, 4.8d cover, +111), `SKU-1042` (Arabica Roast 1kg, 12.3d cover, +52).
  - `dead_stock_clearance.csv` (3 rows): `SKU-4010` ($748), `SKU-0914` ($1,680), `SKU-7044` ($3,360).
- **Export screenshot (`deck/assets/04_export_action.png`)**: Captured live on `PO & Action Output` (`Export Reorder PO CSV` verified downloading `reorder_purchase_order.csv`).

## Slide 8 — Verification
- **Backend pytest suite (`backend/tests/test_flow.py`)**:
  - `test_sample_flow_executes_all_five_nodes` (`test_flow.py:21-54`): Verifies `/api/v1/health`, `/api/v1/flow/sample` (`ok=True`, 6 nodes, summary metrics), parameter update (`target_cover_days=45`), and `/api/v1/flow/export`.
  - `test_margin_summary_template_and_transform_nodes` (`test_flow.py:56-90`): Verifies `margin_summary` template, dynamic insertion of `filter_rows` (`category = Coffee`), and `summarize` output (`row_count == 1`).
  - `test_custom_upload_and_missing_column_node_error` (`test_flow.py:93-163`): Verifies `/api/v1/flow/upload`, dedupe/return filtering (`row_count == 1`), and error/skip propagation on missing `file_id`.
- **Observed verification runs**:
  - `pytest -v -s`: **3 passed in 2.79s**.
  - `npm run lint` (`eslint .`): **Exited 0 (0 errors)**.
  - `npm run build` (`vite build`): **Exited 0 in 1.14s** (`dist/assets/index-CRNh0MQB.js`, 281.91 kB).

## Slide 9 — Planned Work (Roadmap)
- **Standalone `pipeline.py` / DuckDB `query.sql` / `.zip` export (Planned)**: `Group_18_SRS_SDS_v1.1.docx` (§3 FR-6.1–6.4, §4.6). `jinja2>=3.1.4` is in `backend/requirements.txt:9`, but no transpiler module exists in `backend/app/`.
- **Product Lifecycle (PLC) classifier node (Planned)**: `Group_18_SRS_SDS_v1.1.docx` (§3 FR-5.3, §4.5) classifying SKUs into `Unclassified`, `Introduction`, `Growth`, `Maturity`, `Decline`; not present in `backend/app/schemas/flow.py:9-18`.
- **SQL database sources — PostgreSQL, SQLite, MySQL (Planned)**: `Group_18_SRS_SDS_v1.1.docx` (§3 FR-2.2, §4.8 `/api/v1/sources/sql/test`); only file uploads (`CSV`, `TSV`, `XLSX`, `XLSM`, `Parquet`) are implemented in `ingestion.py:186-237`.
- **Authentication, saved pipelines & HTTP 422 DAG validation (Planned)**: `backend/app/db/models.py:20-77` defines `User`, `Pipeline`, and `ExecutionLog` ORM tables, and `requirements.txt:12-13` lists `passlib`/`pyjwt`, but no auth or pipeline CRUD routers exist (`backend/app/main.py:41`), and cycles return HTTP 400 (`routers/flow.py:52-53`) rather than HTTP 422 (`SRS §4.4, §4.8`).
- **NL-to-DuckDB Query Engine (`backend/app/engine/nlq.py`)**: Present in repo but references missing `app.engine.duckdb_utils` and `app.schemas.playground` (`nlq.py:12-27`) and is not wired into `main.py`.

## Slide 10 — Closing / Live Demo
- **One-line takeaway & live demo prompt**: Summarizes the working DataFlow prototype verified against `backend/` tests and `ui/` live execution (`http://127.0.0.1:5173/app`).
