-- 기존에 이미 데이터가 있는 DB에 seat_class/fares를 추가하는 마이그레이션
-- 적용: mysql -u flyfast_app -p flyfast < migration_001_fares.sql

ALTER TABLE seats ADD COLUMN seat_class VARCHAR(10) NOT NULL DEFAULT 'ECONOMY' AFTER seat_no;

CREATE TABLE fares (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schedule_id BIGINT UNSIGNED NOT NULL,
  seat_class  VARCHAR(10) NOT NULL,
  amount      INT NOT NULL,
  UNIQUE KEY uq_fares_schedule_class (schedule_id, seat_class),
  CONSTRAINT fk_fares_schedule FOREIGN KEY (schedule_id) REFERENCES flight_schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기존 좌석: 1번대(1A/1B/1C 등)는 BUSINESS, 나머지는 기본값(ECONOMY) 유지
UPDATE seats SET seat_class = 'BUSINESS' WHERE seat_no LIKE '1%';

-- 기존 스케줄들에 대한 운임표
INSERT INTO fares (schedule_id, seat_class, amount)
SELECT id, 'ECONOMY', 300000 FROM flight_schedules
WHERE id NOT IN (SELECT schedule_id FROM fares WHERE seat_class = 'ECONOMY');

INSERT INTO fares (schedule_id, seat_class, amount)
SELECT id, 'BUSINESS', 800000 FROM flight_schedules
WHERE id NOT IN (SELECT schedule_id FROM fares WHERE seat_class = 'BUSINESS');
