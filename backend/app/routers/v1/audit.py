from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import require_role
from app.models.models import AuditLog, User
from app.schemas.schemas import AuditLogResponse
from typing import List

router = APIRouter(prefix="/audit-log", tags=["audit-log"])

@router.get("", response_model=List[AuditLogResponse])
def get_audit_logs(db: Session = Depends(get_db), current_user: User = Depends(require_role("admin"))):
    return db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100).all()
