-- Flyfast 예약 도메인 스키마
-- 출처: Flyfast_프로젝트_명세서.md 4.1(ERD) / 4.2(제약조건 및 인덱스)
-- 대상: mysql-a (172.16.30.10) flyfast 스키마, ORM 미사용 (Native SQL)
-- 적용: mysql -u flyfast_app -p flyfast < schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE flights (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flight_no   VARCHAR(10)  NOT NULL,
  origin      VARCHAR(10)  NOT NULL,
  destination VARCHAR(10)  NOT NULL,
  UNIQUE KEY uq_flights_flight_no (flight_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(100) NOT NULL,
  password_hash VARCHAR(60)  NOT NULL,
  name          VARCHAR(50)  NOT NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE flight_schedules (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flight_id  BIGINT UNSIGNED NOT NULL,
  depart_at  DATETIME NOT NULL,
  arrival_at DATETIME NOT NULL,
  KEY idx_schedules_flight_depart (flight_id, depart_at),
  CONSTRAINT fk_schedules_flight FOREIGN KEY (flight_id) REFERENCES flights(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seats (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schedule_id BIGINT UNSIGNED NOT NULL,
  seat_no     VARCHAR(10) NOT NULL,
  seat_class  VARCHAR(10) NOT NULL DEFAULT 'ECONOMY',
  status      VARCHAR(15) NOT NULL DEFAULT 'AVAILABLE',
  UNIQUE KEY uq_seats_schedule_seatno (schedule_id, seat_no),
  CONSTRAINT fk_seats_schedule FOREIGN KEY (schedule_id) REFERENCES flight_schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 운임 — 4.3절 Redis 키 fare:{scheduleId}:{class} 캐시가 읽는 원본 데이터.
-- 실시간 항공사 운임 API 연동은 범위 밖(1.3절)이라, 이 테이블이 그 역할을 대신하는 자체 운임표다.
CREATE TABLE fares (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  schedule_id BIGINT UNSIGNED NOT NULL,
  seat_class  VARCHAR(10) NOT NULL,
  amount      INT NOT NULL,
  UNIQUE KEY uq_fares_schedule_class (schedule_id, seat_class),
  CONSTRAINT fk_fares_schedule FOREIGN KEY (schedule_id) REFERENCES flight_schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bookings (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_no  VARCHAR(20) NOT NULL,
  schedule_id BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  status      VARCHAR(15) NOT NULL DEFAULT 'PENDING',
  UNIQUE KEY uq_bookings_booking_no (booking_no),
  CONSTRAINT fk_bookings_schedule FOREIGN KEY (schedule_id) REFERENCES flight_schedules(id),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE passengers (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  seat_id    BIGINT UNSIGNED NOT NULL,
  name       VARCHAR(30) NOT NULL,
  UNIQUE KEY uq_passengers_seat_id (seat_id),
  CONSTRAINT fk_passengers_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT fk_passengers_seat FOREIGN KEY (seat_id) REFERENCES seats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  amount     INT NOT NULL,
  status     VARCHAR(15) NOT NULL DEFAULT 'PENDING',
  UNIQUE KEY uq_payments_booking_id (booking_id),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 로그인 사용자의 검색 기록/즐겨찾기 저장용 테이블 (migration_002_search_history.sql과 동일)
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

SET FOREIGN_KEY_CHECKS = 1;
