"""Add optional unique mobile identifiers without changing legacy credentials."""
from alembic import op
import sqlalchemy as sa

revision = "f350c7b19d02"
down_revision = "e24f867ea17b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("password_credentials", sa.Column("mobile_number", sa.String(16), nullable=True))
    op.create_index("uq_password_mobile", "password_credentials", ["mobile_number"], unique=True)


def downgrade():
    op.drop_index("uq_password_mobile", table_name="password_credentials")
    op.drop_column("password_credentials", "mobile_number")
