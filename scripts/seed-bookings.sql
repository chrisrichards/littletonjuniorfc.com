-- Local development seed. Never run against the remote database.
-- Dates are relative to the 2026-09 season start so /schedule has something to
-- show; adjust if they drift into the past.
DELETE FROM bookings WHERE source = 'seed';

INSERT INTO bookings
  (pitch, date, start_time, end_time, squad_id, team_label, manager_email, manager_name, booked_by, source)
VALUES
  ('top',     '2026-09-05', '09:30', '11:30', 'u8-hornets',   'Hornets U8',   'mckeown.edward7@gmail.com', 'Eddie McKeown', 'mckeown.edward7@gmail.com', 'seed'),
  ('top',     '2026-09-05', '11:30', '13:30', 'u8-raptors',   'Raptors U8',   'gary.lam@hotmail.co.uk',    'Gary Lam',      'gary.lam@hotmail.co.uk',    'seed'),
  ('middle',  '2026-09-05', '09:30', '11:30', 'u8-sabres',    'Sabres U8',    'jay-adams@hotmail.co.uk',   'Jay Adams',     'jay-adams@hotmail.co.uk',   'seed'),
  ('nursery', '2026-09-06', '10:00', '11:30', 'u6-nursery',   'Nursery U6',   'littletonjuniorfc25@gmail.com', 'Phil Denny', 'littletonjuniorfc25@gmail.com', 'seed'),
  ('bottom',  '2026-09-06', '13:00', '15:00', 'u7-nursery',   'Nursery U7',   'littletonjuniorfc24@gmail.com', 'Ed Green-Wilkinson', 'littletonjuniorfc24@gmail.com', 'seed'),
  ('top',     '2026-09-12', '09:30', '11:30', 'u8-hornets',   'Hornets U8',   'mckeown.edward7@gmail.com', 'Eddie McKeown', 'mckeown.edward7@gmail.com', 'seed');
