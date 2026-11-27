# Retail Analytics Revamp — Design Spec

**Date:** 2026-11-26
**Status:** Approved

## 1. Goal & Direction
Replace the complex Visual Dataflow Transpiler (DAG node-graph studio, Jinja2 code generator, and client-side fallback) with a streamlined, upload-and-analyze **Retail Analytics & Executive Dashboard** application. Retail owners upload a Sales CSV/Excel (and optionally an Inventory/Catalog CSV/Excel) and immediately get deep, actionable analytics that would normally take hours.

## 2. Architecture
### Removed Components
- **Backend:** `app/graph/`, `app/transpiler/`, `app/engine/executor.py`, `app/schemas/graph.py`, and old pipeline routes.
- **Frontend:** `StudioCanvas.jsx`, `schema/graphSchema.js`, `recipes/retailRecipes.js`, and client-side Polars/SQL fallback in `App.jsx`.

### Backend (`backend/app/`)
- **`engine/mapper.py` (Smart Column Auto-Mapper):** Heuristic + fuzzy matching from arbitrary retail CSV/Excel headers to canonical fields (`transaction_id`, `transaction_date`, `product_id`, `product_name`, `category`, `store_id`, `quantity`, `unit_price`, `total_sales`, `cost_price`, `stock_on_hand`, `reorder_level`, `lead_time_days`, `region`, `entered_weekday`).
- **`engine/ingestion.py`:** Parses CSV, TSV, Excel (`.xlsx`), and Parquet uploads; saves uploaded files to a managed temp workspace returning a `file_id`; runs auto-mapping and initial Data Hygiene profiling.
- **`engine/hygiene.py`:** Deduplicates transactions, separates returns (`quantity <= 0` or negative sales) from net sales, detects weekday/date mismatches, and records transparent audit counts/issues.
- **`engine/plc.py`:** Classifies SKUs into `Introduction`, `Growth`, `Maturity`, `Decline` using velocity `g` and price delta `p`, with concrete inventory actions.
- **`engine/analytics.py`:** Unified Polars analytics engine computing:
  - **Macro KPIs:** Total Revenue, Net Units, Distinct Transactions, AOV, Gross Margin %, Inventory Value, Stockout Risk Count.
  - **ABC / Pareto Analysis:** Ranks SKUs by cumulative revenue share (`A` ≤ 80%, `B` ≤ 95%, `C` > 95%) + flags Margin Leaks (low/negative margin or high return rate).
  - **Inventory Health:** Average Daily Sales, Days of Cover (`stock_on_hand / avg_daily_sales`), Risk Status (`Critical` < 7d, `Low` < 14d, `Healthy`, `Dead Stock` > 90d or 0 sales), and Suggested Reorder Qty.
  - **Drill-Downs & Plain-English Insights:** By Store, Category, Weekday vs. Weekend, Weekly Trend, Price Band, Region, and Top Products.
- **`routers/analyze.py`:**
  - `POST /api/analyze/preview` — Upload 1 or 2 files, return `file_id`, detected column mappings, sample rows, and hygiene preview.
  - `POST /api/analyze/run` — Run full analytics with optional mapping overrides, hygiene toggles, and global filters (`date_from`, `date_to`, `store_id`, `category`).
  - `GET /api/analyze/sample` — Load and analyze built-in demo Sales + Inventory retail dataset.
  - `POST /api/analyze/export` — Export actionable CSVs (`reorder`, `dead_stock`, `abc_plc`, `hygiene`).

### Frontend (`ui/src/`)
- **Theme:** Clean Stripe/Linear-inspired SaaS UI with Light/Dark mode toggle, tabular numbers, and responsive grid layout.
- **Components:**
  - `UploadWizard.jsx` — Drag-and-drop Sales + optional Inventory upload, 1-click Demo Store loader, and inline column mapping pills with dropdown overrides.
  - `DashboardShell.jsx` — Sticky top bar with global filters (Date Range, Store, Category), theme toggle, New Upload, and Export menu (CSV reports + Print/PDF).
  - `tabs/OverviewTab.jsx` — KPI strip, Weekly Trend & Category/Store/Weekday interactive SVG/CSS charts, and Priority Insights.
  - `tabs/InventoryTab.jsx` — Stockout Risk & Dead Stock summary cards + searchable/sortable SKU Reorder table.
  - `tabs/AbcPlcTab.jsx` — ABC Pareto 80/20 breakdown, PLC stage matrix, and Margin Leak / High-Return SKU flags.
  - `tabs/HygieneTab.jsx` — Data Hygiene audit summary and issue breakdown.

## 3. Verification
- **Backend:** `pytest` unit & integration tests covering auto-mapper, hygiene, ABC/Pareto, PLC, Inventory Health, and `/api/analyze/*` endpoints.
- **Frontend:** `npm run lint` and `npm run build` with zero errors, plus live end-to-end API + UI check.
