import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { translateError } from "../api/errorMessages";

function SearchHistorySkeleton() {
  return (
    <div className="search-history-card">
      <span className="skeleton" style={{ width: 140, height: 18 }} />
      <span className="skeleton" style={{ width: 100, height: 13, marginTop: 6 }} />
    </div>
  );
}

function buildSearchParams(entry) {
  const params = new URLSearchParams({
    origin: entry.origin,
    destination: entry.destination,
    depart: entry.depart_date,
    adults: String(entry.adults),
    direct: "true",
  });
  if (entry.return_date) params.set("return", entry.return_date);
  return params.toString();
}

function SearchHistoryRow({ entry, onToggleFavorite, onDelete }) {
  const navigate = useNavigate();

  return (
    <div
      className="search-history-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/results?${buildSearchParams(entry)}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/results?${buildSearchParams(entry)}`);
      }}
    >
      <div className="search-history-route">
        <p className="search-history-route-text">
          {entry.origin} <span aria-hidden="true">→</span> {entry.destination}
        </p>
        <p className="hint-text">
          {entry.depart_date}
          {entry.return_date ? ` · 귀국 ${entry.return_date}` : ""} · 성인 {entry.adults}명
        </p>
      </div>
      <div className="search-history-actions">
        <button
          type="button"
          className={"favorite-star-btn" + (entry.is_favorite ? " favorite-star-active" : "")}
          aria-pressed={entry.is_favorite}
          aria-label={entry.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(entry);
          }}
        >
          {entry.is_favorite ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="search-history-delete-btn"
          aria-label="기록 삭제"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function SearchHistoryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("favorites"); // "favorites" | "recent"

  const load = useCallback(() => {
    api
      .mySearchHistory()
      .then(setData)
      .catch((err) => setError(translateError(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data && data.favorites.length === 0 && data.recent.length > 0) {
      setTab("recent");
    }
  }, [data]);

  async function handleToggleFavorite(entry) {
    const next = !entry.is_favorite;
    try {
      await api.setSearchFavorite(entry.id, next);
      load();
    } catch (err) {
      setError(translateError(err));
    }
  }

  async function handleDelete(entry) {
    try {
      await api.deleteSearchHistory(entry.id);
      load();
    } catch (err) {
      setError(translateError(err));
    }
  }

  const isEmpty = data && data.favorites.length === 0 && data.recent.length === 0;
  const activeList = data && (tab === "favorites" ? data.favorites : data.recent);

  return (
    <div className="page">
      <section className="route-hero">
        <p className="route-hero-title">검색 기록</p>
        <p className="route-hero-meta">즐겨찾기한 노선과 최근 검색한 노선을 모아봤어요.</p>
      </section>

      {error && <p className="error-text">{error}</p>}

      {!data && !error && (
        <>
          <SearchHistorySkeleton />
          <SearchHistorySkeleton />
        </>
      )}

      {isEmpty && (
        <div className="empty-state">
          <p>아직 검색 기록이 없습니다.</p>
          <Link to="/" className="primary-btn">
            항공편 검색하러 가기
          </Link>
        </div>
      )}

      {data && !isEmpty && (
        <>
          <div className="trip-type-toggle search-history-tabs" role="group" aria-label="검색 기록 탭">
            <button
              type="button"
              className={tab === "favorites" ? "trip-type-btn active" : "trip-type-btn"}
              onClick={() => setTab("favorites")}
            >
              즐겨찾기 ({data.favorites.length})
            </button>
            <button
              type="button"
              className={tab === "recent" ? "trip-type-btn active" : "trip-type-btn"}
              onClick={() => setTab("recent")}
            >
              최근 검색 ({data.recent.length})
            </button>
          </div>

          <section className="flight-list">
            {activeList.length === 0 ? (
              <p className="hint-text">
                {tab === "favorites"
                  ? "아직 즐겨찾기한 검색이 없습니다. ☆ 버튼으로 추가해보세요."
                  : "최근 검색한 노선이 없습니다."}
              </p>
            ) : (
              activeList.map((entry) => (
                <SearchHistoryRow
                  key={entry.id}
                  entry={entry}
                  onToggleFavorite={handleToggleFavorite}
                  onDelete={handleDelete}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
