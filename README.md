# Marktliste

Einkaufsliste, die jedes Produkt dem Markt zuordnet, in dem es gekauft wird.
Eine einzelne HTML-Datei, keine Installation, keine Abhängigkeiten. Alles wird
lokal im Browser gespeichert (localStorage).

## Starten

`index.html` im Browser öffnen, oder das Repo per GitHub Pages veröffentlichen
und die Seite auf dem Handy zum Startbildschirm hinzufügen.

## Was die App kann

**Einkaufsliste** zeigt die offenen Produkte nach Markt gruppiert, jeder Markt
mit eigener Farbe. Oben Produkt eintragen, optional Menge und Markt wählen.
Über die Chips auf einen einzelnen Markt filtern, dann steht beim Einkaufen
genau das auf dem Schirm, was hier gekauft wird. Abgehakte Produkte rutschen
ans Ende der Gruppe und lassen sich pro Markt oder gesammelt entfernen.

**Produkt einem Markt zuordnen** per Drag & Drop auf eine Marktkarte oder einen
Chip, am Handy über das Markt-Auswahlfeld in der Zeile.

**Sammelliste** ist der Vorrat an Produkten, die ihr regelmäßig braucht, jedes
mit seinem Standardmarkt. Ein Tipp auf `+` setzt ein Produkt mit diesem Markt
auf die Einkaufsliste, ein weiterer nimmt es wieder runter. Neu eingetragene
Produkte landen automatisch in der Sammelliste (Haken lässt sich abwählen).

**Märkte** frei anlegen, umbenennen, einfärben und löschen. Beim Löschen
wandern die betroffenen Produkte zurück nach „Ohne Markt“.

**Gemeinsame Liste**: Mit hinterlegten Firebase-Zugangsdaten teilen sich alle
Geräte dieselbe Liste. Wer abhakt, abhakt für alle, in unter einer Sekunde.
Ohne Netz wird lokal weitergearbeitet und beim nächsten Verbinden abgeglichen.
Eingeladen wird über den Link mit dem Listen-Code, ganz ohne Anmeldung.

**Datensicherung**: Ohne Firebase liegen die Daten nur in diesem einen Browser.
Im Tab „Märkte“ lassen sie sich als Text anzeigen, kopieren und auf einem
anderen Gerät wieder einlesen.

## Gemeinsame Liste einrichten (Firebase)

Einmalig, danach läuft es von allein. In der Firebase-Konsole
(console.firebase.google.com), eingeloggt mit einem Google-Konto:

1. **Projekt hinzufügen**, Name zum Beispiel `marktliste`, Google Analytics
   kann aus bleiben.
2. Links **Build → Realtime Database → Datenbank erstellen**, Region
   `europe-west1`, Start **im gesperrten Modus**.
3. Dort auf den Reiter **Regeln** und diese einsetzen, dann **Veröffentlichen**:

   ```json
   {
     "rules": {
       "listen": {
         "$code": {
           ".read": "auth != null",
           ".write": "auth != null"
         }
       }
     }
   }
   ```

4. Links **Build → Authentication → Los geht's**, in der Liste **Anonym**
   auswählen und aktivieren. Dadurch muss sich niemand anmelden, die App
   meldet jedes Gerät still im Hintergrund an.
5. Zurück in der **Projektübersicht** auf das Web-Symbol `</>`, App
   registrieren, den angezeigten `firebaseConfig`-Block kopieren.
6. Die Werte in `firebase-config.js` eintragen und pushen. Damit hat jedes
   Gerät die Zugangsdaten. Zum schnellen Ausprobieren lässt sich der Block
   auch in der App unter **Märkte → Gemeinsame Liste** einfügen, dann gilt er
   nur für diesen einen Browser.
7. Die App erzeugt beim ersten Start einen Listen-Code und hängt ihn als
   `#liste=abcd1234` an die Adresse. Diesen Link an alle schicken, die
   mitlesen und mitändern sollen, fertig.

Der API-Schlüssel steht damit öffentlich im Repo, das ist bei Firebase so
vorgesehen und kein Leck. Den Zugriff regeln die Regeln oben: schreiben darf
nur, wer angemeldet ist, und finden muss man die Liste über ihren Code. Für
eine Einkaufsliste reicht das, Kontodaten gehören da trotzdem nicht rein.

## Aufbau

- `index.html` – Markup und CSS
- `app.js` – die gesamte Logik, Vanilla JS ohne Build-Schritt
- `firebase-config.js` – Zugangsdaten der gemeinsamen Liste, leer bis eingerichtet
- `favicon.svg`, `icon.png`, `manifest.webmanifest` – Icon und Startbildschirm
- Speicherschlüssel: `marktliste.v1`, Listen-Code unter `marktliste.code`
- Datenmodell lokal und in der Datenbank: `{ markets[], catalog[], items[] }`,
  in Firebase unter `listen/<code>/` jeweils als Objekt mit den IDs als Schlüssel

Beim ersten Start ist die Liste mit Beispieldaten gefüllt. „Alles zurücksetzen“
im Tab „Märkte“ leert sie.

## Als GitHub Page veröffentlichen

Im Repo liegt der Workflow `.github/workflows/pages.yml`, der `index.html` bei
jedem Push auf diesen Branch veröffentlicht. Pages selbst lässt sich nicht per
Workflow-Token aktivieren, dieser eine Schalter muss einmal von Hand gesetzt
werden:

Repo → **Settings** → **Pages** → **Source: GitHub Actions**

Danach unter **Actions** den Workflow „GitHub Pages“ erneut starten
(*Re-run all jobs*) oder einmal pushen. Die Seite liegt dann unter
`https://belapfirrmann.github.io/Einkaufsliste/`.

Alternative ohne Workflow: unter **Settings → Pages** als Source
**Deploy from a branch** wählen, Branch `claude/shopping-list-market-selection-7uk3wo`
und Ordner `/ (root)`. Dann kann die Workflow-Datei gelöscht werden.
