from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.llm import connectivity
from app.schemas.settings import LLMProfileCreate, PreferenceValue
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post("/llm-profiles")
def create_llm_profile(payload: LLMProfileCreate, session: Session = Depends(get_db)):
    profile = settings_service.create_llm_profile(
        session,
        name=payload.name,
        provider=payload.provider,
        base_url=payload.base_url,
        model=payload.model,
        api_key=payload.api_key,
        params=payload.params,
        is_default=payload.is_default,
    )
    return next(
        p for p in settings_service.list_llm_profiles(session) if p["id"] == profile.id
    )


@router.get("/llm-profiles")
def list_llm_profiles(session: Session = Depends(get_db)):
    return settings_service.list_llm_profiles(session)


@router.delete("/llm-profiles/{profile_id}", status_code=204)
def delete_llm_profile(profile_id: int, session: Session = Depends(get_db)):
    settings_service.delete_llm_profile(session, profile_id)
    return None


@router.post("/llm-profiles/{profile_id}/test")
def test_llm_profile(profile_id: int, session: Session = Depends(get_db)):
    return connectivity.check_profile_connection(session, profile_id)


@router.put("/preferences/{key}")
def set_preference(
    key: str, payload: PreferenceValue, session: Session = Depends(get_db)
):
    value = payload.model_dump()
    settings_service.set_preference(session, key, value)
    return {"key": key, "value": value}


@router.get("/preferences/{key}")
def get_preference(key: str, session: Session = Depends(get_db)):
    value = settings_service.get_preference(session, key)
    if value is None:
        raise HTTPException(status_code=404, detail="Preference not found")
    return {"key": key, "value": value}
