-- 로그인 사용자의 검색 기록/즐겨찾기 저장용 테이블
-- 적용: mysql -u flyfast_app -p flyfast < migration_002_search_history.sql

CREATE TABLE search_history (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  origin       VARCHAR(10) NOT NULL,
  destination  VARCHAR(10) NOT NULL,
  depart_date  DATE NOT NULL,
  return_date  DATE NULL,
  adults       INT NOT NULL DEFAULT 1,
  is_favorite  TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_search_history_lookup (user_id, origin, destination, depart_date, return_date, adults),
  KEY idx_search_history_list (user_id, is_favorite, updated_at),
  CONSTRAINT fk_search_history_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
