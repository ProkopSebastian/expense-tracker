from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, create_model


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MerchantInput(StrictModel):
    transaction_ids: list[int] = Field(min_length=1)
    merchant: str = Field(min_length=1, max_length=240)
    counterparty: str | None = Field(default=None, max_length=500)
    operation_types: list[str]
    sample_amounts: list[float] = Field(min_length=1, max_length=5)
    currency: str = Field(pattern=r"^[A-Z]{3}$")


class TransactionContext(StrictModel):
    transaction_id: int
    date: str
    amount: float
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    account: str
    operation_type: str | None
    description: str
    counterparty: str | None
    category_key: str | None
    category_status: str | None


def build_merchant_analysis_model(category_keys: tuple[str, ...]) -> type[BaseModel]:
    category_type = Literal[category_keys]
    classification = create_model(
        "MerchantClassificationDynamic",
        __base__=StrictModel,
        transaction_ids=(list[int], Field(min_length=1)),
        category_key=(category_type, ...),
        confidence=(float, Field(ge=0, le=1)),
        rationale=(str, Field(min_length=1, max_length=240)),
        should_create_rule=(bool, ...),
    )
    return create_model(
        "MerchantAnalysisDynamic",
        __base__=StrictModel,
        classifications=(list[classification], ...),
    )


def build_relation_analysis_model(category_keys: tuple[str, ...]) -> type[BaseModel]:
    category_type = Literal[category_keys] | None
    suggestion = create_model(
        "RelationSuggestionDynamic",
        __base__=StrictModel,
        kind=(str, Field(pattern=r"^(own_transfer|shared_purchase|reimbursement|refund|payment_dispute)$")),
        title=(str, Field(min_length=1, max_length=120)),
        transaction_ids=(list[int], Field(min_length=2, max_length=12)),
        category_key=(category_type, ...),
        personal_amount=(float, ...),
        currency=(str, Field(pattern=r"^[A-Z]{3}$")),
        confidence=(float, Field(ge=0, le=1)),
        rationale=(str, Field(min_length=1, max_length=300)),
    )
    return create_model(
        "RelationAnalysisDynamic",
        __base__=StrictModel,
        suggestions=(list[suggestion], ...),
    )
