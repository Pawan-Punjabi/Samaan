"""100% offline, schema-aware natural-language-to-DuckDB-SQL engine."""

from __future__ import annotations

import re
import time
from typing import Any

import duckdb
import polars as pl

from app.engine.duckdb_utils import (
    build_pivot_matrix,
    column_role,
    compile_visual_sql,
    duckdb_to_polars,
    quote_ident,
)
from app.engine.ingestion import _df_to_json_rows
from app.schemas.playground import (
    AskQuestionResponse,
    PlaygroundQueryRequest,
    PlaygroundQueryResponse,
    QueryAggregation,
    QueryFilter,
    TableRef,
)

# Synonyms mapping natural retail concepts to potential column names
CONCEPT_SYNONYMS: dict[str, tuple[str, ...]] = {
    "revenue": (
        "net_sales",
        "total_sales",
        "revenue",
        "sales",
        "amount",
        "line_total",
        "bill_amount",
        "line_rev",
    ),
    "profit": ("gross_profit", "profit", "net_profit", "margin_amount"),
    "units": ("quantity", "qty", "units", "units_sold", "qty_sold"),
    "price": ("unit_price", "price", "selling_price", "mrp", "rate"),
    "cost": ("cost_price", "unit_cost", "cost", "cogs"),
    "stock": (
        "stock_on_hand",
        "stock",
        "on_hand",
        "inventory",
        "closing_stock",
        "qty_on_hand",
    ),
    "store": ("store_id", "store", "branch_id", "branch", "shop_id", "outlet_id", "city"),
    "category": ("category", "prod_category", "department", "dept"),
    "product": ("product_name", "product_id", "sku", "item_name", "item_id", "item"),
    "region": ("region", "zone", "area", "territory"),
    "order": ("transaction_id", "order_id", "bill_no", "invoice_id", "order_ref"),
    "date": ("transaction_date", "order_date", "sale_date", "bill_date", "date"),
}

KEYWORD_TO_CONCEPT: dict[str, str] = {
    "revenue": "revenue",
    "sales": "revenue",
    "income": "revenue",
    "turnover": "revenue",
    "earning": "revenue",
    "earnings": "revenue",
    "profit": "profit",
    "margin": "profit",
    "units": "units",
    "quantity": "units",
    "qty": "units",
    "sold": "units",
    "volume": "units",
    "price": "price",
    "cost": "cost",
    "stock": "stock",
    "storage": "stock",
    "inventory": "stock",
    "warehouse": "stock",
    "store": "store",
    "stores": "store",
    "branch": "store",
    "branches": "store",
    "shop": "store",
    "city": "store",
    "category": "category",
    "categories": "category",
    "department": "category",
    "product": "product",
    "products": "product",
    "item": "product",
    "items": "product",
    "sku": "product",
    "skus": "product",
    "region": "region",
    "regions": "region",
    "order": "order",
    "orders": "order",
    "transaction": "order",
    "transactions": "order",
    "bill": "order",
    "bills": "order",
    "date": "date",
    "day": "date",
    "daily": "date",
    "week": "date",
    "weekly": "date",
    "month": "date",
    "monthly": "date",
}


def _is_metric(dtype: pl.DataType) -> bool:
    return dtype in (
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
    ) or isinstance(dtype, pl.Decimal)


def _is_date(dtype: pl.DataType) -> bool:
    return dtype in (pl.Date, pl.Datetime)


