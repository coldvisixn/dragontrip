"""An explicit investigation goal; existing descriptions retain their meaning."""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("goal", sa.Text(), nullable=False, server_default=""))


def downgrade():
    op.drop_column("projects", "goal")
