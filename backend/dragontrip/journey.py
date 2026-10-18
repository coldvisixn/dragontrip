"""A small read model for the next user decision, not an execution engine."""
from sqlalchemy import select
from .db import ScopeRule


def journey(db, project, objects, tasks, records):
    included = list(db.scalars(select(ScopeRule.value).where(
        ScopeRule.project_id == project.id, ScopeRule.mode == "include"
    ).order_by(ScopeRule.value)))
    if not project.goal.strip():
        step = ("goal", "Project overview", "Set the investigation goal", "Describe the question this project should answer.")
    elif not included:
        step = ("scope", "Targets & scope", "Define target scope", "Record included and excluded targets before planning network activity.")
    elif not sum(objects.values()):
        step = ("collect", "Import results", "Import existing results", "Bring existing evidence, or review a live discovery plan.")
    elif sum(tasks.get(state, 0) for state in ("todo", "open", "in_progress", "blocked")):
        step = ("check", "Task board", "Continue planned checks", "Record each outcome and return to its source evidence.")
    else:
        page = "Web applications" if objects.get("application") else "Hosts"
        step = ("research", page, "Explore observations", "Select an object, inspect its source and create a linked hypothesis or check.")
    return {"stage": step[0], "page": step[1], "label": step[2], "reason": step[3],
            "included_targets": included, "has_records": bool(sum(records.values()))}
