"""Validated HTTP request contracts, separate from application operations."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Money = Annotated[Decimal, Field(allow_inf_nan=False, max_digits=18, decimal_places=2)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
OptionalText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500)]
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


class WalletOpeningRate(BaseModel):
    pln_cost: Money


class CashCountLine(BaseModel):
    amount: Money
    category_key: Text
    description: OptionalText = None


class CashCount(BaseModel):
    currency: Currency = "PLN"
    counted_on: date
    amount: Money
    start_cost: Money | None = None
    lines: list[CashCountLine] = Field(default_factory=list, max_length=50)


class CashForeignWithdrawal(BaseModel):
    currency: Currency
    amount: Money


class CashExchange(BaseModel):
    exchanged_on: date
    given_currency: Currency
    given_amount: Money
    received_currency: Currency
    received_amount: Money


AssetKind = Literal["account", "savings", "bonds", "investments", "cash", "gold", "debt", "other"]
Rate = Annotated[Decimal, Field(allow_inf_nan=False, gt=0, max_digits=18, decimal_places=6)]


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
