"""File ingestion, smart column auto-mapping, and initial profiling."""

from __future__ import annotations

import re
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

import openpyxl
import polars as pl

from app.config import settings
from app.schemas.api import (
    ColumnProfile,
    DoubleCountingCheck,
    UploadPreviewResponse,
    WeekdayAuditSummary,
)

# Canonical retail fields and common header aliases
CANONICAL_ALIASES: dict[str, tuple[str, ...]] = {
    "transaction_id": (
        "transaction_id",
        "txn_id",
        "tx_id",
        "bill_no",
        "bill_id",
        "invoice_id",
        "invoice_no",
        "receipt_id",
        "order_id",
    ),
    "transaction_date": (
        "transaction_date",
        "txn_date",
        "bill_date",
        "order_date",
        "sale_date",
        "date",
        "created_at",
    ),
    "entered_weekday": (
        "entered_weekday",
        "weekday",
        "day_of_week",
        "day_name",
        "day",
    ),
    "product_id": ("product_id", "sku", "sku_id", "item_id", "item_code", "prod_id", "barcode"),
    "product_name": ("product_name", "item_name", "sku_name", "title", "description"),
    "category": ("category", "prod_category", "dept", "department", "product_category"),
    "store_id": ("store_id", "branch_id", "shop_id", "counter_id", "outlet_id", "store"),
    "quantity": ("quantity", "qty", "units", "units_sold", "count", "qty_sold"),
    "unit_price": ("unit_price", "price", "rate", "mrp", "selling_price", "retail_price"),
    "total_sales": (
        "total_sales",
        "sales",
        "amount",
        "line_total",
        "bill_amount",
        "revenue",
        "gross_sales",
        "net_sales",
    ),
    "cost_price": (
        "cost_price",
        "unit_cost",
        "cost",
        "cogs",
        "purchase_price",
        "buying_price",
    ),
    "stock_on_hand": (
        "stock_on_hand",
        "stock",
        "on_hand",
        "inventory",
        "qty_on_hand",
        "available_qty",
        "current_stock",
        "stock_qty",
        "closing_stock",
    ),
    "reorder_level": ("reorder_level", "reorder_point", "min_stock", "safety_stock", "rop"),
    "lead_time_days": ("lead_time_days", "lead_time", "supplier_lead_time"),
    "status": ("status", "txn_status", "order_status", "state"),
    "region": ("region", "zone", "area", "city", "territory"),
}

# Substring fallback hints when exact alias does not match
SUBSTRING_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("transaction_date", ("date", "timestamp")),
    ("transaction_id", ("invoice", "receipt", "order_no", "txn")),
    ("product_id", ("sku", "item_code", "product_code")),
    ("product_name", ("product_name", "item_desc", "item_title")),
    ("stock_on_hand", ("on_hand", "stock", "inventory")),
    ("reorder_level", ("reorder", "safety_stock", "min_qty")),
    ("cost_price", ("cost", "cogs")),
    ("unit_price", ("unit_price", "selling_price", "mrp")),
    ("total_sales", ("revenue", "total_sales", "line_total")),
    ("quantity", ("qty", "units_sold", "quantity")),
    ("category", ("category", "department")),
    ("store_id", ("store", "branch", "outlet")),
)

WEEKDAY_ABBR = {
    "mon": "Monday",
    "monday": "Monday",
    "tue": "Tuesday",
    "tues": "Tuesday",
    "tuesday": "Tuesday",
    "wed": "Wednesday",
    "wednesday": "Wednesday",
    "thu": "Thursday",
    "thur": "Thursday",
    "thurs": "Thursday",
    "thursday": "Thursday",
    "fri": "Friday",
    "friday": "Friday",
    "sat": "Saturday",
    "saturday": "Saturday",
    "sun": "Sunday",
    "sunday": "Sunday",
}


