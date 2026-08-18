"""Tool policy enforcement. Policies are deny-by-default per agent role."""

import hashlib
import json
from dataclasses import dataclass
from urllib.parse import urlparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import ToolApproval, ToolPolicy


@dataclass(frozen=True)
class PolicyDecision:
    action: str  # allow | approval_required | deny
    reason: str
    fingerprint: str


def args_fingerprint(args: dict) -> str:
    canonical = json.dumps(args, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _url_host(args: dict) -> str | None:
    value = args.get("url")
    if not isinstance(value, str):
        return None
    return (urlparse(value).hostname or "").lower() or None


def policy_version(session: Session) -> int:
    return int(session.scalar(func.max(ToolPolicy.version)) or 0)


def list_policies(session: Session) -> list[dict]:
    rows = session.query(ToolPolicy).order_by(ToolPolicy.agent_role, ToolPolicy.tool_name, ToolPolicy.id).all()
    return [{"id": item.id, "version": item.version, "agent_role": item.agent_role, "tool_name": item.tool_name, "allowed_domains": item.allowed_domains_json or [], "require_approval": item.require_approval, "enabled": item.enabled, "created_at": item.created_at.isoformat()} for item in rows]


def create_policy(session: Session, *, agent_role: str, tool_name: str, allowed_domains: list[str] | None = None, require_approval: bool = False, enabled: bool = True) -> dict:
    row = ToolPolicy(version=policy_version(session) + 1, agent_role=agent_role, tool_name=tool_name, allowed_domains_json=sorted({domain.lower().strip() for domain in allowed_domains or [] if domain.strip()}), require_approval=require_approval, enabled=enabled)
    session.add(row)
    session.commit()
    return next(item for item in list_policies(session) if item["id"] == row.id)


def update_policy(session: Session, policy_id: int, **values) -> dict | None:
    row = session.get(ToolPolicy, policy_id)
    if row is None:
        return None
    row.version = policy_version(session) + 1
    for key in ("agent_role", "tool_name", "require_approval", "enabled"):
        if key in values:
            setattr(row, key, values[key])
    if "allowed_domains" in values:
        row.allowed_domains_json = sorted({domain.lower().strip() for domain in values["allowed_domains"] or [] if domain.strip()})
    session.commit()
    return next(item for item in list_policies(session) if item["id"] == row.id)


def delete_policy(session: Session, policy_id: int) -> bool:
    row = session.get(ToolPolicy, policy_id)
    if row is None:
        return False
    session.delete(row)
    session.commit()
    return True


def visible_tool_names(session: Session, agent_role: str, names: list[str]) -> set[str]:
    policies = session.query(ToolPolicy).filter(ToolPolicy.agent_role == agent_role, ToolPolicy.enabled.is_(True)).all()
    allowed = {policy.tool_name for policy in policies}
    return set(names).intersection(allowed)


def decide(session: Session, *, project_id: int, trace_id: str, agent_role: str, tool_name: str, args: dict) -> PolicyDecision:
    fingerprint = args_fingerprint(args)
    policy = session.query(ToolPolicy).filter(ToolPolicy.agent_role == agent_role, ToolPolicy.tool_name == tool_name, ToolPolicy.enabled.is_(True)).order_by(ToolPolicy.id.desc()).first()
    if policy is None:
        # A missing rule never grants execution, but can be explicitly approved for this run.
        return PolicyDecision("approval_required", "No policy allows this tool; approval is required for this task.", fingerprint)
    host = _url_host(args)
    domains = policy.allowed_domains_json or []
    if domains and host and not any(host == domain or host.endswith(f".{domain}") for domain in domains):
        return PolicyDecision("deny", "The requested URL domain is not allowed by the policy.", fingerprint)
    if policy.require_approval:
        approval = session.query(ToolApproval).filter(ToolApproval.project_id == project_id, ToolApproval.trace_id == trace_id, ToolApproval.agent_role == agent_role, ToolApproval.tool_name == tool_name, ToolApproval.args_fingerprint == fingerprint, ToolApproval.decision == "approved").first()
        if approval is None:
            return PolicyDecision("approval_required", "This policy requires approval for the current task.", fingerprint)
    return PolicyDecision("allow", "Allowed by policy.", fingerprint)


def record_approval(session: Session, *, project_id: int, trace_id: str, agent_role: str, tool_name: str, args_fingerprint: str, approved: bool) -> None:
    session.add(ToolApproval(project_id=project_id, trace_id=trace_id, agent_role=agent_role, tool_name=tool_name, args_fingerprint=args_fingerprint, decision="approved" if approved else "denied"))
    session.commit()


def ensure_default_policies(session: Session) -> None:
    """Install conservative built-in read-only rules once for existing projects."""
    existing = {(item.agent_role, item.tool_name) for item in session.query(ToolPolicy).all()}
    for role, tool_name in (("retriever", "fetch_page"), ("retriever", "search_web"), ("verifier", "fetch_page")):
        if (role, tool_name) not in existing:
            session.add(ToolPolicy(version=1, agent_role=role, tool_name=tool_name, allowed_domains_json=[], require_approval=False, enabled=True))
    session.commit()
