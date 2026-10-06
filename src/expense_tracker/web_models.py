"""Validated HTTP request contracts, separate from application operations."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Money = Annotated[Decimal, Field(allow_inf_nan=False, max_digits=18, decimal_places=2)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
Kind = Literal["shared_purchase", "reimbursement", "refund", "own_transfer", "payment_dispute"]
Role = Literal["purchase", "received_reimbursement", "paid_settlement", "received_refund", "account_transfer"]


class CategoryEntry(BaseModel):
    label: Text
    parent_key: str | None = None
    icon: Annotated[str, StringConstraints(min_length=1, max_length=40)]
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class Decision(BaseModel):
    category_key: Text
    remember: bool = False


class SuggestionDecision(Decision):
    id: int


class BatchApproval(BaseModel):
    items: list[SuggestionDecision]


class ManualEntry(BaseModel):
    account: Text
    booking_date: date
    amount: Money
    currency: Currency
    description: Text
    counterparty: str | None = None
    category_key: Text
    wallet_id: int | None = None


class WalletCreate(BaseModel):
    account: Text
    currency: Currency


class WalletFundEntry(BaseModel):
    source_transaction_id: int
    received_amount: Money | None = None
    target_transaction_id: int | None = None
    fee_amount: Money = Decimal(0)
    fee_category_key: str | None = None


class Member(BaseModel):
    transaction_id: int
    role: Role


class GroupEntry(BaseModel):
    title: Text
    kind: Kind
    personal_amount: Money
    currency: Currency
    category_key: Text
    members: list[Member] = Field(min_length=2, max_length=1000)


class WalletConvert(BaseModel):
    target_wallet_id: int
    given_amount: Money
    received_amount: Money
    booking_date: date


class WalletSell(BaseModel):
    proceeds_transaction_id: int
    given_amount: Money
    source_transaction_id: int | None = None


class WalletOpening(BaseModel):
    amount: Money
    pln_cost: Money
    booking_date: date


class ReconcileLine(BaseModel):
    amount: Money
    category_key: Text
    description: Text


class WalletReconcile(BaseModel):
    remaining: Money
    booking_date: date
    lines: list[ReconcileLine] = Field(min_length=1, max_length=50)


AssetKind = Literal["account", "savings", "bonds", "investments", "cash", "gold", "debt", "other"]
Rate = Annotated[Decimal, Field(allow_inf_nan=False, gt=0, max_digits=18, decimal_places=6)]
OptionalText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500)]


class AssetCreate(BaseModel):
    name: Text
    kind: AssetKind
    currency: Currency
    institution: OptionalText = None


class AssetUpdate(BaseModel):
    name: Text
    kind: AssetKind
    institution: OptionalText = None
    is_active: bool


class AssetBalance(BaseModel):
    asset_id: int
    amount: Money


class SnapshotEntry(BaseModel):
    day: date
    balances: list[AssetBalance] = Field(max_length=500)
    rates: dict[Currency, Rate] = Field(default_factory=dict)


class ClientError(BaseModel):
    message: Annotated[str, StringConstraints(max_length=2000)]
    stack: Annotated[str, StringConstraints(max_length=8000)] = ""
    component_stack: Annotated[str, StringConstraints(max_length=8000)] = ""
    url: Annotated[str, StringConstraints(max_length=500)] = ""
