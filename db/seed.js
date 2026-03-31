'use strict';

const kanaData = require('./kana-data');

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      character TEXT NOT NULL,
      romaji    TEXT NOT NULL,
      type      TEXT NOT NULL,
      category  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS progress (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id      INTEGER NOT NULL REFERENCES cards(id),
      bucket       TEXT    NOT NULL DEFAULT 'new',
      interval_days INTEGER NOT NULL DEFAULT 1,
      ease_factor  REAL    NOT NULL DEFAULT 2.5,
      repetitions  INTEGER NOT NULL DEFAULT 0,
      next_review  TEXT,
      last_reviewed TEXT,
      UNIQUE(user_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS daily_activity (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date         TEXT    NOT NULL,
      review_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, date)
    );
  `);

  // Seed cards only if table is empty
  const count = db.prepare('SELECT COUNT(*) as n FROM cards').get();
  if (count.n === 0) {
    const insert = db.prepare(
      'INSERT INTO cards (character, romaji, type, category) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((cards) => {
      for (const c of cards) {
        insert.run(c.character, c.romaji, c.type, c.category);
      }
    });
    insertMany(kanaData);
    console.log(`Seeded ${kanaData.length} kana cards.`);
  }
}

module.exports = { initDb };
