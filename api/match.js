/* Funkcja serwerowa Vercela. Jedyne miejsce, które zna klucz API.
   Przeglądarka nigdy go nie widzi — rozmawia tylko z tym adresem.

   Zmienne środowiskowe w panelu Vercela — ustaw JEDEN z kluczy:
     GEMINI_API_KEY      -> używa Gemini (darmowy tier)
     ANTHROPIC_API_KEY   -> używa Claude (płatne, bez limitu dziennego)

   Jak ustawisz oba, wygrywa Gemini. Żeby przełączyć na Claude w trakcie eventu:
   skasuj GEMINI_API_KEY i zrób Redeploy. 30 sekund, zero zmian w kodzie.

   Opcjonalnie: GEMINI_MODEL / CLAUDE_MODEL — jak puste, funkcja sama wybierze.
*/

const { CATALOG, DIR } = require('./data.js');

const MAX_Q = 500;                 // dłuższych zapytań nie przyjmujemy — to Twój koszt
const RPM_PER_IP = 12;             // zgrubny bezpiecznik na jedną osobę
const hits = new Map();            // pamięć procesu; przy cold starcie się czyści i to jest OK

const SYSTEM = `Jesteś matcherem networkingowym na wydarzeniu PARP Future Camp 2026 w Rynie (24-25 sierpnia).

Dostajesz katalog uczestników, prelegentów i jurorów. Użytkownik pisze własnymi słowami, czego szuka.
Twoje zadanie: wskazać osoby, z którymi naprawdę warto, żeby porozmawiał.

ZASADY:

1. KOMPLEMENTARNOŚĆ, NIE PODOBIEŃSTWO. Szukasz miejsc, gdzie POTRZEBA użytkownika spotyka
   UMIEJĘTNOŚĆ drugiej osoby. Dwóch founderów tej samej branży, którzy szukają tego samego,
   to zły match — chyba że wprost oznaczysz to jako wspólny temat.

2. KIERUNEK. Każdemu dopasowaniu przypisz fit:
   "get"  — ta osoba pomoże użytkownikowi (główny przypadek)
   "give" — użytkownik pomoże jej; łatwiej zacząć rozmowę, przychodząc z czymś
   "both" — ten sam problem, różne rynki; wymiana doświadczeń

3. NIE WYPEŁNIAJ LISTY NA SIŁĘ. Lepiej zwrócić 3 mocne dopasowania niż 8 słabych.
   Jeśli na jakiś wątek zapytania nikt nie pasuje, po prostu go pomiń — nie wciskaj
   osoby, która "trochę" pasuje. Maksymalnie 8 wyników.

4. UZASADNIAJ KONKRETEM Z OBU STRON. "why" ma łączyć to, czego szuka użytkownik,
   z tym, co ta osoba faktycznie zrobiła. Odwołuj się do liczb i faktów z katalogu.
   Zero ogólników typu "ma duże doświadczenie".

5. "ask" to jedno pytanie, od którego warto zacząć rozmowę. Konkretne, nie grzecznościowe.
   Takie, na które ta konkretna osoba ma nieoczywistą odpowiedź.

6. ZWRACAJ UWAGĘ NA NIEOCZYWISTE POŁĄCZENIA. Jeśli ktoś buduje aplikację nagrywającą dźwięk
   w mieszkaniach, prawnik od RODO jest trafnym wynikiem, choć w zapytaniu nie pada słowo "prawo".

7. Pisz po polsku, zwięźle, bez lania wody. Bez emoji.

8. Pole "id" musi być DOKŁADNIE takie jak w nawiasach kwadratowych w katalogu. Nie wymyślaj id.

KATALOG OSÓB:

${CATALOG}`;

/* ---------------------- GEMINI ---------------------- */
const GEMINI_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id:  { type: 'STRING' },
      fit: { type: 'STRING', enum: ['get', 'give', 'both'] },
      why: { type: 'STRING' },
      ask: { type: 'STRING' },
    },
    required: ['id', 'fit', 'why', 'ask'],
  },
};

async function callGemini(key, model, q, exclude) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userMsg(q, exclude) }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2500,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
}

async function listGeminiModels(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key },
  });
  if (!r.ok) return { error: `lista modeli: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`, models: [] };
  const { models = [] } = await r.json();
  return { models: models
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', '')) };
}

/* ---------------------- CLAUDE (zapas) ---------------------- */
async function callClaude(key, model, q, exclude) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: `${userMsg(q, exclude)}\n\nOdpowiedz samą tablicą JSON: [{"id":"...","fit":"get|give|both","why":"...","ask":"..."}]` },
        { role: 'assistant', content: '[' },
      ],
    }),
  });
}

function userMsg(q, exclude) {
  if (!exclude || !exclude.length) return `Użytkownik szuka: ${q}`;
  return `Użytkownik szuka: ${q}\n\nTe osoby już pokazano, pomiń je i znajdź KOLEJNE najlepsze dopasowania (mogą być trochę słabsze niż poprzednie, ale nadal sensowne): ${exclude.join(', ')}`;
}

/* Kaskada modeli. Google wycofuje starsze wersje (404) i przeciąża nowsze (503),
   więc jedna nazwa nie wystarcza. Idziemy po liście, a przy 503/429 ponawiamy
   z odstępem, bo przeciążenie zwykle mija w sekundę-dwie. */
