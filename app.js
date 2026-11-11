'use strict';

/*
 * Natankováno — танковое пиво на карте Чехии (раньше называлось Tankovka).
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
  const SHOT_ABV = 0.40;                      // крепкое (водка, ром, бехеровка, сливовица) ≈ 40 %
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
    installPrompt: null, // событие браузера «можно установить» (Android/Chrome)
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

  // ---------- языки (см. i18n.js) ----------
  const I18N = window.TK_I18N;
  const t = I18N.t, tn = I18N.tn;

  const beers = n => tn('n_beers', n);
  const shots = n => tn('n_shots', n);
  const isShot = d => d.kind === 'shot';
  const countBeers = drinks => drinks.filter(d => !isShot(d)).length;
  const countShots = drinks => drinks.filter(isShot).length;
  // литры считаем только по пиву: стопки — отдельным счётчиком
  const liters = drinks => Math.round(drinks.reduce((sum, d) => sum + (isShot(d) ? 0 : d.size), 0) * 10) / 10;
  const fmtNum = n => Number(n).toLocaleString(I18N.locale, { maximumFractionDigits: 1 });
  const fmtL = l => `${fmtNum(l)} ${t('unit_l')}`;
  const fmtMl = l => `${Math.round(l * 1000)} ${t('unit_ml')}`;
  // граммы чистого спирта: объём × крепость × плотность спирта
  const grams = drinks => Math.round(drinks.reduce((g, d) => g + d.size * 1000 * (isShot(d) ? SHOT_ABV : ABV) * 0.789, 0));
  // «2 пива + 3 стопки» (без литров — для коротких строк)
  function countText(drinks) {
    const nb = countBeers(drinks), ns = countShots(drinks);
    return [nb || !ns ? beers(nb) : '', ns ? shots(ns) : ''].filter(Boolean).join(' + ');
  }
  // «2 пива · 1 л + 3 стопки»
  function tally(drinks) {
    const nb = countBeers(drinks), ns = countShots(drinks);
    if (!nb) return countText(drinks);
    return `${beers(nb)} · ${fmtL(liters(drinks))}${ns ? ' + ' + shots(ns) : ''}`;
  }
  // правая колонка в списках: жирным — пиво, ниже — литры и стопки
  function drinksMeta(drinks) {
    const nb = countBeers(drinks), ns = countShots(drinks);
    if (!nb && ns) return `<b>🥃 ${shots(ns)}</b>`;
    return `<b>${beers(nb)}</b><br>${fmtL(liters(drinks))}${ns ? ` · 🥃${ns}` : ''}`;
  }
  const fmtTime = ts => new Date(ts).toLocaleTimeString(I18N.locale, { hour: '2-digit', minute: '2-digit' });
  const fmtDate = ts => new Date(ts).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long' });

  function distance(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} ${t('unit_m')}` : `${fmtNum(m / 1000)} ${t('unit_km')}`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // коды ошибок из supabase/schema.sql → ключи переводов
  const ERRORS = {
    friend_not_found: 'err_friend_not_found',
    self_friend: 'err_self_friend',
    no_active_session: 'err_no_session',
    too_many: 'err_too_many',
    bad_size: 'err_bad_size',
    pub_not_found: 'err_pub_not_found',
    not_authenticated: 'err_not_auth',
  };
  function errText(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    for (const key in ERRORS) if (m.includes(key)) return t(ERRORS[key]);
    if (/Invalid login credentials/i.test(m)) return t('err_bad_login');
    if (/already registered|already been registered|already exists/i.test(m)) return t('err_exists');
    if (/Password should be|password.*(short|characters)/i.test(m)) return t('err_short_pw');
    if (/valid email|invalid format|validate email/i.test(m)) return t('err_email');
    if (/rate limit|too many/i.test(m)) return t('err_rate');
    if (/Email not confirmed/i.test(m)) return t('err_unconfirmed');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return t('err_network');
    return t('err_generic', { m });
  }

  async function call(request) {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  }

  // ---------- данные ----------
  const pubById = id => state.pubs.find(p => p.id === id);
  const refPoint = () => state.myPos || map.getCenter();
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
    drinks: (r.drinks || []).map(d => ({ kind: d.kind || 'beer', size: Number(d.size), at: Date.parse(d.created_at) })).sort((a, b) => a.at - b.at),
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
      .select('id,user_id,pub_id,started_at,ended_at,drinks(size,kind,created_at)')
      .is('ended_at', null).gt('started_at', since));
    state.live = rows.map(fromSessionRow);
  }
  async function loadStats() {
    state.stats = await call(sb.rpc('my_stats'));
  }
  async function loadMine() {
    const [hist, votes] = await Promise.all([
      call(sb.from('sessions')
        .select('id,user_id,pub_id,started_at,ended_at,drinks(size,kind,created_at)')
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
    if (!sb) { toast(t('no_server')); return false; }
    if (state.user && state.profile) return true;
    if (pendingPub) state.pendingCheckin = pendingPub;
    state.tab = 'me';
    render();
    toast(t('login_first'));
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
    if (ok) toast(t(current ? 'checked_in_moved' : 'checked_in'));
  }

  // kind: 'beer' — пиво 0,3/0,5 л, 'shot' — стопка крепкого 0,02/0,04 л
  async function addDrink(size, kind) {
    kind = kind === 'shot' ? 'shot' : 'beer';
    const s = mySession();
    if (!s) return toast(t('err_no_session'));
    const drink = { kind, size, at: Date.now() };
    s.drinks.push(drink);                      // сразу показываем, потом сохраняем
    render();
    toast(`${kind === 'shot' ? '🥃' : '🍺'} ${tally(s.drinks)}`);
    try {
      await call(sb.rpc('add_drink', { p_size: size, p_kind: kind }));
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
    if (ok) toast(s.drinks.length ? t('saved_tally', { t: tally(s.drinks) }) : t('checkin_removed'));
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
    if (ok && state.myVotes[pubId] === 'yes') toast(t('vote_yes_thanks'));
    if (ok && state.myVotes[pubId] === 'no') toast(t('vote_no_thanks'));
  }

  async function addFriend(code, fromInvite) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const forget = () => { state.pendingFriendCode = null; localStorage.removeItem(PENDING_FRIEND_KEY); };
    if (!code) return toast(t('enter_friend_code'));
    if (state.profile && code === state.profile.friend_code) {
      forget();
      if (!fromInvite) toast(t('err_self_friend'));
      return;
    }
    try {
      const friend = await call(sb.rpc('add_friend', { p_code: code }));
      forget();
      await Promise.all([loadPeople(), loadLive()]);
      const input = $('#friendCode');
      if (input) input.value = '';
      render();
      toast(t('friend_added', { who: `${friend.emoji} ${friend.name}` }));
    } catch (e) {
      if (fromInvite) forget();
      toast(errText(e));
    }
  }

  async function shareInvite() {
    const url = `${location.origin}${location.pathname}?friend=${state.profile.friend_code}`;
    const text = t('invite_text');
    if (navigator.share) {
      try { await navigator.share({ title: 'Natankováno', text, url }); return; } catch (e) { /* отменили — копируем */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t('invite_copied'));
    } catch (e) {
      window.prompt(t('invite_prompt'), url);
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
          .bindTooltip(t('you_are_here')).addTo(map);
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
    if (status) status.textContent = t('point_picked_move');
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
    if (!navigator.geolocation) return toast(t('geo_unsupported'));
    toast(t('geo_locating'));
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setView([state.myPos.lat, state.myPos.lng], 14);
        render();
        toast(t('geo_done'));
      },
      () => toast(t('geo_failed')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // ---------- экраны ----------
  const offlineNote = () => `<div class="note">${t('offline_note')}</div>`;

  function pubListHTML() {
    const q = state.query.trim().toLowerCase();
    const ref = refPoint();
    const rows = state.pubs
      .filter(p => !q || [p.name, p.city, p.brand, p.address].join(' ').toLowerCase().includes(q))
      .map(p => ({ p, d: distance(ref, p) }))
      .sort((a, b) => a.d - b.d);
    if (!rows.length) return `<li class="muted">${t('nothing_found')}</li>`;
    return rows.map(({ p, d }) => {
      const n = drinkersAt(p.id).length;
      return `<li class="item" role="button" tabindex="0" data-action="select-pub" data-id="${esc(p.id)}">
        <div class="ico">🍺</div>
        <div class="main">
          <div class="title">${esc(p.name)} ${p.source.type === 'user' ? `<span class="badge badge-user">${t('badge_new')}</span>` : ''}</div>
          <div class="sub">${esc(p.city || t('country'))} · ${esc(p.brand || t('no_brand'))}</div>
        </div>
        <div class="meta">${fmtDist(d)}${n ? `<br>👥 ${n}` : ''}</div>
      </li>`;
    }).join('');
  }

  function viewList() {
    return `<div class="view">
      <div class="row wrap"><span class="badge badge-tank">${t('only_tank_badge')}</span><span class="muted">${tn('n_places', state.pubs.length)}</span></div>
      <input id="search" class="input mt" type="search" placeholder="${t('search_ph')}" aria-label="${t('search_label')}" value="${esc(state.query)}">
      <div class="row wrap mt">
        <button class="btn" data-action="locate">${t('near_me_btn')}</button>
        <button class="btn" data-action="add-start">${t('add_pub_btn')}</button>
      </div>
      <p class="muted">${t(state.myPos ? 'nearest_me' : 'nearest_center')}</p>
      <ul class="list" id="pubList">${pubListHTML()}</ul>
      ${sb ? '' : offlineNote()}
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
        <div class="title">${d.isMe ? t('you') : esc(d.name)} ${hidden ? `<span class="badge">${t('hidden_badge')}</span>` : ''}</div>
        <div class="sub">${opts.showPub ? esc(pub.name) + ' · ' : ''}${t('since', { time: fmtTime(d.since) })}</div>
      </div>
      <div class="meta">${drinksMeta(d.drinks)}${opts.dist != null ? `<br>${fmtDist(opts.dist)}` : ''}</div>
    </li>`;
  }

  function sessionControls(s, withUndo) {
    const beerBtn = (size, cls) => `<button class="btn ${cls}" data-action="drink" data-size="${size}" aria-label="${t('add_beer_aria', { v: fmtL(size) })}">＋ ${fmtL(size)}</button>`;
    const shotBtn = size => `<button class="btn btn-shot" data-action="drink" data-kind="shot" data-size="${size}" aria-label="${t('add_shot_aria', { v: fmtMl(size) })}">＋ ${fmtMl(size)}</button>`;
    return `<div class="drink-row mt">
        <span class="drink-label">${t('label_beer')}</span>
        ${beerBtn(0.5, 'btn-primary')}
        ${beerBtn(0.3, '')}
      </div>
      <div class="drink-row mt">
        <span class="drink-label">${t('label_spirits')}</span>
        ${shotBtn(0.04)}
        ${shotBtn(0.02)}
      </div>
      <div class="row wrap mt">
        ${withUndo ? `<button class="btn" data-action="undo" ${s.drinks.length ? '' : 'disabled'}>${t('undo')}</button>` : ''}
        <button class="btn" data-action="end">${t('finish')}</button>
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
      <button class="btn btn-ghost" data-action="back">${t('back_all')}</button>
      <h2 class="pub-title">${esc(p.name)}</h2>
      <div class="row wrap">
        <span class="badge badge-tank">TANKOVÉ</span>
        <span class="badge">${esc(p.brand || t('no_brand'))}</span>
        ${isUser ? `<span class="badge badge-user">${t('added_by_user')}</span>` : ''}
      </div>
      <p class="muted">${esc(address || t('no_address'))}${state.myPos ? ` · ${t('dist_from_you', { d: fmtDist(distance(state.myPos, p)) })}` : ''}</p>

      ${mine ? `<div class="card card-session">
          <h3>${t('you_are_here')}</h3>
          <div class="big">${tally(s.drinks)}</div>
          ${sessionControls(s, false)}
        </div>`
        : `<div class="row wrap">
          <button class="btn btn-primary" data-action="checkin" data-id="${esc(p.id)}">${t('drinking_here_btn')}</button>
          <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">${t('route')}</a>
        </div>`}

      <div class="card">
        <h3>${t('drinking_now_h')}${state.user ? ` (${here.length})` : ''}</h3>
        ${!state.user ? `<p class="muted">${t('login_to_see_friends_here')}</p>`
          : here.length ? `<ul class="list">${here.map(d => drinkerItem(d)).join('')}</ul>`
          : `<p class="muted">${t('no_friends_here')}</p>`}
      </div>

      <div class="card">
        <h3>${t('really_tank_h')}</h3>
        <p class="muted">${isUser
          ? t('user_place_confirm')
          : t('source_confirm', { link: `<a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(p.source.name)}</a>` })}</p>
        <div class="row wrap">
          <button class="btn ${vote === 'yes' ? 'btn-ok' : ''}" data-action="vote" data-v="yes" aria-pressed="${vote === 'yes'}">${t('vote_yes', { n: counts.yes })}</button>
          <button class="btn ${vote === 'no' ? 'btn-no' : ''}" data-action="vote" data-v="no" aria-pressed="${vote === 'no'}">${t('vote_no', { n: counts.no })}</button>
        </div>
      </div>
    </div>`;
  }

  function viewAdd() {
    return `<div class="view">
      <button class="btn btn-ghost" data-action="add-cancel">${t('cancel')}</button>
      <h2>${t('new_pub_h')}</h2>
      <p class="muted" id="addPoint">${t(state.pendingPoint ? 'point_picked' : 'step_pick_point')}</p>
      <label class="field">${t('f_name')}<input id="aName" class="input" maxlength="60" placeholder="${t('f_name_ph')}"></label>
      <label class="field">${t('f_address')} <span class="muted">${t('optional')}</span><input id="aAddress" class="input" maxlength="80" placeholder="${t('f_address_ph')}"></label>
      <label class="field">${t('f_city')}<input id="aCity" class="input" maxlength="40" placeholder="Praha"></label>
      <label class="field">${t('f_brand')}
        <select id="aBrand" class="select">
          ${BRANDS.map(b => `<option>${esc(b)}</option>`).join('')}
          <option value="">${t('f_brand_other')}</option>
        </select>
      </label>
      <label class="check"><input type="checkbox" id="aTank"> <span>${t('f_tank_confirm')}</span></label>
      <button class="btn btn-primary" data-action="add-save">${t('add_to_map')}</button>
    </div>`;
  }

  function viewNearby() {
    if (!sb) return `<div class="view"><h2>${t('nearby_h')}</h2>${offlineNote()}</div>`;
    if (state.loading) return `<div class="view"><p class="muted">${t('loading')}</p></div>`;
    if (!state.user) {
      return `<div class="view"><h2>${t('nearby_h')}</h2>
        <p class="muted">${t('login_to_see_nearby')}</p>
        <button class="btn btn-primary" data-action="tab" data-tab="me">${t('login_or_signup')}</button></div>`;
    }
    const ref = refPoint();
    const rows = drinkers()
      .map(d => ({ d, m: distance(ref, pubById(d.pubId)) }))
      .sort((a, b) => (b.d.isMe ? 1 : 0) - (a.d.isMe ? 1 : 0) || a.m - b.m);
    return `<div class="view">
      <h2>${t('nearby_h')}</h2>
      <button class="btn" data-action="locate">${t('where_am_i')}</button>
      <p class="muted">${t(state.myPos ? 'dist_from_me' : 'dist_from_center')} ${t('nearby_privacy')}</p>
      ${rows.length ? `<ul class="list">${rows.map(({ d, m }) => drinkerItem(d, { showPub: true, clickable: true, dist: m })).join('')}</ul>`
        : `<p class="muted">${t('no_friends_drinking')}</p>`}
      ${state.friends.length ? '' : `<div class="note">${t('no_friends_yet')}
        <div class="mt"><button class="btn" data-action="tab" data-tab="me">${t('invite_friends_btn')}</button></div></div>`}
    </div>`;
  }

  function viewAuth() {
    const signup = state.authMode === 'signup';
    return `<div class="view">
      ${state.pendingFriendCode ? `<div class="note" style="margin:0 0 12px">${t('invited_note')}</div>` : ''}
      <div class="seg">
        <button data-action="auth-mode" data-mode="signup" aria-pressed="${signup}">${t('signup_tab')}</button>
        <button data-action="auth-mode" data-mode="login" aria-pressed="${!signup}">${t('login_tab')}</button>
      </div>
      ${state.notice ? `<div class="note">${t(state.notice)}</div>` : ''}
      ${signup ? `
        <label class="field">${t('f_nick')}<input id="pName" class="input" maxlength="24" autocomplete="nickname" placeholder="${t('f_nick_ph')}"></label>
        <div class="field">${t('f_avatar')}
          <div class="emojis">${AVATARS.map(e => `<button class="emoji" data-action="pick-emoji" data-e="${e}" aria-pressed="${e === state.pickedEmoji}" aria-label="${t('f_avatar_aria', { e })}">${e}</button>`).join('')}</div>
        </div>` : ''}
      <label class="field">${t('f_email')}<input id="pEmail" class="input" type="email" autocomplete="email" placeholder="you@example.com"></label>
      <label class="field">${t('f_password')}<input id="pPassword" class="input" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? t('f_password_ph') : ''}"></label>
      ${signup ? `<label class="check"><input type="checkbox" id="p18"> <span>${t('f_18')}</span></label>` : '<div class="mt"></div>'}
      <button class="btn btn-primary" data-action="${signup ? 'signup' : 'login'}">${t(signup ? 'create_profile' : 'login_btn')}</button>
      ${installCard()}
    </div>`;
  }

  // ---------- установка на телефон (иконка на главном экране) ----------
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => !/Android/.test(navigator.userAgent) &&
    (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); // iPad выдаёт себя за Mac
  function installCard() {
    if (isStandalone()) return '';
    const how = state.installPrompt
      ? `<button class="btn btn-primary" data-action="install">${t('install_btn')}</button>`
      : `<p class="muted">${t(isIOS() ? 'install_ios' : 'install_other')}</p>`;
    return `<div class="card">
      <h3>${t('install_h')}</h3>
      <p class="muted">${t('install_text')}</p>
      ${how}
    </div>`;
  }

  function friendItem(f) {
    const s = state.live.find(x => x.userId === f.id);
    const pub = s && pubById(s.pubId);
    const status = pub ? t('friend_at', { pub: esc(pub.name), c: countText(s.drinks) }) : t('friend_not_at_pub');
    const armed = state.armed === 'remove:' + f.id;
    return `<li class="item">
      <div class="ico">${esc(f.emoji)}</div>
      <div class="main"><div class="title">${esc(f.name)}</div><div class="sub">${status}</div></div>
      <button class="btn btn-ghost btn-danger" data-action="remove-friend" data-id="${esc(f.id)}">${t(armed ? 'sure_q' : 'remove')}</button>
    </li>`;
  }

  function viewMe() {
    if (!sb) return `<div class="view"><h2>${t('your_profile')}</h2>${offlineNote()}</div>`;
    if (state.loading) return `<div class="view"><p class="muted">${t('loading')}</p></div>`;
    if (!state.user) return viewAuth();
    const p = state.profile;
    if (!p) return `<div class="view"><p class="muted">${t('profile_not_found')}</p><button class="btn" data-action="logout">${t('logout')}</button></div>`;

    const s = mySession();
    const sp = s && pubById(s.pubId);
    const st = Object.assign({ beers: 0, liters: 0, shots: 0, pubs: 0 }, state.stats);

    return `<div class="view">
      <div class="profile">
        <div class="avatar">${esc(p.emoji)}</div>
        <div><div class="title" style="font-size:18px">${esc(p.name)}</div><div class="muted">${t('member_since', { date: fmtDate(p.created_at) })}</div></div>
      </div>

      ${s && sp ? `<div class="card card-session">
          <h3>${t('now_at', { pub: esc(sp.name) })}</h3>
          <div class="big">${tally(s.drinks)}</div>
          <div class="muted">${t('since_alcohol', { time: fmtTime(s.startedAt), g: grams(s.drinks) })}</div>
          ${sessionControls(s, true)}
          <p class="muted">${t('auto_end_note')}</p>
        </div>`
        : `<div class="card">
          <h3>${t('not_in_pub_h')}</h3>
          <p class="muted">${t('not_in_pub_text')}</p>
          <button class="btn" data-action="tab" data-tab="pubs">${t('open_pubs')}</button>
        </div>`}

      <div class="card">
        <h3>${t('all_time_h')}</h3>
        <div class="stats">
          <div><div class="n">${st.beers}</div><div class="muted">${tn('w_beers', st.beers)}</div></div>
          <div><div class="n">${fmtNum(st.liters)}</div><div class="muted">${t('w_liters')}</div></div>
          <div><div class="n">${st.shots}</div><div class="muted">${tn('w_shots', st.shots)}</div></div>
          <div><div class="n">${st.pubs}</div><div class="muted">${tn('w_pubs', st.pubs)}</div></div>
        </div>
      </div>

      <div class="card">
        <h3>${t('friends_h', { n: state.friends.length })}</h3>
        <p class="muted">${t('your_code')} <b class="code">${esc(p.friend_code)}</b></p>
        <button class="btn btn-primary" data-action="share-invite">${t('invite_link_btn')}</button>
        <div class="row mt">
          <input id="friendCode" class="input" maxlength="12" autocapitalize="characters" autocomplete="off" placeholder="${t('friend_code_ph')}" aria-label="${t('friend_code_ph')}">
          <button class="btn" data-action="add-friend">${t('add')}</button>
        </div>
        ${state.friends.length ? `<ul class="list">${state.friends.map(friendItem).join('')}</ul>` : ''}
      </div>

      <div class="card">
        <h3>${t('who_sees_h')}</h3>
        <div class="seg">
          <button data-action="visibility" data-v="friends" aria-pressed="${p.visibility === 'friends'}">${t('vis_friends')}</button>
          <button data-action="visibility" data-v="nobody" aria-pressed="${p.visibility === 'nobody'}">${t('vis_nobody')}</button>
        </div>
        <p class="muted">${t(p.visibility === 'friends' ? 'vis_friends_text' : 'vis_nobody_text')}</p>
      </div>

      ${installCard()}

      ${state.history.length ? `<div class="card">
          <h3>${t('history_h')}</h3>
          <ul class="list">${state.history.map(h => {
            const hp = pubById(h.pubId);
            return `<li class="item" role="button" tabindex="0" data-action="select-pub" data-id="${esc(h.pubId)}">
              <div class="ico">🍺</div>
              <div class="main"><div class="title">${esc(hp ? hp.name : t('pub_generic'))}</div><div class="sub">${fmtDate(h.startedAt)}, ${fmtTime(h.startedAt)}–${fmtTime(h.endedAt)}</div></div>
              <div class="meta">${drinksMeta(h.drinks)}</div>
            </li>`;
          }).join('')}</ul>
        </div>` : ''}

      <div class="row wrap mt">
        <button class="btn" data-action="logout">${t('logout')}</button>
        <button class="btn btn-ghost btn-danger" data-action="delete-me">${t(state.armed === 'delete-me' ? 'delete_sure' : 'delete_account')}</button>
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
        <button class="chip-text" data-action="tab" data-tab="me" title="${t('my_checkin')}"><span class="chip-pub">${esc(pub.name)}</span><span class="chip-count">🍺${countBeers(s.drinks)}${countShots(s.drinks) ? ` 🥃${countShots(s.drinks)}` : ''}</span></button>
        <button class="chip-add" data-action="drink" data-size="0.5" aria-label="${t('add_beer_aria', { v: fmtL(0.5) })}">＋${fmtNum(0.5)}</button>
      </div>` : '';
  }

  // тексты из index.html: заголовок, вкладки, подсказки, выбор языка
  function renderStatic() {
    document.documentElement.lang = I18N.lang;
    document.title = t('title');
    $('#tagline').textContent = t('tagline');
    $('#map').setAttribute('aria-label', t('map_label'));
    $('#addHint').textContent = t('add_hint');
    document.querySelectorAll('.tabs button').forEach(b => { b.textContent = t('tab_' + b.dataset.tab); });
    const sel = $('#lang');
    if (!sel.options.length) {
      sel.innerHTML = I18N.LANGS.map(l => `<option value="${l.code}">${esc(l.name)}</option>`).join('');
    }
    sel.value = I18N.lang;
    sel.setAttribute('aria-label', t('lang_label'));
    $('#langCode').textContent = I18N.short;
  }

  function render() {
    renderStatic();
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
    drink: el => addDrink(parseFloat(el.dataset.size), el.dataset.kind),
    install: async () => {
      const prompt = state.installPrompt;
      if (!prompt) return;
      state.installPrompt = null;                // окно установки можно показать только один раз
      prompt.prompt();
      await prompt.userChoice.catch(() => null);
      render();
    },
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
      if (!state.pendingPoint) return toast(t('add_hint'));
      if (!name) return toast(t('enter_name'));
      if (!checked('aTank')) return toast(t('only_tank_places'));
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
      toast(t('pub_added'));
    },
    'pick-emoji'(el) {
      state.pickedEmoji = el.dataset.e;
      document.querySelectorAll('.emoji').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === state.pickedEmoji));
    },
    'auth-mode'(el) { state.authMode = el.dataset.mode; state.notice = ''; render(); },
    async signup() {
      const name = value('pName'), email = value('pEmail'), password = document.getElementById('pPassword').value;
      if (!name) return toast(t('enter_nick'));
      if (!email || !password) return toast(t('enter_email_pw'));
      if (password.length < 6) return toast(t('err_short_pw'));
      if (!checked('p18')) return toast(t('adults_only'));
      let result = null;
      const ok = await withBusy(async () => {
        result = await call(sb.auth.signUp({ email, password, options: { data: { name, emoji: state.pickedEmoji } } }));
      });
      if (!ok) return;
      if (result.session) {
        state.notice = '';
        await setUser(result.session.user);
        toast(t('hello_name', { name }));
      } else {
        state.notice = 'notice_check_email';
        state.authMode = 'login';
        render();
      }
    },
    async login() {
      const email = value('pEmail'), password = document.getElementById('pPassword').value;
      if (!email || !password) return toast(t('enter_email_pw'));
      let result = null;
      const ok = await withBusy(async () => {
        result = await call(sb.auth.signInWithPassword({ email, password }));
      });
      if (!ok) return;
      state.notice = '';
      await setUser(result.user);
      toast(t('welcome_back'));
    },
    async logout() {
      await sb.auth.signOut({ scope: 'local' });
      await setUser(null);
      toast(t('logged_out'));
    },
    async 'delete-me'() {
      if (state.armed !== 'delete-me') { state.armed = 'delete-me'; return render(); }
      const ok = await withBusy(async () => { await call(sb.rpc('delete_me')); });
      if (!ok) return;
      await sb.auth.signOut({ scope: 'local' });
      await setUser(null);
      toast(t('account_deleted'));
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
      if (ok) toast(t('friend_removed'));
    },
    'share-invite': shareInvite,
    async visibility(el) {
      const v = el.dataset.v;
      if (state.profile.visibility === v) return;
      const ok = await withBusy(async () => {
        await call(sb.from('profiles').update({ visibility: v }).eq('id', me()));
        state.profile.visibility = v;
      });
      if (ok) toast(t(v === 'friends' ? 'vis_now_friends' : 'vis_now_nobody'));
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
  // смена языка: запоминаем выбор и перерисовываем всё (введённый текст в полях сохраняется)
  document.addEventListener('change', e => {
    if (e.target.id !== 'lang') return;
    I18N.set(e.target.value);
    render();
    if (meMarker) meMarker.setTooltipContent(t('you_are_here'));
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'search') return;
    state.query = e.target.value;
    $('#pubList').innerHTML = pubListHTML();
  });
  window.addEventListener('resize', () => map.invalidateSize());

  // установка как приложение: Chrome/Android сообщает, что сайт можно установить
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.installPrompt = e;
    render();
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    toast(t('installed_toast'));
    render();
  });
  // офлайн-копия интерфейса: сначала сеть, без сети — последняя сохранённая версия
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* без офлайна тоже работает */ });
  }

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
