"""Modular Polars node-flow executor for the Parabola-style Retail Studio."""

from __future__ import annotations

import math
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import date, timedelta
from typing import Any

import polars as pl

from app.engine.ingestion import (
    _df_to_json_rows,
    _parse_dates_column,
    apply_column_mapping,
    get_uploaded_file,
    ingest_and_profile_upload,
    read_tabular_file,
    suggest_column_map,
)
from app.schemas.flow import (
    ColumnMeta,
    FlowEdge,
    FlowGraph,
    FlowNode,
    FlowRunResponse,
    NodeExecutionResult,
)

SAFE_FORMULA_RE = re.compile(r"^[A-Za-z0-9_+\-*/().\s]+$")
NUMERIC_DTYPES = (
    pl.Int8,
    pl.Int16,
    pl.Int32,
    pl.Int64,
    pl.UInt8,
    pl.UInt16,
    pl.UInt32,
    pl.UInt64,
    pl.Float32,
    pl.Float64,
)


def _kahn_sort(nodes: list[FlowNode], edges: list[FlowEdge]) -> list[FlowNode]:
    by_id = {n.id: n for n in nodes}
    indeg: dict[str, int] = {n.id: 0 for n in nodes}
    adj: dict[str, list[str]] = defaultdict(list)

    for e in edges:
        if e.from_node in by_id and e.to_node in by_id:
            adj[e.from_node].append(e.to_node)
            indeg[e.to_node] += 1

    queue = deque(nid for nid, deg in indeg.items() if deg == 0)
    ordered: list[FlowNode] = []
    while queue:
        nid = queue.popleft()
        ordered.append(by_id[nid])
        for nxt in adj[nid]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)

    if len(ordered) != len(nodes):
        raise ValueError("Flow graph contains a cycle.")
    return ordered


def _build_col_stats(df: pl.DataFrame) -> list[ColumnMeta]:
    stats: list[ColumnMeta] = []
    for col in df.columns:
        s = df[col]
        dt = "num" if s.dtype in NUMERIC_DTYPES else "date" if s.dtype in (pl.Date, pl.Datetime) else "str"
        stats.append(
            ColumnMeta(
                name=col,
                dtype=dt,
                null_count=int(s.null_count()),
                unique_count=int(s.n_unique()),
            )
        )
    return stats


def _run_input_csv(node: FlowNode) -> tuple[pl.DataFrame, str]:
    p = node.params
    file_id = p.get("file_id")
    if not file_id:
        raise ValueError(f"Upload a CSV/Excel file for '{node.label}'.")

    path = get_uploaded_file(str(file_id))
    df, _, _ = read_tabular_file(path)
    if df.is_empty():
        raise ValueError(f"Uploaded file in '{node.label}' has 0 rows.")

    col_map = p.get("column_map") or suggest_column_map(df.columns)
    working = apply_column_mapping(df, col_map)

    rename_cols = p.get("rename_columns") or {}
    valid_renames = {
        k: v.strip()
        for k, v in rename_cols.items()
        if k in working.columns and v and v.strip() and v.strip() != k and v.strip() not in working.columns
    }
    if valid_renames:
        working = working.rename(valid_renames)

    drop_cols = [c for c in (p.get("drop_columns") or []) if c in working.columns]
    if drop_cols and len(drop_cols) < working.width:
        working = working.drop(drop_cols)

    return working, f"{working.height:,} rows · {working.width} cols"


