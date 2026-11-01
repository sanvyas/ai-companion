from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect

from lab import db
from lab.config import load_settings
from lab.models import Base


def test_models_match_migrations(env):
    """Fails when someone changes models.py without adding a migration."""
    db.init_db(load_settings())
    try:
        with db.get_engine().connect() as conn:
            diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
        assert diff == [], diff
    finally:
        db.dispose_db()


def test_migration_is_idempotent(env):
    settings = load_settings()
    db.init_db(settings)
    db.dispose_db()
    db.init_db(settings)  # second boot must be a no-op
    try:
        assert {"prompts", "conversations", "eval_results", "alembic_version"} <= set(inspect(db.get_engine()).get_table_names())
    finally:
        db.dispose_db()


def test_upgrade_keeps_existing_rows(env):
    """0001 -> 0002 on a database that already holds conversations (NOT NULL columns need defaults)."""
    from alembic import command
    from sqlalchemy import text

    settings = load_settings()
    engine = db.make_engine(settings.database_url)
    cfg = db._alembic_config(settings.database_url)
    cfg.attributes["connection"] = engine
    command.upgrade(cfg, "0001")
    with engine.begin() as c:
        c.execute(text("INSERT INTO conversations (id, source, status, title, mood, prompt_label, rendered_prompt, variables, scenario_snapshot, evalset_snapshot, gen_config, provider, model, attempts, generated, verdict_reason, created_at) "
                       "VALUES ('old1','simulated','completed','old','sad','p v1','x','{}','{}','{}','{}','','',0,true,'',CURRENT_TIMESTAMP)"))
    command.upgrade(cfg, "head")
    with engine.connect() as c:
        row = c.execute(text("SELECT client, user_ref, environment, api_key_id FROM conversations WHERE id='old1'")).one()
    assert tuple(row) == ("", "", "", None)
    command.downgrade(cfg, "0001")  # and back, without error
    engine.dispose()