def _resolve_columns(df: pl.DataFrame) -> dict[str, Any]:
    """Build schema lookup maps and categorical value index for a DataFrame."""
    cols_lower = {c.lower(): c for c in df.columns}
    metrics = [c for c in df.columns if _is_metric(df[c].dtype)]
    dates = [c for c in df.columns if _is_date(df[c].dtype)]
    dims = [c for c in df.columns if c not in metrics and c not in dates]

    concept_to_col: dict[str, str] = {}
    for concept, aliases in CONCEPT_SYNONYMS.items():
        for alias in aliases:
            if alias in cols_lower:
                concept_to_col[concept] = cols_lower[alias]
                break

    # Fallbacks for generic/arbitrary CSVs
    if "revenue" not in concept_to_col and metrics:
        concept_to_col["revenue"] = metrics[0]
    if "date" not in concept_to_col and dates:
        concept_to_col["date"] = dates[0]

    # Index distinct categorical values (low cardinality <= 60)
    value_index: list[tuple[str, str, str]] = []  # (lower_val, col_name, exact_val)
    for col in dims:
        if df[col].n_unique() <= 60:
            for val in df[col].drop_nulls().unique().to_list():
                s = str(val).strip()
                if len(s) >= 3:
                    value_index.append((s.lower(), col, s))
    # Match longer phrases first
    value_index.sort(key=lambda item: len(item[0]), reverse=True)

    return {
        "cols_lower": cols_lower,
        "metrics": metrics,
        "dates": dates,
        "dims": dims,
        "concept_to_col": concept_to_col,
        "value_index": value_index,
    }


def _match_column_from_phrase(phrase: str, idx: dict[str, Any]) -> str | None:
    p = phrase.strip().lower()
    if p in idx["cols_lower"]:
        return idx["cols_lower"][p]
    # Check normalized underscore match
    p_under = re.sub(r"[^a-z0-9]+", "_", p).strip("_")
    if p_under in idx["cols_lower"]:
        return idx["cols_lower"][p_under]
    # Check keyword concept
    for tok in re.findall(r"[a-z0-9_]+", p):
        concept = KEYWORD_TO_CONCEPT.get(tok)
        if concept and concept in idx["concept_to_col"]:
            return idx["concept_to_col"][concept]
        if tok in idx["cols_lower"]:
            return idx["cols_lower"][tok]
    return None


def suggest_questions_for_df(df: pl.DataFrame) -> list[str]:
    """Generate schema-specific natural language sample questions."""
    if df.is_empty():
        return []
    idx = _resolve_columns(df)
    c2c = idx["concept_to_col"]
    rev = c2c.get("revenue")
    cat = c2c.get("category") or (idx["dims"][0] if idx["dims"] else None)
    store = c2c.get("store")
    prod = c2c.get("product")
    stock = c2c.get("stock")
    profit = c2c.get("profit")
    date_col = c2c.get("date")

    qs: list[str] = []
    if rev and cat:
        qs.append(f"Top 5 {cat} by {rev}")
    if profit and prod:
        qs.append(f"Top 5 {prod} by {profit}")
    if stock and prod:
        qs.append("Which items are running low on stock?")
        qs.append("Show dead stock sitting in storage")
    if rev and store and cat and store != cat:
        qs.append(f"Compare {rev} by {store} and {cat}")
    if rev and date_col:
        qs.append(f"Weekly {rev} trend")
    if not qs and idx["dims"] and idx["metrics"]:
        qs.append(f"Top 5 {idx['dims'][0]} by {idx['metrics'][0]}")
    return qs[:5]


def _run_duckdb_sql(
    workspace_df: pl.DataFrame,
    sql: str,
) -> PlaygroundQueryResponse:
    t0 = time.perf_counter()
    conn = duckdb.connect(":memory:")
    try:
        conn.register("workspace_data", workspace_df)
        try:
            conn.execute("SET enable_external_access = false;")
        except duckdb.Error:
            pass
        res_df = duckdb_to_polars(conn, sql)
    finally:
        conn.close()

    rows = _df_to_json_rows(res_df, 200)
    num_cols = [c for c in res_df.columns if column_role(res_df[c].dtype) == "metric"]
    elapsed = round((time.perf_counter() - t0) * 1000.0, 2)
    return PlaygroundQueryResponse(
        sql=sql,
        columns=res_df.columns,
        numeric_columns=num_cols,
        rows=rows,
        pivot_matrix=None,
        row_count=res_df.height,
        duration_ms=elapsed,
    )