def _run_clean_sales(node: FlowNode, df: pl.DataFrame) -> tuple[pl.DataFrame, str]:
    if not node.enabled:
        return df, f"{df.height:,} rows (bypassed)"

    p = node.params
    working = df
    removed_dupes = 0
    removed_returns = 0

    if "transaction_date" in working.columns:
        working = working.with_columns(
            _parse_dates_column(working["transaction_date"]).alias("transaction_date")
        )

    if p.get("drop_returns", True) and "quantity" in working.columns:
        before = working.height
        working = working.filter(pl.col("quantity").cast(pl.Float64, strict=False) > 0)
        removed_returns = before - working.height

    dedupe_col = p.get("dedupe_column") or ("transaction_id" if "transaction_id" in working.columns else None)
    if p.get("deduplicate", True) and dedupe_col and dedupe_col in working.columns:
        before = working.height
        working = working.unique(subset=[dedupe_col], keep="first", maintain_order=True)
        removed_dupes = before - working.height

    if p.get("trim_text", True):
        for col in working.columns:
            if working[col].dtype == pl.String:
                expr = pl.col(col).str.strip_chars()
                if col in ("category", "product_name"):
                    expr = expr.str.to_titlecase()
                working = working.with_columns(expr.alias(col))

    fill_col = p.get("fill_null_column")
    fill_val = p.get("fill_null_value")
    if fill_col and fill_col in working.columns and fill_val is not None and fill_val != "":
        if working[fill_col].dtype in NUMERIC_DTYPES:
            working = working.with_columns(pl.col(fill_col).fill_null(float(fill_val)))
        else:
            working = working.with_columns(pl.col(fill_col).cast(pl.String).fill_null(str(fill_val)))

    if "quantity" in working.columns and "unit_price" in working.columns and "net_sales" not in working.columns:
        working = working.with_columns(
            (
                pl.col("quantity").cast(pl.Float64, strict=False)
                * pl.col("unit_price").cast(pl.Float64, strict=False)
            )
            .round(2)
            .alias("net_sales")
        )

    parts = [f"{working.height:,} clean"]
    if removed_dupes:
        parts.append(f"-{removed_dupes} dupes")
    if removed_returns:
        parts.append(f"-{removed_returns} returns")
    return working, " · ".join(parts)


def _single_filter_expr(df: pl.DataFrame, cond: dict[str, Any]) -> pl.Expr:
    col = cond.get("column")
    op = cond.get("op", "=")
    val = cond.get("value", "")
    if not col or col not in df.columns:
        raise ValueError(f"Column '{col}' not found for filter condition.")

    if op == "is_null":
        return pl.col(col).is_null()
    if op == "not_null":
        return pl.col(col).is_not_null()

    is_num = df[col].dtype in NUMERIC_DTYPES
    if op == "contains":
        return pl.col(col).cast(pl.String, strict=False).str.to_lowercase().str.contains(
            str(val).lower(), literal=True
        )
    if is_num:
        rhs = float(val)
        lhs = pl.col(col).cast(pl.Float64, strict=False)
        expr = {
            "=": lhs == rhs,
            "!=": lhs != rhs,
            ">": lhs > rhs,
            ">=": lhs >= rhs,
            "<": lhs < rhs,
            "<=": lhs <= rhs,
        }.get(op)
        if expr is None:
            raise ValueError(f"Unsupported numeric operator: {op}")
        return expr

    rhs_s = str(val)
    lhs_s = pl.col(col).cast(pl.String, strict=False)
    return lhs_s != rhs_s if op == "!=" else lhs_s == rhs_s


def _run_filter_rows(node: FlowNode, df: pl.DataFrame) -> tuple[pl.DataFrame, str]:
    if not node.enabled:
        return df, f"{df.height:,} rows (bypassed)"
    p = node.params
    conditions = p.get("conditions")
    if not conditions and p.get("column"):
        conditions = [{"column": p["column"], "op": p.get("op", "="), "value": p.get("value", "")}]
    if not conditions:
        raise ValueError(f"Add at least one filter condition in '{node.label}'.")

    match_mode = p.get("match", "all")
    combined: pl.Expr | None = None
    for cond in conditions:
        expr = _single_filter_expr(df, cond)
        if combined is None:
            combined = expr
        elif match_mode == "any":
            combined = combined | expr
        else:
            combined = combined & expr

    out = df.filter(combined) if combined is not None else df
    return out, f"{out.height:,} of {df.height:,} kept"


