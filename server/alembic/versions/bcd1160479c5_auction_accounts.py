"""auction_accounts

Revision ID: bcd1160479c5
Revises: 0001_shared_services
Create Date: 2026-11-16 13:39:31.754670
"""
from alembic import op
import sqlalchemy as sa


revision = 'bcd1160479c5'
down_revision = '0001_shared_services'
branch_labels = None
depends_on = None

def upgrade():
    # Preserve existing shared-service data; reject duplicated source capacities.
    op.create_table('auth_throttles',
    sa.Column('key', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('resets_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    op.create_table('password_credentials',
    sa.Column('username', sa.String(length=80), nullable=False),
    sa.Column('user_id', sa.String(length=80), nullable=False),
    sa.Column('password_hash', sa.String(length=300), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('username'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('auctions',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('organisation_id', sa.String(length=80), nullable=False),
    sa.Column('created_by', sa.String(length=80), nullable=False),
    sa.Column('mode', sa.String(length=20), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('crop', sa.String(length=120), nullable=False),
    sa.Column('variety', sa.String(length=120), nullable=False),
    sa.Column('grade', sa.String(length=80), nullable=False),
    sa.Column('week_start', sa.String(length=10), nullable=False),
    sa.Column('week_end', sa.String(length=10), nullable=False),
    sa.Column('quantity_g', sa.Integer(), nullable=False),
    sa.Column('capacity_id', sa.String(length=80), nullable=True),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('limit_price', sa.Integer(), nullable=False),
    sa.Column('increment', sa.Integer(), nullable=False),
    sa.Column('opens_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('closes_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('original_closes_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('extension_window_s', sa.Integer(), nullable=False),
    sa.Column('extension_s', sa.Integer(), nullable=False),
    sa.Column('extension_cap_s', sa.Integer(), nullable=False),
    sa.Column('confirmation_hours', sa.Integer(), nullable=False),
    sa.Column('terms', sa.JSON(), nullable=False),
    sa.Column('eligible_org_ids', sa.JSON(), nullable=False),
    sa.Column('rule_version', sa.String(length=40), nullable=False),
    sa.Column('bid_count', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('quantity_g > 0 AND limit_price > 0 AND increment > 0', name='ck_auction_amounts'),
    sa.ForeignKeyConstraint(['capacity_id'], ['capacities.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_auction_deadline', 'auctions', ['status', 'closes_at'], unique=False)
    op.create_table('auction_bids',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('auction_id', sa.String(length=80), nullable=False),
    sa.Column('organisation_id', sa.String(length=80), nullable=False),
    sa.Column('user_id', sa.String(length=80), nullable=False),
    sa.Column('capacity_id', sa.String(length=80), nullable=True),
    sa.Column('price', sa.Integer(), nullable=False),
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('price > 0', name='ck_bid_positive'),
    sa.ForeignKeyConstraint(['auction_id'], ['auctions.id'], ),
    sa.ForeignKeyConstraint(['capacity_id'], ['capacities.id'], ),
    sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('auction_id', 'sequence')
    )
    op.create_index(op.f('ix_auction_bids_auction_id'), 'auction_bids', ['auction_id'], unique=False)
    op.create_table('auction_holds',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('auction_id', sa.String(length=80), nullable=False),
    sa.Column('organisation_id', sa.String(length=80), nullable=False),
    sa.Column('capacity_id', sa.String(length=80), nullable=False),
    sa.Column('quantity_g', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.ForeignKeyConstraint(['auction_id'], ['auctions.id'], ),
    sa.ForeignKeyConstraint(['capacity_id'], ['capacities.id'], ),
    sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('auction_id', 'organisation_id')
    )
    op.create_index(op.f('ix_auction_holds_auction_id'), 'auction_holds', ['auction_id'], unique=False)
    op.create_table('auction_awards',
    sa.Column('id', sa.String(length=80), nullable=False),
    sa.Column('auction_id', sa.String(length=80), nullable=False),
    sa.Column('bid_id', sa.String(length=80), nullable=False),
    sa.Column('buyer_org_id', sa.String(length=80), nullable=False),
    sa.Column('seller_org_id', sa.String(length=80), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('buyer_confirmed', sa.Boolean(), nullable=False),
    sa.Column('seller_confirmed', sa.Boolean(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['auction_id'], ['auctions.id'], ),
    sa.ForeignKeyConstraint(['bid_id'], ['auction_bids.id'], ),
    sa.ForeignKeyConstraint(['buyer_org_id'], ['organisations.id'], ),
    sa.ForeignKeyConstraint(['seller_org_id'], ['organisations.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('auction_id')
    )

def downgrade():
    op.drop_table('auction_awards')
    op.drop_index(op.f('ix_auction_holds_auction_id'), table_name='auction_holds')
    op.drop_table('auction_holds')
    op.drop_index(op.f('ix_auction_bids_auction_id'), table_name='auction_bids')
    op.drop_table('auction_bids')
    op.drop_index('ix_auction_deadline', table_name='auctions')
    op.drop_table('auctions')
    op.drop_table('password_credentials')
    op.drop_table('auth_throttles')
