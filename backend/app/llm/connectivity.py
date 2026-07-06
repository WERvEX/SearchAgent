from sqlalchemy.orm import Session

from app.llm.factory import build_chat_model_from_profile


def check_connection(model) -> dict:
    """Send a minimal request to verify the model is reachable/usable.

    Returns {"ok": bool, "error": Optional[str]}. Never raises.
    """
    try:
        model.invoke("ping")
        return {"ok": True, "error": None}
    except Exception as exc:  # noqa: BLE001 - surface any provider error to the user
        return {"ok": False, "error": str(exc)}


def check_profile_connection(session: Session, profile_id: int) -> dict:
    """Build the model for a stored profile and test its connectivity."""
    try:
        model = build_chat_model_from_profile(session, profile_id)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    return check_connection(model)