def _eval_arithmetic_expr(expr: str, df: pl.DataFrame) -> pl.Expr:
    cleaned = expr.strip()
    if not cleaned or not SAFE_FORMULA_RE.fullmatch(cleaned):
        raise ValueError("Formula may only use column names, numbers, and + - * / ( ).")

    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[+\-*/()]", cleaned)
    env: dict[str, pl.Expr] = {}
    py_parts: list[str] = []
    for tok in tokens:
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", tok):
            if tok not in df.columns:
                raise ValueError(f"Column '{tok}' not found in upstream table.")
            safe_var = f"_col_{tok}"
            env[safe_var] = pl.col(tok).cast(pl.Float64, strict=False)
            py_parts.append(safe_var)
        else:
            py_parts.append(tok)

    code = " ".join(py_parts)
    result_expr = eval(compile(code, "<formula>", "eval"), {"__builtins__": {}}, env)  # noqa: S307
    if not isinstance(result_expr, pl.Expr):
        raise ValueError("Formula did not produce a valid column expression.")
    return result_expr.round(2)


def _run_formula(node: FlowNode, df: pl.DataFrame) -> tuple[pl.DataFrame, str]:
    if not node.enabled:
        return df, f"{df.height:,} rows (bypassed)"
    p = node.params
    formulas = p.get("formulas")
    if not formulas and p.get("column_name"):
        formulas = [{"column_name": p["column_name"], "expression": p.get("expression", "")}]
    if not formulas:
        raise ValueError(f"Add at least one formula in '{node.label}'.")

    working = df
    added: list[str] = []
    for item in formulas:
        name = str(item.get("column_name") or "").strip()
        expr_str = str(item.get("expression") or "").strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,40}", name):
            raise ValueError(f"Invalid column name '{name}'.")
        expr = _eval_arithmetic_expr(expr_str, working)
        working = working.with_columns(expr.alias(name))
        added.append(name)

    return working, f"+ {', '.join(added)}"


def _run_summarize(node: FlowNode, df: pl.DataFrame) -> tuple[pl.DataFrame, str]:
    if not node.enabled:
        return df, f"{df.height:,} rows (bypassed)"
    p = node.params
    raw_groups = p.get("group_by")
    group_cols = [raw_groups] if isinstance(raw_groups, str) and raw_groups else list(raw_groups or [])
    group_cols = [c for c in group_cols if c in df.columns]
    if not group_cols:
        raise ValueError(f"Select at least one Group By column in '{node.label}'.")

    raw_aggs = p.get("aggregations")
    if not raw_aggs:
        raw_aggs = [{"column": p.get("metric") or "", "func": p.get("func", "SUM")}]

    aggs: list[pl.Expr] = []
    pct_aliases: list[tuple[str, str]] = []
    for item in raw_aggs:
        col = item.get("column")
        func = item.get("func", "SUM")
        if func == "COUNT" or not col or col == "*":
            aggs.append(pl.len().alias(item.get("alias") or "row_count"))
            continue
        if col not in df.columns:
            continue
        num = pl.col(col).cast(pl.Float64, strict=False)
        alias = item.get("alias") or f"{func.lower()}_{col}"
        if func == "AVG":
            aggs.append(num.mean().round(2).alias(alias))
        elif func == "MAX":
            aggs.append(num.max().round(2).alias(alias))
        elif func == "MIN":
            aggs.append(num.min().round(2).alias(alias))
        elif func == "COUNT_DISTINCT":
            aggs.append(pl.col(col).n_unique().alias(alias))
        elif func == "PCT_TOTAL":
            sum_alias = f"_sum_{col}"
            aggs.append(num.sum().alias(sum_alias))
            pct_aliases.append((sum_alias, item.get("alias") or f"pct_{col}"))
        else:
            aggs.append(num.sum().round(2).alias(alias))

    if not aggs:
        aggs.append(pl.len().alias("row_count"))

    out = df.group_by(group_cols).agg(aggs)
    for sum_alias, pct_alias in pct_aliases:
        total = float(out[sum_alias].sum() or 0.0)
        out = out.with_columns(
            (pl.col(sum_alias) * 100.0 / total).round(2).alias(pct_alias)
            if total > 0
            else pl.lit(0.0).alias(pct_alias)
        ).drop(sum_alias)

    sort_col = p.get("sort_by")
    if not sort_col or sort_col not in out.columns:
        non_group = [c for c in out.columns if c not in group_cols]
        sort_col = non_group[0] if non_group else group_cols[0]
    descending = p.get("sort_dir", "desc") != "asc"
    out = out.sort(sort_col, descending=descending)
    return out, f"{out.height:,} groups"