def _format_num(v: Any) -> str:
    if isinstance(v, float):
        return f"{int(v):,}" if v.is_integer() else f"{v:,.2f}"
    if isinstance(v, int) and not isinstance(v, bool):
        return f"{v:,}"
    return str(v)


def answer_question_offline(question: str, workspace_df: pl.DataFrame) -> AskQuestionResponse:
    """Translate a plain-English retail/storage question into DuckDB SQL offline."""
    q_raw = question.strip()
    q_low = q_raw.lower()
    idx = _resolve_columns(workspace_df)
    c2c = idx["concept_to_col"]
    suggestions = suggest_questions_for_df(workspace_df)

    if workspace_df.is_empty():
        return AskQuestionResponse(
            understood=False,
            question=q_raw,
            answer="The active workspace has 0 rows. Adjust your cleaning filters or upload a file first.",
            explanation="Empty dataset",
            suggestions=suggestions,
        )

    # --- Special Intent 1: Storage / Stockout / Days of Cover ---
    stock_col = c2c.get("stock")
    prod_col = c2c.get("product") or (idx["dims"][0] if idx["dims"] else None)
    units_col = c2c.get("units")
    date_col = c2c.get("date")
    rev_col = c2c.get("revenue")

    is_low_stock = bool(
        re.search(r"\b(low stock|stockout|running out|days of cover|reorder|shortage|run out)\b", q_low)
    )
    is_dead_stock = bool(
        re.search(r"\b(dead stock|slow moving|overstock|stuck|stagnant|not selling)\b", q_low)
    )

    if (is_low_stock or is_dead_stock) and stock_col and prod_col:
        name_col = idx["cols_lower"].get("product_name")
        select_name = f", ANY_VALUE({quote_ident(name_col)}) AS product_name" if name_col and name_col != prod_col else ""
        qty_expr = f"SUM(TRY_CAST({quote_ident(units_col)} AS DOUBLE))" if units_col else "COUNT(*)"
        if date_col:
            span_expr = f"GREATEST(1, DATE_DIFF('day', MIN(TRY_CAST({quote_ident(date_col)} AS DATE)), MAX(TRY_CAST({quote_ident(date_col)} AS DATE))) + 1)"
        else:
            span_expr = "30"

        threshold_m = re.search(r"(?:under|below|less than|<)\s*(\d+)", q_low)
        days_thresh = int(threshold_m.group(1)) if threshold_m else (90 if is_dead_stock else 14)

        if is_dead_stock:
            sql = (
                f"WITH base AS (\n"
                f"  SELECT {quote_ident(prod_col)} AS sku{select_name},\n"
                f"    ROUND(AVG(TRY_CAST({quote_ident(stock_col)} AS DOUBLE)), 1) AS stock_on_hand,\n"
                f"    ROUND({qty_expr} / (SELECT {span_expr} FROM workspace_data), 2) AS avg_daily_sales\n"
                f"  FROM workspace_data\n"
                f"  GROUP BY {quote_ident(prod_col)}\n"
                f")\n"
                f"SELECT *, CASE WHEN avg_daily_sales > 0 THEN ROUND(stock_on_hand / avg_daily_sales, 1) ELSE NULL END AS days_of_cover\n"
                f"FROM base\n"
                f"WHERE stock_on_hand > 0 AND (avg_daily_sales = 0 OR (stock_on_hand / avg_daily_sales) > {days_thresh})\n"
                f"ORDER BY stock_on_hand DESC\nLIMIT 25"
            )
            res = _run_duckdb_sql(workspace_df, sql)
            if res.rows:
                top_item = res.rows[0].get("product_name") or res.rows[0].get("sku")
                ans = f"Found {res.row_count} slow/dead-stock SKU(s) with >{days_thresh} days of cover; largest holding is {top_item} ({_format_num(res.rows[0]['stock_on_hand'])} units)."
            else:
                ans = f"No dead-stock items found above {days_thresh} days of cover."
            return AskQuestionResponse(
                understood=True,
                question=q_raw,
                answer=ans,
                explanation=f"Storage Dead-Stock Check (>{days_thresh}d cover) on {prod_col} & {stock_col}",
                chart_type="table",
                query_result=res,
                suggestions=suggestions,
            )

        sql = (
            f"WITH base AS (\n"
            f"  SELECT {quote_ident(prod_col)} AS sku{select_name},\n"
            f"    ROUND(AVG(TRY_CAST({quote_ident(stock_col)} AS DOUBLE)), 1) AS stock_on_hand,\n"
            f"    ROUND({qty_expr} / (SELECT {span_expr} FROM workspace_data), 2) AS avg_daily_sales\n"
            f"  FROM workspace_data\n"
            f"  GROUP BY {quote_ident(prod_col)}\n"
            f"), cover AS (\n"
            f"  SELECT *, CASE WHEN avg_daily_sales > 0 THEN ROUND(stock_on_hand / avg_daily_sales, 1) ELSE NULL END AS days_of_cover\n"
            f"  FROM base\n"
            f")\n"
            f"SELECT * FROM cover\n"
            f"WHERE avg_daily_sales > 0 AND days_of_cover < {days_thresh}\n"
            f"ORDER BY days_of_cover ASC\nLIMIT 25"
        )
        res = _run_duckdb_sql(workspace_df, sql)
        if res.rows:
            first = res.rows[0]
            top_item = first.get("product_name") or first.get("sku")
            ans = f"Found {res.row_count} SKU(s) under {days_thresh} days of cover. Most urgent: {top_item} ({first['days_of_cover']}d left, {first['stock_on_hand']} on hand)."
        else:
            ans = f"Healthy storage levels: 0 SKUs have fewer than {days_thresh} days of cover."
        return AskQuestionResponse(
            understood=True,
            question=q_raw,
            answer=ans,
            explanation=f"Storage Stockout Risk (<{days_thresh}d cover) using {stock_col} & sales velocity",
            chart_type="bar" if res.row_count > 1 else "table",
            query_result=res,
            suggestions=suggestions,
        )

    # --- General Schema-Aware Analytical Parser ---
    # 1. Determine Aggregation
    agg_func = "SUM"
    if re.search(r"\b(average|avg|mean)\b", q_low):
        agg_func = "AVG"
    elif re.search(r"\b(how many|count|number of)\b", q_low):
        agg_func = "COUNT_DISTINCT" if re.search(r"\b(unique|distinct)\b", q_low) else "COUNT"
    elif re.search(r"\b(maximum|highest|max)\b", q_low) and "by " not in q_low:
        agg_func = "MAX"
    elif re.search(r"\b(minimum|lowest|min)\b", q_low) and "by " not in q_low:
        agg_func = "MIN"
    elif re.search(r"\b(share|percentage|percent|%)\b", q_low):
        agg_func = "PCT_TOTAL"

    # 2. Extract Metric Column
    metric_col: str | None = None
    for tok in re.findall(r"[a-z0-9_]+", q_low):
        if tok in idx["cols_lower"] and idx["cols_lower"][tok] in idx["metrics"]:
            metric_col = idx["cols_lower"][tok]
            break
    if not metric_col:
        for tok in re.findall(r"[a-z0-9_]+", q_low):
            concept = KEYWORD_TO_CONCEPT.get(tok)
            if concept and concept in c2c and c2c[concept] in idx["metrics"]:
                metric_col = c2c[concept]
                break
    if not metric_col:
        metric_col = rev_col or (idx["metrics"][0] if idx["metrics"] else None)

    # 3. Extract Group By Dimensions
    group_by: list[str] = []
    time_granularity: str | None = None
    if date_col:
        if re.search(r"\b(weekly|by week|per week)\b", q_low):
            time_granularity = "week"
        elif re.search(r"\b(monthly|by month|per month)\b", q_low):
            time_granularity = "month"
        elif re.search(r"\b(daily|by day|trend|over time)\b", q_low):
            time_granularity = "day"

    if re.search(r"\b(weekday|weekend)\b", q_low):
        wd_col = next((c for c in workspace_df.columns if "weekday" in c.lower()), None)
        if wd_col:
            group_by.append(wd_col)

    by_match = re.search(r"\b(?:by|per|across|for each)\s+([a-z0-9_\s,]+?)(?:\s+(?:where|with|in|for|from|over|under|above|below|last|top|bottom|sorted)|$)", q_low)
    if by_match:
        chunk = by_match.group(1)
        for part in re.split(r"\s*(?:,|and|&|vs|versus|x|×)\s*", chunk):
            col = _match_column_from_phrase(part, idx)
            if col and col not in group_by and col != metric_col:
                group_by.append(col)
                if len(group_by) >= 2:
                    break

    # Also check "compare X vs Y" or "top N <dim>"
    if not group_by:
        top_dim_m = re.search(r"\b(?:top|bottom|best|worst)\s+(?:\d+\s+)?([a-z0-9_]+)\b", q_low)
        if top_dim_m:
            col = _match_column_from_phrase(top_dim_m.group(1), idx)
            if col and col != metric_col:
                group_by.append(col)

    # 4. Extract Categorical Filters from value_index
    filters: list[dict[str, Any]] = []
    used_filter_cols: set[str] = set()
    for lower_val, col_name, exact_val in idx["value_index"]:
        if col_name in group_by or col_name in used_filter_cols:
            continue
        if re.search(rf"\b{re.escape(lower_val)}\b", q_low):
            filters.append({"column": col_name, "op": "=", "value": exact_val})
            used_filter_cols.add(col_name)

    # 5. Extract Numeric Filters (e.g., "stock below 20", "quantity > 5")
    for num_m in re.finditer(r"([a-z0-9_]+)\s*(?:is\s+)?(>=|<=|>|<|above|over|more than|greater than|below|under|less than)\s*(-?\d+(?:\.\d+)?)", q_low):
        col_candidate = _match_column_from_phrase(num_m.group(1), idx)
        if col_candidate and col_candidate in idx["metrics"]:
            op_word = num_m.group(2)
            op = (
                ">"
                if op_word in (">", "above", "over", "more than", "greater than")
                else "<"
                if op_word in ("<", "below", "under", "less than")
                else op_word
            )
            filters.append({"column": col_candidate, "op": op, "value": float(num_m.group(3))})

    # 6. Extract Top/Bottom Limit & Sort
    limit = 50
    sort_dir = "desc"
    rank_m = re.search(r"\b(top|best|highest|bottom|worst|lowest)\s*(\d+)?\b", q_low)
    if rank_m:
        if rank_m.group(2):
            limit = min(500, max(1, int(rank_m.group(2))))
        elif rank_m.group(1) in ("top", "best", "highest", "worst", "lowest"):
            limit = 10
        if rank_m.group(1) in ("bottom", "worst", "lowest"):
            sort_dir = "asc"

    # Check if question matched at least one meaningful signal
    has_signal = bool(group_by or time_granularity or filters or any(w in q_low for w in KEYWORD_TO_CONCEPT if w in q_low))
    if not has_signal or (not metric_col and agg_func != "COUNT"):
        return AskQuestionResponse(
            understood=False,
            question=q_raw,
            answer="I couldn't match specific columns or metrics from your dataset in that question. Try referencing a column or one of the suggested questions below.",
            explanation="No matching schema columns or values detected",
            suggestions=suggestions,
        )

    # Build SQL (handle time_granularity or standard Visual Query)
    if time_granularity and date_col:
        trunc = "week" if time_granularity == "week" else "month" if time_granularity == "month" else "day"
        period_expr = (
            f"STRFTIME(DATE_TRUNC('{trunc}', TRY_CAST({quote_ident(date_col)} AS DATE)), '%Y-%m-%d')"
            if trunc != "day"
            else f"STRFTIME(TRY_CAST({quote_ident(date_col)} AS DATE), '%Y-%m-%d')"
        )
        m_expr = (
            "COUNT(*)"
            if agg_func == "COUNT" or not metric_col
            else f"ROUND({agg_func}(TRY_CAST({quote_ident(metric_col)} AS DOUBLE)), 2)"
        )
        m_alias = "row_count" if agg_func == "COUNT" or not metric_col else f"{agg_func.lower()}_{metric_col}"
        where_sql = ""
        if filters:
            parts = [f"CAST({quote_ident(f['column'])} AS VARCHAR) = '{str(f['value']).replace(chr(39), chr(39)*2)}'" for f in filters if f["op"] == "="]
            if parts:
                where_sql = "\nWHERE " + " AND ".join(parts)
        sql = (
            f"SELECT {period_expr} AS period, {m_expr} AS {quote_ident(m_alias)}\n"
            f"FROM workspace_data{where_sql}\n"
            f"GROUP BY 1\nORDER BY 1 ASC\nLIMIT {limit}"
        )
        res = _run_duckdb_sql(workspace_df, sql)
        if res.rows:
            peak = max(res.rows, key=lambda r: float(r.get(m_alias) or 0))
            ans = f"Plotted {res.row_count} {time_granularity} period(s). Peak was {peak['period']} with {_format_num(peak[m_alias])} in {m_alias}."
        else:
            ans = "No dated rows matched your filters."
        return AskQuestionResponse(
            understood=True,
            question=q_raw,
            answer=ans,
            explanation=f"{time_granularity.title()} {agg_func}({metric_col or '*'}) over {date_col}",
            chart_type="line",
            query_result=res,
            suggestions=suggestions,
        )

    # Standard Visual Query compatible path
    agg_col = "*" if agg_func == "COUNT" and not metric_col else (metric_col or "*")
    agg_alias = "row_count" if agg_col == "*" else f"{agg_func.lower()}_{agg_col}"
    visual_dict = {
        "mode": "visual",
        "group_by": group_by,
        "aggregations": [{"column": agg_col, "func": agg_func, "alias": agg_alias}],
        "filters": filters,
        "sort_by": agg_alias if group_by else None,
        "sort_dir": sort_dir,
        "limit": limit,
        "pivot": len(group_by) == 2,
    }
    dummy_req = PlaygroundQueryRequest(
        tables=[TableRef(file_id="0000", alias="sales")],
        mode="visual",
        group_by=group_by,
        aggregations=[QueryAggregation(column=agg_col, func=agg_func, alias=agg_alias)],
        filters=[QueryFilter(**f) for f in filters],
        sort_by=agg_alias if group_by else None,
        sort_dir=sort_dir,
        limit=limit,
        pivot=len(group_by) == 2,
    )
    sql = compile_visual_sql(dummy_req, workspace_df)
    res = _run_duckdb_sql(workspace_df, sql)
    if len(group_by) == 2 and res.numeric_columns:
        res.pivot_matrix = build_pivot_matrix(res.rows, group_by[0], group_by[1], res.numeric_columns[0])

    chart_type = "pivot" if res.pivot_matrix else ("bar" if len(group_by) == 1 else "table")
    if res.rows:
        top = res.rows[0]
        if group_by:
            label = " / ".join(str(top.get(g, "")) for g in group_by)
            rank_word = "Lowest" if sort_dir == "asc" else "Top"
            ans = f"{rank_word} result: {label} with {_format_num(top.get(agg_alias))} ({agg_alias}) across {res.row_count} group(s)."
        else:
            ans = f"{agg_alias} = {_format_num(top.get(agg_alias))}."
    else:
        ans = "No rows matched your filters."

    exp_parts = [f"Metric: {agg_func}({agg_col})"]
    if group_by:
        exp_parts.append(f"Group by: {', '.join(group_by)}")
    if filters:
        exp_parts.append("Filters: " + ", ".join(f"{f['column']} {f['op']} {f['value']}" for f in filters))

    return AskQuestionResponse(
        understood=True,
        question=q_raw,
        answer=ans,
        explanation=" · ".join(exp_parts),
        chart_type=chart_type,
        visual_query=visual_dict,
        query_result=res,
        suggestions=suggestions,
    )
