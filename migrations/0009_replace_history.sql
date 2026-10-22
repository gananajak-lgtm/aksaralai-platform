-- Auditable snapshots for exact whole-novel replacements and conflict-safe undo.
CREATE TABLE IF NOT EXISTS novel_replace_history (
 id TEXT PRIMARY KEY,
 novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
 find_text TEXT NOT NULL,
 replacement_text TEXT NOT NULL,
 affected_count INTEGER NOT NULL,
 chapter_count INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 undone_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_novel_replace_history ON novel_replace_history(novel_id,id DESC);
CREATE TABLE IF NOT EXISTS novel_replace_history_chapters (
 history_id TEXT NOT NULL REFERENCES novel_replace_history(id) ON DELETE CASCADE,
 chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
 before_body TEXT NOT NULL,
 after_body TEXT NOT NULL,
 occurrences INTEGER NOT NULL,
 PRIMARY KEY(history_id,chapter_id)
);
