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

**Datensicherung**: Die Daten liegen nur in diesem einen Browser. Im Tab
„Märkte“ lassen sie sich als Text anzeigen, kopieren und auf einem anderen
Gerät wieder einlesen.

## Aufbau

- `index.html` – Markup, CSS und JavaScript in einer Datei, Vanilla JS ohne Build-Schritt
- Speicherschlüssel: `marktliste.v1`
- Datenmodell: `{ markets[], catalog[], items[] }`

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
