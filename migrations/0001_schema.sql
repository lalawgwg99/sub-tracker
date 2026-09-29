-- 訂閱管家 schema v1
-- 注意：正式環境由 functions/api 的 ensureSchema() 自動建表，
-- 此檔供本機/手動建表與文件對照用。
CREATE TABLE IF NOT EXISTS subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TWD',
  cycle TEXT NOT NULL DEFAULT 'monthly',
  cycle_days INTEGER,
  first_billing TEXT NOT NULL,
  pay_method TEXT DEFAULT '',
  category TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  trial_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subs(status);