const GEMINI_CHAIN = [
  'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash',
  'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
];
const BUDGET_MS = 40000;   // twardy budżet: funkcja Vercela ma limit czasu
const CLAUDE_CHAIN = ['claude-haiku-4-5', 'claude-sonnet-4-5'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let cachedModel = null;          // co ostatnio zadziałało — próbujemy tego najpierw

async function callWithFallback(provider, key, q, exclude) {
  const deadline = Date.now() + BUDGET_MS;
  const call = provider === 'gemini' ? callGemini : callClaude;
  const base = provider === 'gemini' ? GEMINI_CHAIN : CLAUDE_CHAIN;
  const wanted = provider === 'gemini' ? process.env.GEMINI_MODEL : process.env.CLAUDE_MODEL;

  // kolejność: ostatni działający -> ustawiony ręcznie -> kaskada
  const chain = [...new Set([cachedModel, wanted, ...base].filter(Boolean))];
  const tried = [];

  for (const model of chain) {
    if (Date.now() > deadline) { tried.push('budżet czasu wyczerpany'); break; }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (Date.now() > deadline) break;
      let r;
      try { r = await call(key, model, q, exclude); }
      catch (e) { tried.push(`${model}: ${e.message}`); break; }

      if (r.ok) { cachedModel = model; return { r, model, tried }; }

      const body = await r.text();
      tried.push(`${model} -> HTTP ${r.status}`);

      // 404/400 = model nie istnieje albo zły request: nie ma sensu ponawiać
      if (r.status === 404 || r.status === 400) break;
      // 401/403 = klucz: kończymy od razu, kaskada nic nie da
      if (r.status === 401 || r.status === 403) {
        return { fatal: { status: r.status, body: body.slice(0, 300) }, tried };
      }
      // 503/429/5xx = przeciążenie: czekamy i próbujemy jeszcze raz tym samym modelem
      if (attempt < 1) await sleep(600);
    }
  }
  return { exhausted: true, tried };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Tylko POST' });

  const gKey = process.env.GEMINI_API_KEY;
  const cKey = process.env.ANTHROPIC_API_KEY;
  const provider = gKey ? 'gemini' : cKey ? 'claude' : null;
  if (!provider) {
    // diagnostyka: same NAZWY zmiennych, nigdy wartości
    const widoczne = Object.keys(process.env)
      .filter(k => /GEMINI|ANTHROPIC|API|KEY/i.test(k) && !/^(VERCEL|NEXT|npm|AWS)/i.test(k));
    console.error('Brak klucza. Widoczne zmienne:', widoczne);
    return res.status(500).json({
      error: 'Brak klucza w zmiennych środowiskowych.',
      diagnostyka: {
        widoczne_zmienne: widoczne,
        srodowisko: process.env.VERCEL_ENV || 'nieznane',
        podpowiedz: widoczne.length
          ? 'Zmienne są widoczne, ale żadna nie nazywa się dokładnie GEMINI_API_KEY ani ANTHROPIC_API_KEY. Sprawdź pisownię.'
          : 'Funkcja nie widzi żadnej Twojej zmiennej. Najpewniej dodana do innego środowiska (Production/Preview) albo do innego projektu, albo deploy jest starszy niż zmienna.',
      },
    });
  }

  const ip = req.headers['x-forwarded-for'] || 'anon';
  const now = Date.now();
  const bucket = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (bucket.length >= RPM_PER_IP) return res.status(429).json({ error: 'Za dużo zapytań. Odczekaj minutę.' });
  bucket.push(now); hits.set(ip, bucket);

  const q = String((req.body && req.body.q) || '').trim().slice(0, MAX_Q);
  if (q.length < 3) return res.status(400).json({ error: 'Napisz, czego szukasz.' });
  const exclude = Array.isArray(req.body && req.body.exclude)
    ? req.body.exclude.filter(id => typeof id === 'string').slice(0, 100)
    : [];

  try {
    const key = provider === 'gemini' ? gKey : cKey;
    const { r, model, fatal, exhausted, tried } = await callWithFallback(provider, key, q, exclude);
    console.error('próby:', tried.join(' | '));

    if (fatal) {
      return res.status(502).json({
        error: fatal.status === 429 ? 'Wyczerpany limit zapytań do API.' : 'Nieprawidłowy klucz API',
        diagnostyka: { proby: tried },
      });
    }
    if (exhausted) {
      return res.status(502).json({
        error: 'Wszystkie modele odmówiły. Zwykle to chwilowe przeciążenie — spróbuj za minutę.',
        diagnostyka: { proby: tried },
      });
    }

    const data = await r.json();
    let raw = provider === 'gemini'
      ? (data.candidates?.[0]?.content?.parts || [])
          .filter(p => !p.thought)
          .map(p => p.text || '')
          .join('')
      : '[' + (data.content?.[0]?.text || '');
    if (provider === 'claude') raw = raw.slice(0, raw.lastIndexOf(']') + 1 || undefined);

    let picks;
    try { picks = JSON.parse(raw); }
    catch {
      console.error('Zły JSON:', raw.slice(0, 400));
      return res.status(502).json({ error: 'Model zwrócił nieczytelną odpowiedź. Spróbuj jeszcze raz.' });
    }

    // dane kontaktowe doklejamy po stronie serwera — model nigdy nie wymyśla linków
    const out = (Array.isArray(picks) ? picks : [])
      .filter(p => p && DIR[p.id])
      .slice(0, 8)
      .map(p => ({ ...DIR[p.id], fit: p.fit || 'get', why: p.why || '', ask: p.ask || '' }));

    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ results: out, total: Object.keys(DIR).length, model });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Coś padło po stronie serwera.' });
  }
};
