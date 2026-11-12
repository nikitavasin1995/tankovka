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
  // аватары — только алкоголь (все такие эмодзи, что есть в Unicode).
  // Старые аватары у пользователей сохраняются, пока они сами их не сменят.
  const AVATARS = ['🍺', '🍻', '🥃', '🍷', '🥂', '🍾', '🍸', '🍹', '🍶'];
  const PENDING_FRIEND_KEY = 'tk.pendingFriend';
  const ADULT_KEY = 'tk.adult';               // «мне есть 18» — спрашиваем один раз при первом запуске
  const SITE = 'https://natankovano.cz/';     // адрес сайта: ссылки-приглашения и правила
  // грубые слова — тот же список, что в supabase/schema.sql (is_offensive); сервер проверяет сам,
  // здесь — чтобы сразу подсказать, не дожидаясь ответа
  const OFFENSIVE = /fuck|cunt|nigg|faggot|kurva|kurvo|kurvy|píč|pič[aiou]|kokot|čurák|curak|zmrd|mrdat|mrdk|šukat|buzerant|hurensohn|wichser|fotze|arschloch|pizd|mudak|blyat|blyad|bljad|хуй|хуе|хуё|хуя|пизд|ебат|ебал|ебан|ёбан|еблан|бляд|блят|мудак|мудил|пидор|пидар|підар|залуп/;
  const isOffensive = (...texts) => OFFENSIVE.test(texts.join(' ').toLowerCase());

  // ---------- приложение для iPhone (Capacitor) ----------
  // в App Store-версии сайт лежит внутри приложения, а GPS, вибрация и «Поделиться» — родные iOS
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plugin = name => (NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
  const buzz = () => { const h = plugin('Haptics'); if (h) h.impact({ style: 'MEDIUM' }).catch(() => {}); };

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
    editAvatar: false,   // открыт выбор аватара в профиле
    events: [],          // события и акции в пивных (текущие и на 7 дней вперёд)
    publicLive: [],      // отметки людей, которые показывают себя всем (не друзья)
    nearPubId: null,     // пивная рядом по GPS — предлагаем отметиться
    onlyEvents: false,   // фильтр «только с событиями»
    eventForm: null,     // id пивной, для которой открыта форма нового события
    evKind: 'event',
    personMenu: null,    // у какого человека открыто меню «Пожаловаться / Заблокировать»
    reported: new Set(), // на что я уже пожаловался ('event:<id>', 'user:<id>', 'pub:<id>') — скрываем
    blocks: [],          // кого я заблокировал: { id, name, emoji }
    adult: localStorage.getItem(ADULT_KEY) === '1',
    underage: false,
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
    offensive_text: 'err_offensive',
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

  const isBlocked = id => state.blocks.some(b => b.id === id);

  // кто сейчас в пивных: я, друзья и те, кто показывает себя всем
  function drinkers() {
    return state.live.concat(state.publicLive || []).map(s => {
      const person = s.person || personById(s.userId);
      if (!person || !pubById(s.pubId) || isBlocked(s.userId)) return null;
      return { id: s.userId, isMe: s.userId === me(), isPublic: !!s.person, name: person.name, emoji: person.emoji, pubId: s.pubId, since: s.startedAt, drinks: s.drinks };
    }).filter(Boolean);
  }
  const drinkersAt = pubId => drinkers().filter(d => d.pubId === pubId);

  // ---------- события и акции ----------
  const EVENTS_AHEAD_MS = 7 * 24 * 3600e3;
  const isLive = e => e.start <= Date.now() && e.end > Date.now();
  const eventsAt = pubId => state.events.filter(e => e.pubId === pubId && e.end > Date.now()).sort((a, b) => a.start - b.start);
  const activeEvent = pubId => state.events.find(e => e.pubId === pubId && isLive(e));
  const nextEvent = pubId => eventsAt(pubId).find(e => e.start > Date.now());
  const soonEvent = pubId => { const e = nextEvent(pubId); return e && e.start - Date.now() < 24 * 3600e3 ? e : null; };
  const pad2 = n => String(n).padStart(2, '0');
  const toLocalInput = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  function dayLabel(ts) {
    const d = new Date(ts), today = new Date();
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
    if (diff === 0) return t('today');
    if (diff === 1) return t('tomorrow');
    return d.toLocaleDateString(I18N.locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtWhen(e) {
    const sameDay = new Date(e.start).toDateString() === new Date(e.end - 1).toDateString();
    return sameDay
      ? `${dayLabel(e.start)} ${fmtTime(e.start)}–${fmtTime(e.end)}`
      : `${dayLabel(e.start)} ${fmtTime(e.start)} – ${dayLabel(e.end)} ${fmtTime(e.end)}`;
  }
  async function loadEvents() {
    if (!sb) return;
    const rows = await call(sb.from('events')
      .select('id,pub_id,kind,title,details,starts_at,ends_at,created_by')
      .gt('ends_at', new Date().toISOString())
      .lt('starts_at', new Date(Date.now() + EVENTS_AHEAD_MS).toISOString())
      .order('starts_at').limit(500));
    state.events = rows.filter(r => !state.reported.has('event:' + r.id)).map(r => ({
      id: r.id, pubId: r.pub_id, kind: r.kind, title: r.title, details: r.details || '',
      start: Date.parse(r.starts_at), end: Date.parse(r.ends_at), mine: !!me() && r.created_by === me(),
    }));
  }

  // мои жалобы (то, на что пожаловался, больше не показываем) и мой список заблокированных
  async function loadSafety() {
    const [reps, blocks] = await Promise.all([
      call(sb.from('reports').select('target_type,target_id')),
      call(sb.from('blocks').select('blocked,blocked_name,blocked_emoji,created_at').order('created_at', { ascending: false })),
    ]);
    state.reported = new Set(reps.map(r => r.target_type + ':' + r.target_id));
    state.blocks = blocks.map(b => ({ id: b.blocked, name: b.blocked_name || '?', emoji: b.blocked_emoji || '🍺' }));
  }

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
    const [rows, everyone] = await Promise.all([
      call(sb.from('sessions')
        .select('id,user_id,pub_id,started_at,ended_at,drinks(size,kind,created_at)')
        .is('ended_at', null).gt('started_at', since)),
      // люди, которые показывают себя всем (сервер отдаёт только имя, аватар, пивную и выпитое)
      Promise.resolve(sb.rpc('public_live')).then(r => (r && !r.error && r.data) || [], () => []),
    ]);
    state.live = rows.map(fromSessionRow);
    const seen = new Set(state.live.map(s => s.userId));
    state.publicLive = everyone.filter(r => !seen.has(r.user_id)).map(r => Object.assign(
      fromSessionRow({ id: 'everyone-' + r.user_id, user_id: r.user_id, pub_id: r.pub_id, started_at: r.started_at, ended_at: null, drinks: r.drinks }),
      { person: { id: r.user_id, name: r.name, emoji: r.emoji } }));
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
    Object.assign(state, { profile: null, friends: [], live: [], publicLive: [], history: [], stats: null, myVotes: {}, armed: null, eventForm: null,
      personMenu: null, reported: new Set(), blocks: [] });
    if (!user) { state.loading = false; render(); return; }
    state.loading = true;
    render();
    try {
      await Promise.all([loadPeople(), loadSafety().catch(() => {})]);
      await Promise.all([loadLive(), loadMine(), loadEvents().catch(() => {})]);
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
    if (state.busy) return;
    try {
      await Promise.all([loadEvents().catch(() => {}), state.user ? loadLive() : null, state.user ? loadPeople() : null]);
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
    buzz();
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
    // в приложении адрес страницы внутренний (capacitor://), поэтому ссылка всегда на сайт
    const url = `${NATIVE ? SITE : location.origin + location.pathname}?friend=${state.profile.friend_code}`;
    const text = t('invite_text');
    const share = plugin('Share');
    if (share) {
      try { await share.share({ title: 'Natankováno', text, url, dialogTitle: t('invite_link_btn') }); } catch (e) { /* отменили */ }
      return;
    }
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
    // если внутри кружка есть пивная, где сейчас событие, — кружок тоже «горит»
    iconCreateFunction: cluster => {
      const hot = cluster.getAllChildMarkers().some(m => m.options.hasEvent);
      return L.divIcon({
        className: '',
        html: `<div class="cluster${hot ? ' cluster-event' : ''}">${hot ? '🎉' : '🍺'} ${cluster.getChildCount()}</div>`,
        iconSize: [52, 36], iconAnchor: [26, 18],
      });
    },
  }) : L.layerGroup()).addTo(map);
  let meMarker = null;
  let pendingMarker = null;

  function renderMarkers() {
    pubLayer.clearLayers();
    const mine = mySession();
    state.pubs.forEach(p => {
      const n = drinkersAt(p.id).length;
      const ev = activeEvent(p.id);
      const soon = !ev && soonEvent(p.id);
      const cls = ['pin',
        p.source.type === 'user' ? 'pin-user' : '',
        ev ? 'pin-event' : soon ? 'pin-soon' : '',
        mine && mine.pubId === p.id ? 'pin-mine' : '',
        state.selectedId === p.id ? 'pin-active' : ''].join(' ');
      const icon = L.divIcon({
        className: '',
        html: `<div class="${cls}">${ev ? '🎉' : '🍺'}${n ? `<span class="pin-badge">${n}</span>` : ''}</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      L.marker([p.lat, p.lng], {
        icon, title: ev ? `${p.name} — ${ev.title}` : p.name, keyboard: true, hasEvent: !!ev,
        zIndexOffset: state.selectedId === p.id ? 1000 : ev ? 500 : 0,
      })
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

  function setPendingPoint(ll) {
    state.pendingPoint = { lat: ll.lat, lng: ll.lng };
    if (pendingMarker) pendingMarker.setLatLng([ll.lat, ll.lng]);
    else pendingMarker = L.marker([ll.lat, ll.lng], {
      icon: L.divIcon({ className: '', html: '<div class="pin pin-user">＋</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
    }).addTo(map);
  }

  map.on('click', e => {
    if (state.view !== 'add') return;
    setPendingPoint(e.latlng);
    const status = $('#addPoint');
    if (status) status.textContent = t('point_picked_move');
  });

  // ---------- поиск по карте: подсказки адресов и заведений (OpenStreetMap / Photon) ----------
  // Photon — бесплатный геокодер на данных OpenStreetMap, разрешает подсказки «по мере ввода».
  const GEO_URL = 'https://photon.komoot.io/api/';
  const CZ_BBOX = '12.09,48.55,18.86,51.06';
  const DRINK_PLACES = ['pub', 'bar', 'biergarten', 'restaurant', 'cafe', 'brewery', 'nightclub'];
  const geoCache = new Map();
  let geoTimer = null, geoCtrl = null, searchMarker = null;

  function toPlace(f) {
    const p = f.properties || {}, [lng, lat] = f.geometry.coordinates;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const city = p.city || p.town || p.village || p.county || '';
    const isPoi = !!p.name && !['place', 'highway', 'boundary'].includes(p.osm_key) && !['street', 'city', 'district', 'locality', 'county', 'state'].includes(p.type);
    const parts = [isPoi || !p.name ? street : '', p.district && p.district !== city ? p.district : '', city];
    return {
      lat, lng, street, city,
      name: isPoi ? p.name : '',
      title: p.name || street || city,
      sub: parts.filter((v, i, a) => v && a.indexOf(v) === i && v !== p.name).join(', '),
      drink: DRINK_PLACES.includes(p.osm_value),
    };
  }

  function geoListHTML() {
    const g = state.geo;
    if (!g || g.status === 'idle') return '';
    if (g.status !== 'done') return `<li class="muted geo-status">${t({ loading: 'geo_searching', empty: 'geo_none', error: 'geo_error' }[g.status])}</li>`;
    return `<li class="geo-head">${t('geo_places')}</li>` + g.results.map((r, i) => `
      <li class="item geo-item" role="button" tabindex="0" data-action="geo-pick" data-i="${i}">
        <div class="ico">${r.drink ? '🍺' : '📍'}</div>
        <div class="main"><div class="title">${esc(r.title)}</div><div class="sub">${esc(r.sub)}</div></div>
      </li>`).join('');
  }
  function renderGeo() {
    const el = document.getElementById(state.geo && state.geo.target === 'add' ? 'geoListAdd' : 'geoList');
    if (el) el.innerHTML = geoListHTML();
  }

  // подсказки по мере ввода: ждём паузу 0,35 с, старый запрос отменяем, ответы кешируем
  function geoQuery(text, target) {
    clearTimeout(geoTimer);
    const q = String(text || '').trim();
    state.geo = { target, query: q, results: [], status: q.length < 3 ? 'idle' : 'loading' };
    renderGeo();
    if (q.length < 3) return;
    geoTimer = setTimeout(async () => {
      const key = q.toLowerCase();
      try {
        let res = geoCache.get(key);
        if (!res) {
          if (geoCtrl) geoCtrl.abort();
          geoCtrl = new AbortController();
          const c = map.getCenter();
          const url = `${GEO_URL}?q=${encodeURIComponent(q)}&limit=8&bbox=${CZ_BBOX}&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}`;
          const r = await fetch(url, { signal: geoCtrl.signal });
          if (!r.ok) throw new Error('geo ' + r.status);
          const data = await r.json();
          // ранжирование: с номером дома в запросе — сначала точные адреса, иначе — бары и пивные
          const nums = q.match(/\d+/g) || [];
          const score = r => (nums.length
            ? (nums.some(n => new RegExp(`\\b${n}\\b`).test(r.street)) ? 3 : 0) + (r.name && !r.drink ? -2 : 0)
            : (r.drink ? 2 : 0) + (r.name && !r.drink ? -1 : 0));
          res = (data.features || []).filter(f => (f.properties || {}).countrycode === 'CZ').map(toPlace)
            .map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.r).slice(0, 6);
          geoCache.set(key, res);
        }
        if (!state.geo || state.geo.query !== q) return; // человек уже печатает дальше
        state.geo.results = res;
        state.geo.status = res.length ? 'done' : 'empty';
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (state.geo && state.geo.query === q) state.geo.status = 'error';
      }
      renderGeo();
    }, 350);
  }

  function showSearchMarker(r) {
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([r.lat, r.lng], {
      icon: L.divIcon({ className: '', html: '<div class="pin pin-search">📍</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
      title: r.title, zIndexOffset: 500,
    }).addTo(map);
  }

  function pickGeo(index) {
    const g = state.geo;
    const r = g && g.results[index];
    if (!r) return;
    state.geo = null;
    // уже есть в нашей базе (то же место в пределах 80 м)? — открываем его карточку
    const near = state.pubs.map(p => ({ p, d: distance(p, r) })).filter(x => x.d < 80).sort((a, b) => a.d - b.d)[0];
    if (g.target === 'add') {
      if (near && (r.name || r.drink)) { toast(t('already_on_map', { name: near.p.name })); clearAddMode(); selectPub(near.p.id); return; }
      setPendingPoint(r);
      const fill = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
      if (r.drink) fill('aName', r.name);   // название берём только у баров, пивных и ресторанов
      fill('aAddress', r.street || (r.name ? '' : r.title));   // у улицы без номера — хотя бы название улицы
      fill('aCity', r.city);
      const find = document.getElementById('aFind');
      if (find) find.value = '';
      map.setView([r.lat, r.lng], 17);
      const list = document.getElementById('geoListAdd');
      if (list) list.innerHTML = '';
      const status = $('#addPoint');
      if (status) status.textContent = t('point_from_search', { place: r.title });
      return;
    }
    state.query = '';
    const input = document.getElementById('search');
    if (input) input.value = '';
    if (near) { selectPub(near.p.id); return; }
    showSearchMarker(r);
    map.setView([r.lat, r.lng], 16);
    render();
  }

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
    state.geo = null;
    state.tab = 'pubs';
    state.view = 'pub';
    state.selectedId = id;
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
    render();
  }

  // ближайшая пивная в радиусе maxM метров
  function nearestPub(pos, maxM) {
    let best = null;
    state.pubs.forEach(p => { const d = distance(pos, p); if (d <= maxM && (!best || d < best.d)) best = { p, d }; });
    return best && best.p;
  }

  // GPS: где я и в какой пивной сижу. Позицию никуда не отправляем — только предлагаем
  // отметиться в ближайшей пивной; друзья/все видят пивную, а не точку на карте.
  function locate(opts) {
    opts = opts || {};
    const gps = plugin('Geolocation');           // в iPhone-приложении — родной GPS iOS
    if (!gps && !navigator.geolocation) { if (!opts.silent) toast(t('geo_unsupported')); return; }
    if (!opts.silent) toast(t('geo_locating'));
    const getPos = (ok, fail, o) => gps ? gps.getCurrentPosition(o).then(ok, fail) : navigator.geolocation.getCurrentPosition(ok, fail, o);
    getPos(
      pos => {
        state.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const near = nearestPub(state.myPos, 100);
        state.nearPubId = near ? near.id : null;
        if (near) map.setView([near.lat, near.lng], 17);
        else if (!opts.silent) map.setView([state.myPos.lat, state.myPos.lng], 14);
        render();
        if (opts.silent) return;
        if (near) toast(t('near_found', { name: near.name }));
        else toast(t(opts.findPub ? 'gps_no_pub' : 'geo_done'));
      },
      () => { if (!opts.silent) toast(t('geo_failed')); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  // плашка «Вы в такой-то пивной? — Я тут пью»
  function nearBanner() {
    const p = state.nearPubId && pubById(state.nearPubId);
    const s = mySession();
    if (!p || !state.myPos || (s && s.pubId === p.id)) return '';
    return `<div class="note note-near">${t('near_pub_banner', { name: esc(p.name), d: fmtDist(distance(state.myPos, p)) })}
      <div class="row wrap mt">
        <button class="btn btn-primary" data-action="checkin" data-id="${esc(p.id)}">${t('drinking_here_btn')}</button>
        <button class="btn btn-ghost" data-action="near-dismiss">${t('not_here')}</button>
      </div></div>`;
  }

  // ---------- экраны ----------
  const offlineNote = () => `<div class="note">${t('offline_note')}</div>`;

  function pubListHTML() {
    const q = state.query.trim().toLowerCase();
    const ref = refPoint();
    const rows = state.pubs
      .filter(p => !q || [p.name, p.city, p.brand, p.address].join(' ').toLowerCase().includes(q))
      .filter(p => !state.onlyEvents || activeEvent(p.id) || nextEvent(p.id))
      .map(p => ({ p, d: distance(ref, p) }))
      .sort((a, b) => a.d - b.d);
    if (!rows.length) return `<li class="muted">${t(state.onlyEvents ? 'no_events_anywhere' : 'nothing_found')}</li>`;
    return rows.map(({ p, d }) => {
      const n = drinkersAt(p.id).length;
      const ev = activeEvent(p.id);
      const next = !ev && nextEvent(p.id);
      return `<li class="item ${ev ? 'item-event' : ''}" role="button" tabindex="0" data-action="select-pub" data-id="${esc(p.id)}">
        <div class="ico">${ev ? '🎉' : '🍺'}</div>
        <div class="main">
          <div class="title">${esc(p.name)} ${p.source.type === 'user' ? `<span class="badge badge-user">${t('badge_new')}</span>` : ''}</div>
          <div class="sub">${esc(p.city || t('country'))} · ${esc(p.brand || t('no_brand'))}</div>
          ${ev ? `<div class="sub ev-line">🎉 ${t('event_now')}: ${esc(ev.title)}</div>`
            : next ? `<div class="sub ev-soon">⏰ ${dayLabel(next.start)} ${fmtTime(next.start)} · ${esc(next.title)}</div>` : ''}
        </div>
        <div class="meta">${fmtDist(d)}${n ? `<br>👥 ${n}` : ''}</div>
      </li>`;
    }).join('');
  }

  function viewList() {
    return `<div class="view">
      <div class="row wrap"><span class="badge badge-tank">${t('only_tank_badge')}</span><span class="muted">${tn('n_places', state.pubs.length)}</span></div>
      ${nearBanner()}
      <input id="search" class="input mt" type="search" placeholder="${t('search_ph')}" aria-label="${t('search_label')}" value="${esc(state.query)}">
      <div class="row wrap mt">
        <button class="btn" data-action="locate">${t('near_me_btn')}</button>
        <button class="btn" data-action="add-start">${t('add_pub_btn')}</button>
        <button class="btn ${state.onlyEvents ? 'btn-event-on' : ''}" data-action="toggle-events" aria-pressed="${state.onlyEvents}">${t('filter_events')}${liveEventPubs() ? ` · ${liveEventPubs()}` : ''}</button>
      </div>
      <p class="muted">${t(state.myPos ? 'nearest_me' : 'nearest_center')}</p>
      <ul class="list" id="pubList">${pubListHTML()}</ul>
      <ul class="list geo-list" id="geoList">${state.geo && state.geo.target === 'search' ? geoListHTML() : ''}</ul>
      ${sb ? '' : offlineNote()}
    </div>`;
  }

  const liveEventPubs = () => new Set(state.events.filter(isLive).map(e => e.pubId)).size;

  function eventItem(e) {
    const live = isLive(e);
    return `<li class="ev-item ${live ? 'ev-live' : ''}">
      <div class="row wrap">
        <span class="badge ${e.kind === 'promo' ? 'badge-promo' : 'badge-event'}">${t(e.kind === 'promo' ? 'kind_promo' : 'kind_event')}</span>
        ${live ? `<span class="badge badge-live">● ${t('event_now')}</span>` : ''}
        <span class="muted">${fmtWhen(e)}</span>
      </div>
      <div class="ev-title">${esc(e.title)}</div>
      ${e.details ? `<div class="muted">${esc(e.details)}</div>` : ''}
      ${e.mine ? `<button class="btn btn-ghost btn-danger" data-action="event-delete" data-id="${esc(e.id)}">${t(state.armed === 'ev:' + e.id ? 'sure_q' : 'ev_delete')}</button>`
        : `<button class="btn btn-ghost btn-report" data-action="report" data-type="event" data-id="${esc(e.id)}">${t(state.armed === 'rep:event:' + e.id ? 'sure_report' : 'report_btn')}</button>`}
    </li>`;
  }

  function eventForm() {
    const start = new Date();
    start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);   // по умолчанию — «идёт сейчас»
    const end = new Date(start.getTime() + 3 * 3600e3);
    return `<div class="ev-form">
      <div class="seg mt">
        <button data-action="ev-kind" data-k="event" aria-pressed="${state.evKind !== 'promo'}">${t('kind_event')}</button>
        <button data-action="ev-kind" data-k="promo" aria-pressed="${state.evKind === 'promo'}">${t('kind_promo')}</button>
      </div>
      <label class="field">${t('ev_title')}<input id="evTitle" class="input" maxlength="80" placeholder="${t('ev_title_ph')}"></label>
      <label class="field">${t('ev_details')} <span class="muted">${t('optional')}</span><textarea id="evDetails" class="input" maxlength="300" rows="2"></textarea></label>
      <div class="ev-times">
        <label class="field">${t('ev_start')}<input id="evStart" class="input" type="datetime-local" value="${toLocalInput(start)}"></label>
        <label class="field">${t('ev_end')}<input id="evEnd" class="input" type="datetime-local" value="${toLocalInput(end)}"></label>
      </div>
      <div class="row wrap mt">
        <button class="btn btn-primary" data-action="event-save">${t('ev_save')}</button>
        <button class="btn btn-ghost" data-action="event-cancel">${t('cancel_plain')}</button>
      </div>
    </div>`;
  }

  function eventsCard(p) {
    const list = eventsAt(p.id);
    return `<div class="card ${list.some(isLive) ? 'card-event' : ''}">
      <h3>${t('events_h')}</h3>
      ${list.length ? `<ul class="list">${list.map(eventItem).join('')}</ul>` : `<p class="muted">${t('no_events')}</p>`}
      ${state.eventForm === p.id ? eventForm()
        : `<button class="btn mt" data-action="event-form" data-id="${esc(p.id)}">${t('add_event_btn')}</button>`}
    </div>`;
  }

  function drinkerItem(d, opts) {
    opts = opts || {};
    const pub = pubById(d.pubId);
    const vis = d.isMe && state.profile ? state.profile.visibility : null;
    const hidden = vis === 'nobody';
    const attrs = opts.clickable ? `role="button" tabindex="0" data-action="select-pub" data-id="${esc(d.pubId)}"` : '';
    return `<li class="item" ${attrs}>
      <div class="ico ${d.isMe ? 'ico-me' : ''}">${esc(d.emoji)}</div>
      <div class="main">
        <div class="title">${d.isMe ? t('you') : esc(d.name)} ${hidden ? `<span class="badge">${t('hidden_badge')}</span>` : ''}${vis === 'everyone' ? `<span class="badge badge-public">${t('seen_by_all')}</span>` : ''}${d.isPublic ? `<span class="badge badge-public">${t('not_friend_badge')}</span>` : ''}</div>
        <div class="sub">${opts.showPub ? esc(pub.name) + ' · ' : ''}${t('since', { time: fmtTime(d.since) })}</div>
      </div>
      <div class="meta">${drinksMeta(d.drinks)}${opts.dist != null ? `<br>${fmtDist(opts.dist)}` : ''}</div>
      ${d.isMe ? '' : moreBtn(d.id)}
    </li>${d.isMe ? '' : personMenu(d.id)}`;
  }

  // «⋯» у человека → «Пожаловаться» и «Заблокировать» (правило Apple для приложений с людьми)
  const moreBtn = id => `<button class="btn-more" data-action="person-menu" data-id="${esc(id)}" aria-expanded="${state.personMenu === id}" aria-label="${t('more_actions')}">⋯</button>`;
  function personMenu(id) {
    if (state.personMenu !== id) return '';
    return `<li class="person-menu">
      <button class="btn btn-ghost btn-report" data-action="report" data-type="user" data-id="${esc(id)}">${t(state.armed === 'rep:user:' + id ? 'sure_report' : 'report_btn')}</button>
      <button class="btn btn-ghost btn-danger" data-action="block-user" data-id="${esc(id)}">${t(state.armed === 'blk:' + id ? 'sure_block' : 'block_btn')}</button>
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

      ${eventsCard(p)}

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
        ${isUser && !state.reported.has('pub:' + p.id) ? `<button class="btn btn-ghost btn-report mt" data-action="report" data-type="pub" data-id="${esc(p.id)}">${t(state.armed === 'rep:pub:' + p.id ? 'sure_report' : 'report_place')}</button>` : ''}
      </div>
    </div>`;
  }

  function viewAdd() {
    return `<div class="view">
      <button class="btn btn-ghost" data-action="add-cancel">${t('cancel')}</button>
      <h2>${t('new_pub_h')}</h2>
      <label class="field">${t('find_label')}<input id="aFind" class="input" type="search" autocomplete="off" placeholder="${t('find_ph')}"></label>
      <ul class="list geo-list" id="geoListAdd">${state.geo && state.geo.target === 'add' ? geoListHTML() : ''}</ul>
      <p class="muted">${t('find_hint')}</p>
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
      ${signup ? `<label class="check"><input type="checkbox" id="p18"> <span>${t('f_18', { terms: `<a href="${SITE}terms.html" target="_blank" rel="noopener">${t('terms_word')}</a>` })}</span></label>` : '<div class="mt"></div>'}
      <button class="btn btn-primary" data-action="${signup ? 'signup' : 'login'}">${t(signup ? 'create_profile' : 'login_btn')}</button>
      ${installCard()}
      ${legalLinks()}
    </div>`;
  }

  // правила, конфиденциальность, поддержка — страницы на сайте (нужны для App Store)
  const legalLinks = () => `<p class="legal muted">
      <a href="${SITE}terms.html" target="_blank" rel="noopener">${t('link_terms')}</a> ·
      <a href="${SITE}privacy.html" target="_blank" rel="noopener">${t('link_privacy')}</a> ·
      <a href="${SITE}support.html" target="_blank" rel="noopener">${t('link_support')}</a>
    </p>`;

  // первый запуск: «Тебе есть 18?» — приложение про алкоголь
  function gateHTML() {
    if (state.adult) return '';
    return `<div class="gate" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
      <div class="gate-box">
        <div class="gate-ico">🍺</div>
        ${state.underage ? `<p class="gate-text">${t('gate_bye')}</p>` : `
          <h2 id="gateTitle">${t('gate_title')}</h2>
          <p class="gate-text">${t('gate_text')}</p>
          <div class="row wrap gate-btns">
            <button class="btn btn-primary" data-action="adult-yes">${t('gate_yes')}</button>
            <button class="btn" data-action="adult-no">${t('gate_no')}</button>
          </div>`}
      </div>
    </div>`;
  }

  // ---------- установка на телефон (иконка на главном экране) ----------
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => !/Android/.test(navigator.userAgent) &&
    (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); // iPad выдаёт себя за Mac
  function installCard() {
    if (NATIVE || isStandalone()) return '';
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
      ${moreBtn(f.id)}
    </li>${personMenu(f.id)}`;
  }

  function blockedCard() {
    if (!state.blocks.length) return '';
    return `<div class="card">
      <h3>${t('blocked_h', { n: state.blocks.length })}</h3>
      <ul class="list">${state.blocks.map(b => `<li class="item">
        <div class="ico">${esc(b.emoji)}</div>
        <div class="main"><div class="title">${esc(b.name)}</div></div>
        <button class="btn btn-ghost" data-action="unblock" data-id="${esc(b.id)}">${t('unblock')}</button>
      </li>`).join('')}</ul>
    </div>`;
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
        <button class="avatar avatar-btn" data-action="avatar-edit" aria-expanded="${state.editAvatar}" title="${t('change_avatar')}" aria-label="${t('change_avatar')}">${esc(p.emoji)}<span class="avatar-pen" aria-hidden="true">✎</span></button>
        <div><div class="title" style="font-size:18px">${esc(p.name)}</div><div class="muted">${t('member_since', { date: fmtDate(p.created_at) })}</div></div>
      </div>
      ${state.editAvatar ? `<div class="card">
          <h3>${t('change_avatar')}</h3>
          <div class="emojis">${AVATARS.map(e => `<button class="emoji" data-action="set-avatar" data-e="${e}" aria-pressed="${e === p.emoji}" aria-label="${t('f_avatar_aria', { e })}">${e}</button>`).join('')}</div>
        </div>` : ''}

      ${s && sp ? `<div class="card card-session">
          <h3>${t('now_at', { pub: esc(sp.name) })}</h3>
          <div class="big">${tally(s.drinks)}</div>
          <div class="muted">${t('since_alcohol', { time: fmtTime(s.startedAt), g: grams(s.drinks) })}</div>
          ${sessionControls(s, true)}
          <p class="muted">${t('auto_end_note')}</p>
          <p class="muted">${t('responsible')}</p>
        </div>`
        : `<div class="card">
          <h3>${t('not_in_pub_h')}</h3>
          <p class="muted">${t('not_in_pub_text')}</p>
          ${nearBanner()}
          <div class="row wrap">
            <button class="btn btn-primary" data-action="find-my-pub">${t('gps_find_pub')}</button>
            <button class="btn" data-action="tab" data-tab="pubs">${t('open_pubs')}</button>
          </div>
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
          <button data-action="visibility" data-v="everyone" aria-pressed="${p.visibility === 'everyone'}">${t('vis_everyone')}</button>
          <button data-action="visibility" data-v="nobody" aria-pressed="${p.visibility === 'nobody'}">${t('vis_nobody')}</button>
        </div>
        <p class="muted">${t({ friends: 'vis_friends_text', everyone: 'vis_everyone_text' }[p.visibility] || 'vis_nobody_text')}</p>
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

      ${blockedCard()}

      <div class="row wrap mt">
        <button class="btn" data-action="logout">${t('logout')}</button>
        <button class="btn btn-ghost btn-danger" data-action="delete-me">${t(state.armed === 'delete-me' ? 'delete_sure' : 'delete_account')}</button>
      </div>
      ${legalLinks()}
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
      view.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
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
    $('#gate').innerHTML = gateHTML();
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
      state.geo = null;
      state.editAvatar = false;
      state.personMenu = null;
      render();
    },
    'select-pub': el => selectPub(el.dataset.id),
    'adult-yes'() {
      state.adult = true;
      localStorage.setItem(ADULT_KEY, '1');
      render();
    },
    'adult-no'() { state.underage = true; render(); },
    'person-menu'(el) {
      state.personMenu = state.personMenu === el.dataset.id ? null : el.dataset.id;
      render();
    },
    // пожаловаться на человека, событие или пивную (двойное нажатие — подтверждение)
    async report(el) {
      if (!requireLogin()) return;
      const type = el.dataset.type, id = el.dataset.id, key = type + ':' + id;
      if (state.armed !== 'rep:' + key) { state.armed = 'rep:' + key; return render(); }
      state.armed = null;
      const ok = await withBusy(async () => {
        await call(sb.rpc('report_content', { p_type: type, p_id: id }));
        state.reported.add(key);
        if (type === 'event') state.events = state.events.filter(e => e.id !== id);
        state.personMenu = null;
      });
      if (ok) toast(t('reported_toast'));
    },
    async 'block-user'(el) {
      const id = el.dataset.id;
      if (state.armed !== 'blk:' + id) { state.armed = 'blk:' + id; return render(); }
      state.armed = null;
      const who = drinkers().find(d => d.id === id) || personById(id) || { name: '' };
      const ok = await withBusy(async () => {
        await call(sb.rpc('block_user', { p_user: id }));
        state.personMenu = null;
        await Promise.all([loadSafety(), loadPeople(), loadLive()]);
      });
      if (ok) toast(t('blocked_toast', { who: who.name }));
    },
    async unblock(el) {
      const id = el.dataset.id;
      const ok = await withBusy(async () => {
        await call(sb.from('blocks').delete().eq('blocker', me()).eq('blocked', id));
        await Promise.all([loadSafety(), loadLive()]);
      });
      if (ok) toast(t('unblocked_toast'));
    },
    'toggle-events'() { state.onlyEvents = !state.onlyEvents; render(); },
    'near-dismiss'() { state.nearPubId = null; render(); },
    'find-my-pub': () => locate({ findPub: true }),
    'event-form'(el) {
      if (!requireLogin()) return;
      state.eventForm = el.dataset.id;
      state.evKind = 'event';
      render();
      const input = document.getElementById('evTitle');
      if (input) input.focus();
    },
    'event-cancel'() { state.eventForm = null; render(); },
    'ev-kind'(el) { state.evKind = el.dataset.k === 'promo' ? 'promo' : 'event'; render(); },
    async 'event-save'() {
      const pubId = state.eventForm;
      if (!pubId) return;
      const title = value('evTitle'), details = value('evDetails');
      const start = new Date(value('evStart')), end = new Date(value('evEnd'));
      if (title.length < 2) return toast(t('ev_err_title'));
      if (isOffensive(title, details)) return toast(t('err_offensive'));
      if (isNaN(start) || isNaN(end) || end <= start || end - start > 31 * 864e5 || end <= Date.now()) return toast(t('ev_err_time'));
      const ok = await withBusy(async () => {
        await call(sb.from('events').insert({
          pub_id: pubId, kind: state.evKind === 'promo' ? 'promo' : 'event', title, details: details || null,
          starts_at: start.toISOString(), ends_at: end.toISOString(),
        }));
        state.eventForm = null;
        await loadEvents();
      });
      if (ok) toast(t('ev_saved'));
    },
    async 'event-delete'(el) {
      const id = el.dataset.id;
      if (state.armed !== 'ev:' + id) { state.armed = 'ev:' + id; return render(); }
      state.armed = null;
      const ok = await withBusy(async () => {
        await call(sb.from('events').delete().eq('id', id));
        await loadEvents();
      });
      if (ok) toast(t('ev_deleted'));
    },
    'geo-pick': el => pickGeo(Number(el.dataset.i)),
    back() { state.view = 'list'; state.selectedId = null; state.geo = null; render(); },
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
    locate: () => locate({}),
    'add-start'() {
      if (!requireLogin()) return;
      state.tab = 'pubs';
      state.view = 'add';
      state.selectedId = null;
      state.geo = null;
      render();
    },
    'add-cancel'() { clearAddMode(); state.view = 'list'; state.geo = null; render(); },
    async 'add-save'() {
      const name = value('aName');
      if (!state.pendingPoint) return toast(t('add_hint'));
      if (!name) return toast(t('enter_name'));
      if (isOffensive(name, value('aAddress'), value('aCity'))) return toast(t('err_offensive'));
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
    'avatar-edit'() { state.editAvatar = !state.editAvatar; render(); },
    async 'set-avatar'(el) {
      const emoji = el.dataset.e;
      if (!state.profile || emoji === state.profile.emoji) { state.editAvatar = false; return render(); }
      const ok = await withBusy(async () => {
        await call(sb.from('profiles').update({ emoji }).eq('id', me()));
        state.profile.emoji = emoji;
        state.editAvatar = false;
      });
      if (ok) toast(`${emoji} ${t('avatar_saved')}`);
    },
    'pick-emoji'(el) {
      state.pickedEmoji = el.dataset.e;
      document.querySelectorAll('.emoji').forEach(b => b.setAttribute('aria-pressed', b.dataset.e === state.pickedEmoji));
    },
    'auth-mode'(el) { state.authMode = el.dataset.mode; state.notice = ''; render(); },
    async signup() {
      const name = value('pName'), email = value('pEmail'), password = document.getElementById('pPassword').value;
      if (!name) return toast(t('enter_nick'));
      if (isOffensive(name)) return toast(t('err_offensive'));
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
      if (ok) toast(t({ friends: 'vis_now_friends', everyone: 'vis_now_everyone' }[v] || 'vis_now_nobody'));
    },
  };

  // действия, которые нельзя запускать, пока предыдущее ещё идёт
  const EXCLUSIVE = new Set(['checkin', 'end', 'vote', 'add-save', 'signup', 'login', 'delete-me', 'remove-friend', 'visibility', 'set-avatar', 'event-save', 'event-delete',
    'report', 'block-user', 'unblock']);

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const name = el.dataset.action;
    const fn = actions[name];
    if (!fn) return;
    e.preventDefault();
    if (state.busy && EXCLUSIVE.has(name)) return;
    if (state.armed && !['delete-me', 'remove-friend', 'event-delete', 'report', 'block-user'].includes(name)) state.armed = null;
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
    if (e.target.id === 'search') {
      state.query = e.target.value;
      $('#pubList').innerHTML = pubListHTML();
      geoQuery(e.target.value, 'search');   // плюс подсказки адресов и мест на карте
    } else if (e.target.id === 'aFind') {
      geoQuery(e.target.value, 'add');
    }
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
      await Promise.all([loadPubs(), loadVoteCounts(), loadEvents().catch(() => {})]);
      render();
    } catch (e) {
      toast(errText(e));
    }
    const { data } = await sb.auth.getSession();
    await setUser(data.session ? data.session.user : null);
    // если доступ к GPS уже разрешён — тихо проверяем, не сидим ли мы в пивной
    const gps = plugin('Geolocation');
    if (gps) {
      gps.checkPermissions().then(p => { if (p.location === 'granted') locate({ silent: true }); }).catch(() => {});
    } else if (navigator.permissions && navigator.geolocation) {
      navigator.permissions.query({ name: 'geolocation' })
        .then(p => { if (p.state === 'granted') locate({ silent: true }); })
        .catch(() => { /* браузер не умеет спрашивать про разрешения */ });
    }
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
