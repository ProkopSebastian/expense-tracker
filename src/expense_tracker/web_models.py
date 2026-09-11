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


class Decision(BaseModel):
    category_key: Text
    remember: bool = False


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


class ClientError(BaseModel):
    message: Annotated[str, StringConstraints(max_length=2000)]
    stack: Annotated[str, StringConstraints(max_length=8000)] = ""
    component_stack: Annotated[str, StringConstraints(max_length=8000)] = ""
    url: Annotated[str, StringConstraints(max_length=500)] = ""
