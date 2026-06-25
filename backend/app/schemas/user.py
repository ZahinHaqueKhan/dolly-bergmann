from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

UserRole = Literal["customer", "wholesale", "admin"]


# Password rule per PLAN 2.1: >= 8 chars with upper, lower, digit
_PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$")


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(
                "password must be at least 8 characters and contain "
                "at least one uppercase letter, one lowercase letter, "
                "and one digit"
            )
        return v

    @field_validator("first_name", "last_name")
    @classmethod
    def _trim_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class UserRead(BaseModel):
    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None
    role: UserRole = "customer"
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    # Use plain str rather than EmailStr so test/dev mailboxes like
    # `admin@modestwear.test` (RFC 6761 reserved TLD) are accepted at
    # the wire. We still normalize (lower) before querying the DB.
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=1)


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token lifetime in seconds


class TokenData(BaseModel):
    user_id: int | None = None
    role: UserRole = "customer"
    token_type: Literal["access", "refresh"] = "access"
