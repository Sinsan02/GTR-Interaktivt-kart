# NPC-jakt kart

Interaktivt kart for GTA RP: sett nåler og kryss av steder du har sjekket.

## Filer
- `index.html` – oppsett og knapper
- `style.css` – farger, layout og mobilvisning (farger ligger som variabler øverst i `:root`)
- `script.js` – all logikk: zoom/panorering, nåler, liste, lagring, import/eksport

## Kjøre lokalt
Åpne `index.html` direkte i nettleseren, eller bruk utvidelsen **Live Server** i VS Code
(høyreklikk `index.html` → *Open with Live Server*) for automatisk oppdatering når du lagrer.

## Felles rom (Firebase)
Åpne siden med `?rom=<kode>` (eller skriv en romkode i feltet øverst) for å dele data live
med alle som har samme kode. Ruter, punkter og rutenett-størrelse lagres da i
Firebase Realtime Database under `rooms/<kode>`. Uten romkode brukes lokal lagring som før.

Databasereglene ligger i `database.rules.json`. Lim dem inn under
Realtime Database → *Rules* i Firebase-konsollen og trykk *Publish*.

## Kartbilde
Kartet er fast og ligger i repoet som `map.webp`. Bytt ut filen for å endre kartet for alle.

## Lokal lagring (uten rom)
- Punkter lagres i `localStorage` (nøkkel `npcjakt.pins.v1`).
- Sjekkede ruter lagres i `localStorage` (nøkkel `npcjakt.cells.v1`), separat for hver rutenett-størrelse.
Begge er knyttet til adressen siden åpnes fra, så punkter fra den publiserte versjonen
følger ikke med automatisk. Bruk «Lagre / hent» for å flytte dem over.

## Nyttige steder å endre i script.js
- `GRID_SIZES` – valgene for hvor mange ruter rutenettet er i bredden (radene regnes ut så rutene blir kvadratiske)
- Eksempelpunktene ligger nederst under `// ---------- boot ----------`
