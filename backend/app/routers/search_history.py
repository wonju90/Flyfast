from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.db import engine
from app.deps import get_current_user_id

router = APIRouter(prefix="/api/v1", tags=["search-history"])

_RECENT_LIMIT = 10

_LIST_SQL = text(
    """
    SELECT id, origin, destination, depart_date, return_date, adults, is_favorite, updated_at
    FROM search_history
    WHERE user_id = :user_id AND is_favorite = :is_favorite
    ORDER BY updated_at DESC
    LIMIT :limit
    """
)


class FavoriteRequest(BaseModel):
    is_favorite: bool


def _not_found():
    return HTTPException(status_code=404, detail={"error": "NOT_FOUND", "message": "search history not found"})


def _forbidden():
    return HTTPException(
        status_code=403, detail={"error": "FORBIDDEN", "message": "this search history does not belong to the current user"}
    )


def _serialize(row):
    return {
        "id": row["id"],
        "origin": row["origin"],
        "destination": row["destination"],
        "depart_date": row["depart_date"].isoformat(),
        "return_date": row["return_date"].isoformat() if row["return_date"] else None,
        "adults": row["adults"],
        "is_favorite": bool(row["is_favorite"]),
        "updated_at": row["updated_at"].isoformat(),
    }


@router.get("/search-history/me")
def list_my_search_history(current_user_id: int = Depends(get_current_user_id)):
    with engine.connect() as conn:
        favorites = conn.execute(
            _LIST_SQL, {"user_id": current_user_id, "is_favorite": True, "limit": 50}
        ).mappings().all()
        recent = conn.execute(
            _LIST_SQL, {"user_id": current_user_id, "is_favorite": False, "limit": _RECENT_LIMIT}
        ).mappings().all()

    return {
        "favorites": [_serialize(r) for r in favorites],
        "recent": [_serialize(r) for r in recent],
    }


@router.patch("/search-history/{history_id}/favorite")
def set_search_favorite(
    history_id: int,
    body: FavoriteRequest,
    current_user_id: int = Depends(get_current_user_id),
):
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT user_id FROM search_history WHERE id = :id"), {"id": history_id}
        ).mappings().first()
        if row is None:
            raise _not_found()
        if row["user_id"] != current_user_id:
            raise _forbidden()

        conn.execute(
            text("UPDATE search_history SET is_favorite = :is_favorite WHERE id = :id"),
            {"is_favorite": body.is_favorite, "id": history_id},
        )

    return {"id": history_id, "is_favorite": body.is_favorite}


@router.delete("/search-history/{history_id}")
def delete_search_history(history_id: int, current_user_id: int = Depends(get_current_user_id)):
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT user_id FROM search_history WHERE id = :id"), {"id": history_id}
        ).mappings().first()
        if row is None:
            raise _not_found()
        if row["user_id"] != current_user_id:
            raise _forbidden()

        conn.execute(text("DELETE FROM search_history WHERE id = :id"), {"id": history_id})

    return {"id": history_id, "deleted": True}
