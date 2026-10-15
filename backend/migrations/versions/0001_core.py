"""Phase 1 schema. Definitions are frozen here, independent of future ORM models."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("projects",
        sa.Column("id",sa.String(),primary_key=True),
        sa.Column("name",sa.String(),nullable=False),
        sa.Column("description",sa.Text()),
        sa.Column("created",sa.String()),sa.Column("updated",sa.String()))
    op.create_table("nodes",
        sa.Column("id",sa.String(),primary_key=True),
        sa.Column("project_id",sa.String(),sa.ForeignKey("projects.id"),nullable=False),
        sa.Column("kind",sa.String(),nullable=False),
        sa.Column("label",sa.String(),nullable=False),
        sa.Column("attrs",sa.Text()),sa.Column("x",sa.Float()),sa.Column("y",sa.Float()))
    op.create_table("edges",
        sa.Column("id",sa.String(),primary_key=True),
        sa.Column("project_id",sa.String(),sa.ForeignKey("projects.id"),nullable=False),
        sa.Column("source",sa.String(),sa.ForeignKey("nodes.id"),nullable=False),
        sa.Column("target",sa.String(),sa.ForeignKey("nodes.id"),nullable=False),
        sa.Column("kind",sa.String()),sa.Column("evidence",sa.String(),nullable=True))
    op.create_table("scans",
        sa.Column("id",sa.String(),primary_key=True),
        sa.Column("project_id",sa.String(),sa.ForeignKey("projects.id"),nullable=False),
        sa.Column("target",sa.String(),nullable=False),
        sa.Column("status",sa.String()),sa.Column("command",sa.Text()),
        sa.Column("started",sa.String()),sa.Column("ended",sa.String(),nullable=True),
        sa.Column("exit_code",sa.String(),nullable=True),
        sa.Column("output",sa.Text()),sa.Column("error",sa.Text()))
    op.create_table("activity",
        sa.Column("id",sa.String(),primary_key=True),
        sa.Column("project_id",sa.String(),sa.ForeignKey("projects.id")),
        sa.Column("message",sa.String()),sa.Column("created",sa.String()))
    for table in ("nodes","edges","scans","activity"):
        op.create_index(f"ix_{table}_project_id",table,["project_id"])


def downgrade():
    for table in ("activity","edges","scans","nodes","projects"):
        op.drop_table(table)
