"""unique_capacity_source

Revision ID: e24f867ea17b
Revises: bcd1160479c5
Create Date: 2026-11-16 13:45:45.587931
"""
from alembic import op
import sqlalchemy as sa


revision = 'e24f867ea17b'
down_revision = 'bcd1160479c5'
branch_labels = None
depends_on = None

def upgrade():
    # Projected capacity supports multiple budgeted tranches; only physical lot
    # sources are unique. Existing duplicate lots must be reconciled by an operator.
    op.create_index("uq_capacity_source", "capacities", ["organisation_id", "source_id"], unique=True,
        postgresql_where=sa.text("source_type = 'harvested_lot'"), sqlite_where=sa.text("source_type = 'harvested_lot'"))


def downgrade():
    op.drop_index("uq_capacity_source", table_name="capacities")