def _run_merge_sku(
    node: FlowNode,
    left_df: pl.DataFrame,
    right_df: pl.DataFrame,
) -> tuple[pl.DataFrame, str]:
    p = node.params
    how = p.get("how", "left")
    if how not in ("left", "inner", "full"):
        how = "left"

    left_key = p.get("left_key") or ("product_id" if "product_id" in left_df.columns else None)
    right_key = p.get("right_key") or ("product_id" if "product_id" in right_df.columns else None)
    if not left_key or left_key not in left_df.columns or not right_key or right_key not in right_df.columns:
        raise ValueError("Select valid Left Key and Right Key columns to merge.")

    aggregate_sales = p.get("aggregate_sales", True)

    # Identify sales vs stock automatically when aggregate_sales is on and one table has stock_on_hand
    if aggregate_sales and ("stock_on_hand" in left_df.columns or "stock_on_hand" in right_df.columns):
        if "stock_on_hand" in left_df.columns and "stock_on_hand" not in right_df.columns:
            stock_df, sales_df = left_df, right_df
            s_key, k_key = right_key, left_key
        else:
            sales_df, stock_df = left_df, right_df
            s_key, k_key = left_key, right_key

        obs_days = 30
        if "transaction_date" in sales_df.columns:
            dates = _parse_dates_column(sales_df["transaction_date"]).drop_nulls()
            if not dates.is_empty():
                obs_days = max(1, (dates.max() - dates.min()).days + 1)

        qty_expr = (
            pl.col("quantity").cast(pl.Float64, strict=False).fill_null(0.0).sum().alias("units_sold")
            if "quantity" in sales_df.columns
            else pl.len().cast(pl.Float64).alias("units_sold")
        )
        sales_aggs: list[pl.Expr] = [qty_expr]
        if "net_sales" in sales_df.columns:
            sales_aggs.append(
                pl.col("net_sales").cast(pl.Float64, strict=False).fill_null(0.0).sum().round(2).alias("revenue")
            )
        if "unit_price" in sales_df.columns:
            sales_aggs.append(
                pl.col("unit_price").cast(pl.Float64, strict=False).mean().round(2).alias("avg_sell_price")
            )

        sales_by_sku = (
            sales_df.filter(pl.col(s_key).is_not_null())
            .with_columns(pl.col(s_key).cast(pl.String).str.strip_chars().alias("product_id"))
            .group_by("product_id")
            .agg(sales_aggs)
            .with_columns((pl.col("units_sold") / obs_days).round(2).alias("avg_daily_sales"))
        )

        stock_clean = stock_df.filter(pl.col(k_key).is_not_null()).with_columns(
            pl.col(k_key).cast(pl.String).str.strip_chars().alias("product_id")
        )
        inv_aggs: list[pl.Expr] = [
            pl.col("stock_on_hand").cast(pl.Float64, strict=False).fill_null(0.0).sum().round(1).alias("stock_on_hand")
        ]
        for opt in ("product_name", "category"):
            if opt in stock_clean.columns:
                inv_aggs.append(pl.col(opt).drop_nulls().first().alias(opt))
        for num_opt in ("reorder_level", "lead_time_days", "cost_price", "unit_price"):
            if num_opt in stock_clean.columns:
                inv_aggs.append(pl.col(num_opt).cast(pl.Float64, strict=False).mean().round(2).alias(num_opt))

        inv_by_sku = stock_clean.group_by("product_id").agg(inv_aggs)
        merged = inv_by_sku.join(sales_by_sku, on="product_id", how=how).with_columns(
            pl.col("units_sold").fill_null(0.0),
            pl.col("avg_daily_sales").fill_null(0.0),
            pl.lit(obs_days).alias("observation_days"),
        )
        matched = merged.filter(pl.col("units_sold") > 0).height
        match_pct = round(matched / inv_by_sku.height * 100.0, 1) if inv_by_sku.height else 0.0
        return merged, f"{merged.height} SKUs ({match_pct}% matched)"

    # General table join
    right_dedup = right_df.unique(subset=[right_key], keep="first", maintain_order=True)
    merged = left_df.join(
        right_dedup,
        left_on=left_key,
        right_on=right_key,
        how=how,
        suffix="_right",
        coalesce=True,
    )
    return merged, f"{merged.height:,} merged rows"


