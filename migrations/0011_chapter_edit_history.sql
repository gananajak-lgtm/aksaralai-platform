-- Immutable snapshots of AI-assisted chapter edits for owner-controlled rollback.
CREATE TABLE IF NOT EXISTS chapter_edit_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chapter_id INTEGER NOT NULL REFERENCES chapters(id),
 novel_id INTEGER NOT NULL REFERENCES novels(id),
 writer_id INTEGER NOT NULL REFERENCES users(id),
 before_body TEXT NOT NULL,
 after_body TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapter_edit_history_chapter
 ON chapter_edit_history(chapter_id,created_at DESC,id DESC);
