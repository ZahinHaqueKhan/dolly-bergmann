"""PLAN 7.3 — Audit logging helpers.

Admin write actions call `record_audit(...)` to write a row. The
optional middleware in `main.py` can also capture auth context
(remote IP, User-Agent) automatically.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    admin_user_id: int,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: dict | None = None,
    ip: str | None = None,
    ua: str | None = None,
    method: str | None = None,
    path: str | None = None,
) -> AuditLog:
    """Persist one audit-log row. Caller is responsible for
    committing the session (or letting the request finish do it).
    """
    row = AuditLog(
        admin_user_id=admin_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip=ip,
        ua=ua,
        method=method,
        path=path,
    )
    db.add(row)
    return row