def _run_reorder_rules(
    node: FlowNode,
    merged_df: pl.DataFrame,
) -> tuple[pl.DataFrame, str, dict[str, Any]]:
    if "stock_on_hand" not in merged_df.columns or "product_id" not in merged_df.columns:
        raise ValueError("Connect a Merge Tables node (with stock_on_hand) into Reorder Rules.")

    p = node.params
    critical_days = float(p.get("critical_days", 7))
    low_days = float(p.get("low_days", 14))
    dead_days = float(p.get("dead_days", 90))
    target_cover = float(p.get("target_cover_days", 30))
    default_lead = float(p.get("default_lead_time_days", 7))

    out_rows: list[dict[str, Any]] = []
    crit_cnt = 0
    low_cnt = 0
    dead_cnt = 0
    dead_val = 0.0
    total_val = 0.0
    total_po_units = 0
    est_po_cost = 0.0

    for r in merged_df.to_dicts():
        sku = str(r["product_id"])
        stock = float(r.get("stock_on_hand") or 0.0)
        avg_daily = float(r.get("avg_daily_sales") or 0.0)
        lead_time = float(r.get("lead_time_days") or default_lead)
        rop = r.get("reorder_level")
        cost = r.get("cost_price")
        sell_price = r.get("unit_price") or r.get("avg_sell_price")
        unit_val = cost if cost is not None else sell_price
        stock_value = round(stock * float(unit_val), 2) if unit_val is not None else None
        if stock_value is not None:
            total_val += max(0.0, stock_value)

        days_cover = round(stock / avg_daily, 1) if avg_daily > 0 else None

        if stock > 0 and (avg_daily == 0 or (days_cover is not None and days_cover > dead_days)):
            status = "Dead Stock"
            dead_cnt += 1
            if stock_value is not None:
                dead_val += stock_value
        elif avg_daily > 0 and (stock <= 0 or (days_cover is not None and days_cover < critical_days)):
            status = "Critical"
            crit_cnt += 1
        elif (days_cover is not None and days_cover < low_days) or (
            rop is not None and stock <= float(rop) and avg_daily > 0
        ):
            status = "Low"
            low_cnt += 1
        else:
            status = "Healthy"

        reorder_qty = 0
        if status in ("Critical", "Low") and avg_daily > 0:
            reorder_qty = max(1, int(math.ceil(avg_daily * (target_cover + lead_time) - stock)))
            total_po_units += reorder_qty
            if cost is not None:
                est_po_cost += reorder_qty * float(cost)

        out_rows.append(
            {
                "status": status,
                "product_id": sku,
                "product_name": r.get("product_name") or "—",
                "category": r.get("category") or "—",
                "stock_on_hand": round(stock, 1),
                "avg_daily_sales": round(avg_daily, 2),
                "days_of_cover": days_cover,
                "suggested_reorder_qty": reorder_qty,
                "stock_value": stock_value,
            }
        )

    priority = {"Critical": 0, "Low": 1, "Dead Stock": 2, "Healthy": 3}
    out_rows.sort(
        key=lambda x: (
            priority[x["status"]],
            x["days_of_cover"] if x["days_of_cover"] is not None else 9999.0,
        )
    )
    out_df = pl.DataFrame(out_rows) if out_rows else pl.DataFrame()
    metrics = {
        "total_skus": len(out_rows),
        "critical_count": crit_cnt,
        "low_count": low_cnt,
        "dead_stock_count": dead_cnt,
        "dead_stock_value": round(dead_val, 2),
        "total_inventory_value": round(total_val, 2),
        "total_reorder_units": total_po_units,
        "estimated_po_cost": round(est_po_cost, 2),
    }
    badge = f"{crit_cnt} Critical · {low_cnt} Low · {dead_cnt} Dead"
    return out_df, badge, metrics


