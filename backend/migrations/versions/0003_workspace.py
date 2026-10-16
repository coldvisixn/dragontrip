"""Project investigation records and encrypted credentials."""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "knowledge",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False
        ),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created", sa.String()),
        sa.Column("updated", sa.String()),
    )
    op.create_index("ix_knowledge_project_id", "knowledge", ["project_id"])
    op.create_table(
        "credentials",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "project_id", sa.String(), sa.ForeignKey("projects.id"), nullable=False
        ),
        sa.Column("ciphertext", sa.Text(), nullable=False),
    )
    op.create_index("ix_credentials_project_id", "credentials", ["project_id"])


def downgrade():
    op.drop_table("credentials")
    op.drop_table("knowledge")
