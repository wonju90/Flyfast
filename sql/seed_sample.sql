-- 로컬 개발/API 테스트용 샘플 데이터 (ICN<->NRT 왕복)
-- 적용: mysql -u flyfast_app -p flyfast < seed_sample.sql

INSERT INTO flights (flight_no, origin, destination) VALUES ('KE001', 'ICN', 'NRT');
SET @flight_out = LAST_INSERT_ID();

INSERT INTO flight_schedules (flight_id, depart_at, arrival_at) VALUES
  (@flight_out, '2026-09-04 09:00:00', '2026-09-04 11:30:00');
SET @schedule_out1 = LAST_INSERT_ID();

INSERT INTO flight_schedules (flight_id, depart_at, arrival_at) VALUES
  (@flight_out, '2026-09-04 15:00:00', '2026-09-04 17:30:00');
SET @schedule_out2 = LAST_INSERT_ID();

INSERT INTO seats (schedule_id, seat_no, seat_class, status) VALUES
  (@schedule_out1, '1A', 'BUSINESS', 'AVAILABLE'),
  (@schedule_out1, '1B', 'BUSINESS', 'AVAILABLE'),
  (@schedule_out1, '1C', 'BUSINESS', 'SOLD'),
  (@schedule_out2, '1A', 'BUSINESS', 'AVAILABLE'),
  (@schedule_out2, '1B', 'BUSINESS', 'SOLD');

INSERT INTO fares (schedule_id, seat_class, amount) VALUES
  (@schedule_out1, 'ECONOMY', 320000), (@schedule_out1, 'BUSINESS', 850000),
  (@schedule_out2, 'ECONOMY', 350000), (@schedule_out2, 'BUSINESS', 900000);

INSERT INTO flights (flight_no, origin, destination) VALUES ('KE002', 'NRT', 'ICN');
SET @flight_in = LAST_INSERT_ID();

INSERT INTO flight_schedules (flight_id, depart_at, arrival_at) VALUES
  (@flight_in, '2026-09-08 12:00:00', '2026-09-08 14:30:00');
SET @schedule_in1 = LAST_INSERT_ID();

INSERT INTO seats (schedule_id, seat_no, seat_class, status) VALUES
  (@schedule_in1, '1A', 'BUSINESS', 'AVAILABLE'),
  (@schedule_in1, '1B', 'BUSINESS', 'AVAILABLE');

INSERT INTO fares (schedule_id, seat_class, amount) VALUES
  (@schedule_in1, 'ECONOMY', 300000), (@schedule_in1, 'BUSINESS', 780000);

-- 넉넉한 좌석의 여유 스케줄 (수동/브라우저 테스트로 소진되는 위 데이터와 별개로 항상 좌석이 남아있게)
INSERT INTO flight_schedules (flight_id, depart_at, arrival_at) VALUES
  (@flight_out, '2026-09-04 20:00:00', '2026-09-04 22:30:00');
SET @schedule_out3 = LAST_INSERT_ID();

INSERT INTO seats (schedule_id, seat_no, seat_class, status) VALUES
  (@schedule_out3, '1A', 'BUSINESS', 'AVAILABLE'),
  (@schedule_out3, '1B', 'BUSINESS', 'AVAILABLE'),
  (@schedule_out3, '1C', 'BUSINESS', 'AVAILABLE'),
  (@schedule_out3, '2A', 'ECONOMY', 'AVAILABLE'),
  (@schedule_out3, '2B', 'ECONOMY', 'AVAILABLE'),
  (@schedule_out3, '2C', 'ECONOMY', 'AVAILABLE');

INSERT INTO fares (schedule_id, seat_class, amount) VALUES
  (@schedule_out3, 'ECONOMY', 280000), (@schedule_out3, 'BUSINESS', 750000);