def _run_action_output(node: FlowNode, df: pl.DataFrame) -> tuple[pl.DataFrame, str]:
    status_filter = node.params.get("filter_status", "ALL")
    if df.is_empty() or status_filter == "ALL" or "status" not in df.columns:
        return df, f"{df.height:,} rows ready"
    filtered = df.filter(pl.col("status") == status_filter)
    return filtered, f"{filtered.height} {status_filter} rows"


def run_flow(graph: FlowGraph) -> tuple[FlowRunResponse, dict[str, pl.DataFrame]]:
    """Execute any Parabola-style visual FlowGraph and return per-node results."""
    t_all = time.perf_counter()
    ordered = _kahn_sort(graph.nodes, graph.edges)
    parents_map: dict[str, list[str]] = defaultdict(list)
    for e in graph.edges:
        parents_map[e.to_node].append(e.from_node)

    node_dfs: dict[str, pl.DataFrame] = {}
    results: dict[str, NodeExecutionResult] = {}
    summary_metrics: dict[str, Any] = {}
    all_ok = True

    for node in ordered:
        t0 = time.perf_counter()
        parents = parents_map.get(node.id, [])

        if any(results.get(pid) and results[pid].status == "error" for pid in parents):
            results[node.id] = NodeExecutionResult(
                node_id=node.id,
                status="skipped",
                summary="Waiting on upstream fix",
                error_message="Fix the upstream node error first.",
            )
            all_ok = False
            continue

        try:
            if node.type == "input_csv":
                df, badge = _run_input_csv(node)
            elif node.type == "clean_sales":
                if not parents:
                    raise ValueError("Connect an upstream table into Clean & Dedupe.")
                df, badge = _run_clean_sales(node, node_dfs[parents[0]])
            elif node.type == "filter_rows":
                if not parents:
                    raise ValueError("Connect an upstream node into Filter Rows.")
                df, badge = _run_filter_rows(node, node_dfs[parents[0]])
            elif node.type == "formula":
                if not parents:
                    raise ValueError("Connect an upstream node into Formula Column.")
                df, badge = _run_formula(node, node_dfs[parents[0]])
            elif node.type == "summarize":
                if not parents:
                    raise ValueError("Connect an upstream node into Group & Sum.")
                df, badge = _run_summarize(node, node_dfs[parents[0]])
            elif node.type == "merge_sku":
                if len(parents) < 2:
                    raise ValueError("Connect 2 tables into Merge Tables.")
                df, badge = _run_merge_sku(node, node_dfs[parents[0]], node_dfs[parents[1]])
            elif node.type == "reorder_rules":
                if not parents:
                    raise ValueError("Connect a merged table into Reorder Rules.")
                df, badge, summary_metrics = _run_reorder_rules(node, node_dfs[parents[0]])
            elif node.type == "action_output":
                if not parents:
                    raise ValueError("Connect an upstream node into Action Output.")
                df, badge = _run_action_output(node, node_dfs[parents[0]])
            else:
                raise ValueError(f"Unsupported node type: {node.type}")

            node_dfs[node.id] = df
            elapsed = round((time.perf_counter() - t0) * 1000.0, 2)
            results[node.id] = NodeExecutionResult(
                node_id=node.id,
                status="ok",
                row_count=df.height,
                summary=badge,
                columns=df.columns,
                column_stats=_build_col_stats(df),
                rows=_df_to_json_rows(df, 40),
                duration_ms=elapsed,
            )
        except Exception as exc:
            all_ok = False
            results[node.id] = NodeExecutionResult(
                node_id=node.id,
                status="error",
                summary="Needs attention",
                error_message=str(exc),
                duration_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            )

    total_ms = round((time.perf_counter() - t_all) * 1000.0, 2)
    return (
        FlowRunResponse(
            run_id=uuid.uuid4().hex[:8],
            ok=all_ok,
            nodes=results,
            summary_metrics=summary_metrics,
            duration_ms=total_ms,
        ),
        node_dfs,
    )


