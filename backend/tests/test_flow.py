"""Tests for the simplified 5-node Weekly Inventory & Reorder Flow."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def _isolated_workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(settings, "workspace_dir", tmp_path)
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    return tmp_path


def test_sample_flow_executes_all_five_nodes() -> None:
    with TestClient(app) as client:
        health = client.get("/api/v1/health")
        assert health.status_code == 200

        res = client.get("/api/v1/flow/sample")
        assert res.status_code == 200
        body = res.json()

        exe = body["execution"]
        assert exe["ok"] is True
        assert set(exe["nodes"].keys()) == {"sales_in", "stock_in", "clean", "merge", "reorder", "output"}
        assert exe["summary_metrics"]["critical_count"] >= 1
        assert exe["summary_metrics"]["dead_stock_count"] >= 1
        assert exe["summary_metrics"]["total_reorder_units"] > 0

        # Adjust Reorder Rules (target_cover_days = 45) and re-run
        graph = body["graph"]
        for node in graph["nodes"]:
            if node["id"] == "reorder":
                node["params"]["target_cover_days"] = 45

        rerun = client.post("/api/v1/flow/run", json=graph)
        assert rerun.status_code == 200
        assert rerun.json()["summary_metrics"]["total_reorder_units"] >= exe["summary_metrics"]["total_reorder_units"]

        # Export Reorder PO CSV from reorder node
        exp = client.post(
            "/api/v1/flow/export",
            json={"graph": graph, "node_id": "reorder", "export_type": "reorder"},
        )
        assert exp.status_code == 200
        assert "suggested_reorder_qty" in exp.text


def test_margin_summary_template_and_transform_nodes() -> None:
    with TestClient(app) as client:
        res = client.get("/api/v1/flow/sample?template=margin_summary")
        assert res.status_code == 200
        body = res.json()
        assert body["execution"]["ok"] is True
        assert body["execution"]["nodes"]["sum_cat"]["row_count"] >= 3

        # Insert a Filter Rows step and verify formula + summarize
        graph = body["graph"]
        graph["nodes"].append(
            {
                "id": "flt",
                "type": "filter_rows",
                "label": "Only Coffee",
                "x": 400,
                "y": 200,
                "params": {"column": "category", "op": "=", "value": "Coffee"},
            }
        )
        # Re-route clean -> flt -> formula_1
        graph["edges"] = [
            e for e in graph["edges"] if not (e["from_node"] == "clean" and e["to_node"] == "formula_1")
        ]
        graph["edges"].extend(
            [
                {"from_node": "clean", "to_node": "flt"},
                {"from_node": "flt", "to_node": "formula_1"},
            ]
        )
        rerun = client.post("/api/v1/flow/run", json=graph)
        assert rerun.status_code == 200
        assert rerun.json()["ok"] is True
        assert rerun.json()["nodes"]["sum_cat"]["row_count"] == 1
        assert len(rerun.json()["nodes"]["sum_cat"]["column_stats"]) >= 2


def test_custom_upload_and_missing_column_node_error() -> None:
    sales_csv = (
        b"Bill No,Sale Date,SKU,Qty Sold,Selling Price\n"
        b"B1,2026-11-01,SKU-A,10,15.0\n"
        b"B1,2026-11-01,SKU-A,10,15.0\n"
        b"B2,2026-11-10,SKU-A,-2,15.0\n"
    )
    stock_csv = (
        b"SKU,Item Name,Category,Closing Stock Qty,Unit Cost\n"
        b"SKU-A,Roast Beans,Coffee,3,7.5\n"
        b"SKU-B,Old Mug,Merch,200,5.0\n"
    )

    with TestClient(app) as client:
        s_up = client.post("/api/v1/flow/upload", files={"file": ("s.csv", sales_csv, "text/csv")})
        k_up = client.post("/api/v1/flow/upload", files={"file": ("k.csv", stock_csv, "text/csv")})
        assert s_up.status_code == 200
        assert k_up.status_code == 200

        graph = {
            "nodes": [
                {
                    "id": "sales_in",
                    "type": "input_csv",
                    "label": "Sales CSV",
                    "params": {
                        "role": "sales",
                        "file_id": s_up.json()["file_id"],
                        "column_map": s_up.json()["suggested_column_map"],
                    },
                },
                {
                    "id": "stock_in",
                    "type": "input_csv",
                    "label": "Stock CSV",
                    "params": {
                        "role": "stock",
                        "file_id": k_up.json()["file_id"],
                        "column_map": k_up.json()["suggested_column_map"],
                    },
                },
                {"id": "clean", "type": "clean_sales", "label": "Clean", "params": {}},
                {"id": "merge", "type": "merge_sku", "label": "Merge", "params": {"how": "left"}},
                {"id": "reorder", "type": "reorder_rules", "label": "Reorder", "params": {}},
                {"id": "output", "type": "action_output", "label": "Output", "params": {}},
            ],
            "edges": [
                {"from_node": "sales_in", "to_node": "clean"},
                {"from_node": "clean", "to_node": "merge"},
                {"from_node": "stock_in", "to_node": "merge"},
                {"from_node": "merge", "to_node": "reorder"},
                {"from_node": "reorder", "to_node": "output"},
            ],
        }

        res = client.post("/api/v1/flow/run", json=graph)
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["nodes"]["clean"]["row_count"] == 1
        assert body["summary_metrics"]["critical_count"] == 1
        assert body["summary_metrics"]["dead_stock_count"] == 1

        # Missing file error marks input node without crashing API
        graph["nodes"][0]["params"]["file_id"] = None
        err_res = client.post("/api/v1/flow/run", json=graph)
        assert err_res.status_code == 200
        err_body = err_res.json()
        assert err_body["ok"] is False
        assert err_body["nodes"]["sales_in"]["status"] == "error"
        assert err_body["nodes"]["clean"]["status"] == "skipped"
