"""Phase 2 recon metadata and persisted configuration."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    for name, default in [("tool", "nmap"), ("profile", "quick"), ("options", "{}")]:
        op.add_column(
            "scans", sa.Column(name, sa.Text(), nullable=False, server_default=default)
        )
    op.add_column(
        "scans", sa.Column("queued_at", sa.String(), nullable=False, server_default="")
    )
    op.execute("UPDATE scans SET queued_at = started")
    op.create_table(
        "configuration",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )


def downgrade():
    op.drop_table("configuration")
    for name in ("queued_at", "options", "profile", "tool"):
        op.drop_column("scans", name)