def _seed_sample_files() -> tuple[Any, Any]:
    today = date(2026, 11, 20)
    catalog = [
        ("SKU-1042", "Arabica Roast 1kg", "Coffee", 18.0, 32.0, 28, 35, 5),
        ("SKU-2088", "Ceramic Dripper V60", "Brew Gear", 14.0, 29.5, 95, 20, 7),
        ("SKU-3019", "Ceremonial Matcha 100g", "Tea", 22.0, 44.0, 12, 25, 6),
        ("SKU-4010", "Oat Barista Milk 1L", "Dairy & Alt", 2.2, 4.8, 340, 80, 3),
        ("SKU-0914", "Paper Filter Pack (Old)", "Brew Gear", 4.0, 8.5, 420, 30, 7),
        ("SKU-5021", "Cold Brew Concentrate", "Coffee", 9.0, 19.0, 18, 40, 4),
        ("SKU-6033", "Chai Spice Loose Leaf", "Tea", 7.5, 16.0, 160, 25, 5),
        ("SKU-7044", "Insulated Travel Tumbler", "Merch", 16.0, 34.0, 210, 15, 10),
    ]
    stock_rows = [
        {
            "product_id": sku,
            "product_name": name,
            "category": cat,
            "cost_price": cost,
            "unit_price": price,
            "stock_on_hand": stock,
            "reorder_level": rop,
            "lead_time_days": lead,
        }
        for sku, name, cat, cost, price, stock, rop, lead in catalog
    ]
    stock_csv = pl.DataFrame(stock_rows).write_csv().encode("utf-8")
    stock_preview = ingest_and_profile_upload("warehouse_stock.csv", stock_csv)

    sales_rows: list[dict[str, Any]] = []
    txn_counter = 1000
    for day_offset in range(60):
        d = today - timedelta(days=59 - day_offset)
        is_weekend = d.weekday() >= 5
        for sku, _name, cat, _cost, price, _, _, _ in catalog:
            if sku == "SKU-3019":
                qty = 4 if day_offset >= 30 else 1
            elif sku == "SKU-5021":
                qty = 5 if day_offset >= 30 else 2
            elif sku == "SKU-0914":
                qty = 2 if day_offset < 20 else 0
            elif sku == "SKU-7044":
                qty = 1 if day_offset % 10 == 0 else 0
            else:
                qty = 2
            if qty == 0:
                continue
            if is_weekend:
                qty += 1
            txn_counter += 1
            final_qty = -1 if (day_offset in (12, 41) and sku == "SKU-2088") else qty
            sales_rows.append(
                {
                    "transaction_id": f"TXN-{txn_counter}",
                    "transaction_date": d.isoformat(),
                    "product_id": sku,
                    "category": cat,
                    "quantity": final_qty,
                    "unit_price": price,
                }
            )
            if day_offset == 10 and sku == "SKU-1042":
                sales_rows.append(dict(sales_rows[-1]))

    sales_csv = pl.DataFrame(sales_rows).write_csv().encode("utf-8")
    sales_preview = ingest_and_profile_upload("pos_sales.csv", sales_csv)
    return sales_preview, stock_preview


