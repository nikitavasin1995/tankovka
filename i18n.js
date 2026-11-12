'use strict';

/*
 * Natankováno — переводы интерфейса: чешский, английский, немецкий, русский, украинский.
 * Каждая строка: L(cs, en, de, ru, uk). Формы множественного числа — объекты
 * { one, few, many, other } по правилам Intl.PluralRules для каждого языка.
 * Чтобы добавить язык: допишите его в LANGS и добавьте шестой аргумент в L().
 */
window.TK_I18N = (function () {
  const LANGS = [
    { code: 'cs', short: 'CS', name: 'Čeština', locale: 'cs-CZ' },
    { code: 'en', short: 'EN', name: 'English', locale: 'en-GB' },
    { code: 'de', short: 'DE', name: 'Deutsch', locale: 'de-DE' },
    { code: 'ru', short: 'RU', name: 'Русский', locale: 'ru-RU' },
    { code: 'uk', short: 'UA', name: 'Українська', locale: 'uk-UA' },
  ];
  const ORDER = LANGS.map(l => l.code);
  const STORAGE_KEY = 'tk.lang';
  const L = (...v) => { const o = {}; ORDER.forEach((c, i) => { o[c] = v[i]; }); return o; };

  const T = {
    // ---------- шапка, вкладки ----------
    title: L('Natankováno — tankové pivo na mapě Česka', 'Natankováno — tank beer on the map of Czechia', 'Natankováno — Tankbier auf der Karte Tschechiens', 'Natankováno — танковое пиво на карте Чехии', 'Natankováno — танкове пиво на мапі Чехії'),
    tagline: L('jen tankové', 'tank beer only', 'nur Tankbier', 'только танковое', 'тільки танкове'),
    map_label: L('Mapa hospod', 'Map of pubs', 'Kneipenkarte', 'Карта пивных', 'Мапа пивних'),
    lang_label: L('Jazyk', 'Language', 'Sprache', 'Язык', 'Мова'),
    tab_pubs: L('🗺 Hospody', '🗺 Pubs', '🗺 Kneipen', '🗺 Пивные', '🗺 Пивні'),
    tab_nearby: L('👥 Poblíž', '👥 Nearby', '👥 In der Nähe', '👥 Рядом', '👥 Поруч'),
    tab_me: L('🙂 Já', '🙂 Me', '🙂 Ich', '🙂 Я', '🙂 Я'),
    add_hint: L('Klepněte do mapy, kde hospoda je', 'Tap the map where the pub is', 'Tippe auf die Karte, wo die Kneipe ist', 'Нажмите на карту, где находится пивная', 'Натисніть на мапу, де розташована пивна'),

    // ---------- единицы и счётчики ----------
    unit_l: L('l', 'l', 'l', 'л', 'л'),
    unit_ml: L('ml', 'ml', 'ml', 'мл', 'мл'),
    unit_m: L('m', 'm', 'm', 'м', 'м'),
    unit_km: L('km', 'km', 'km', 'км', 'км'),
    n_beers: L(
      { one: '{n} pivo', few: '{n} piva', many: '{n} piva', other: '{n} piv' },
      { one: '{n} beer', other: '{n} beers' },
      { one: '{n} Bier', other: '{n} Bier' },
      { one: '{n} пиво', few: '{n} пива', many: '{n} пив', other: '{n} пива' },
      { one: '{n} пиво', few: '{n} пива', many: '{n} пив', other: '{n} пива' }),
    n_shots: L(
      { one: '{n} panák', few: '{n} panáky', many: '{n} panáku', other: '{n} panáků' },
      { one: '{n} shot', other: '{n} shots' },
      { one: '{n} Schnaps', other: '{n} Schnäpse' },
      { one: '{n} стопка', few: '{n} стопки', many: '{n} стопок', other: '{n} стопки' },
      { one: '{n} чарка', few: '{n} чарки', many: '{n} чарок', other: '{n} чарки' }),
    n_places: L(
      { one: '{n} místo na mapě', few: '{n} místa na mapě', many: '{n} místa na mapě', other: '{n} míst na mapě' },
      { one: '{n} place on the map', other: '{n} places on the map' },
      { one: '{n} Ort auf der Karte', other: '{n} Orte auf der Karte' },
      { one: '{n} место на карте', few: '{n} места на карте', many: '{n} мест на карте', other: '{n} места на карте' },
      { one: '{n} місце на мапі', few: '{n} місця на мапі', many: '{n} місць на мапі', other: '{n} місця на мапі' }),
    w_beers: L(
      { one: 'pivo', few: 'piva', many: 'piva', other: 'piv' },
      { one: 'beer', other: 'beers' },
      { one: 'Bier', other: 'Bier' },
      { one: 'пиво', few: 'пива', many: 'пив', other: 'пива' },
      { one: 'пиво', few: 'пива', many: 'пив', other: 'пива' }),
    w_shots: L(
      { one: 'panák', few: 'panáky', many: 'panáku', other: 'panáků' },
      { one: 'shot', other: 'shots' },
      { one: 'Schnaps', other: 'Schnäpse' },
      { one: 'стопка', few: 'стопки', many: 'стопок', other: 'стопки' },
      { one: 'чарка', few: 'чарки', many: 'чарок', other: 'чарки' }),
    w_pubs: L(
      { one: 'hospoda', few: 'hospody', many: 'hospody', other: 'hospod' },
      { one: 'pub', other: 'pubs' },
      { one: 'Kneipe', other: 'Kneipen' },
      { one: 'пивная', few: 'пивные', many: 'пивных', other: 'пивные' },
      { one: 'пивна', few: 'пивні', many: 'пивних', other: 'пивні' }),
    w_liters: L('litrů', 'litres', 'Liter', 'литров', 'літрів'),

    // ---------- ошибки ----------
    err_friend_not_found: L('Uživatel s tímto kódem neexistuje', 'No user with this code', 'Kein Nutzer mit diesem Code', 'Нет пользователя с таким кодом', 'Немає користувача з таким кодом'),
    err_self_friend: L('To je váš vlastní kód 🙂', 'That’s your own code 🙂', 'Das ist dein eigener Code 🙂', 'Это ваш собственный код 🙂', 'Це ваш власний код 🙂'),
    err_no_session: L('Nejdřív klepněte v hospodě na „Piju tady“', 'First tap “I’m drinking here” at a pub', 'Tippe zuerst in einer Kneipe auf „Ich trinke hier“', 'Сначала отметьтесь в пивной', 'Спочатку відмітьтеся в пивній'),
    err_too_many: L('Maximálně 60 nápojů za jednu návštěvu', 'Max 60 drinks per check-in', 'Maximal 60 Getränke pro Check-in', 'Максимум 60 напитков за одну отметку', 'Максимум 60 напоїв за одну відмітку'),
    err_bad_size: L('Takový objem nelze přidat', 'This amount can’t be added', 'Diese Menge geht nicht', 'Такой объём добавить нельзя', 'Такий об’єм додати не можна'),
    err_pub_not_found: L('Hospoda nenalezena', 'Pub not found', 'Kneipe nicht gefunden', 'Пивная не найдена', 'Пивну не знайдено'),
    err_not_auth: L('Přihlaste se', 'Please log in', 'Bitte melde dich an', 'Войдите в профиль', 'Увійдіть у профіль'),
    err_bad_login: L('Nesprávný e-mail nebo heslo', 'Wrong email or password', 'Falsche E-Mail oder falsches Passwort', 'Неверный email или пароль', 'Невірний email або пароль'),
    err_exists: L('Tento e-mail už je registrovaný — přihlaste se', 'This email is already registered — log in', 'Diese E-Mail ist schon registriert — melde dich an', 'Такой email уже зарегистрирован — войдите', 'Такий email уже зареєстровано — увійдіть'),
    err_short_pw: L('Heslo je moc krátké — aspoň 6 znaků', 'Password too short — at least 6 characters', 'Passwort zu kurz — mindestens 6 Zeichen', 'Пароль слишком короткий — минимум 6 символов', 'Пароль надто короткий — мінімум 6 символів'),
    err_email: L('Zkontrolujte e-mail', 'Check the email address', 'Prüfe die E-Mail-Adresse', 'Проверьте email', 'Перевірте email'),
    err_rate: L('Příliš mnoho pokusů, chvíli počkejte', 'Too many attempts, please wait a bit', 'Zu viele Versuche, warte kurz', 'Слишком много попыток, подождите немного', 'Забагато спроб, зачекайте трохи'),
    err_unconfirmed: L('E-mail není potvrzený — zkontrolujte poštu', 'Email not confirmed — check your inbox', 'E-Mail nicht bestätigt — sieh in dein Postfach', 'Email не подтверждён — проверьте почту', 'Email не підтверджено — перевірте пошту'),
    err_network: L('Žádné spojení se serverem', 'No connection to the server', 'Keine Verbindung zum Server', 'Нет связи с сервером', 'Немає зв’язку з сервером'),
    err_generic: L('Chyba: {m}', 'Error: {m}', 'Fehler: {m}', 'Ошибка: {m}', 'Помилка: {m}'),

    // ---------- сообщения ----------
    no_server: L('Server ještě není připojený', 'Server not connected yet', 'Server noch nicht verbunden', 'Сервер ещё не подключён', 'Сервер ще не підключено'),
    login_first: L('Nejdřív se přihlaste nebo zaregistrujte', 'Log in or sign up first', 'Melde dich zuerst an oder registriere dich', 'Сначала войдите или зарегистрируйтесь', 'Спочатку увійдіть або зареєструйтеся'),
    checked_in_moved: L('Předchozí hospoda je uložená v historii. Teď jste tady!', 'Previous pub saved to history. You’re checked in here!', 'Die vorige Kneipe ist im Verlauf gespeichert. Du bist jetzt hier eingecheckt!', 'Прошлая пивная сохранена в историю. Вы отметились здесь!', 'Попередню пивну збережено в історії. Ви відмітилися тут!'),
    checked_in: L('Jste tady! Pití přidávejte tlačítky „+“', 'Checked in! Add drinks with the “+” buttons', 'Eingecheckt! Getränke fügst du mit „+“ hinzu', 'Вы отметились! Добавляйте напитки кнопками «+»', 'Ви відмітилися! Додавайте напої кнопками «+»'),
    saved_tally: L('Uloženo: {t}', 'Saved: {t}', 'Gespeichert: {t}', 'Записано: {t}', 'Записано: {t}'),
    checkin_removed: L('Návštěva zrušena', 'Check-in removed', 'Check-in entfernt', 'Отметка снята', 'Відмітку знято'),
    vote_yes_thanks: L('Díky! Zaznamenáno, že tu točí tankové', 'Thanks! Marked as serving tank beer', 'Danke! Vermerkt: Hier gibt es Tankbier', 'Спасибо! Отмечено, что здесь танковое', 'Дякуємо! Відмічено, що тут танкове'),
    vote_no_thanks: L('Díky! Zaznamenáno, že tankové už tu nemají', 'Thanks! Noted that there’s no tank beer here any more', 'Danke! Vermerkt: Hier gibt es kein Tankbier mehr', 'Спасибо! Учтём, что танкового здесь больше нет', 'Дякуємо! Врахуємо, що танкового тут більше немає'),
    enter_friend_code: L('Zadejte kód přítele', 'Enter a friend’s code', 'Gib den Code deines Freundes ein', 'Введите код друга', 'Введіть код друга'),
    friend_added: L('{who} je teď mezi vašimi přáteli', '{who} is now your friend', '{who} ist jetzt in deiner Freundesliste', '{who} теперь у вас в друзьях', '{who} тепер у вас у друзях'),
    invite_text: L('Přidej si mě do přátel v aplikaci Natankováno 🍺 — mapa tankového piva', 'Add me as a friend on Natankováno 🍺 — the tank beer map', 'Füg mich in Natankováno als Freund hinzu 🍺 — die Tankbier-Karte', 'Добавляйся ко мне в друзья в Natankováno 🍺 — карта танкового пива', 'Додавайся до мене в друзі в Natankováno 🍺 — мапа танкового пива'),
    invite_copied: L('Odkaz s pozvánkou zkopírován', 'Invite link copied', 'Einladungslink kopiert', 'Ссылка-приглашение скопирована', 'Посилання-запрошення скопійовано'),
    invite_prompt: L('Zkopírujte odkaz s pozvánkou:', 'Copy the invite link:', 'Kopiere den Einladungslink:', 'Скопируйте ссылку-приглашение:', 'Скопіюйте посилання-запрошення:'),
    you_are_here: L('Jste tady', 'You’re here', 'Du bist hier', 'Вы здесь', 'Ви тут'),
    point_picked_move: L('✔ Bod na mapě vybrán. Posunout ho můžete dalším klepnutím.', '✔ Point selected. Tap again to move it.', '✔ Punkt gewählt. Tippe erneut, um ihn zu verschieben.', '✔ Точка на карте выбрана. Можно передвинуть — нажмите ещё раз.', '✔ Точку на мапі вибрано. Щоб пересунути — натисніть ще раз.'),
    geo_unsupported: L('Prohlížeč neumí zjistit polohu', 'Your browser can’t detect location', 'Dein Browser kann den Standort nicht bestimmen', 'Браузер не умеет определять местоположение', 'Браузер не вміє визначати місцезнаходження'),
    geo_locating: L('Zjišťuji, kde jste…', 'Finding your location…', 'Standort wird ermittelt…', 'Определяю, где вы…', 'Визначаю, де ви…'),
    geo_done: L('Hotovo — vzdálenosti se počítají od vás', 'Done — distances are now from you', 'Fertig — Entfernungen ab deinem Standort', 'Готово — расстояния считаются от вас', 'Готово — відстані рахуються від вас'),
    geo_failed: L('Polohu se nepodařilo zjistit. Počítám od středu mapy.', 'Couldn’t get your location. Using the map centre.', 'Standort nicht verfügbar. Es wird ab Kartenmitte gerechnet.', 'Не получилось определить местоположение. Считаю от центра карты.', 'Не вдалося визначити місцезнаходження. Рахую від центру мапи.'),
    offline_note: L(
      'Server ještě není připojený: mapa funguje, profily, přátelé a počítadlo piva přibudou po nastavení Supabase (viz SETUP.md).',
      'The server isn’t connected yet: the map works; profiles, friends and the drink counter appear after Supabase is set up (see SETUP.md).',
      'Server noch nicht verbunden: Die Karte funktioniert; Profile, Freunde und der Getränkezähler kommen nach der Supabase-Einrichtung (siehe SETUP.md).',
      'Сервер ещё не подключён: карта работает, а профили, друзья и счётчик пива появятся после настройки Supabase (см. SETUP.md).',
      'Сервер ще не підключено: мапа працює, а профілі, друзі й лічильник пива з’являться після налаштування Supabase (див. SETUP.md).'),

    // ---------- список пивных ----------
    nothing_found: L('Nic jsme nenašli. Znáte takové místo? Přidejte ho.', 'Nothing found. Know a place like this? Add it.', 'Nichts gefunden. Kennst du so einen Ort? Füg ihn hinzu.', 'Ничего не нашлось. Знаете такое место — добавьте его.', 'Нічого не знайдено. Знаєте таке місце — додайте його.'),
    badge_new: L('nové', 'new', 'neu', 'новое', 'нове'),
    country: L('Česko', 'Czechia', 'Tschechien', 'Чехия', 'Чехія'),
    no_brand: L('značka neuvedena', 'brand unknown', 'Marke unbekannt', 'марка не указана', 'марку не вказано'),
    only_tank_badge: L('JEN TANKOVÉ', 'TANK BEER ONLY', 'NUR TANKBIER', 'ТОЛЬКО ТАНКОВОЕ', 'ТІЛЬКИ ТАНКОВЕ'),
    search_ph: L('Hospoda, adresa, město nebo značka', 'Pub, address, city or brand', 'Kneipe, Adresse, Stadt oder Marke', 'Пивная, адрес, город или марка', 'Пивна, адреса, місто або марка'),
    search_label: L('Hledat hospodu', 'Search pubs', 'Kneipe suchen', 'Поиск пивной', 'Пошук пивної'),
    near_me_btn: L('📍 Blízko mě', '📍 Near me', '📍 In meiner Nähe', '📍 Рядом со мной', '📍 Поруч зі мною'),
    add_pub_btn: L('＋ Přidat hospodu', '＋ Add a pub', '＋ Kneipe hinzufügen', '＋ Добавить пивную', '＋ Додати пивну'),
    nearest_me: L('Nejbližší k vám', 'Nearest to you', 'Am nächsten zu dir', 'Ближайшие к вам', 'Найближчі до вас'),
    nearest_center: L('Nejbližší ke středu mapy', 'Nearest to the map centre', 'Am nächsten zur Kartenmitte', 'Ближайшие к центру карты', 'Найближчі до центру мапи'),

    // ---------- отметка и напитки ----------
    you: L('Vy', 'You', 'Du', 'Вы', 'Ви'),
    hidden_badge: L('skryto před přáteli', 'hidden from friends', 'für Freunde verborgen', 'скрыто от друзей', 'приховано від друзів'),
    since: L('od {time}', 'since {time}', 'seit {time}', 'с {time}', 'з {time}'),
    label_beer: L('🍺 Pivo', '🍺 Beer', '🍺 Bier', '🍺 Пиво', '🍺 Пиво'),
    label_spirits: L('🥃 Tvrdé', '🥃 Spirits', '🥃 Schnaps', '🥃 Крепкое', '🥃 Міцне'),
    add_beer_aria: L('Přidat pivo {v}', 'Add a {v} beer', '{v} Bier hinzufügen', 'Добавить пиво {v}', 'Додати пиво {v}'),
    add_shot_aria: L('Přidat panáka {v}', 'Add a {v} shot', '{v} Schnaps hinzufügen', 'Добавить стопку {v}', 'Додати чарку {v}'),
    undo: L('↶ Zpět', '↶ Undo', '↶ Rückgängig', '↶ Отменить', '↶ Скасувати'),
    finish: L('Ukončit', 'Finish', 'Beenden', 'Закончить', 'Завершити'),
    my_checkin: L('Moje návštěva', 'My check-in', 'Mein Check-in', 'Моя отметка', 'Моя відмітка'),

    // ---------- карточка пивной ----------
    back_all: L('← Všechny hospody', '← All pubs', '← Alle Kneipen', '← Все пивные', '← Усі пивні'),
    added_by_user: L('přidal uživatel', 'added by a user', 'von Nutzern hinzugefügt', 'добавлено пользователем', 'додано користувачем'),
    no_address: L('Adresa neuvedena', 'No address', 'Keine Adresse', 'Адрес не указан', 'Адресу не вказано'),
    dist_from_you: L('{d} od vás', '{d} from you', '{d} von dir', '{d} от вас', '{d} від вас'),
    drinking_here_btn: L('🍺 Piju tady', '🍺 I’m drinking here', '🍺 Ich trinke hier', '🍺 Я тут пью', '🍺 Я тут п’ю'),
    route: L('Trasa ↗', 'Directions ↗', 'Route ↗', 'Маршрут ↗', 'Маршрут ↗'),
    drinking_now_h: L('Teď tu pijí', 'Drinking here now', 'Trinken gerade hier', 'Сейчас здесь пьют', 'Зараз тут п’ють'),
    login_to_see_friends_here: L('Přihlaste se, abyste viděli přátele v této hospodě.', 'Log in to see friends at this pub.', 'Melde dich an, um Freunde in dieser Kneipe zu sehen.', 'Войдите, чтобы видеть друзей в этой пивной.', 'Увійдіть, щоб бачити друзів у цій пивній.'),
    no_friends_here: L('Teď tu nikdo není označený.', 'Nobody has checked in here right now.', 'Gerade ist hier niemand eingecheckt.', 'Сейчас здесь никто не отметился.', 'Зараз тут ніхто не відмітився.'),
    really_tank_h: L('Opravdu tu točí tankové?', 'Really tank beer here?', 'Wirklich Tankbier hier?', 'Здесь правда танковое?', 'Тут справді танкове?'),
    user_place_confirm: L('Místo přidal uživatel — potvrďte, pokud jste tu byli.', 'Added by a user — confirm if you’ve been here.', 'Von Nutzern hinzugefügt — bestätige, wenn du hier warst.', 'Место добавлено пользователем — подтвердите, если были здесь.', 'Місце додав користувач — підтвердьте, якщо були тут.'),
    source_confirm: L('Zdroj: {link}. Údaje můžou být zastaralé — potvrďte, pokud jste tu nedávno byli.', 'Source: {link}. Info may be out of date — confirm if you’ve been here recently.', 'Quelle: {link}. Die Angaben können veraltet sein — bestätige, wenn du kürzlich hier warst.', 'Источник: {link}. Данные могли устареть — подтвердите, если были здесь недавно.', 'Джерело: {link}. Дані могли застаріти — підтвердьте, якщо були тут нещодавно.'),
    vote_yes: L('✔ Ano, tankové · {n}', '✔ Yes, tank beer · {n}', '✔ Ja, Tankbier · {n}', '✔ Да, танковое · {n}', '✔ Так, танкове · {n}'),
    vote_no: L('✖ Už ne · {n}', '✖ Not any more · {n}', '✖ Nicht mehr · {n}', '✖ Уже нет · {n}', '✖ Вже ні · {n}'),

    // ---------- новая пивная ----------
    cancel: L('← Zrušit', '← Cancel', '← Abbrechen', '← Отмена', '← Скасувати'),
    new_pub_h: L('Nová hospoda', 'New pub', 'Neue Kneipe', 'Новая пивная', 'Нова пивна'),
    point_picked: L('✔ Bod na mapě vybrán.', '✔ Point on the map selected.', '✔ Punkt auf der Karte gewählt.', '✔ Точка на карте выбрана.', '✔ Точку на мапі вибрано.'),
    step_pick_point: L('① Klepněte do mapy, kde hospoda je.', '① Tap the map where the pub is.', '① Tippe auf die Karte, wo die Kneipe ist.', '① Нажмите на карту, где находится пивная.', '① Натисніть на мапу, де розташована пивна.'),
    f_name: L('Název', 'Name', 'Name', 'Название', 'Назва'),
    f_name_ph: L('Třeba U Kocoura', 'e.g. U Kocoura', 'z. B. U Kocoura', 'Например, U Kocoura', 'Наприклад, U Kocoura'),
    f_address: L('Adresa', 'Address', 'Adresse', 'Адрес', 'Адреса'),
    optional: L('(nepovinné)', '(optional)', '(optional)', '(необязательно)', '(необов’язково)'),
    f_address_ph: L('Ulice a číslo domu', 'Street and number', 'Straße und Hausnummer', 'Улица и номер дома', 'Вулиця і номер будинку'),
    f_city: L('Město', 'City', 'Stadt', 'Город', 'Місто'),
    f_brand: L('Jaké pivo z tanku', 'Which tank beer', 'Welches Tankbier', 'Какое пиво из танка', 'Яке пиво з танка'),
    f_brand_other: L('Jiné / nevím', 'Other / not sure', 'Andere / weiß nicht', 'Другое / не знаю', 'Інше / не знаю'),
    f_tank_confirm: L('Potvrzuji: točí tu <b>opravdu tankové</b> pivo (z tanků, ne ze sudů)', 'I confirm: they pour <b>real tank beer</b> here (from tanks, not kegs)', 'Ich bestätige: Hier gibt es <b>echtes Tankbier</b> (aus Tanks, nicht aus Fässern)', 'Подтверждаю: здесь наливают <b>именно танковое</b> пиво (из танков, а не из кегов)', 'Підтверджую: тут наливають <b>саме танкове</b> пиво (з танків, а не з кег)'),
    add_to_map: L('Přidat na mapu', 'Add to map', 'Zur Karte hinzufügen', 'Добавить на карту', 'Додати на мапу'),
    enter_name: L('Zadejte název', 'Enter a name', 'Gib einen Namen ein', 'Введите название', 'Введіть назву'),
    only_tank_places: L('Přidávat jde jen místa s tankovým pivem', 'Only places with tank beer can be added', 'Nur Orte mit Tankbier können hinzugefügt werden', 'Добавлять можно только места с танковым пивом', 'Додавати можна лише місця з танковим пивом'),
    pub_added: L('Hospoda přidána na mapu — uvidí ji všichni', 'Pub added to the map — everyone will see it', 'Kneipe zur Karte hinzugefügt — alle sehen sie', 'Пивная добавлена на карту — её увидят все', 'Пивну додано на мапу — її побачать усі'),
    // ---------- поиск по карте (подсказки адресов) ----------
    geo_places: L('Místa na mapě', 'Places on the map', 'Orte auf der Karte', 'Места на карте', 'Місця на мапі'),
    geo_searching: L('Hledám…', 'Searching…', 'Suche…', 'Ищу…', 'Шукаю…'),
    geo_none: L('Na mapě nic nenalezeno', 'Nothing found on the map', 'Nichts auf der Karte gefunden', 'На карте ничего не нашлось', 'На мапі нічого не знайдено'),
    geo_error: L('Hledání na mapě teď nefunguje, zkuste to později', 'Map search isn’t available right now, try later', 'Kartensuche gerade nicht verfügbar, versuch es später', 'Поиск по карте сейчас недоступен, попробуйте позже', 'Пошук на мапі зараз недоступний, спробуйте пізніше'),
    find_label: L('Najít na mapě', 'Find on the map', 'Auf der Karte finden', 'Найти на карте', 'Знайти на мапі'),
    find_ph: L('Název hospody nebo adresa', 'Pub name or address', 'Kneipenname oder Adresse', 'Название пивной или адрес', 'Назва пивної або адреса'),
    find_hint: L('Vyberte z nabídky — bod na mapě a adresa se vyplní samy. Nebo klepněte přímo do mapy.', 'Pick a suggestion — the map point and address fill in automatically. Or tap the map.', 'Wähle einen Vorschlag — Kartenpunkt und Adresse werden automatisch ausgefüllt. Oder tippe auf die Karte.', 'Выберите подсказку — точка на карте и адрес заполнятся сами. Или нажмите на карту.', 'Виберіть підказку — точка на мапі й адреса заповняться самі. Або натисніть на мапу.'),
    point_from_search: L('✔ Nalezeno: {place}. Bod můžete upřesnit klepnutím do mapy.', '✔ Found: {place}. Tap the map to fine-tune the point.', '✔ Gefunden: {place}. Tippe auf die Karte, um den Punkt anzupassen.', '✔ Найдено: {place}. Точку можно уточнить нажатием на карту.', '✔ Знайдено: {place}. Точку можна уточнити натисканням на мапу.'),
    already_on_map: L('Hospoda „{name}“ už na mapě je', '“{name}” is already on the map', '„{name}“ ist schon auf der Karte', '«{name}» уже есть на карте', '«{name}» вже є на мапі'),

    // ---------- рядом ----------
    nearby_h: L('Kdo pije poblíž', 'Who’s drinking nearby', 'Wer trinkt in der Nähe', 'Кто пьёт рядом', 'Хто п’є поруч'),
    loading: L('Načítám…', 'Loading…', 'Wird geladen…', 'Загрузка…', 'Завантаження…'),
    login_to_see_nearby: L('Přihlaste se a uvidíte, ve kterých hospodách jsou vaši přátelé a kolik vypili.', 'Log in to see which pubs your friends are at and how much they’ve had.', 'Melde dich an, um zu sehen, in welchen Kneipen deine Freunde sind und wie viel sie getrunken haben.', 'Войдите, чтобы видеть, в каких пивных сейчас ваши друзья и сколько они выпили.', 'Увійдіть, щоб бачити, в яких пивних зараз ваші друзі та скільки вони випили.'),
    login_or_signup: L('Přihlásit se nebo registrovat', 'Log in or sign up', 'Anmelden oder registrieren', 'Войти или зарегистрироваться', 'Увійти або зареєструватися'),
    where_am_i: L('📍 Zjistit, kde jsem', '📍 Find my location', '📍 Meinen Standort finden', '📍 Определить, где я', '📍 Визначити, де я'),
    dist_from_me: L('Vzdálenost od vás.', 'Distance from you.', 'Entfernung von dir.', 'Расстояние от вас.', 'Відстань від вас.'),
    dist_from_center: L('Vzdálenost od středu mapy.', 'Distance from the map centre.', 'Entfernung von der Kartenmitte.', 'Расстояние от центра карты.', 'Відстань від центру мапи.'),
    nearby_privacy: L('Vidíte přátele a lidi, kteří se ukazují všem — jen hospodu, kde se sami označili, bez sledování GPS. Seznam se obnovuje každých 30 sekund.', 'You see friends and people who show themselves to everyone — only the pub they checked in at, no GPS tracking. The list refreshes every 30 seconds.', 'Du siehst Freunde und Leute, die sich allen zeigen — nur die Kneipe, in der sie eingecheckt haben, kein GPS-Tracking. Die Liste wird alle 30 Sekunden aktualisiert.', 'Видны друзья и те, кто показывает себя всем, — только пивная, где они сами отметились, без слежки по GPS. Список обновляется каждые 30 секунд.', 'Видно друзів і тих, хто показує себе всім, — лише пивну, де вони самі відмітилися, без стеження за GPS. Список оновлюється кожні 30 секунд.'),
    no_friends_drinking: L('Teď není nikdo označený v hospodě.', 'Nobody is checked in at a pub right now.', 'Gerade ist niemand in einer Kneipe eingecheckt.', 'Сейчас никто не отметился в пивной.', 'Зараз ніхто не відмітився в пивній.'),
    no_friends_yet: L('V aplikaci zatím nemáte přátele. Pošlete jim pozvánku ze sekce „Já“.', 'You have no friends on Natankováno yet. Send them an invite link from the “Me” tab.', 'Du hast noch keine Freunde in Natankováno. Schick ihnen einen Einladungslink aus dem Bereich „Ich“.', 'У вас пока нет друзей в Natankováno. Отправьте им ссылку-приглашение из раздела «Я».', 'У вас поки немає друзів у Natankováno. Надішліть їм посилання-запрошення з розділу «Я».'),
    invite_friends_btn: L('Pozvat přátele', 'Invite friends', 'Freunde einladen', 'Пригласить друзей', 'Запросити друзів'),

    // ---------- вход и регистрация ----------
    invited_note: L('🍻 Někdo vás zve do přátel! Zaregistrujte se nebo se přihlaste — přátelství se přidá samo.', '🍻 You’ve been invited as a friend! Sign up or log in and the friendship is added automatically.', '🍻 Du wurdest als Freund eingeladen! Registriere dich oder melde dich an — die Freundschaft wird automatisch hinzugefügt.', '🍻 Вас пригласили в друзья! Зарегистрируйтесь или войдите — дружба добавится сама.', '🍻 Вас запросили в друзі! Зареєструйтеся або увійдіть — дружба додасться сама.'),
    signup_tab: L('Registrace', 'Sign up', 'Registrieren', 'Регистрация', 'Реєстрація'),
    login_tab: L('Přihlášení', 'Log in', 'Anmelden', 'Вход', 'Вхід'),
    f_nick: L('Jméno nebo přezdívka', 'Name or nickname', 'Name oder Spitzname', 'Имя или ник', 'Ім’я або нік'),
    f_nick_ph: L('Jak vám říkají přátelé', 'What your friends call you', 'Wie dich deine Freunde nennen', 'Как вас называют друзья', 'Як вас називають друзі'),
    f_avatar: L('Avatar', 'Avatar', 'Avatar', 'Аватар', 'Аватар'),
    f_avatar_aria: L('Avatar {e}', 'Avatar {e}', 'Avatar {e}', 'Аватар {e}', 'Аватар {e}'),
    change_avatar: L('Změnit avatar', 'Change avatar', 'Avatar ändern', 'Сменить аватар', 'Змінити аватар'),
    avatar_saved: L('Avatar změněn', 'Avatar updated', 'Avatar geändert', 'Аватар обновлён', 'Аватар оновлено'),
    // ---------- события и акции ----------
    events_h: L('🎉 Akce a události', '🎉 Events & offers', '🎉 Events & Aktionen', '🎉 События и акции', '🎉 Події та акції'),
    event_now: L('teď', 'now', 'jetzt', 'сейчас', 'зараз'),
    kind_event: L('Událost', 'Event', 'Event', 'Событие', 'Подія'),
    kind_promo: L('Akce', 'Offer', 'Aktion', 'Акция', 'Акція'),
    no_events: L('Zatím žádné akce. Víte o nějaké? Přidejte ji.', 'No events yet. Know of one? Add it.', 'Noch keine Events. Kennst du eins? Füg es hinzu.', 'Пока нет событий. Знаете о каком-то — добавьте.', 'Поки немає подій. Знаєте про якусь — додайте.'),
    no_events_anywhere: L('Teď ani v příštích 7 dnech nejsou žádné akce. Přidejte první na kartě hospody.', 'No events now or in the next 7 days. Add the first one on a pub’s page.', 'Keine Events jetzt oder in den nächsten 7 Tagen. Füg das erste auf der Seite einer Kneipe hinzu.', 'Ни сейчас, ни в ближайшие 7 дней событий нет. Добавьте первое в карточке пивной.', 'Ні зараз, ні найближчими 7 днями подій немає. Додайте першу в картці пивної.'),
    add_event_btn: L('＋ Přidat akci', '＋ Add event', '＋ Event hinzufügen', '＋ Добавить событие', '＋ Додати подію'),
    ev_title: L('Název', 'Title', 'Titel', 'Название', 'Назва'),
    ev_title_ph: L('Třeba: tankové za 39 Kč, kvíz, fotbal na plátně', 'e.g. tank beer for 39 CZK, quiz, football on screen', 'z. B. Tankbier für 39 Kč, Quiz, Fußball auf Leinwand', 'Например: танковое за 39 Kč, квиз, футбол на экране', 'Наприклад: танкове за 39 Kč, квіз, футбол на екрані'),
    ev_details: L('Podrobnosti', 'Details', 'Details', 'Подробности', 'Подробиці'),
    ev_start: L('Začátek', 'Starts', 'Beginn', 'Начало', 'Початок'),
    ev_end: L('Konec', 'Ends', 'Ende', 'Конец', 'Кінець'),
    ev_save: L('Uložit akci', 'Save event', 'Event speichern', 'Сохранить событие', 'Зберегти подію'),
    ev_saved: L('Akce přidána — v době konání bude hospoda na mapě svítit 🎉', 'Event added — the pub will glow on the map while it’s on 🎉', 'Event hinzugefügt — die Kneipe leuchtet auf der Karte, solange es läuft 🎉', 'Событие добавлено — пока оно идёт, пивная светится на карте 🎉', 'Подію додано — поки вона триває, пивна світиться на мапі 🎉'),
    ev_deleted: L('Akce smazána', 'Event deleted', 'Event gelöscht', 'Событие удалено', 'Подію видалено'),
    ev_delete: L('Smazat', 'Delete', 'Löschen', 'Удалить', 'Видалити'),
    ev_err_title: L('Zadejte název akce', 'Enter a title', 'Gib einen Titel ein', 'Введите название события', 'Введіть назву події'),
    ev_err_time: L('Konec musí být po začátku a v budoucnu (max. 31 dní)', 'End must be after the start and in the future (max 31 days)', 'Ende muss nach dem Beginn und in der Zukunft liegen (max. 31 Tage)', 'Конец должен быть позже начала и ещё не наступить (максимум 31 день)', 'Кінець має бути пізніше за початок і ще не настати (максимум 31 день)'),
    filter_events: L('🎉 Akce', '🎉 Events', '🎉 Events', '🎉 События', '🎉 Події'),
    today: L('dnes', 'today', 'heute', 'сегодня', 'сьогодні'),
    tomorrow: L('zítra', 'tomorrow', 'morgen', 'завтра', 'завтра'),
    cancel_plain: L('Zrušit', 'Cancel', 'Abbrechen', 'Отмена', 'Скасувати'),

    // ---------- кто где сидит: видимость «все» и поиск пивной по GPS ----------
    vis_everyone: L('Všichni', 'Everyone', 'Alle', 'Все', 'Усі'),
    vis_everyone_text: L('Všichni uživatelé Natankováno vidí, ve které hospodě jste a kolik jste vypili. Ukazuje se jen hospoda, kde jste se označili, nikdy přesná poloha.', 'Everyone on Natankováno sees which pub you’re in and how much you’ve had. Only the pub you checked in at is shown, never your exact location.', 'Alle Nutzer von Natankováno sehen, in welcher Kneipe du bist und wie viel du getrunken hast. Gezeigt wird nur die Kneipe, nie dein genauer Standort.', 'Все пользователи Natankováno видят, в какой пивной вы и сколько выпили. Показывается только пивная, где вы отметились, — не точное местоположение.', 'Усі користувачі Natankováno бачать, у якій пивній ви і скільки випили. Показується лише пивна, де ви відмітилися, — не точне місцезнаходження.'),
    vis_now_everyone: L('Teď vás vidí všichni', 'Now everyone can see you', 'Jetzt sehen dich alle', 'Теперь вас видят все', 'Тепер вас бачать усі'),
    not_friend_badge: L('není přítel', 'not a friend', 'kein Freund', 'не друг', 'не друг'),
    seen_by_all: L('vidí všichni', 'visible to all', 'für alle sichtbar', 'видят все', 'бачать усі'),
    near_pub_banner: L('📍 Jste v hospodě „{name}“? ({d} od vás)', '📍 Are you at “{name}”? ({d} away)', '📍 Bist du in „{name}“? ({d} entfernt)', '📍 Вы в «{name}»? ({d} от вас)', '📍 Ви в «{name}»? ({d} від вас)'),
    near_found: L('📍 Vypadá to, že jste v „{name}“', '📍 Looks like you’re at “{name}”', '📍 Sieht aus, als wärst du in „{name}“', '📍 Похоже, вы в «{name}»', '📍 Схоже, ви в «{name}»'),
    not_here: L('Ne, nejsem tu', 'Not here', 'Nein, nicht hier', 'Нет, я не тут', 'Ні, я не тут'),
    gps_find_pub: L('📍 Najít hospodu podle GPS', '📍 Find my pub by GPS', '📍 Kneipe per GPS finden', '📍 Определить пивную по GPS', '📍 Визначити пивну за GPS'),
    gps_no_pub: L('Do 100 m není žádná hospoda s tankovým. Vyberte ji na mapě nebo ji přidejte.', 'No tank-beer pub within 100 m. Pick one on the map or add it.', 'Keine Tankbier-Kneipe im Umkreis von 100 m. Wähle eine auf der Karte oder füg sie hinzu.', 'В радиусе 100 м нет пивной с танковым. Выберите на карте или добавьте.', 'У радіусі 100 м немає пивної з танковим. Виберіть на мапі або додайте.'),
    f_email: L('E-mail', 'Email', 'E-Mail', 'Email', 'Email'),
    f_password: L('Heslo', 'Password', 'Passwort', 'Пароль', 'Пароль'),
    f_password_ph: L('Aspoň 6 znaků', 'At least 6 characters', 'Mindestens 6 Zeichen', 'Минимум 6 символов', 'Мінімум 6 символів'),
    f_18: L('Je mi 18 let nebo víc a přijímám {terms}', 'I am 18 or older and accept {terms}', 'Ich bin mindestens 18 Jahre alt und akzeptiere {terms}', 'Мне уже исполнилось 18 лет, и я принимаю {terms}', 'Мені вже виповнилося 18 років, і я приймаю {terms}'),
    terms_word: L('pravidla', 'the Terms', 'die Regeln', 'правила', 'правила'),
    create_profile: L('Vytvořit profil', 'Create profile', 'Profil erstellen', 'Создать профиль', 'Створити профіль'),
    login_btn: L('Přihlásit se', 'Log in', 'Anmelden', 'Войти', 'Увійти'),
    enter_nick: L('Zadejte jméno nebo přezdívku', 'Enter a name or nickname', 'Gib einen Namen oder Spitznamen ein', 'Введите имя или ник', 'Введіть ім’я або нік'),
    enter_email_pw: L('Zadejte e-mail a heslo', 'Enter email and password', 'Gib E-Mail und Passwort ein', 'Введите email и пароль', 'Введіть email і пароль'),
    adults_only: L('Aplikace je jen pro lidi od 18 let', 'The app is for adults 18+ only', 'Die App ist nur für Erwachsene ab 18', 'Приложение только для тех, кому есть 18', 'Застосунок лише для тих, кому є 18'),
    hello_name: L('Ahoj, {name}! Vyberte hospodu na mapě', 'Hi {name}! Pick a pub on the map', 'Hallo {name}! Wähle eine Kneipe auf der Karte', 'Привет, {name}! Выберите пивную на карте', 'Привіт, {name}! Виберіть пивну на мапі'),
    notice_check_email: L('Skoro hotovo: poslali jsme vám e-mail — otevřete odkaz v něm a pak se přihlaste.', 'Almost done: we sent you an email — open the link in it, then log in.', 'Fast geschafft: Wir haben dir eine E-Mail geschickt — öffne den Link darin und melde dich dann an.', 'Почти готово: мы отправили письмо на ваш email — откройте ссылку из него, потом войдите.', 'Майже готово: ми надіслали лист на ваш email — відкрийте посилання з нього, потім увійдіть.'),
    welcome_back: L('Vítejte zpět! 🍺', 'Welcome back! 🍺', 'Willkommen zurück! 🍺', 'С возвращением! 🍺', 'З поверненням! 🍺'),

    // ---------- установка на телефон ----------
    install_h: L('📲 Natankováno na ploše telefonu', '📲 Natankováno on your home screen', '📲 Natankováno auf dem Startbildschirm', '📲 Natankováno на главном экране', '📲 Natankováno на головному екрані'),
    install_text: L('Ikona otevře mapu hned, bez prohlížeče — jako běžná aplikace.', 'The icon opens the map straight away, without the browser — like a normal app.', 'Das Symbol öffnet die Karte direkt, ohne Browser — wie eine normale App.', 'Иконка откроет карту сразу, без браузера — как обычное приложение.', 'Іконка відкриє мапу одразу, без браузера — як звичайний застосунок.'),
    install_btn: L('📲 Nainstalovat aplikaci', '📲 Install the app', '📲 App installieren', '📲 Установить приложение', '📲 Встановити застосунок'),
    install_ios: L('V Safari klepněte na „Sdílet“ <b>⬆︎</b> dole na obrazovce → <b>„Přidat na plochu“</b>.', 'In Safari tap “Share” <b>⬆︎</b> at the bottom → <b>“Add to Home Screen”</b>.', 'Tippe in Safari unten auf „Teilen“ <b>⬆︎</b> → <b>„Zum Home-Bildschirm“</b>.', 'В Safari нажмите «Поделиться» <b>⬆︎</b> внизу экрана → <b>«На экран „Домой“»</b>.', 'У Safari натисніть «Поділитися» <b>⬆︎</b> унизу екрана → <b>«На початковий екран»</b>.'),
    install_other: L('Otevřete menu prohlížeče <b>⋮</b> → <b>„Přidat na plochu“</b> nebo <b>„Instalovat aplikaci“</b>.', 'Open the browser menu <b>⋮</b> → <b>“Add to Home screen”</b> or <b>“Install app”</b>.', 'Öffne das Browsermenü <b>⋮</b> → <b>„Zum Startbildschirm hinzufügen“</b> oder <b>„App installieren“</b>.', 'Откройте меню браузера <b>⋮</b> → <b>«Добавить на главный экран»</b> или <b>«Установить приложение»</b>.', 'Відкрийте меню браузера <b>⋮</b> → <b>«Додати на головний екран»</b> або <b>«Встановити застосунок»</b>.'),
    installed_toast: L('Aplikace Natankováno je nainstalovaná — hledejte ikonu na ploše 🍺', 'Natankováno installed — look for the icon on your home screen 🍺', 'Natankováno installiert — such das Symbol auf dem Startbildschirm 🍺', 'Приложение Natankováno установлено — ищите иконку на главном экране 🍺', 'Застосунок Natankováno встановлено — шукайте іконку на головному екрані 🍺'),

    // ---------- профиль ----------
    your_profile: L('Váš profil', 'Your profile', 'Dein Profil', 'Ваш профиль', 'Ваш профіль'),
    profile_not_found: L('Profil nenalezen. Zkuste se odhlásit a znovu přihlásit.', 'Profile not found. Try logging out and in again.', 'Profil nicht gefunden. Melde dich ab und wieder an.', 'Профиль не найден. Попробуйте выйти и войти снова.', 'Профіль не знайдено. Спробуйте вийти й увійти знову.'),
    logout: L('Odhlásit se', 'Log out', 'Abmelden', 'Выйти', 'Вийти'),
    member_since: L('v aplikaci od {date}', 'member since {date}', 'dabei seit {date}', 'в приложении с {date}', 'у застосунку з {date}'),
    now_at: L('Teď: {pub}', 'Now: {pub}', 'Jetzt: {pub}', 'Сейчас: {pub}', 'Зараз: {pub}'),
    since_alcohol: L('od {time} · ≈ {g} g čistého alkoholu', 'since {time} · ≈ {g} g of pure alcohol', 'seit {time} · ≈ {g} g reiner Alkohol', 'с {time} · ≈ {g} г чистого алкоголя', 'з {time} · ≈ {g} г чистого алкоголю'),
    auto_end_note: L('Návštěva se sama ukončí po 8 hodinách.', 'Your check-in ends automatically after 8 hours.', 'Dein Check-in endet automatisch nach 8 Stunden.', 'Отметка снимется сама через 8 часов.', 'Відмітка зніметься сама через 8 годин.'),
    not_in_pub_h: L('Teď nejste v hospodě', 'You’re not at a pub now', 'Du bist gerade in keiner Kneipe', 'Вы сейчас не в пивной', 'Ви зараз не в пивній'),
    not_in_pub_text: L('Vyberte hospodu na mapě a klepněte na „Piju tady“.', 'Pick a pub on the map and tap “I’m drinking here”.', 'Wähle eine Kneipe auf der Karte und tippe auf „Ich trinke hier“.', 'Выберите пивную на карте и нажмите «Я тут пью».', 'Виберіть пивну на мапі й натисніть «Я тут п’ю».'),
    open_pubs: L('Otevřít hospody', 'Open pubs', 'Kneipen öffnen', 'Открыть пивные', 'Відкрити пивні'),
    all_time_h: L('Celkem', 'All time', 'Insgesamt', 'За всё время', 'За весь час'),
    friends_h: L('Přátelé ({n})', 'Friends ({n})', 'Freunde ({n})', 'Друзья ({n})', 'Друзі ({n})'),
    your_code: L('Váš kód přítele:', 'Your friend code:', 'Dein Freundescode:', 'Ваш код друга:', 'Ваш код друга:'),
    invite_link_btn: L('🔗 Pozvat odkazem', '🔗 Invite with a link', '🔗 Per Link einladen', '🔗 Пригласить по ссылке', '🔗 Запросити за посиланням'),
    friend_code_ph: L('Kód přítele', 'Friend’s code', 'Freundescode', 'Код друга', 'Код друга'),
    add: L('Přidat', 'Add', 'Hinzufügen', 'Добавить', 'Додати'),
    friend_at: L('v „{pub}“ · {c}', 'at “{pub}” · {c}', 'in „{pub}“ · {c}', 'в «{pub}» · {c}', 'у «{pub}» · {c}'),
    friend_not_at_pub: L('teď není v hospodě', 'not at a pub now', 'gerade in keiner Kneipe', 'сейчас не в пивной', 'зараз не в пивній'),
    sure_q: L('Opravdu?', 'Sure?', 'Sicher?', 'Точно?', 'Точно?'),
    remove: L('Odebrat', 'Remove', 'Entfernen', 'Убрать', 'Прибрати'),
    who_sees_h: L('Kdo vidí, kde piju', 'Who can see where I drink', 'Wer sieht, wo ich trinke', 'Кто видит, где я пью', 'Хто бачить, де я п’ю'),
    vis_friends: L('Přátelé', 'Friends', 'Freunde', 'Друзья', 'Друзі'),
    vis_nobody: L('Nikdo', 'Nobody', 'Niemand', 'Никто', 'Ніхто'),
    vis_friends_text: L('Přátelé vidí hospodu, kde jste se označili, a kolik jste vypili.', 'Friends see the pub you checked in at and how much you’ve had.', 'Freunde sehen die Kneipe, in der du eingecheckt bist, und wie viel du getrunken hast.', 'Друзья видят пивную, где вы отметились, и сколько выпито.', 'Друзі бачать пивну, де ви відмітилися, і скільки випито.'),
    vis_nobody_text: L('Jste neviditelní: vypité se počítá jen pro vás.', 'You’re invisible: drinks are counted only for you.', 'Du bist unsichtbar: Getränke zählen nur für dich.', 'Вы невидимка: выпитое считается только для вас.', 'Ви невидимка: випите рахується лише для вас.'),
    history_h: L('Historie', 'History', 'Verlauf', 'История', 'Історія'),
    pub_generic: L('Hospoda', 'Pub', 'Kneipe', 'Пивная', 'Пивна'),
    delete_sure: L('Opravdu smazat účet? Klepněte znovu', 'Really delete your account? Tap again', 'Konto wirklich löschen? Tippe erneut', 'Точно удалить аккаунт? Нажмите ещё раз', 'Точно видалити акаунт? Натисніть ще раз'),
    delete_account: L('Smazat účet', 'Delete account', 'Konto löschen', 'Удалить аккаунт', 'Видалити акаунт'),
    logged_out: L('Odhlásili jste se', 'You’ve logged out', 'Du bist abgemeldet', 'Вы вышли из профиля', 'Ви вийшли з профілю'),
    account_deleted: L('Účet a všechna data jsou smazány', 'Account and all data deleted', 'Konto und alle Daten gelöscht', 'Аккаунт и все данные удалены', 'Акаунт і всі дані видалено'),
    friend_removed: L('Přítel odebrán', 'Friend removed', 'Freund entfernt', 'Друг удалён', 'Друга видалено'),
    vis_now_friends: L('Přátelé teď vidí, kde pijete', 'Friends can now see where you drink', 'Freunde sehen jetzt, wo du trinkst', 'Теперь друзья видят, где вы пьёте', 'Тепер друзі бачать, де ви п’єте'),
    vis_now_nobody: L('Teď vás nikdo nevidí', 'Now nobody can see you', 'Jetzt sieht dich niemand', 'Теперь вас никто не видит', 'Тепер вас ніхто не бачить'),

    // ---------- App Store: жалобы, блокировка, 18+, правила ----------
    more_actions: L('Další akce', 'More actions', 'Weitere Aktionen', 'Ещё действия', 'Ще дії'),
    report_btn: L('🚩 Nahlásit', '🚩 Report', '🚩 Melden', '🚩 Пожаловаться', '🚩 Поскаржитися'),
    report_place: L('🚩 Nahlásit nevhodné místo', '🚩 Report inappropriate place', '🚩 Unpassenden Ort melden', '🚩 Пожаловаться на место', '🚩 Поскаржитися на місце'),
    sure_report: L('Opravdu nahlásit? Klepněte znovu', 'Really report? Tap again', 'Wirklich melden? Tippe erneut', 'Точно пожаловаться? Нажмите ещё раз', 'Точно поскаржитися? Натисніть ще раз'),
    reported_toast: L('Děkujeme, nahlášení jsme přijali a do 24 hodin ho prověříme', 'Thanks, we’ve got your report and will review it within 24 hours', 'Danke, wir haben deine Meldung erhalten und prüfen sie innerhalb von 24 Stunden', 'Спасибо, жалоба отправлена. Мы проверим её в течение 24 часов', 'Дякуємо, скаргу надіслано. Ми перевіримо її протягом 24 годин'),
    block_btn: L('⛔ Zablokovat', '⛔ Block', '⛔ Blockieren', '⛔ Заблокировать', '⛔ Заблокувати'),
    sure_block: L('Opravdu zablokovat? Klepněte znovu', 'Really block? Tap again', 'Wirklich blockieren? Tippe erneut', 'Точно заблокировать? Нажмите ещё раз', 'Точно заблокувати? Натисніть ще раз'),
    blocked_toast: L('Zablokováno: {who} vás už neuvidí a nepřidá si vás', 'Blocked: {who} can no longer see you or add you', 'Blockiert: {who} sieht dich nicht mehr und kann dich nicht hinzufügen', 'Заблокировано: {who} больше не увидит вас и не сможет добавить', 'Заблоковано: {who} більше не побачить вас і не зможе додати'),
    blocked_h: L('Zablokovaní ({n})', 'Blocked ({n})', 'Blockiert ({n})', 'Заблокированные ({n})', 'Заблоковані ({n})'),
    unblock: L('Odblokovat', 'Unblock', 'Freigeben', 'Разблокировать', 'Розблокувати'),
    unblocked_toast: L('Odblokováno', 'Unblocked', 'Blockierung aufgehoben', 'Разблокировано', 'Розблоковано'),
    err_offensive: L('Text obsahuje nevhodná slova — upravte ho, prosím', 'The text contains offensive words — please change it', 'Der Text enthält beleidigende Wörter – bitte ändere ihn', 'В тексте есть грубые слова — исправьте, пожалуйста', 'У тексті є грубі слова — виправте, будь ласка'),
    responsible: L('🚗 Za volant ani kapku. Pijte s rozumem.', '🚗 Never drink and drive. Please drink responsibly.', '🚗 Kein Alkohol am Steuer. Trink verantwortungsvoll.', '🚗 За руль — ни капли. Пейте с умом.', '🚗 За кермо — ні краплі. Пийте з розумом.'),
    link_terms: L('Pravidla', 'Terms', 'Regeln', 'Правила', 'Правила'),
    link_privacy: L('Soukromí', 'Privacy', 'Datenschutz', 'Конфиденциальность', 'Конфіденційність'),
    link_support: L('Podpora', 'Support', 'Support', 'Поддержка', 'Підтримка'),
    gate_title: L('Je vám 18?', 'Are you 18?', 'Bist du 18?', 'Вам есть 18?', 'Вам є 18?'),
    gate_text: L('Natankováno je o pivu, a proto jen pro dospělé.', 'Natankováno is all about beer, so it’s for adults only.', 'Bei Natankováno dreht sich alles um Bier – deshalb nur für Erwachsene.', 'Natankováno — про пиво, поэтому только для взрослых.', 'Natankováno — про пиво, тому лише для дорослих.'),
    gate_yes: L('Ano, je mi 18+', 'Yes, I’m 18+', 'Ja, ich bin 18+', 'Да, мне 18+', 'Так, мені 18+'),
    gate_no: L('Ne', 'No', 'Nein', 'Нет', 'Ні'),
    gate_bye: L('Tak se vraťte, až vám bude 18 🙂', 'Come back when you’re 18 🙂', 'Komm wieder, wenn du 18 bist 🙂', 'Возвращайтесь, когда исполнится 18 🙂', 'Повертайтеся, коли виповниться 18 🙂'),
  };

  // похожие языки: словацкий → чешский, белорусский → русский
  const ALIASES = { sk: 'cs', be: 'ru' };
  function detect() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* приватный режим */ }
    if (ORDER.includes(saved)) return saved;
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (const p of prefs) {
      const c = String(p).slice(0, 2).toLowerCase();
      if (ORDER.includes(c)) return c;
      if (ALIASES[c]) return ALIASES[c];
    }
    return 'en';
  }

  let lang = detect();
  const info = () => LANGS.find(l => l.code === lang);
  const fill = (s, params) => String(s).replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? params[k] : m));

  function t(key, params) {
    const entry = T[key];
    if (!entry) return key;
    const s = entry[lang] != null ? entry[lang] : entry.en;
    return fill(typeof s === 'object' ? s.other : s, params);
  }
  // формы множественного числа: tn('n_beers', 5) → «5 пив» / «5 piv» / «5 beers»
  function tn(key, n, params) {
    const entry = T[key];
    if (!entry) return key;
    const forms = entry[lang] || entry.en;
    const cat = new Intl.PluralRules(info().locale).select(n);
    const s = forms[cat] || forms.other || forms.many || forms.few || forms.one;
    return fill(s, Object.assign({ n }, params));
  }
  function set(code) {
    if (!ORDER.includes(code)) return;
    lang = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* приватный режим */ }
  }

  return {
    LANGS, T, t, tn, set,
    get lang() { return lang; },
    get locale() { return info().locale; },
    get short() { return info().short; },
  };
})();
