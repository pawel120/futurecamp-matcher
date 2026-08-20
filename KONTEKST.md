# Kontekst projektu — wklej to na starcie nowej sesji

## Co budujemy

Matcher networkingowy na **PARP Future Camp 2026** (Ryn, 24-25 sierpnia 2026).
Użytkownik wpisuje własnymi słowami, czego szuka. AI czyta katalog 113 osób i zwraca
tych, z którymi warto pogadać, z uzasadnieniem i pytaniem na start.

Ja (Paweł) jadę na ten event jako uczestnik. Narzędzie ma być realnie używane przez
uczestników — link idzie na grupę WhatsApp. Prezentacja organizatorowi to efekt uboczny.

**Zostały ~4 dni do eventu.**

## Stan na teraz

Działa: baza danych, frontend, funkcja serwerowa, deploy na Vercelu.
Nie działa: ostatnia poprawka parsowania odpowiedzi **nie jest jeszcze wgrana**.

Ostatni błąd na produkcji: „Model zwrócił nieczytelną odpowiedź".
Przyczyna znaleziona i naprawiona w plikach, które masz — trzeba tylko wdrożyć.

## Architektura

```
index.html          jedno pole tekstowe + wyniki, mobile-first, zero zależności
api/match.js        funkcja serwerowa Vercela — jedyne miejsce znające klucz API
api/data.js         GENEROWANY katalog dla modelu (~19 tys. tokenów)
profiles.js         38 uczestników — z intro wrzuconych na grupę WhatsApp
speakers.js         75 prelegentów, mentorów i jury — z agendy i biogramów PARP
build-data.js       profiles.js + speakers.js  ->  api/data.js
vercel.json         maxDuration 60s, noindex
```

Przepływ: przeglądarka → `/api/match` → Gemini API → wynik.
Model dostaje katalog i zapytanie, zwraca `[{id, fit, why, ask}]`.
Dane kontaktowe (LinkedIn, linki) doklejane po stronie serwera ze słownika —
model nigdy nie wymyśla adresów.

`fit` ma trzy wartości: `get` (on pomoże Tobie), `give` (Ty pomożesz jemu),
`both` (ten sam problem, inne rynki). Sedno produktu: matchujemy **komplementarnych**,
nie podobnych — czyjaś POTRZEBA ma trafić w czyjąś UMIEJĘTNOŚĆ.

## Wdrożenie

- Vercel, projekt `futurecamp-matcher_3`, team `zrobmy-cos`
- Domena: `futurecamp-matcher3.vercel.app`
- Repo git: **jeszcze nie ma** — wdrażane przez `vercel` CLI
- Zmienne środowiskowe (Production + Preview + Development):
  - `GEMINI_API_KEY` — klucz z Google AI Studio, działa, sprawdzony
  - `GEMINI_MODEL` — obecnie `gemini-3.7-flash`, można skasować (kod ma kaskadę)
- Klucz Anthropic też mam. Kod obsługuje oba: jak ustawisz `ANTHROPIC_API_KEY`
  zamiast `GEMINI_API_KEY`, przełącza się na Claude bez zmian w kodzie.

## Pułapki, w które już wdepnęliśmy — nie powtarzaj

1. **Modele `gemini-2.5-*` zwracają 404.** Są na liście `ListModels`, ale wycofane
   z `generateContent`. Działają `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`.
2. **Modele 3.x domyślnie „myślą".** Tok rozumowania wraca jako osobna część odpowiedzi
   z flagą `thought: true` i zjada limit tokenów. Trzeba `thinkingConfig: {thinkingBudget: 0}`
   i filtrować części przy parsowaniu. To był ostatni błąd.
3. **Darmowy tier bywa przeciążony (503).** Kod ma kaskadę 6 modeli + retry z odstępem
   + budżet 40 s, żeby funkcja nie wpadła w timeout Vercela.
4. **Zmienne środowiskowe muszą być w Production.** Dodane tylko do Development nie
   działają na wdrożonej stronie. Po każdej zmianie zmiennej trzeba Redeploy.
5. **Vercel AI Gateway to nie to.** Wymaga karty i nie ma z tym projektem nic wspólnego —
   klucz bierzemy z `aistudio.google.com`, nie z panelu Vercela.
6. **Diagnostyka.** Vercel → Deployments → Runtime Logs pokazuje nazwę modelu i surową
   odpowiedź Google. Szybciej niż zgadywanie.

## Dane

113 osób, wszystkie sprawdzone i ustrukturyzowane:

- **38 uczestników** — z intro wrzuconych na grupę. Pola: `does`, `seeks`, `offers`,
  `tags`, `keywords`. `offers` jest **wywnioskowane** — ludzie piszą, czego szukają,
  prawie nikt nie pisze, w czym pomoże.
- **75 prelegentów i jury** — z publicznej agendy PARP plus biogramy z profili autorskich.
  Mają dodatkowo `session` i `when`, więc wiadomo, kiedy i gdzie kogo złapać.

Zasady, których się trzymamy:
- do bazy wchodzi **tylko to, co człowiek sam wrzucił na grupę** (albo dane publiczne PARP)
- **numery telefonów nie wchodzą**, mimo że były widoczne na zrzutach
- jeden wpis (`natalia-herrise`) ma `hidden: true`, bo opis pochodził z LinkedIna,
  a nie z jej intro — zdjąć flagę dopiero, gdy sama coś napisze

Ośmioro uczestników nie ma linku do LinkedIna (ucięty na zrzucie), troje ma za mało
treści, żeby ich sensownie matchować. To nie blokuje niczego.

## Co dalej, w kolejności

1. **Wdrożyć obecną wersję i sprawdzić, czy zwraca wyniki.** To jedyna rzecz na krytycznej ścieżce.
2. Podmienić `TWOJ@MAIL.PL` w stopce `index.html` na mój adres.
3. Założyć repo na GitHubie i podpiąć do Vercela — żeby deploy szedł z commita.
4. Dopisać `raw` (oryginalne intro) do uczestników — mam je do wklejenia w tekście.
   `build-data.js` już to obsługuje, wystarczy dodać pole do rekordu.
5. Uzupełnić brakujące linki LinkedIn.
6. Napisać do organizatora **zanim** link pójdzie na grupę.

## Jak ze mną pracować

- Odpowiadaj po polsku, zwięźle, bez lania wody.
- **Nie buduj nic bez uzgodnienia.** Najpierw powiedz, jak coś ma działać, poczekaj
  na moje ok, potem rób. Dostawanie gotowych rozwiązań, o które nie prosiłem, mnie wkurza.
- Nie podmieniaj plików w kółko przy debugowaniu. Najpierw diagnoza z logów albo curla,
  potem jedna poprawka.
- Wolę opcje tanie i proste. Bez zbędnych zależności.