def create_sample_flow(template_id: str = "reorder_po") -> dict[str, Any]:
    """Return a pre-wired Parabola showcase template and its initial execution."""
    sales_p, stock_p = _seed_sample_files()

    if template_id == "margin_summary":
        graph = FlowGraph(
            nodes=[
                FlowNode(
                    id="sales_in",
                    type="input_csv",
                    label="Sales CSV",
                    x=40,
                    y=80,
                    params={
                        "role": "sales",
                        "file_id": sales_p.file_id,
                        "filename": "pos_sales.csv",
                        "columns": [c.model_dump() for c in sales_p.columns],
                        "column_map": sales_p.suggested_column_map,
                    },
                ),
                FlowNode(
                    id="clean",
                    type="clean_sales",
                    label="Clean & Dedupe",
                    x=290,
                    y=80,
                    params={"deduplicate": True, "dedupe_column": "transaction_id", "drop_returns": True, "trim_text": True},
                ),
                FlowNode(
                    id="formula_1",
                    type="formula",
                    label="Calc Line Revenue",
                    x=540,
                    y=80,
                    params={
                        "formulas": [{"column_name": "line_revenue", "expression": "quantity * unit_price"}],
                    },
                ),
                FlowNode(
                    id="sum_cat",
                    type="summarize",
                    label="Sum by Category",
                    x=790,
                    y=80,
                    params={
                        "group_by": ["category"],
                        "aggregations": [
                            {"column": "line_revenue", "func": "SUM", "alias": "total_revenue"},
                            {"column": "line_revenue", "func": "PCT_TOTAL", "alias": "share_pct"},
                            {"column": "*", "func": "COUNT", "alias": "orders"},
                        ],
                    },
                ),
                FlowNode(
                    id="output",
                    type="action_output",
                    label="Summary Export",
                    x=1040,
                    y=80,
                    params={"filter_status": "ALL"},
                ),
            ],
            edges=[
                FlowEdge(from_node="sales_in", to_node="clean"),
                FlowEdge(from_node="clean", to_node="formula_1"),
                FlowEdge(from_node="formula_1", to_node="sum_cat"),
                FlowEdge(from_node="sum_cat", to_node="output"),
            ],
        )
    else:
        graph = FlowGraph(
            nodes=[
                FlowNode(
                    id="sales_in",
                    type="input_csv",
                    label="Sales CSV",
                    x=30,
                    y=28,
                    params={
                        "role": "sales",
                        "file_id": sales_p.file_id,
                        "filename": "pos_sales.csv",
                        "columns": [c.model_dump() for c in sales_p.columns],
                        "column_map": sales_p.suggested_column_map,
                    },
                ),
                FlowNode(
                    id="stock_in",
                    type="input_csv",
                    label="Warehouse Stock CSV",
                    x=30,
                    y=152,
                    params={
                        "role": "stock",
                        "file_id": stock_p.file_id,
                        "filename": "warehouse_stock.csv",
                        "columns": [c.model_dump() for c in stock_p.columns],
                        "column_map": stock_p.suggested_column_map,
                    },
                ),
                FlowNode(
                    id="clean",
                    type="clean_sales",
                    label="Clean & Dedupe",
                    x=280,
                    y=28,
                    params={"deduplicate": True, "dedupe_column": "transaction_id", "drop_returns": True, "trim_text": True},
                ),
                FlowNode(
                    id="merge",
                    type="merge_sku",
                    label="Merge on SKU",
                    x=530,
                    y=90,
                    params={"left_key": "product_id", "right_key": "product_id", "how": "left", "aggregate_sales": True},
                ),
                FlowNode(
                    id="reorder",
                    type="reorder_rules",
                    label="Reorder Rules",
                    x=780,
                    y=90,
                    params={
                        "critical_days": 7,
                        "low_days": 14,
                        "dead_days": 90,
                        "target_cover_days": 30,
                        "default_lead_time_days": 7,
                    },
                ),
                FlowNode(
                    id="output",
                    type="action_output",
                    label="PO & Action Output",
                    x=1030,
                    y=90,
                    params={"filter_status": "ALL"},
                ),
            ],
            edges=[
                FlowEdge(from_node="sales_in", to_node="clean"),
                FlowEdge(from_node="clean", to_node="merge"),
                FlowEdge(from_node="stock_in", to_node="merge"),
                FlowEdge(from_node="merge", to_node="reorder"),
                FlowEdge(from_node="reorder", to_node="output"),
            ],
        )

    execution, _ = run_flow(graph)
    return {"graph": graph.model_dump(), "execution": execution.model_dump()}
