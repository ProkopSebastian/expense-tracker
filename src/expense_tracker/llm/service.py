from __future__ import annotations

import hashlib
import json
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from openai import OpenAI
from pydantic import BaseModel

from ..config import settings
from ..ledger import categories, merchant_key, pending_merchant_suggestion_transaction_ids, transactions
from .contracts import (
    MerchantInput,
    TransactionContext,
    build_merchant_analysis_model,
    build_relation_analysis_model,
)
from .prompts import (
    MERCHANT_INSTRUCTIONS,
    PROMPT_VERSION,
    RELATION_INSTRUCTIONS,
    merchant_input,
    relation_input,
)
from .redaction import redact_text

MAX_MERCHANTS_PER_REQUEST = 20
MAX_RELATION_TRANSACTIONS = 100


@dataclass
class MerchantAnalysisResult:
    saved: int
    groups_processed: int
    groups_remaining: int


def analyze_merchants(connection: sqlite3.Connection) -> MerchantAnalysisResult:
    # Both expenses (negative) and income (positive) are sent — the LLM is told to pick an
    # income-kind category for positive amounts instead of skipping them entirely. Transactions
    # already covered by a pending (not yet approved/rejected) suggestion are excluded, or a
    # repeat click would re-ask the LLM about them and could save a near-duplicate suggestion
    # if its wording/confidence differs slightly on the second answer.
    already_suggested = pending_merchant_suggestion_transaction_ids(connection)
    rows = [
        row
        for row in transactions(connection)
        if not row["category_key"] and not row["case_id"] and int(row["id"]) not in already_suggested
    ]
    groups: defaultdict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        groups[(merchant_key(str(row["description"])), str(row["currency"]))].append(row)
    all_groups = list(groups.values())
    merchant_groups = all_groups[:MAX_MERCHANTS_PER_REQUEST]
    if not merchant_groups:
        return MerchantAnalysisResult(saved=0, groups_processed=0, groups_remaining=0)
    payload = [
        MerchantInput(
            transaction_ids=[int(row["id"]) for row in group],
            merchant=redact_text(str(group[0]["description"])),
            counterparty=redact_text(str(group[0]["counterparty"])) if group[0]["counterparty"] else None,
            operation_types=sorted({str(row["transaction_type"] or "unknown") for row in group}),
            sample_amounts=[float(Decimal(str(row["amount"]))) for row in group[:5]],
            currency=str(group[0]["currency"]),
        )
        for group in merchant_groups
    ]
    category_keys_tuple = tuple(str(category["key"]) for category in categories(connection))
    response = _request(
        build_merchant_analysis_model(category_keys_tuple),
        MERCHANT_INSTRUCTIONS,
        merchant_input(categories(connection), payload),
        4,
    )
    category_keys = set(category_keys_tuple)
    is_income_by_id = {int(row["id"]): Decimal(str(row["amount"])) > 0 for group in merchant_groups for row in group}
    saved = 0
    for item in response.classifications:
        if item.category_key in category_keys:
            category_key = item.category_key
        else:
            category_key = "income" if is_income_by_id.get(item.transaction_ids[0], False) else "uncategorized_expense"
        saved += _save_suggestion(
            connection,
            "merchant_classification",
            {
                "transaction_ids": item.transaction_ids,
                "category_key": category_key,
                "confidence": item.confidence,
                "rationale": item.rationale,
                "should_create_rule": item.should_create_rule,
            },
        )
    connection.commit()
    return MerchantAnalysisResult(
        saved=saved, groups_processed=len(merchant_groups), groups_remaining=len(all_groups) - len(merchant_groups)
    )


def analyze_relations(connection: sqlite3.Connection) -> int:
    rows = [row for row in transactions(connection) if not row["case_id"]][:MAX_RELATION_TRANSACTIONS]
    if len(rows) < 2:
        return 0
    payload = [
        TransactionContext(
            transaction_id=int(row["id"]),
            date=str(row["booking_date"]),
            amount=float(Decimal(str(row["amount"]))),
            currency=str(row["currency"]),
            account=str(row["account"]),
            operation_type=str(row["transaction_type"]) if row["transaction_type"] else None,
            description=redact_text(str(row["description"])),
            counterparty=redact_text(str(row["counterparty"])) if row["counterparty"] else None,
            category_key=str(row["category_key"]) if row["category_key"] else None,
            category_status=str(row["decision_status"]) if row["decision_status"] else None,
        )
        for row in rows
    ]
    category_keys_tuple = tuple(str(category["key"]) for category in categories(connection))
    response = _request(
        build_relation_analysis_model(category_keys_tuple),
        RELATION_INSTRUCTIONS,
        relation_input(categories(connection), payload),
        0,
    )
    transaction_ids = {int(row["id"]) for row in rows}
    category_keys = set(category_keys_tuple)
    saved = 0
    for item in response.suggestions:
        if not set(item.transaction_ids).issubset(transaction_ids):
            continue
        if item.category_key and item.category_key not in category_keys:
            continue
        saved += _save_suggestion(connection, "relation", item.model_dump())
    connection.commit()
    return saved


def _request(model: type[BaseModel], instructions: str, input_text: str, max_tool_calls: int) -> Any:
    api_key = settings.openai_api_key
    if api_key is None:
        raise ValueError("Brakuje OPENAI_API_KEY w pliku .env.")
    tools: list[dict[str, str]] = [{"type": "web_search"}] if settings.openai_web_search and max_tool_calls else []
    request: dict[str, Any] = {
        "model": settings.openai_model,
        "instructions": instructions,
        "input": input_text,
        "store": False,
        "reasoning": {"effort": "low"},
        "max_output_tokens": 4000,
        "text": {
            "format": {
                "type": "json_schema",
                "name": model.__name__.lower(),
                "schema": model.model_json_schema(),
                "strict": True,
            }
        },
    }
    if tools:
        request["tools"] = tools
        request["max_tool_calls"] = max_tool_calls
    response = OpenAI(api_key=api_key.get_secret_value()).responses.create(
        **request,
    )
    return model.model_validate_json(response.output_text)


def _save_suggestion(connection: sqlite3.Connection, kind: str, payload: dict[str, object]) -> int:
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    fingerprint = hashlib.sha256(f"{PROMPT_VERSION}\x1f{kind}\x1f{serialized}".encode()).hexdigest()
    cursor = connection.execute(
        """INSERT OR IGNORE INTO suggestions
        (fingerprint, kind, payload_json, confidence, source, prompt_version, status)
        VALUES (?, ?, ?, ?, 'llm', ?, 'suggested')""",
        (fingerprint, kind, serialized, float(payload.get("confidence", 0)), PROMPT_VERSION),
    )
    return cursor.rowcount
