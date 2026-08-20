# Matcher — Future Camp 2026

Wpisujesz, czego szukasz. Claude czyta bazę 113 osób i zwraca tych, z którymi warto pogadać,
z uzasadnieniem i pytaniem na start.

## Pliki

```
index.html        strona — jedno pole i wyniki
api/match.js      funkcja serwerowa: jedyne miejsce, które zna klucz API
api/data.js       GENEROWANY katalog dla modelu — nie edytuj ręcznie
profiles.js       38 uczestników (intro z grupy WhatsApp)
speakers.js       75 prelegentów, mentorów i jury (agenda + biogramy PARP)
build-data.js     przerabia profiles.js + speakers.js na api/data.js
vercel.json
```

## Wdrożenie — 4 kroki

### 1. Klucz API

`aistudio.google.com` → **Get API key** → **Create API key in new project**. Bez karty, darmowy tier.

Funkcja obsługuje też Claude jako zapas — patrz „Gdy padnie limit” niżej.

### 2. Wrzuć projekt na Vercela

Najprościej przez GitHub: załóż repo, wrzuć te pliki, potem na `vercel.com` →
**Add New → Project** → wybierz repo → **Deploy**.

Framework Preset: **Other**. Build Command i Output Directory zostaw **puste**.

Alternatywa bez GitHuba:

```bash
npm i -g vercel
vercel        # w katalogu projektu, odpowiadasz na kilka pytań
```

### 3. Wklej klucz jako zmienną środowiskową

**To jest ten krok, którego nie wolno pominąć ani obejść.** W panelu Vercela:
Project → Settings → Environment Variables → dodaj:

| Nazwa | Wartość |
|---|---|
| `GEMINI_API_KEY` | Twój klucz z AI Studio |
| `GEMINI_MODEL` | *(opcjonalnie)* np. `gemini-2.5-flash` |

Klucza nie wolno wkleić do `index.html` ani do żadnego pliku w repo. Wszystko, co trafia do
przeglądarki, jest jawne — każdy odwiedzający może podejrzeć źródło strony, wyciągnąć klucz
i obciążyć nim Twoje konto. Klucz ma istnieć wyłącznie w zmiennych środowiskowych Vercela,
gdzie czyta go funkcja `api/match.js`.

Po dodaniu zmiennej zrób **Redeploy** — bez tego stara wersja jej nie zobaczy.

`GEMINI_MODEL` możesz zostawić puste. Jeśli domyślna nazwa modelu nie zadziała, funkcja sama
zapyta API o listę dostępnych i wybierze wariant Flash. Listę zobaczysz też sam:

```bash
curl https://generativelanguage.googleapis.com/v1beta/models -H "x-goog-api-key: TWOJ_KLUCZ"
```

### Gdy padnie limit darmowego tieru

Gemini ma dzienny limit. Jeśli wyczerpie się w środku eventu, strona zacznie zwracać błąd.
Ratunek zajmuje 30 sekund i nie wymaga zmiany kodu:

1. Weź klucz z `console.anthropic.com` → Settings → API Keys
2. Vercel → Settings → Environment Variables → **usuń** `GEMINI_API_KEY`, dodaj `ANTHROPIC_API_KEY`
3. Redeploy

Funkcja sama wykryje, który klucz jest ustawiony. Claude jest płatny, ale katalog idzie przez
prompt caching, więc przy modelu Haiku i skali tego wydarzenia to pojedyncze złotówki.
Jak ustawisz oba klucze naraz, wygrywa Gemini.

### 4. Sprawdź

Wejdź na adres z Vercela, wpisz „szukam inwestora na pierwszą rundę”, poczekaj kilka sekund.
Powinny wyjść nazwiska z uzasadnieniami.

Jeśli wyskoczy błąd — Vercel → Deployments → wybierz deploy → **Runtime Logs**. Tam jest powód.

## Dopisanie ludzi

1. Dodaj rekord w `profiles.js` (uczestnicy) albo `speakers.js` (prelegenci)
2. `node build-data.js`
3. Commit i push — Vercel przebuduje sam

Krok 2 jest obowiązkowy. Bez niego model nie zobaczy nowej osoby, mimo że jest w pliku.

## Koszty i bezpieczniki

Katalog ma około 19 tys. tokenów i leci przy każdym zapytaniu. Na darmowym tierze Gemini
kosztuje to zero — liczy się tylko dzienny limit zapytań.

W `api/match.js` siedzą dwa bezpieczniki:

- `MAX_Q = 500` — dłuższych zapytań funkcja nie przyjmie
- `RPM_PER_IP = 12` — maksymalnie 12 zapytań na minutę z jednego adresu

To zgrubna ochrona, licząca w pamięci procesu. Wystarczy przeciw przypadkowemu zapętleniu
i komuś, kto się nudzi. Nie wystarczy przeciw komuś, kto naprawdę chce Ci wypalić limit —
jeśli link wyjdzie poza grupę, obserwuj zużycie w konsoli Anthropic i w razie czego
wygeneruj nowy klucz.

## Przed wrzuceniem linku na grupę

1. Podmień `TWOJ@MAIL.PL` w stopce `index.html` na swój adres
2. `noindex` jest już w `<head>` — strona nie wejdzie do Google
3. Napisz do organizatora **zanim** link pójdzie na grupę
4. Baza zawiera tylko to, co ludzie sami wrzucili na grupę, plus publiczną agendę PARP.
   Numery telefonów widoczne na zrzutach nie weszły. Natalia z HerRise jest oznaczona
   `hidden:true`, bo jej opis pochodził z LinkedIna, a nie z jej intro — zdejmij tę flagę
   dopiero, jeśli sama napisze coś na grupie.
