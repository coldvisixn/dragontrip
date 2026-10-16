"""Persist scope and immutable offline import provenance without changing old objects."""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scope_rules",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False
        ),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
    )
    op.create_table(
        "import_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False
        ),
        sa.Column("format", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column(
            "attachment_id",
            sa.String(),
            sa.ForeignKey("attachments.id"),
            nullable=False,
        ),
        sa.Column("created", sa.String()),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.UniqueConstraint("project_id", "sha256", name="uq_import_source"),
    )
    op.create_table(
        "observations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False
        ),
        sa.Column(
            "run_id", sa.String(), sa.ForeignKey("import_runs.id"), nullable=False
        ),
        sa.Column("node_id", sa.String(), sa.ForeignKey("nodes.id"), nullable=False),
        sa.Column("finding_id", sa.String(), sa.ForeignKey("knowledge.id")),
        sa.Column("fingerprint", sa.String(), nullable=False),
        sa.Column("locator", sa.String(), nullable=False),
        sa.Column("data", sa.Text(), nullable=False),
    )
    for table in ("scope_rules", "import_runs", "observations"):
        op.create_index(f"ix_{table}_project_id", table, ["project_id"])
    for field in ("run_id", "node_id"):
        op.create_index(f"ix_observations_{field}", "observations", [field])


def downgrade():
    for table in ("observations", "import_runs", "scope_rules"):
        op.drop_table(table)
