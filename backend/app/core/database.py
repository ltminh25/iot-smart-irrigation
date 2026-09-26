from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings
from passlib.context import CryptContext

engine = create_engine(
    settings.DB_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Nhập models tại đây để SQLAlchemy Base thu thập meta
    from app.models.models import Role, User
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Seed roles
        roles = ["admin", "owner", "viewer"]
        for role_name in roles:
            existing = db.query(Role).filter(Role.name == role_name).first()
            if not existing:
                db.add(Role(name=role_name))
        db.commit()

        # Seed admin user
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if admin_role:
            admin_user = db.query(User).filter(User.username == "admin").first()
            if not admin_user:
                pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                hashed_pw = pwd_context.hash("admin123")
                db.add(User(
                    username="admin", 
                    password_hash=hashed_pw, 
                    email="admin@iot.local", 
                    role_id=admin_role.id
                ))
                db.commit()
    finally:
        db.close()
