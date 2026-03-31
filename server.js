'use strict';

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const Database = require('better-sqlite3');
const { initDb } = require('./db/seed');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'kana.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initDb(db);

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function calcNextReview(prog, result) {
  let { interval_days, ease_factor, repetitions } = prog;

  if (result === 'correct') {
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    ease_factor    = Math.min(3.0, +(ease_factor + 0.1).toFixed(2));
    repetitions   += 1;
    const bucket   = repetitions >= 3 ? 'learned' : 'learning';
    return { interval_days, ease_factor, repetitions, bucket,
             next_review: addDays(today(), interval_days) };
  } else {
    return {
      interval_days : 1,
      ease_factor   : Math.max(1.3, +(ease_factor - 0.2).toFixed(2)),
      repetitions   : 0,
      bucket        : 'review',
      next_review   : addDays(today(), 1),
    };
  }
}

function typeFilter(type) {
  if (type === 'hiragana' || type === 'katakana') return `AND c.type = '${type}'`;
  return '';
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

app.get('/api/users', (_req, res) => {
  const users = db.prepare('SELECT id, name, created_at FROM users ORDER BY name').all();
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const info = db.prepare('INSERT INTO users (name) VALUES (?)').run(name);
    res.status(201).json({ id: info.lastInsertRowid, name });
  } catch {
    res.status(409).json({ error: 'Name already taken' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/users/:id/progress', (req, res) => {
  const { type } = req.query; // 'hiragana' | 'katakana' | omit for all
  if (type === 'hiragana' || type === 'katakana') {
    db.prepare(`
      DELETE FROM progress WHERE user_id = ?
      AND card_id IN (SELECT id FROM cards WHERE type = ?)
    `).run(req.params.id, type);
  } else {
    db.prepare('DELETE FROM progress      WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM daily_activity WHERE user_id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Cards (for browse view)
// ---------------------------------------------------------------------------

app.get('/api/cards', (req, res) => {
  const { type, user_id } = req.query;
  const tf = type ? `WHERE c.type = '${type}'` : '';

  let rows;
  if (user_id) {
    rows = db.prepare(`
      SELECT c.id, c.character, c.romaji, c.type, c.category,
             COALESCE(p.bucket, 'new') as bucket,
             p.next_review, p.repetitions
      FROM cards c
      LEFT JOIN progress p ON p.card_id = c.id AND p.user_id = ?
      ${tf}
      ORDER BY c.type, c.category, c.id
    `).all(user_id);
  } else {
    rows = db.prepare(`
      SELECT id, character, romaji, type, category
      FROM cards c ${tf}
      ORDER BY type, category, id
    `).all();
  }
  res.json(rows);
});

// ---------------------------------------------------------------------------
// Session (cards due for review)
// ---------------------------------------------------------------------------

app.get('/api/users/:id/session', (req, res) => {
  const userId  = parseInt(req.params.id, 10);
  const type    = req.query.type || 'both';
  const tf      = typeFilter(type);
  const t       = today();
  const NEW_CAP = 10;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // 1. Overdue review cards
  const reviewCards = db.prepare(`
    SELECT c.id, c.character, c.romaji, c.type, c.category,
           p.bucket, p.interval_days, p.ease_factor, p.repetitions, p.next_review
    FROM cards c JOIN progress p ON p.card_id = c.id
    WHERE p.user_id = ? AND p.bucket = 'review'
      AND (p.next_review IS NULL OR p.next_review <= ?)
      ${tf}
    ORDER BY p.next_review ASC
    LIMIT 30
  `).all(userId, t);

  // 2. Due learning cards
  const learningCards = db.prepare(`
    SELECT c.id, c.character, c.romaji, c.type, c.category,
           p.bucket, p.interval_days, p.ease_factor, p.repetitions, p.next_review
    FROM cards c JOIN progress p ON p.card_id = c.id
    WHERE p.user_id = ? AND p.bucket = 'learning' AND p.next_review <= ?
      ${tf}
    ORDER BY p.next_review ASC
    LIMIT 30
  `).all(userId, t);

  // 3. New cards (no progress row yet)
  const newCards = db.prepare(`
    SELECT c.id, c.character, c.romaji, c.type, c.category,
           'new' as bucket, 1 as interval_days, 2.5 as ease_factor,
           0 as repetitions, NULL as next_review
    FROM cards c
    WHERE NOT EXISTS (
      SELECT 1 FROM progress p WHERE p.card_id = c.id AND p.user_id = ?
    )
    ${tf}
    ORDER BY c.id
    LIMIT ?
  `).all(userId, NEW_CAP);

  // 4. Due learned cards
  const learnedCards = db.prepare(`
    SELECT c.id, c.character, c.romaji, c.type, c.category,
           p.bucket, p.interval_days, p.ease_factor, p.repetitions, p.next_review
    FROM cards c JOIN progress p ON p.card_id = c.id
    WHERE p.user_id = ? AND p.bucket = 'learned' AND p.next_review <= ?
      ${tf}
    ORDER BY p.next_review ASC
    LIMIT 20
  `).all(userId, t);

  const cards = [...reviewCards, ...learningCards, ...newCards, ...learnedCards];

  // Count total due (excluding new cap)
  const totalDue = db.prepare(`
    SELECT COUNT(*) as n FROM progress p
    JOIN cards c ON c.id = p.card_id
    WHERE p.user_id = ? AND p.bucket IN ('review','learning','learned')
      AND p.next_review <= ? ${tf}
  `).get(userId, t).n;

  res.json({ cards, total_due: totalDue });
});

// ---------------------------------------------------------------------------
// Submit a review
// ---------------------------------------------------------------------------

app.post('/api/users/:id/review', (req, res) => {
  const userId  = parseInt(req.params.id, 10);
  const { card_id, result } = req.body;

  if (!card_id || !['correct', 'wrong'].includes(result)) {
    return res.status(400).json({ error: 'card_id and result (correct|wrong) required' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Get existing progress or defaults
  const existing = db.prepare(
    'SELECT * FROM progress WHERE user_id = ? AND card_id = ?'
  ).get(userId, card_id) || { interval_days: 1, ease_factor: 2.5, repetitions: 0, bucket: 'new' };

  const updated = calcNextReview(existing, result);
  const t = today();

  db.prepare(`
    INSERT INTO progress (user_id, card_id, bucket, interval_days, ease_factor, repetitions, next_review, last_reviewed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, card_id) DO UPDATE SET
      bucket        = excluded.bucket,
      interval_days = excluded.interval_days,
      ease_factor   = excluded.ease_factor,
      repetitions   = excluded.repetitions,
      next_review   = excluded.next_review,
      last_reviewed = excluded.last_reviewed
  `).run(userId, card_id, updated.bucket, updated.interval_days,
         updated.ease_factor, updated.repetitions, updated.next_review, t);

  // Track daily activity for streak
  db.prepare(`
    INSERT INTO daily_activity (user_id, date, review_count)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, date) DO UPDATE SET review_count = review_count + 1
  `).run(userId, t);

  res.json({ ...updated });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

app.get('/api/users/:id/stats', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const type   = req.query.type || 'both';
  const tf     = typeFilter(type);
  const t      = today();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Total cards of this type
  const totalCards = db.prepare(`
    SELECT COUNT(*) as n FROM cards c WHERE 1=1 ${tf}
  `).get().n;

  // Bucket counts for cards with progress
  const buckets = db.prepare(`
    SELECT p.bucket, COUNT(*) as n
    FROM progress p JOIN cards c ON c.id = p.card_id
    WHERE p.user_id = ? ${tf}
    GROUP BY p.bucket
  `).all(userId).reduce((acc, r) => { acc[r.bucket] = r.n; return acc; }, {});

  buckets.new      = totalCards - (buckets.learning || 0) - (buckets.learned || 0) - (buckets.review || 0);
  buckets.learning = buckets.learning || 0;
  buckets.learned  = buckets.learned  || 0;
  buckets.review   = buckets.review   || 0;

  // Due today
  const dueToday = db.prepare(`
    SELECT COUNT(*) as n FROM progress p JOIN cards c ON c.id = p.card_id
    WHERE p.user_id = ? AND p.next_review <= ? ${tf}
  `).get(userId, t).n;

  // Streak: count consecutive days from today backwards with review_count > 0
  const activity = db.prepare(`
    SELECT date FROM daily_activity WHERE user_id = ? ORDER BY date DESC
  `).all(userId).map(r => r.date);

  let streak = 0;
  let check = t;
  for (const date of activity) {
    if (date === check) {
      streak++;
      const d = new Date(check);
      d.setDate(d.getDate() - 1);
      check = d.toISOString().split('T')[0];
    } else if (date < check) {
      break;
    }
  }

  res.json({ buckets, total_cards: totalCards, due_today: dueToday, streak });
});

// ---------------------------------------------------------------------------
// SPA fallback
// ---------------------------------------------------------------------------

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kana Flash running on http://0.0.0.0:${PORT}`);
});
