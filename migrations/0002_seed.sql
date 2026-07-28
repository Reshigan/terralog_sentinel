-- Seed data for first-run UI demo.
-- 3 demo readings with placeholder photos, GPS coordinates, and values.

INSERT INTO readings (photo, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id, row_version)
VALUES (
  NULL,
  48.5,
  '2026-03-14T10:00:00Z',
  '{"iv":"aGVsbG9fd29ybGRfdjEyMw==","data":"ZW5jcnlwdGVkX2Jsb2JfZGF0YQ=="}',
  'pending',
  0,
  '5c4e6f32-9dad-51a1-80b4-00c04fd430c8',
  1,
  1,
  1,
  1
);

INSERT INTO readings (photo, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id, row_version)
VALUES (
  NULL,
  52.3,
  '2026-03-14T11:30:00Z',
  '{"iv":"c2Vjb25kX3BsYWNlaG9sZGVyX2l2","data":"c2Vjb25kX2VuY3J5cHRlZF9ibG9i"}',
  'pending',
  0,
  '7a8e9f12-3bc4-52b2-80b4-00c04fd430c8',
  1,
  1,
  1,
  1
);

INSERT INTO readings (photo, numeric_value, timestamp, encrypted_blob, sync_status, sync_attempts, dedupe_id, site_id, device_id, equipment_id, calibration_id, row_version)
VALUES (
  NULL,
  46.8,
  '2026-03-14T14:15:00Z',
  '{"iv":"dGhpcmRfcGxhY2Vob2xkZXJfaXY","data":"dGhpcmRfZW5jcnlwdGVkX2Jsb2I"}',
  'pending',
  0,
  '9b1c2d34-5def-53c3-80b4-00c04fd430c8',
  1,
  1,
  1,
  1
);
