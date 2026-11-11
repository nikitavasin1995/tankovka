'use strict';

/*
 * Tankovka — танковое пиво на карте Чехии.
 * Данные (профили, друзья, отметки, пиво, пивные) хранятся в Supabase — см. supabase/schema.sql.
 * Если config.js не заполнен, приложение показывает карту из data/pubs.js без профилей.
 */
(function () {
  // ---------- подключение ----------
  const cfg = window.TANKOVKA_CONFIG || {};
  const sb = cfg.supabaseUrl && cfg.supabaseKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey)
    : null;

  // ---------- константы ----------
  const SESSION_MAX_MS = 8 * 60 * 60 * 1000; // отметка в пивной снимается сама через 8 часов
  const POLL_MS = 30 * 1000;                  // как часто обновлять, кто где пьёт
  const ABV = 0.044;                          // ≈ крепость светлого 12°
  const BRANDS = ['Pilsner Urquell', 'Kozel', 'Radegast', 'Gambrinus', 'Staropramen',
    'Budějovický Budvar', 'Krušovice', 'Bernard', 'Svijany'];
  const AVATARS = ['🍺', '🧔', '👩', '🧢', '🎸', '🚲', '🦊', '🐻', '🤠', '👽'];
  const PENDING_FRIEND_KEY = 'tk.pendingFriend';

  // ---------- состояние ----------
  const state = {
    user: null,
    profile: null,
    friends: [],
    pubs: (window.PUBS || []).slice(),
    voteCounts: {},
    myVotes: {},
    live: [],          // активные отметки, которые мне видны (мои и друзей)
    history: [],
    stats: null,
    loading: !!sb,
    busy: false,
    notice: '',
    tab: 'pubs',
    view: 'list',      // list | pub | add
    selectedId: null,
    query: '',
    myPos: null,
    pendingPoint: null,
    pendingCheckin: null,
    pendingFriendCode: localStorage.getItem(PENDING_FRIEND_KEY),
    pickedEmoji: AVATARS[0],
    authMode: 'signup',
    armed: null,       // кнопка «нажмите ещё раз» для опасных действий
  };

  // приглашение в друзья по ссылке ?friend=КОД
  const invited = new URLSearchParams(location.search).get('friend');
  if (invited) {
    state.pendingFriendCode = invited.toUpperCase();
    localStorage.setItem(PENDING_FRIEND_KEY, state.pendingFriendCode);
    history.replaceState(null, '', location.pathname);
    state.tab = 'me';
  }

  // ---------- помощники ----------
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function plural(n, forms) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }
  const beers = n => `${n} ${plural(n, ['пиво', 'пива', 'пив'])}`;
  const liters = drinks => Math.round(drinks.reduce((sum, d) => sum + d.size, 0) * 10) / 10;
  const fmtNum = n => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const fmtL = l => `${fmtNum(l)} л`;
  const grams = l => Math.round(l * 1000 * ABV * 0.789);
  const fmtTime = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

  function distance(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} м` : `${fmtNum(m / 1000)} км`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  const ERRORS = {
    friend_not_found: 'Нет пользователя с таким кодом',
    self_friend: 'Это ваш собственный код 🙂',
    no_active_session: 'Сначала отметьтесь в пивной',
    too_many: 'Максимум 40 пив за одну отметку',
    pub_not_found: 'Пивная не найдена',
    not_authenticated: 'Войдите в профиль',
  };
  function errText(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    for (const key in ERRORS) if (m.includes(key)) return ERRORS[key];
    if (/Invalid login credentials/i.test(m)) return 'Неверный email или пароль';
    if (/already registered|already been registered|already exists/i.test(m)) return 'Такой email уже зарегистрирован — войдите';
    if (/Password should be|password.*(short|characters)/i.test(m)) return 'Пароль слишком короткий — минимум 6 символов';
    if (/valid email|invalid format|validate email/i.test(m)) return 'Проверьте email';
    if (/rate limit|too many/i.test(m)) return 'Слишком много попыток, подождите немного';
    if (/Email not confirmed/i.test(m)) return 'Email не подтверждён — проверьте почту';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Нет связи с сервером';
    return 'Ошибка: ' + m;
  }

  async function call(request) {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  }

  // ---------- данные ----------
  const pubById = id => state.pubs.find(p => p.id === id);
  const refPoint = () => state.myPos || map.getCenter();
  const refLabel = () => state.myPos ? 'от вас' : 'от центра карты';
  const me = () => state.user && state.user.id;
  const mySession = () => state.live.find(s => s.userId === me());
  const personById = id => (state.profile && state.profile.id === id) ? state.profile : state.friends.find(f => f.id === id);

  const fromPubRow = r => ({
    id: r.id, name: r.name, address: r.address || '', city: r.city || '', brand: r.brand,
    lat: r.lat, lng: r.lng, source: { type: r.source_type, name: r.source_name, url: r.source_url },
  });
  const fromSessionRow = r => ({
    id: r.id, userId: r.user_id, pubId: r.pub_id,
    startedAt: Date.parse(r.started_at), endedAt: r.ended_at ? Date.parse(r.ended_at) : null,
    drinks: (r.drinks || []).map(d => ({ size: Number(d.size), at: Date.parse(d.created_at) })).sort((a, b) => a.at - b.at),
  });

  function drinkers() {
    return state.live.map(s => {
      const person = personById(s.userId);
      if (!person || !pubById(s.pubId)) return null;
      return { id: s.userId, isMe: s.userId === me(), name: person.name, emoji: person.emoji, pubId: s.pubId, since: s.startedAt, drinks: s.drinks };
    }).filter(Boolean);
  }
  const drinkersAt = pubId => drinkers().filter(d => d.pubId === pubId);

  async function loadPubs() {
    const rows = await call(sb.from('pubs')
      .select('id,name,address,city,brand,lat,lng,source_type,source_name,source_url')
      .order('created_at'));
    state.pubs = rows.map(fromPubRow);
  }
  async function loadVoteCounts() {
    const rows = await call(sb.rpc('pub_vote_counts'));
    state.voteCounts = {};
    rows.forEach(r => { state.voteCounts[r.pub_id] = { yes: Number(r.yes_count), no: Number(r.no_count) }; });
  }
  async function loadPeople() {
    const rows = await call(sb.from('profiles').select('id,name,emoji,visibility,friend_code,created_at'));
    state.profile = rows.find(r => r.id === me()) || null;
    state.friends = rows.filter(r => r.id !== me()).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function loadLive() {
    const since = new Date(Date.now() - SESSION_MAX_MS).toISOString();
    const rows = await call(sb.from('sessions')
      .select('id,user_id,pub_id,started_at,ended_at,drinks(size,created_at)')
      .is('ended_at', null).gt('started_at', since));
    state.live = rows.map(fromSessionRow);
  }
  async function loadStats() {
    state.stats = await call(sb.rpc('my_stats'));
  }
  async function loadMine() {
    const [hist, votes] = await Promise.all([
      call(sb.from('sessions')
        .select('id,user_id,pub_id,started_at,ended_at,drinks(size,created_at)')
        .eq('user_id', me()).not('ended_at', 'is', null)
        .order('started_at', { ascending: false }).limit(10)),
      call(sb.from('pub_votes').select('pub_id,vote')),
      loadStats(),
    ]);
    state.history = hist.map(fromSessionRow).filter(s => s.drinks.length);
    state.myVotes = {};
    votes.forEach(v => { state.myVotes[v.pub_id] = v.vote; });
  }

  async function setUser(user) {
    state.user = user;
    Object.assign(state, { profile: null, friends: [], live: [], history: [], stats: null, myVotes: {}, armed: null });
    if (!user) { state.loading = false; render(); return; }
    state.loading = true;
    render();
    try {
      await loadPeople();
      await Promise.all([loadLive(), loadMine()]);
    } catch (e) {
      toast(errText(e));
    }
    state.loading = false;
    render();
    if (state.pendingFriendCode) await addFriend(state.pendingFriendCode, true);
    if (state.pendingCheckin) {
      const id = state.pendingCheckin;
      state.pendingCheckin = null;
      selectPub(id);
      await checkIn(id);
    }
  }

  async function refreshLive() {
    if (!state.user || state.busy) return;
    try {
      await Promise.all([loadLive(), loadPeople()]);
      render();
    } catch (e) { /* тихо: попробуем в следующий раз */ }
  }

  // ---------- действия с сервером ----------
  async function withBusy(fn) {
    state.busy = true;
    try { await fn(); return true; }
    catch (e) { toast(errText(e)); return false; }
    finally { state.busy = false; render(); }
  }

  function requireLogin(pendingPub) {
    if (!sb) { toast('Сервер ещё не подключён'); return false; }
    if (state.user && state.profile) return true;
    if (pendingPub) state.pendingCheckin = pendingPub;
    state.tab = 'me';
    render();
    toast('Сначала войдите или зарегистрируйтесь');
    return false;
  }

  async function checkIn(pubId) {
    if (!requireLogin(pubId)) return;
    const current = mySession();
    if (current && current.pubId === pubId) return;
    const ok = await withBusy(async () => {
      await call(sb.rpc('check_in', { p_pub: pubId }));
      await Promise.all([loadLive(), loadMine()]);
    });
    if (ok) toast(current ? 'Прошлая пивная сохранена в историю. Вы отметились здесь!' : 'Вы отметились! Добавляйте пиво кнопкой «+»');
  }

  async function addDrink(size) {
    const s = mySession();
    if (!s) return toast('Сначала отметьтесь в пивной');
    const drink = { size, at: Date.now() };
    s.drinks.push(drink);                      // сразу показываем, потом сохраняем
    render();
    toast(`🍺 ${beers(s.drinks.length)} · ${fmtL(liters(s.drinks))}`);
    try {
      await call(sb.rpc('add_drink', { p_size: size }));
      await loadStats();
      render();
    } catch (e) {
      const i = s.drinks.indexOf(drink);
      if (i >= 0) s.drinks.splice(i, 1);
      render();
      toast(errText(e));
    }
  }

  async function undoDrink() {
    const s = mySession();
    if (!s || !s.drinks.length) return;
    const drink = s.drinks.pop();
    render();
    try {
      await call(sb.rpc('undo_drink'));
      await loadStats();
      render();
    } catch (e) {
      s.drinks.push(drink);
      render();
      toast(errText(e));
    }
  }

  async function endSession() {
    const s = mySession();
    if (!s) return;
    const ok = await withBusy(async () => {
      await call(sb.rpc('end_session'));
      await Promise.all([loadLive(), loadMine()]);
    });
    if (ok) toast(s.drinks.length ? `Записано: ${beers(s.drinks.length)}, ${fmtL(liters(s.drinks))}` : 'Отметка снята');
  }

  async function vote(pubId, value) {
    if (!requireLogin()) return;
    const current = state.myVotes[pubId];
    const ok = await withBusy(async () => {
      if (current === value) {
        await call(sb.from('pub_votes').delete().eq('pub_id', pubId).eq('user_id', me()));
        delete state.myVotes[pubId];
      } else {
        await call(sb.from('pub_votes').upsert({ pub_id: pubId, user_id: me(), vote: value, updated_at: new Date().toISOString() }));
        state.myVotes[pubId] = value;
      }
      await loadVoteCounts();
    });
    if (ok && state.myVotes[pubId] === 'yes') toast('Спасибо! Отмечено, что здесь танковое');
    if (ok && state.myVotes[pubId] === 'no') toast('Спасибо! Учтём, что танкового здесь больше нет');
  }

  async function addFriend(code, fromInvite) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const forget = () => { state.pendingFriendCode = null; localStorage.removeItem(PENDING_FRIEND_KEY); };
    if (!code) return toast('Введите код друга');
    if (state.profile && code === state.profile.friend_code) {
      forget();
      if (!fromInvite) toast(ERRORS.self_friend);
      return;
    }
    try {
      const friend = await call(sb.rpc('add_friend', { p_code: code }));
      forget();
      await Promise.all([loadPeople(), loadLive()]);
      const input = $('#friendCode');
      if (input) input.value = '';
      render();
      toast(`${friend.emoji} ${friend.name} теперь у вас в друзьях`);
    } catch (e) {
      if (fromInvite) forget();
      toast(errText(e));
    }
  }

  async function shareInvite() {
    const url = `${location.origin}${location.pathname}?friend=${state.profile.friend_code}`;
    const text = 'Добавляйся ко мне в друзья в Tankovka 🍺 — карта танкового пива';
    if (navigator.share) {
      try { await navigator.share({ title: 'Tankovka', text, url }); return; } catch (e) { /* отменили — копируем */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка-приглашение скопирована');
    } catch (e) {
      window.prompt('Скопируйте ссылку-приглашение:', url);
    }
  }

  // ---------- карта ----------
  const map = L.map('map', { zoomControl: true }).setView([49.85, 15.4], 7);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Близкие метки собираются в кружок «🍺 N», при приближении он раскрывается.
  const pubLayer = (L.markerClusterGroup ? L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 45,
    disableClusteringAtZoom: 15,
    iconCreateFunction: cluster => L.divIcon({
      className: '',
      html: `<div class="cluster">🍺 ${cluster.getChildCount()}</div>`,
      iconSize: [52, 36], iconAnchor: [26, 18],
    }),
  }) : L.layerGroup()).addTo(map);
  let meMarker = null;
  let pendingMarker = null;

  function renderMarkers() {
    pubLayer.clearLayers();
    const mine = mySession();
    state.pubs.forEach(p => {
      const n = drinkersAt(p.id).length;
      const cls = ['pin',
        p.source.type === 'user' ? 'pin-user' : '',
        mine && mine.pubId === p.id ? 'pin-mine' : '',
        state.selectedId === p.id ? 'pin-active' : ''].join(' ');
      const icon = L.divIcon({
        className: '',
        html: `<div class="${cls}">🍺${n ? `<span class="pin-badge">${n}</span>` : ''}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      L.marker([p.lat, p.lng], { icon, title: p.name, keyboard: true, zIndexOffset: state.selectedId === p.id ? 1000 : 0 })
        .on('click', () => selectPub(p.id))
        .addTo(pubLayer);
    });

    if (state.myPos) {
      if (!meMarker) {
        meMarker = L.circleMarker(state.myPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#2A7DE1', fillOpacity: 1 })
          .bindTooltip('Вы здесь').addTo(map);
      } else {
        meMarker.setLatLng(state.myPos);
      }
    }
  }

  map.on('click', e => {
    if (state.view !== 'add') return;
    state.pendingPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (pendingMarker) pendingMarker.setLatLng(e.latlng);
    else pendingMarker = L.marker(e.latlng, {
      icon: L.divIcon({ className: '', html: '<div class="pin pin-user">＋</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
    }).addTo(map);
    const status = $('#addPoint');
    if (status) status.textContent = '✔ Точка на карте выбрана. Можно передвинуть — нажмите ещё раз.';
  });

  map.on('moveend', () => {
    if (state.myPos) return;
    if (state.tab === 'pubs' && state.view === 'list') {
      const ul = $('#pubList');
      if (ul) ul.innerHTML = pubListHTML();
    } else if (state.tab === 'nearby') {
      renderView();
    }
  });

  function clearAddMode() {
    state.pendingPoint = null;
    if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
  }

  function selectPub(id) {
    const p = pubById(id);
    if (!p) return;
    if (state.view === 'add') clearAddMode();
    state.tab = 'pubs';
    state.view = 'pub';
    state.selectedId = id;
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
    render();
  }

  function locate() {
    if (!navigator.geolocation) return toast('Браузер не умеет определять местоположение');
    toast('Определяю, где вы…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setView([state.myPos.lat, state.myPos.lng], 14);
        render();
        toast('Готово — расстояния считаются от вас');
      },
      () => toast('Не получилось определить местоположение. Считаю от центра карты.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // ---------- экраны ----------
  const offlineNote = '<div class="note">Сервер ещё не подключён: карта работает, а профили, друзья и счётчик пива появятся после настройки Supabase (см. SETUP.md).</div>';

  function pubListHTML() {
    const q = state.query.trim().toLowerCase();
    const ref = refPoint();
    const rows = state.pubs
      .filter(p => !q || [p.name, p.city, p.brand, p.address].join(' ').toLowerCase().includes(q))
      .map(p => ({ p, d: distance(ref, p) }))
      .sort((a, b) => a.d - b.d);
    if (!rows.length) return '<li class="muted">Ничего не нашлось. Знаете такое место — добавьте его.</li>';
    return rows.map(({ p, d }) => {
      const n = drinkersAt(p.id).length;
      return `<li class="item" role="button" tabindex="0" data-action="select-pub" data-id="${esc(p.id)}">
        <div class="ico">🍺</div>
        <div class="main">
          <div class="title">${esc(p.name)} ${p.source.type === 'user' ? '<span class="badge badge-user">новое</span>' : ''}</div>
          <div class="sub">${esc(p.city || 'Чехия')} · ${esc(p.brand || 'марка не указана')}</div>
        </div>
        <div class="meta">${fmtDist(d)}${n ? `<br>👥 ${n}` : ''}</div>
      </li>`;
    }).join('');
  }

  function viewList() {
    return `<div class="view">
      <div class="row wrap"><span class="badge badge-tank">ТОЛЬКО ТАНКОВОЕ</span><span class="muted">${state.pubs.length} мест на карте</span></div>
      <input id="search" class="input mt" type="search" placeholder="Название, город или марка" aria-label="Поиск пивной" value="${esc(state.query)}">
      <div class="row wrap mt">
        <button class="btn" data-action="locate">📍 Рядом со мной</button>
        <button class="btn" data-action="add-start">＋ Добавить пивную</button>
      </div>
      <p class="muted">Ближайшие ${refLabel()}</p>
      <ul class="list" id="pubList">${pubListHTML()}</ul>
      ${sb ? '' : offlineNote}
    </div>`;
  }

  function drinkerItem(d, opts) {
    opts = opts || {};
    const pub = pubById(d.pubId);
    const hidden = d.isMe && state.profile && state.profile.visibility === 'nobody';
    const attrs = opts.clickable ? `role="button" tabindex="0" data-action="select-pub" data-id="${esc(d.pubId)}"` : '';
    return `<li class="item" ${attrs}>
      <div class="ico ${d.isMe ? 'ico-me' : ''}">${esc(d.emoji)}</div>
      <div class="main">
        <div class="title">${d.isMe ? 'Вы' : esc(d.name)} ${hidden ? '<span class="badge">скрыто от друзей</span>' : ''}</div>
        <div class="sub">${opts.showPub ? esc(pub.name) + ' · ' : ''}с ${fmtTime(d.since)}</div>
      </div>
      <div class="meta"><b>${beers(d.drinks.length)}</b><br>${fmtL(liters(d.drinks))}${opts.dist != null ? ' · ' + fmtDist(opts.dist) : ''}</div>
    </li>`;
  }

  function sessionControls(s, withUndo) {
    return `<div class="row wrap mt">
      <button class="btn btn-primary" data-action="drink" data-size="0.5">＋ 0,5 л</button>
      <button class="btn" data-action="drink" data-size="0.3">＋ 0,3 л</button>
      ${withUndo ? `<button class="btn" data-action="undo" ${s.drinks.length ? '' : 'disabled'}>↶ Отменить</button>` : ''}
      <button class="btn" data-action="end">Закончить</button>
    </div>`;
  }

  function viewPub() {
    const p = pubById(state.selectedId);
    if (!p) { state.view = 'list'; return viewList(); }
    const here = drinkersAt(p.id);
    const s = mySession();
    const mine = s && s.pubId === p.id;
    const vote = state.myVotes[p.id];
    const counts = state.voteCounts[p.id] || { yes: 0, no: 0 };
    const isUser = p.source.type === 'user';
    const address = [p.address, p.address && p.city && !p.address.includes(p.city) ? p.city : ''].filter(Boolean).join(', ');

    return `<div class="view">
      <button class="btn btn-ghost" data-action="back">← Все пивные</button>
      <h2 class="pub-title">${esc(p.name)}</h2>
      <div class="row wrap">
        <span class="badge badge-tank">TANKOVÉ</span>
        <span class="badge">${esc(p.brand || 'марка не указана')}</span>
        ${isUser ? '<span class="badge badge-user">добавлено пользователем</span>' : ''}
      </div>
      <p class="muted">${esc(address || 'Адрес не указан')}${state.myPos ? ` · ${fmtDist(distance(state.myPos, p))} от вас` : ''}</p>

      ${mine ? `<div class="card card-session">
          <h3>Вы здесь</h3>
          <div class="big">${beers(s.drinks.length)} · ${fmtL(liters(s.drinks))}</div>
          ${sessionControls(s, false)}
        </div>`
        : `<div class="row wrap">
          <button class="btn btn-primary" data-action="checkin" data-id="${esc(p.id)}">🍺 Я тут пью</button>
          <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Маршрут ↗</a>
        </div>`}

      <div class="card">
        <h3>Сейчас здесь пьют${state.user ? ` (${here.length})` : ''}</h3>
        ${!state.user ? '<p class="muted">Войдите, чтобы видеть друзей в этой пивной.</p>'
          : here.length ? `<ul class="list">${here.map(d => drinkerItem(d)).join('')}</ul>`
          : '<p class="muted">Из ваших друзей здесь пока никого.</p>'}
      </div>

      <div class="card">
        <h3>Здесь правда танковое?</h3>
        <p class="muted">${isUser
          ? 'Место добавлено пользователем — подтвердите, если были здесь.'
          : `Источник: <a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(p.source.name)}</a>. Данные могли устареть — подтвердите, если были здесь недавно.`}</p>
        <div class="row wrap">
          <button class="btn ${vote === 'yes' ? 'btn-ok' : ''}" data-action="vote" data-v="yes" aria-pressed="${vote === 'yes'}">✔ Да, танковое · ${counts.yes}</button>
          <button class="btn ${vote === 'no' ? 'btn-no' : ''}" data-action="vote" data-v="no" aria-pressed="${vote === 'no'}">✖ Уже нет · ${counts.no}</button>
        </div>
      </div>
    </div>`;
  }

  function viewAdd() {
    return `<div class="view">
      <button class="btn btn-ghost" data-action="add-cancel">← Отмена</button>
      <h2>Новая пивная</h2>
      <p class="muted" id="addPoint">${state.pendingPoint ? '✔ Точка на карте выбрана.' : '① Нажмите на карту, где находится пивная.'}</p>
      <label class="field">Название<input id="aName" class="input" maxlength="60" placeholder="Например, U Kocoura"></label>
      <label class="field">Адрес <span class="muted">(необязательно)</span><input id="aAddress" class="input" maxlength="80" placeholder="Улица и номер дома"></label>
      <label class="field">Город<input id="aCity" class="input" maxlength="40" placeholder="Praha"></label>
      <label class="field">Какое пиво из танка
        <select id="aBrand" class="select">
          ${BRANDS.map(b => `<option>${esc(b)}</option>`).join('')}
          <option value="">Другое / не знаю</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" id="aTank"> <span>Подтверждаю: здесь наливают <b>именно танковое</b> пиво (из танков, а не из кегов)</span></label>
      <button class="btn btn-primary" data-action="add-save">Добавить на карту</button>
    </div>`;
  }

  function viewNearby() {
    if (!sb) return `<div class="view"><h2>Кто пьёт рядом</h2>${offlineNote}</div>`;
    if (state.loading) return '<div class="view"><p class="muted">Загрузка…</p></div>';
    if (!state.user) {
      return `<div class="view"><h2>Кто пьёт рядом</h2>
        <p class="muted">Войдите, чтобы видеть, в каких пивных сейчас ваши друзья и сколько они выпили.</p>
        <button class="btn btn-primary" data-action="tab" data-tab="me">Войти или зарегистрироваться</button></div>`;
    }
    const ref = refPoint();
    const rows = drinkers()
      .map(d => ({ d, m: distance(ref, pubById(d.pubId)) }))
      .sort((a, b) => (b.d.isMe ? 1 : 0) - (a.d.isMe ? 1 : 0) || a.m - b.m);
    return `<div class="view">
      <h2>Кто пьёт рядом</h2>
      <button class="btn" data-action="locate">📍 Определить, где я</button>
      <p class="muted">Расстояние ${refLabel()}. Видны только друзья, которые сами отметились в пивной, — постоянной слежки по GPS нет. Список обновляется каждые 30 секунд.</p>
      ${rows.length ? `<ul class="list">${rows.map(({ d, m }) => drinkerItem(d, { showPub: true, clickable: true, dist: m })).join('')}</ul>`
        : '<p class="muted">Сейчас никто из друзей не отметился в пивной.</p>'}
      ${state.friends.length ? '' : `<div class="note">У вас пока нет друзей в Tankovka. Отправьте им ссылку-приглашение из раздела «Я».
        <div class="mt"><button class="btn" data-action="tab" data-tab="me">Пригласить друзей</button></div></div>`}
    </div>`;
  }

  function viewAuth() {
    const signup = state.authMode === 'signup';
    return `<div class="view">
      ${state.pendingFriendCode ? '<div class="note" style="margin:0 0 12px">🍻 Вас пригласили в друзья! Зарегистрируйтесь или войдите — дружба добавится сама.</div>' : ''}
      <div class="seg">
        <button data-action="auth-mode" data-mode="signup" aria-pressed="${signup}">Регистрация</button>
        <button data-action="auth-mode" data-mode="login" aria-pressed="${!signup}">Вход</button>
      </div>
      ${state.notice ? `<div class="note">${esc(state.notice)}</div>` : ''}
      ${signup ? `
        <label class="field">Имя или ник<input id="pName" class="input" maxlength="24" autocomplete="nickname" placeholder="Как вас называют друзья"></label>
        <div class="field">Аватар
          <div class="emojis">${AVATARS.map(e => `<button class="emoji" data-action="pick-emoji" data-e="${e}" aria-pressed="${e === state.pickedEmoji}" aria-label="Аватар ${e}">${e}</button>`).join('')}</div>
        </div>` : ''}
      <label class="field">Email<input id="pEmail" class="input" type="email" autocomplete="email" placeholder="you@example.com"></label>
      <label class="field">Пароль<input id="pPassword" class="input" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'Минимум 6 символов' : ''}"></label>
      ${signup ? '<label class="check"><input type="checkbox" id="p18"> <span>Мне уже исполнилось 18 лет</span></label>' : '<div class="mt"></div>'}
      <button class="btn btn-primary" data-action="${signup ? 'signup' : 'login'}">${signup ? 'Создать профиль' : 'Войти'}</button>
    </div>`;
  }

  function friendItem(f) {
    const s = state.live.find(x => x.userId === f.id);
    const pub = s && pubById(s.pubId);
    const status = pub ? `в «${esc(pub.name)}» · ${beers(s.drinks.length)}` : 'сейчас не в пивной';
    const armed = state.armed === 'remove:' + f.id;
    return `<li class="item">
      <div class="ico">${esc(f.emoji)}</div>
      <div class="main"><div class="title">${esc(f.name)}</div><div class="sub">${status}</div></div>
      <button class="btn btn-ghost btn-danger" data-action="remove-friend" data-id="${esc(f.id)}">${armed ? 'Точно?' : 'Убрать'}</button>
    </li>`;
  }

  function viewMe() {
    if (!sb) return `<div class="view"><h2>Ваш профиль</h2>${offlineNote}</div>`;
    if (state.loading) return '<div class="view"><p class="muted">Загрузка…</p></div>';
    if (!state.user) return viewAuth();
    const p = state.profile;
    if (!p) return '<div class="view"><p class="muted">Профиль не найден. Попробуйте выйти и войти снова.</p><button class="btn" data-action="logout">Выйти</button></div>';

    const s = mySession();
    const sp = s && pubById(s.pubId);
    const st = state.stats || { beers: 0, liters: 0, pubs: 0 };

    return `<div class="view">
      <div class="profile">
        <div class="avatar">${esc(p.emoji)}</div>
        <div><div class="title" style="font-size:18px">${esc(p.name)}</div><div class="muted">в Tankovka с ${fmtDate(p.created_at)}</div></div>
      </div>

      ${s && sp ? `<div class="card card-session">
          <h3>Сейчас: ${esc(sp.name)}</h3>
          <div class="big">${beers(s.drinks.length)} · ${fmtL(liters(s.drinks))}</div>
          <div class="muted">с ${fmtTime(s.startedAt)} · ≈ ${grams(liters(s.drinks))} г чистого алкоголя</div>
          ${sessionControls(s, true)}
          <p class="muted">Отметка снимется сама через 8 часов.</p>
        </div>`
        : `<div class="card">
          <h3>Вы сейчас не в пивной</h3>
          <p class="muted">Выберите пивную на карте и нажмите «Я тут пью».</p>
          <button class="btn" data-action="tab" data-tab="pubs">Открыть пивные</button>
        </div>`}

      <div class="card">
        <h3>За всё время</h3>
        <div class="stats">
          <div><div class="n">${st.beers}</div><div class="muted">${plural(st.beers, ['пиво', 'пива', 'пив'])}</div></div>
          <div><div class="n">${fmtNum(st.liters)}</div><div class="muted">литров</div></div>
          <div><div class="n">${st.pubs}</div><div class="muted">${plural(st.pubs, ['пивная', 'пивные', 'пивных'])}</div></div>
        </div>
      </div>

      <div class="card">
        <h3>Друзья (${state.friends.length})</h3>
        <p class="muted">Ваш код друга: <b class="code">${esc(p.friend_code)}</b></p>
        <button class="btn btn-primary" data-action="share-invite">🔗 Пригласить по ссылке</button>
        <div class="row mt">
          <input id="friendCode" class="input" maxlength="12" autocapitalize="characters" autocomplete="off" placeholder="Код друга" aria-label="Код друга">
          <button class="btn" data-action="add-friend">Добавить</button>
        </div>
        ${state.friends.length ? `<ul class="list">${state.friends.map(friendItem).join('')}</ul>` : ''}
      </div>

      <div class="card">
        <h3>Кто видит, где я пью</h3>
        <div class="seg">
          <button data-action="visibility" data-v="friends" aria-pressed="${p.visibility === 'friends'}">Друзья</button>
          <button data-action="visibility" data-v="nobody" aria-pressed="${p.visibility === 'nobody'}">Никто</button>
        </div>
        <p class="muted">${p.visibility === 'friends'
          ? 'Друзья видят пивную, где вы отметились, и сколько выпито.'
          : 'Вы невидимка: пиво считается только для вас.'}</p>
      </div>

      ${state.history.length ? `<div class="card">
          <h3>История</h3>
          <ul class="list">${state.history.map(h => {
            const hp = pubById(h.pubId);
            return `<li class="item" role="button" tabindex="0" data-action="select-pub" data-id="${esc(h.pubId)}">
              <div class="ico">🍺</div>
              <div class="main"><div class="title">${esc(hp ? hp.name : 'Пивная')}</div><div class="sub">${fmtDate(h.startedAt)}, ${fmtTime(h.startedAt)}–${fmtTime(h.endedAt)}</div></div>
              <div class="meta"><b>${beers(h.drinks.length)}</b><br>${fmtL(liters(h.drinks))}</div>
            </li>`;
          }).join('')}</ul>
        </div>` : ''}

      <div class="row wrap mt">
        <button class="btn" data-action="logout">Выйти</button>
        <button class="btn btn-ghost btn-danger" data-action="delete-me">${state.armed === 'delete-me' ? 'Точно удалить аккаунт? Нажмите ещё раз' : 'Удалить аккаунт'}</button>
      </div>
    </div>`;
  }

  // ---------- отрисовка ----------
  let lastViewKey = '';
  function renderView() {
    const view = $('#view');
    const key = state.tab + ':' + state.view + ':' + state.selectedId + ':' + !!state.user + ':' + state.authMode;
    const sameScreen = key === lastViewKey;

    // сохраняем то, что человек успел ввести, чтобы обновление не стёрло форму
    const kept = {};
    const focusedId = document.activeElement && view.contains(document.activeElement) ? document.activeElement.id : null;
    if (sameScreen) {
      view.querySelectorAll('input[id], select[id]').forEach(el => {
        kept[el.id] = el.type === 'checkbox' ? el.checked : el.value;
      });
    }

    view.innerHTML = state.tab === 'nearby' ? viewNearby()
      : state.tab === 'me' ? viewMe()
      : state.view === 'pub' ? viewPub()
      : state.view === 'add' ? viewAdd()
      : viewList();

    if (sameScreen) {
      Object.keys(kept).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = kept[id]; else el.value = kept[id];
      });
      if (focusedId) {
        const el = document.getElementById(focusedId);
        if (el) el.focus();
      }
    } else {
      $('#panel').scrollTop = 0;
    }
    lastViewKey = key;
  }

  function renderChip() {
    const s = mySession();
    const pub = s && pubById(s.pubId);
    $('#chip').innerHTML = pub ? `<div class="chip">
        <button class="chip-text" data-action="tab" data-tab="me" title="Моя отметка">🍺 ${esc(pub.name)} · ${s.drinks.length}</button>
        <button class="chip-add" data-action="drink" data-size="0.5" aria-label="Добавить пиво 0,5 л">＋0,5</button>
      </div>` : '';
  }

  function render() {
    document.querySelectorAll('.tabs button').forEach(b => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    const adding = state.tab === 'pubs' && state.view === 'add';
    document.body.classList.toggle('adding', adding);
    $('#addHint').hidden = !adding;
    renderView();
    renderChip();
    renderMarkers();
  }

  // ---------- кнопки ----------
  const value = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const checked = id => { const el = document.getElementById(id); return !!(el && el.checked); };

  const actions = {
    tab(el) {
      if (state.view === 'add') clearAddMode();
      state.tab = el.dataset.tab;
      state.view = 'list';
      state.selectedId = null;
      state.armed = null;
      render();
    },
    'select-pub': el => selectPub(el.dataset.id),
    back() { state.view = 'list'; state.selectedId = null; render(); },
    checkin: el => checkIn(el.dataset.id),
    drink: el => addDrink(parseFloat(el.dataset.size)),
    undo: undoDrink,
    end: endSession,
    vote: el => vote(state.selectedId, el.dataset.v),
    locate,
    'add-start'() {
      if (!requireLogin()) return;
      state.tab = 'pubs';
      state.view = 'add';
      state.selectedId = null;
      render();
    },
    'add-cancel'() { clearAddMode(); state.view = 'list'; render(); },
    async 'add-save'() {
      const name = value('aName');
      if (!state.pendingPoint) return toast('Нажмите на карту, где находится пивная');
      if (!name) return toast('Введите название');
      if (!checked('aTank')) return toast('Добавлять можно только места с танковым пивом');
      let newId = null;
      const ok = await withBusy(async () => {
        const row = await call(sb.from('pubs').insert({
          name,
          address: value('aAddress') || null,
          city: value('aCity') || null,
          brand: value('aBrand') || null,
          lat: Math.round(state.pendingPoint.lat * 1e6) / 1e6,
          lng: Math.round(state.pendingPoint.lng * 1e6) / 1e6,
        }).select('id').single());
        newId = row.id;
        await call(sb.from('pub_votes').insert({ pub_id: newId, user_id: me(), vote: 'yes' }));
        state.myVotes[newId] = 'yes';
        await Promise.all([loadPubs(), loadVoteCounts()]);
      });
      if (!ok) return;
      clearAddMode();
      selectPub(newId);
      toast('Пивная добавлена на карту — её увидят все');
    },
    'pick-emoji'(el) {
      state.pickedEmoji = el.dataset.e;
      document.querySelectorAll('.emoji').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === state.pickedEmoji));
    },
    'auth-mode'(el) { state.authMode = el.dataset.mode; state.notice = ''; render(); },
    async signup() {
      const name = value('pName'), email = value('pEmail'), password = document.getElementById('pPassword').value;
      if (!name) return toast('Введите имя или ник');
      if (!email || !password) return toast('Введите email и пароль');
      if (password.length < 6) return toast('Пароль слишком короткий — минимум 6 символов');
      if (!checked('p18')) return toast('Приложение только для тех, кому есть 18');
      let result = null;
      const ok = await withBusy(async () => {
        result = await call(sb.auth.signUp({ email, password, options: { data: { name, emoji: state.pickedEmoji } } }));
      });
      if (!ok) return;
      if (result.session) {
        state.notice = '';
        await setUser(result.session.user);
        toast(`Привет, ${name}! Выберите пивную на карте`);
      } else {
        state.notice = 'Почти готово: мы отправили письмо на ваш email — откройте ссылку из него, потом войдите.';
        state.authMode = 'login';
        render();
      }
    },
    async login() {
      const email = value('pEmail'), password = document.getElementById('pPassword').value;
      if (!email || !password) return toast('Введите email и пароль');
      let result = null;
      const ok = await withBusy(async () => {
        result = await call(sb.auth.signInWithPassword({ email, password }));
      });
      if (!ok) return;
      state.notice = '';
      await setUser(result.user);
      toast('С возвращением! 🍺');
    },
    async logout() {
      await sb.auth.signOut({ scope: 'local' });
      await setUser(null);
      toast('Вы вышли из профиля');
    },
    async 'delete-me'() {
      if (state.armed !== 'delete-me') { state.armed = 'delete-me'; return render(); }
      const ok = await withBusy(async () => { await call(sb.rpc('delete_me')); });
      if (!ok) return;
      await sb.auth.signOut({ scope: 'local' });
      await setUser(null);
      toast('Аккаунт и все данные удалены');
    },
    'add-friend'() { addFriend(value('friendCode'), false); },
    async 'remove-friend'(el) {
      const id = el.dataset.id;
      if (state.armed !== 'remove:' + id) { state.armed = 'remove:' + id; return render(); }
      state.armed = null;
      const ok = await withBusy(async () => {
        await call(sb.rpc('remove_friend', { p_friend: id }));
        await Promise.all([loadPeople(), loadLive()]);
      });
      if (ok) toast('Друг удалён');
    },
    'share-invite': shareInvite,
    async visibility(el) {
      const v = el.dataset.v;
      if (state.profile.visibility === v) return;
      const ok = await withBusy(async () => {
        await call(sb.from('profiles').update({ visibility: v }).eq('id', me()));
        state.profile.visibility = v;
      });
      if (ok) toast(v === 'friends' ? 'Теперь друзья видят, где вы пьёте' : 'Теперь вас никто не видит');
    },
  };

  // действия, которые нельзя запускать, пока предыдущее ещё идёт
  const EXCLUSIVE = new Set(['checkin', 'end', 'vote', 'add-save', 'signup', 'login', 'delete-me', 'remove-friend', 'visibility']);

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const name = el.dataset.action;
    const fn = actions[name];
    if (!fn) return;
    e.preventDefault();
    if (state.busy && EXCLUSIVE.has(name)) return;
    if (state.armed && name !== 'delete-me' && name !== 'remove-friend') state.armed = null;
    fn(el, e);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-action]')) {
      e.preventDefault();
      e.target.click();
    }
    if (e.key === 'Enter' && e.target.matches('#pPassword') && !state.busy) actions[state.authMode === 'signup' ? 'signup' : 'login']();
    if (e.key === 'Enter' && e.target.matches('#friendCode')) actions['add-friend']();
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'search') return;
    state.query = e.target.value;
    $('#pubList').innerHTML = pubListHTML();
  });
  window.addEventListener('resize', () => map.invalidateSize());

  // ---------- старт ----------
  async function boot() {
    render();
    if (!sb) return;
    try {
      await Promise.all([loadPubs(), loadVoteCounts()]);
      render();
    } catch (e) {
      toast(errText(e));
    }
    const { data } = await sb.auth.getSession();
    await setUser(data.session ? data.session.user : null);
    sb.auth.onAuthStateChange((event, session) => {
      const user = session ? session.user : null;
      // вход/выход в другой вкладке или истёкшая сессия; проверяем ещё раз после паузы,
      // чтобы не грузить данные дважды, когда вход уже обработан кнопкой
      setTimeout(() => {
        const id = user ? user.id : null;
        if (id !== (me() || null)) setUser(user);
      }, 0);
    });
    setInterval(() => { if (!document.hidden) refreshLive(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
  }
  boot();
})();
