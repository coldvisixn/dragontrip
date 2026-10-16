"""Evidence attachments, persistent graph views and bounded-query indexes."""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "attachments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False
        ),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("created", sa.String()),
    )
    op.create_index("ix_attachments_project_id", "attachments", ["project_id"])
    op.create_table(
        "graph_views",
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), primary_key=True
        ),
        sa.Column("value", sa.Text(), nullable=False),
    )
    for table, columns in [
        ("activity", ["project_id", "created", "id"]),
        ("knowledge", ["project_id", "kind", "updated", "id"]),
        ("scans", ["project_id", "queued_at", "id"]),
        ("nodes", ["project_id", "kind", "id"]),
    ]:
        op.create_index("ix_" + table + "_page", table, columns)


def downgrade():
    for table in ["activity", "knowledge", "scans", "nodes"]:
        op.drop_index("ix_" + table + "_page", table)
    op.drop_table("graph_views")
    op.drop_table("attachments")
