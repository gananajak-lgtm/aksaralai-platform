CREATE TABLE IF NOT EXISTS novel_characters (
 id INTEGER PRIMARY KEY,
 novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT '',
 biography TEXT NOT NULL DEFAULT '',
 position INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_novel_characters_novel ON novel_characters(novel_id,position,id);
