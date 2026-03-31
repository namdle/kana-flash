/* ============================================================
   Kana Flash — Single-page app
   ============================================================ */

const App = (() => {
  // ── State ──────────────────────────────────────────────────
  const state = {
    user        : null,     // { id, name }
    session     : [],       // array of card objects
    cardIndex   : 0,
    flipped     : false,
    sessionType : 'both',   // 'hiragana' | 'katakana' | 'both'
    stats       : { correct: 0, wrong: 0 },
    chart       : null,     // Chart.js instance
  };

  // ── Routing ────────────────────────────────────────────────
  function navigate(path) { location.hash = path; }

  function getRoute() {
    const raw  = location.hash || '#/';
    const idx  = raw.indexOf('?');
    const path = idx === -1 ? raw : raw.slice(0, idx);
    const qs   = idx === -1 ? '' : raw.slice(idx + 1);
    const params = Object.fromEntries(new URLSearchParams(qs));
    return { path, params };
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);

  function render() {
    const { path, params } = getRoute();
    if (state.chart) { state.chart.destroy(); state.chart = null; }

    switch (path) {
      case '#/':       return renderProfiles();
      case '#/menu':   return state.user ? renderMenu() : navigate('#/');
      case '#/study':  return state.user ? renderStudy(params.type) : navigate('#/');
      case '#/stats':  return state.user ? renderStats(params.type) : navigate('#/');
      case '#/browse': return state.user ? renderBrowse(params.type) : navigate('#/');
      default:         return renderProfiles();
    }
  }

  // ── Shuffle ────────────────────────────────────────────────
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Audio ──────────────────────────────────────────────────
  function playPronunciation(character) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(character);
    utter.lang = 'ja-JP';
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  }

  function playCorrectSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[523.25, 0], [659.25, 0.11], [783.99, 0.22]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.22);
      });
    } catch {}
  }

  function playWrongSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.32);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.32);
    } catch {}
  }

  // ── DOM helpers ────────────────────────────────────────────
  function el(id)          { return document.getElementById(id); }
  function esc(s)          { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function setApp(html)    { document.getElementById('app').innerHTML = html; }

  function header(backHash, backLabel) {
    const back = backHash
      ? `<a href="${backHash}" class="text-decoration-none text-secondary me-2" style="font-size:1.4rem" aria-label="Back">&#8592;</a>`
      : '';
    const user = state.user
      ? `<span class="ms-auto text-muted small">${esc(state.user.name)}</span>`
      : '';
    return `
      <header class="app-header d-flex align-items-center">
        ${back}
        <a href="#/" class="brand">Kana<span>Flash</span></a>
        ${user}
      </header>`;
  }

  // ── API helpers ────────────────────────────────────────────
  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  // ── View: Profile selector ─────────────────────────────────
  async function renderProfiles() {
    setApp(`${header(null, null)}
      <div class="page-container">
        <div class="mt-4 mb-3">
          <h1 class="h4 fw-bold mb-0">Who's studying?</h1>
          <p class="text-muted small mb-0">Select your profile to continue</p>
        </div>
        <div id="profiles-grid" class="row g-3">
          <div class="col-12 text-center py-4">
            <div class="spinner-border spinner-border-sm text-danger"></div>
          </div>
        </div>
      </div>`);

    const users = await api('GET', '/api/users');

    const cards = users.map(u => `
      <div class="col-6 col-sm-4">
        <div style="position:relative">
          <div class="profile-card" data-action="select-user" data-id="${u.id}" data-name="${esc(u.name)}">
            <div class="profile-avatar">${esc(u.name.charAt(0).toUpperCase())}</div>
            <div class="profile-name">${esc(u.name)}</div>
          </div>
          <button class="profile-delete-btn" data-action="delete-user" data-id="${u.id}" data-name="${esc(u.name)}" title="Delete profile" aria-label="Delete profile">×</button>
        </div>
      </div>`).join('');

    el('profiles-grid').innerHTML = cards + `
      <div class="col-6 col-sm-4">
        <div class="add-profile-card" data-action="new-user">
          <div style="font-size:2rem">+</div>
          <div class="fw-600 mt-1" style="font-size:.9rem">New Profile</div>
        </div>
      </div>`;

    el('app').addEventListener('click', profileClickHandler, { once: true });
  }

  function profileClickHandler(e) {
    const card = e.target.closest('[data-action]');
    if (!card) { el('app').addEventListener('click', profileClickHandler, { once: true }); return; }

    if (card.dataset.action === 'select-user') {
      state.user = { id: +card.dataset.id, name: card.dataset.name };
      navigate('#/menu');
    } else if (card.dataset.action === 'new-user') {
      showNewProfileModal();
    } else if (card.dataset.action === 'delete-user') {
      showConfirmModal({
        title: 'Delete Profile',
        message: `Delete <strong>${esc(card.dataset.name)}</strong> and all their progress? This cannot be undone.`,
        confirmLabel: 'Delete',
        onConfirm: async () => {
          await api('DELETE', `/api/users/${card.dataset.id}`);
          if (state.user?.id === +card.dataset.id) state.user = null;
          renderProfiles();
        },
      });
    }
  }

  function showNewProfileModal() {
    const existing = document.getElementById('new-profile-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="new-profile-modal" tabindex="-1" aria-modal="true" role="dialog">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content rounded-4 border-0">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title fw-bold">Create Profile</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body pt-2">
              <input type="text" id="new-profile-name" class="form-control form-control-lg rounded-3"
                     placeholder="Your name" maxlength="30" autocomplete="off" />
              <div id="new-profile-error" class="text-danger small mt-1" style="display:none"></div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-light rounded-3" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger rounded-3 px-4" id="create-profile-btn">Create</button>
            </div>
          </div>
        </div>
      </div>`);

    const modal = new bootstrap.Modal(document.getElementById('new-profile-modal'));
    modal.show();

    setTimeout(() => document.getElementById('new-profile-name')?.focus(), 400);

    document.getElementById('create-profile-btn').addEventListener('click', async () => {
      const name = document.getElementById('new-profile-name').value.trim();
      const errEl = document.getElementById('new-profile-error');
      if (!name) { errEl.textContent = 'Please enter a name'; errEl.style.display = ''; return; }
      try {
        const user = await api('POST', '/api/users', { name });
        state.user = user;
        modal.hide();
        navigate('#/menu');
      } catch {
        errEl.textContent = 'That name is already taken';
        errEl.style.display = '';
      }
    });

    document.getElementById('new-profile-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('create-profile-btn').click();
    });
  }

  function showConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm }) {
    const id = 'confirm-modal';
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal fade" id="${id}" tabindex="-1" aria-modal="true" role="dialog">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content rounded-4 border-0">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title fw-bold">${esc(title)}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-muted small">${message}</div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-light rounded-3" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger rounded-3 px-4" id="confirm-modal-ok">${esc(confirmLabel)}</button>
            </div>
          </div>
        </div>
      </div>`);

    const modal = new bootstrap.Modal(document.getElementById(id));
    modal.show();
    document.getElementById('confirm-modal-ok').addEventListener('click', () => {
      modal.hide();
      onConfirm();
    });
  }

  // ── View: Menu ─────────────────────────────────────────────
  async function renderMenu() {
    // Fetch quick stats for "due today" badge
    let dueH = 0, dueK = 0, dueB = 0;
    try {
      const [sh, sk] = await Promise.all([
        api('GET', `/api/users/${state.user.id}/stats?type=hiragana`),
        api('GET', `/api/users/${state.user.id}/stats?type=katakana`),
      ]);
      dueH = sh.due_today;
      dueK = sk.due_today;
      dueB = dueH + dueK;
    } catch { /* non-fatal */ }

    const dueBadge = (n) => n > 0
      ? `<span class="badge bg-danger ms-1">${n}</span>`
      : '';

    setApp(`
      ${header('#/', 'Profiles')}
      <div class="page-container">
        <div class="mt-4 mb-4">
          <h2 class="h5 fw-bold mb-0">こんにちは, ${esc(state.user.name)}!</h2>
          <p class="text-muted small">What would you like to study?</p>
        </div>

        <div class="row g-3 mb-4">
          <div class="col-12 col-sm-4">
            <a href="#/study?type=hiragana" class="menu-btn">
              <span class="icon kana-char">あ</span>
              <div class="label">Hiragana ${dueBadge(dueH)}</div>
              <div class="sublabel">46+ characters</div>
            </a>
          </div>
          <div class="col-12 col-sm-4">
            <a href="#/study?type=katakana" class="menu-btn">
              <span class="icon kana-char">ア</span>
              <div class="label">Katakana ${dueBadge(dueK)}</div>
              <div class="sublabel">46+ characters</div>
            </a>
          </div>
          <div class="col-12 col-sm-4">
            <a href="#/study?type=both" class="menu-btn">
              <span class="icon kana-char" style="font-size:2rem">あア</span>
              <div class="label">Both ${dueBadge(dueB)}</div>
              <div class="sublabel">All characters</div>
            </a>
          </div>
        </div>

        <div class="section-title">Progress</div>
        <div class="row g-2 mb-3">
          <div class="col-4">
            <a href="#/stats?type=hiragana" class="text-decoration-none">
              <div class="stat-card">
                <div class="kana-char" style="font-size:1.5rem">あ</div>
                <div class="stat-label">Hiragana</div>
              </div>
            </a>
          </div>
          <div class="col-4">
            <a href="#/stats?type=katakana" class="text-decoration-none">
              <div class="stat-card">
                <div class="kana-char" style="font-size:1.5rem">ア</div>
                <div class="stat-label">Katakana</div>
              </div>
            </a>
          </div>
          <div class="col-4">
            <a href="#/browse?type=hiragana" class="text-decoration-none">
              <div class="stat-card">
                <div style="font-size:1.5rem">📋</div>
                <div class="stat-label">Browse All</div>
              </div>
            </a>
          </div>
        </div>

        <div class="mt-4 pt-2 border-top">
          <a href="#/" class="text-muted text-decoration-none small">
            ← Switch profile
          </a>
        </div>
      </div>`);
  }

  // ── View: Study session ─────────────────────────────────────
  async function renderStudy(type) {
    type = type || 'both';
    state.sessionType = type;
    state.cardIndex   = 0;
    state.flipped     = false;
    state.stats       = { correct: 0, wrong: 0 };

    const typeLabel = type === 'hiragana' ? 'Hiragana' : type === 'katakana' ? 'Katakana' : 'Hiragana + Katakana';

    const shuffleDefault = localStorage.getItem('kana-shuffle') !== 'false';

    setApp(`
      ${header('#/menu', 'Menu')}
      <div class="page-container pt-3">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <span class="small text-muted fw-500">${esc(typeLabel)}</span>
          <div class="d-flex align-items-center gap-3">
            <div class="form-check mb-0">
              <input class="form-check-input" type="checkbox" id="shuffle-toggle" ${shuffleDefault ? 'checked' : ''}>
              <label class="form-check-label small text-muted" for="shuffle-toggle">Shuffle</label>
            </div>
            <span id="card-counter" class="small text-muted"></span>
          </div>
        </div>
        <div class="session-progress-bar mb-4">
          <div class="session-progress-fill" id="progress-fill" style="width:0%"></div>
        </div>
        <div id="study-area">
          <div class="text-center py-5">
            <div class="spinner-border text-danger"></div>
          </div>
        </div>
      </div>`);

    try {
      const { cards } = await api('GET', `/api/users/${state.user.id}/session?type=${type}`);
      state.sessionOriginal = cards;

      function applyOrder() {
        const checked = el('shuffle-toggle')?.checked ?? true;
        localStorage.setItem('kana-shuffle', checked);
        state.session   = checked ? shuffleArray([...state.sessionOriginal]) : [...state.sessionOriginal];
        state.cardIndex = 0;
        state.flipped   = false;
        state.stats     = { correct: 0, wrong: 0 };
        showCard();
      }

      if (cards.length === 0) {
        showAllDone(true);
      } else {
        el('shuffle-toggle')?.addEventListener('change', applyOrder);
        applyOrder();
      }
    } catch (err) {
      el('study-area').innerHTML = `<div class="alert alert-danger">Failed to load session: ${esc(err.message)}</div>`;
    }
  }

  function showCard() {
    const card = state.session[state.cardIndex];
    if (!card) { showAllDone(false); return; }

    state.flipped = false;
    const total    = state.session.length;
    const done     = state.cardIndex;
    const pct      = Math.round((done / total) * 100);
    const typeBadgeClass = card.type === 'hiragana' ? 'badge-hiragana' : 'badge-katakana';
    const typeBadgeLabel = card.type === 'hiragana' ? 'Hiragana' : 'Katakana';

    if (el('card-counter')) el('card-counter').textContent = `${done + 1} / ${total}`;
    if (el('progress-fill')) el('progress-fill').style.width = pct + '%';

    el('study-area').innerHTML = `
      <div class="card-scene" id="card-scene">
        <div class="card-flipper" id="card-flipper">
          <div class="card-face card-front">
            <span class="card-hint">Tap to reveal</span>
            <span class="card-type-badge ${typeBadgeClass}">${typeBadgeLabel}</span>
            <span class="kana-char card-character">${esc(card.character)}</span>
          </div>
          <div class="card-face card-back">
            <span class="card-type-badge ${typeBadgeClass}">${typeBadgeLabel}</span>
            <span class="kana-char card-character" style="font-size:clamp(3rem,12vw,4.5rem);margin-bottom:.5rem">${esc(card.character)}</span>
            <span class="card-romaji">${esc(card.romaji)}</span>
            <span class="card-romaji-label">${esc(card.category)}</span>
          </div>
        </div>
      </div>
      <div class="d-flex align-items-center mt-2 mb-1 card-below-row">
        <button class="btn-speak" id="btn-speak" title="Hear pronunciation" aria-label="Hear pronunciation">
          <i class="bi bi-volume-up-fill"></i>
        </button>
        <p class="flip-hint flex-grow-1 text-center mb-0" id="flip-hint">Tap the card to flip</p>
      </div>
      <div class="review-btns mt-2" id="review-btns" style="display:none">
        <button class="btn-review"  id="btn-wrong">Need Review ✗</button>
        <button class="btn-got-it"  id="btn-correct">Got it ✓</button>
      </div>`;

    // Flip on card click
    el('card-scene').addEventListener('click', flipCard);
    el('btn-speak').addEventListener('click', () => playPronunciation(card.character));
  }

  function flipCard() {
    if (state.flipped) return;
    state.flipped = true;

    el('card-scene').classList.add('flipped');
    el('flip-hint').style.display   = 'none';
    el('review-btns').style.display = 'grid';

    el('btn-correct').addEventListener('click', () => submitReview('correct'));
    el('btn-wrong').addEventListener('click',   () => submitReview('wrong'));
  }

  async function submitReview(result) {
    const card = state.session[state.cardIndex];

    // Disable buttons immediately
    el('btn-correct').disabled = true;
    el('btn-wrong').disabled   = true;

    if (result === 'correct') { state.stats.correct++; playCorrectSound(); }
    else                      { state.stats.wrong++;   playWrongSound();   }

    try {
      await api('POST', `/api/users/${state.user.id}/review`, { card_id: card.id, result });
    } catch { /* non-fatal: continue session */ }

    state.cardIndex++;
    showCard();
  }

  function showAllDone(noneScheduled) {
    const { correct, wrong } = state.stats;
    const total = correct + wrong;

    if (el('card-counter')) el('card-counter').textContent = '';
    if (el('progress-fill')) el('progress-fill').style.width = '100%';

    if (noneScheduled) {
      el('study-area').innerHTML = `
        <div class="empty-state">
          <span class="icon">🎉</span>
          <h3 class="h5 fw-bold">All caught up!</h3>
          <p class="text-muted">No cards are due right now.<br>Come back tomorrow to review more.</p>
          <a href="#/menu" class="btn btn-danger rounded-3 px-4 mt-2">Back to Menu</a>
        </div>`;
      return;
    }

    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    el('study-area').innerHTML = `
      <div class="text-center py-4">
        <div class="summary-ring">${pct}%</div>
        <h3 class="h5 fw-bold mb-1">Session Complete!</h3>
        <p class="text-muted mb-4">
          <span class="text-success fw-bold">${correct} correct</span> &nbsp;·&nbsp;
          <span class="text-danger fw-bold">${wrong} to review</span>
          &nbsp;out of ${total} cards
        </p>
        <div class="d-flex gap-2 justify-content-center flex-wrap">
          <button class="btn btn-danger rounded-3 px-4" id="btn-study-again">Study Again</button>
          <a href="#/stats?type=${esc(state.sessionType)}" class="btn btn-outline-secondary rounded-3 px-4">View Progress</a>
          <a href="#/menu" class="btn btn-light rounded-3 px-3">Menu</a>
        </div>
      </div>`;

    el('btn-study-again')?.addEventListener('click', () => renderStudy(state.sessionType));
  }

  // ── View: Stats ─────────────────────────────────────────────
  async function renderStats(type) {
    type = type || 'hiragana';
    const typeLabel = type === 'hiragana' ? 'Hiragana' : 'Katakana';

    setApp(`
      ${header('#/menu', 'Menu')}
      <div class="page-container">
        <div class="mt-4 mb-3 d-flex align-items-center gap-2">
          <h2 class="h5 fw-bold mb-0">${esc(state.user.name)}'s Progress</h2>
          <div class="ms-auto">
            <select id="type-select" class="form-select form-select-sm rounded-3" style="width:auto">
              <option value="hiragana" ${type === 'hiragana' ? 'selected' : ''}>Hiragana</option>
              <option value="katakana" ${type === 'katakana' ? 'selected' : ''}>Katakana</option>
            </select>
          </div>
        </div>

        <div id="stats-content">
          <div class="text-center py-5"><div class="spinner-border text-danger"></div></div>
        </div>
      </div>`);

    el('type-select').addEventListener('change', e => {
      navigate(`#/stats?type=${e.target.value}`);
    });

    const stats = await api('GET', `/api/users/${state.user.id}/stats?type=${type}`);
    const { buckets, total_cards, due_today, streak } = stats;

    const chartData = [buckets.learned, buckets.learning, buckets.review, buckets.new];
    const chartColors = ['#16a34a', '#2563eb', '#ea580c', '#cbd5e1'];
    const chartLabels = ['Learned', 'Learning', 'Need Review', 'New'];

    el('stats-content').innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-4">
          <div class="stat-card">
            <div class="stat-number text-success">${buckets.learned}</div>
            <div class="stat-label">Learned</div>
          </div>
        </div>
        <div class="col-4">
          <div class="stat-card">
            <div class="stat-number text-danger">${due_today}</div>
            <div class="stat-label">Due Today</div>
          </div>
        </div>
        <div class="col-4">
          <div class="stat-card">
            <div class="stat-number" style="color:var(--orange)">${streak}</div>
            <div class="stat-label">Day Streak</div>
          </div>
        </div>
      </div>

      <div class="stat-card mb-4">
        <div style="max-width:260px;margin:0 auto">
          <canvas id="progress-chart"></canvas>
        </div>
        <div class="d-flex flex-wrap justify-content-center gap-3 mt-3">
          ${chartLabels.map((l, i) => `
            <div class="d-flex align-items-center gap-1 small">
              <span class="legend-dot" style="background:${chartColors[i]}"></span>
              <span>${l}: <strong>${chartData[i]}</strong></span>
            </div>`).join('')}
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-6">
          <div class="stat-card">
            <div class="stat-number text-primary">${buckets.learning}</div>
            <div class="stat-label">Learning</div>
          </div>
        </div>
        <div class="col-6">
          <div class="stat-card">
            <div class="stat-number" style="color:var(--orange)">${buckets.review}</div>
            <div class="stat-label">Need Review</div>
          </div>
        </div>
      </div>

      <div class="d-flex gap-2 flex-wrap mb-4">
        <a href="#/study?type=${esc(type)}" class="btn btn-danger rounded-3 px-4">
          Study ${esc(typeLabel)} ${due_today > 0 ? `(${due_today} due)` : ''}
        </a>
        <a href="#/browse?type=${esc(type)}" class="btn btn-outline-secondary rounded-3">
          Browse Cards
        </a>
      </div>

      <div class="border-top pt-3">
        <div class="section-title mb-2">Reset Progress</div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline-danger btn-sm rounded-3" id="btn-reset-type">
            Reset ${esc(typeLabel)} only
          </button>
          <button class="btn btn-outline-danger btn-sm rounded-3" id="btn-reset-all">
            Reset all progress
          </button>
        </div>
      </div>`;

    // Render doughnut chart
    const ctx = document.getElementById('progress-chart').getContext('2d');
    state.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: chartLabels,
        datasets: [{ data: chartData, backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }],
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / total_cards * 100)}%)`,
            },
          },
        },
      },
    });

    el('btn-reset-type').addEventListener('click', () => {
      showConfirmModal({
        title: `Reset ${typeLabel}`,
        message: `Reset all <strong>${esc(typeLabel)}</strong> progress for <strong>${esc(state.user.name)}</strong>? Every card goes back to New.`,
        confirmLabel: 'Reset',
        onConfirm: async () => {
          await api('DELETE', `/api/users/${state.user.id}/progress?type=${type}`);
          renderStats(type);
        },
      });
    });

    el('btn-reset-all').addEventListener('click', () => {
      showConfirmModal({
        title: 'Reset All Progress',
        message: `Reset <strong>all</strong> Hiragana and Katakana progress for <strong>${esc(state.user.name)}</strong>? Every card goes back to New and your streak is cleared.`,
        confirmLabel: 'Reset All',
        onConfirm: async () => {
          await api('DELETE', `/api/users/${state.user.id}/progress`);
          renderStats(type);
        },
      });
    });
  }

  // ── View: Browse ───────────────────────────────────────────
  async function renderBrowse(type) {
    type = type || 'hiragana';

    setApp(`
      ${header('#/menu', 'Menu')}
      <div class="page-container">
        <div class="mt-4 mb-3 d-flex align-items-center gap-2">
          <h2 class="h5 fw-bold mb-0">Browse Cards</h2>
          <div class="ms-auto">
            <select id="type-select" class="form-select form-select-sm rounded-3" style="width:auto">
              <option value="hiragana" ${type === 'hiragana' ? 'selected' : ''}>Hiragana</option>
              <option value="katakana" ${type === 'katakana' ? 'selected' : ''}>Katakana</option>
            </select>
          </div>
        </div>

        <!-- Legend -->
        <div class="d-flex flex-wrap gap-2 mb-3 small">
          <span><span class="legend-dot" style="background:#cbd5e1;border:1px solid #e2e8f0"></span>New</span>
          <span><span class="legend-dot" style="background:#2563eb"></span>Learning</span>
          <span><span class="legend-dot" style="background:#ea580c"></span>Need Review</span>
          <span><span class="legend-dot" style="background:#16a34a"></span>Learned</span>
        </div>

        <div id="browse-content">
          <div class="text-center py-5"><div class="spinner-border text-danger"></div></div>
        </div>
      </div>`);

    el('type-select').addEventListener('change', e => {
      navigate(`#/browse?type=${e.target.value}`);
    });

    const cards = await api('GET', `/api/cards?type=${type}&user_id=${state.user.id}`);

    const categories = ['basic', 'dakuten', 'handakuten', 'combination'];
    const catLabels  = {
      basic       : 'Basic',
      dakuten     : 'Dakuten (Voiced)',
      handakuten  : 'Handakuten (Semi-voiced)',
      combination : 'Combinations',
    };

    const sections = categories.map(cat => {
      const group = cards.filter(c => c.category === cat);
      if (!group.length) return '';

      const tiles = group.map(c => `
        <div class="kana-tile bucket-${c.bucket}" title="${esc(c.romaji)} · ${esc(c.bucket)}"
             data-character="${esc(c.character)}" style="cursor:pointer">
          <span class="char kana-char">${esc(c.character)}</span>
          <span class="roma">${esc(c.romaji)}</span>
        </div>`).join('');

      return `
        <div class="mb-4">
          <div class="section-title">${esc(catLabels[cat])}</div>
          <div class="kana-grid">${tiles}</div>
        </div>`;
    }).join('');

    el('browse-content').innerHTML = sections || '<div class="empty-state">No cards found.</div>';

    el('browse-content').addEventListener('click', e => {
      const tile = e.target.closest('[data-character]');
      if (tile) playPronunciation(tile.dataset.character);
    });
  }

  // Public API (none needed — auto-starts on DOMContentLoaded)
  return {};
})();