def _normalize_header(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def suggest_column_map(columns: list[str]) -> dict[str, str]:
    """Suggest mapping from raw file headers to canonical retail field names."""
    mapping: dict[str, str] = {}
    used_targets: set[str] = set()

    # Pass 1: Exact / alias match
    for col in columns:
        norm = _normalize_header(col)
        for canonical, aliases in CANONICAL_ALIASES.items():
            if canonical in used_targets:
                continue
            if norm == canonical or norm in aliases:
                mapping[col] = canonical
                used_targets.add(canonical)
                break

    # Pass 2: Substring heuristic match for unmapped columns
    for col in columns:
        if col in mapping:
            continue
        norm = _normalize_header(col)
        for canonical, hints in SUBSTRING_HINTS:
            if canonical in used_targets:
                continue
            if any(h in norm for h in hints):
                mapping[col] = canonical
                used_targets.add(canonical)
                break

    return mapping


def _map_polars_dtype(dtype: pl.DataType) -> Literal["INT64", "FLOAT64", "STRING", "DATE"]:
    if dtype in (pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64):
        return "INT64"
    if dtype in (pl.Float32, pl.Float64) or isinstance(dtype, pl.Decimal):
        return "FLOAT64"
    if dtype in (pl.Date, pl.Datetime):
        return "DATE"
    return "STRING"


def _parse_dates_column(series: pl.Series) -> pl.Series:
    if series.dtype in (pl.Date, pl.Datetime):
        return series.cast(pl.Date)
    if series.dtype == pl.String:
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%Y/%m/%d", "%d/%m/%Y"):
            parsed = series.str.to_date(format=fmt, strict=False)
            if parsed.null_count() < len(series):
                return parsed
    return series.cast(pl.Date, strict=False)


def read_tabular_file(
    file_path: Path,
    *,
    sheet: str | None = None,
    header_offset: int = 0,
) -> tuple[pl.DataFrame, list[str], str | None]:
    """Read CSV, TSV, XLSX, or Parquet into Polars with optional sheet/header offset."""
    suffix = file_path.suffix.lower()
    sheets: list[str] = []
    selected_sheet: str | None = None

    if suffix in (".csv", ".tsv"):
        sep = "\t" if suffix == ".tsv" else ","
        df = pl.read_csv(
            file_path,
            separator=sep,
            skip_rows=header_offset,
            try_parse_dates=True,
            infer_schema_length=1000,
        )
    elif suffix in (".xlsx", ".xlsm"):
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheets = list(wb.sheetnames)
        selected_sheet = sheet if sheet and sheet in sheets else sheets[0]
        ws = wb[selected_sheet]
        raw_rows = list(ws.iter_rows(values_only=True))
        wb.close()
        if len(raw_rows) <= header_offset:
            return pl.DataFrame(), sheets, selected_sheet
        header_row = raw_rows[header_offset]
        headers = [
            str(h).strip() if h is not None and str(h).strip() else f"column_{idx}"
            for idx, h in enumerate(header_row)
        ]
        data_rows = raw_rows[header_offset + 1 :]
        records = [
            {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
            for row in data_rows
            if any(cell is not None for cell in row)
        ]
        df = pl.DataFrame(records) if records else pl.DataFrame(schema=headers)
        for col in df.columns:
            if df[col].dtype == pl.String and "date" in _normalize_header(col):
                parsed = _parse_dates_column(df[col])
                if parsed.null_count() < df.height:
                    df = df.with_columns(parsed.alias(col))
    elif suffix == ".parquet":
        df = pl.read_parquet(file_path)
    else:
        raise ValueError(f"Unsupported file extension: {suffix}")

    return df, sheets, selected_sheet


def _check_double_counting(df: pl.DataFrame, col_map: dict[str, str]) -> DoubleCountingCheck:
    rev_map = {v: k for k, v in col_map.items()}
    qty_col = rev_map.get("quantity") or ("quantity" if "quantity" in df.columns else None)
    price_col = rev_map.get("unit_price") or ("unit_price" if "unit_price" in df.columns else None)
    total_col = rev_map.get("total_sales") or (
        "total_sales" if "total_sales" in df.columns else None
    )

    if not (qty_col and price_col and total_col):
        return DoubleCountingCheck(has_both_sources=False)

    computed = df[qty_col].cast(pl.Float64, strict=False) * df[price_col].cast(
        pl.Float64, strict=False
    )
    reported = df[total_col].cast(pl.Float64, strict=False)
    diff = (computed - reported).abs()
    disagreements = int((diff > 0.01).sum() or 0)
    return DoubleCountingCheck(
        has_both_sources=True,
        disagreement_count=disagreements,
        tolerance=0.01,
        recommended_source="qty_x_price",
    )


def _check_weekday_audit(df: pl.DataFrame, col_map: dict[str, str]) -> WeekdayAuditSummary:
    rev_map = {v: k for k, v in col_map.items()}
    date_col = rev_map.get("transaction_date") or (
        "transaction_date" if "transaction_date" in df.columns else None
    )
    entered_col = rev_map.get("entered_weekday") or (
        "entered_weekday" if "entered_weekday" in df.columns else None
    )

    if not (date_col and entered_col):
        return WeekdayAuditSummary(has_entered_weekday=False)

    dates = _parse_dates_column(df[date_col])
    verified = dates.dt.strftime("%A")
    mismatches = 0
    for ent, ver in zip(df[entered_col].to_list(), verified.to_list(), strict=False):
        if ent is None or ver is None:
            continue
        norm_ent = WEEKDAY_ABBR.get(str(ent).strip().lower(), str(ent).strip())
        if norm_ent.lower() != ver.lower():
            mismatches += 1
    return WeekdayAuditSummary(has_entered_weekday=True, mismatch_count=mismatches)


def _df_to_json_rows(df: pl.DataFrame, limit: int) -> list[dict[str, Any]]:
    sliced = df.head(limit)
    rows: list[dict[str, Any]] = []
    for row in sliced.to_dicts():
        clean: dict[str, Any] = {}
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                clean[k] = v.isoformat()
            elif isinstance(v, Decimal):
                clean[k] = int(v) if v == v.to_integral_value() else float(v)
            else:
                clean[k] = v
        rows.append(clean)
    return rows


def get_uploaded_file(file_id: str) -> Path:
    """Resolve an uploaded file_id inside workspace_data/data/ safely."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,32}", file_id):
        raise ValueError(f"Invalid file_id: {file_id}")
    data_dir = (settings.workspace_dir / "data").resolve()
    matches = sorted(data_dir.glob(f"{file_id}_*"))
    if not matches:
        raise FileNotFoundError(f"Uploaded file '{file_id}' not found.")
    # Prefer parquet cache if present
    for m in matches:
        if m.suffix.lower() == ".parquet":
            return m
    return matches[0]


def apply_column_mapping(df: pl.DataFrame, col_map: dict[str, str]) -> pl.DataFrame:
    """Rename raw columns to canonical names using the provided mapping."""
    rename_dict: dict[str, str] = {}
    existing = set(df.columns)
    for src, target in col_map.items():
        if not target or src not in existing:
            continue
        if target in existing and target != src:
            continue
        if target in rename_dict.values():
            continue
        rename_dict[src] = target
    return df.rename(rename_dict) if rename_dict else df


def ingest_and_profile_upload(
    filename: str,
    content: bytes,
    *,
    sheet: str | None = None,
    header_offset: int = 0,
) -> UploadPreviewResponse:
    """Store uploaded file under workspace data/ and return schema & audit profile."""
    data_dir = settings.workspace_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name)
    file_id = uuid.uuid4().hex[:8]
    rel_path = f"data/{file_id}_{safe_name}"
    target = settings.workspace_dir / rel_path
    target.write_bytes(content)

    df, sheets, selected_sheet = read_tabular_file(
        target, sheet=sheet, header_offset=header_offset
    )

    if target.suffix.lower() in (".xlsx", ".xlsm") and df.height > 10000:
        parquet_rel = f"data/{file_id}_{Path(safe_name).stem}.parquet"
        df.write_parquet(settings.workspace_dir / parquet_rel)

    row_count = df.height
    profiles = [
        ColumnProfile(
            name=col,
            inferred_type=_map_polars_dtype(df[col].dtype),
            null_count=int(df[col].null_count()),
            null_ratio=round(df[col].null_count() / row_count, 4) if row_count else 0.0,
        )
        for col in df.columns
    ]

    col_map = suggest_column_map(df.columns)
    double_counting = _check_double_counting(df, col_map)
    weekday_audit = _check_weekday_audit(df, col_map)

    return UploadPreviewResponse(
        file_id=file_id,
        filename=filename,
        stored_path=rel_path,
        row_count=row_count,
        sheets=sheets,
        selected_sheet=selected_sheet,
        columns=profiles,
        suggested_column_map=col_map,
        double_counting=double_counting,
        weekday_audit=weekday_audit,
        preview_rows=_df_to_json_rows(df, settings.max_preview_rows),
    )
