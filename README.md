# Arbeitsstunden-App

Eine mobile, leicht nutzbare Web-App für einen Minijob, bei der im Mittelpunkt steht, ob die vertraglich nötigen Stunden erreicht werden – nicht der Lohn. Aus Monatslohn und Stundenlohn berechnet die App automatisch dein Stunden-Soll und zeigt, wie du im Vergleich zur aktuellen Woche und zum Monat liegst. Einträge werden automatisch mit Supabase in der Cloud synchronisiert (mit lokalem Speicher als Offline-Fallback) und können zusätzlich als CSV exportiert und wieder importiert werden.

## Features

- **Stunden-Ziel statt Lohn im Fokus**: Fortschrittsanzeige für „Diese Woche” und „Dieser Monat” mit Soll/Ist-Vergleich
- **Automatische Soll-Berechnung**: Aus Monatslohn und Stundenlohn (Einstellungen) berechnet die App die nötigen Monats- und Wochenstunden – kein manuelles Nachrechnen nötig
- **Wochen-Übertrag**: Wer in einer Woche weniger arbeitet, bekommt in der/den folgenden Woche(n) desselben Monats ein entsprechend höheres Wochenziel (und umgekehrt bei Mehrarbeit)
- **Monats-Übertrag**: Wer in einem Monat insgesamt zu wenig gearbeitet hat, bekommt den Rückstand als Zuschlag auf das Stunden-Soll des nächsten Monats (und umgekehrt bei Mehrarbeit)
- **Monatsgrenzen exakt in der Wochenanzeige**: Fällt ein Monatswechsel mitten in eine Woche, wird die Woche weiterhin als ein Block angezeigt, ihr Soll aber tageweise an der Monatsgrenze aufgeteilt und mit dem jeweiligen Monats-Soll berechnet – Über-/Unterstunden wandern dadurch nur über den echten Monats-Übertrag in den nächsten Monat, nicht schon durch die Wochen-Zuordnung
- **Beschäftigungszeitraum**: Anfangs- und Enddatum des Arbeitsverhältnisses in den Einstellungen – bestimmt, ab wann Wochen-/Monats-Übertrag zählen und welcher Zeitraum in der Statistik auftaucht (ohne Eintrag fällt die App auf den ersten erfassten Eintrag zurück). Tage vor Beschäftigungsbeginn bzw. nach -ende zählen nicht zum Soll, wodurch die erste/letzte Woche automatisch kürzer ausfällt
- **Zahltag mit Countdown**: Tag im Monat einstellbar, an dem das Gehalt kommt – zeigt oben im Stunden-Ziel-Bereich und in den Einstellungen an, in wie vielen Tagen die nächste Auszahlung ansteht
- **Einstellungs-Tab**: Monatslohn, Stundenlohn/Mindestlohn, Beschäftigungszeitraum und Zahltag frei einstellbar, inkl. Anzeige der daraus berechneten Monats- und Ø-Wochenstunden (nur lokal auf dem Gerät gespeichert)
- Eingabe von Datum, Start, Ende, Pause und Tätigkeit über ein einklappbares Formular; der Stundenlohn kommt automatisch aus den Einstellungen
- Automatische Berechnung von Arbeitszeit (Format „xh xxmin”) und Lohn
- Lohn- und Gesamtstunden-Übersicht weiterhin vorhanden, aber bewusst in einem eingeklappten Bereich (kein Bezahlt-Status mehr nötig, da das Gehalt ohnehin monatlich pauschal überwiesen wird); „Gesamt Stunden“ zählt live mit, „Gesamt Lohn“ dagegen erst, sobald ein Monat abgeschlossen ist
- Einträge bearbeiten über ein Modal (inkl. Stundenlohn-Korrektur), löschen per Klick, Rechtsklick-Menü oder Wisch-Geste (mobil)
- Monatsfilter für die Einträge-Liste
- Statistik-Tab mit Wochen- und Monats-Statistik (Soll- vs. Ist-Stunden als Balkenvergleich, inkl. bester/schwächster Periode), begrenzt auf den Beschäftigungszeitraum und mit fester Maximalhöhe, damit wenige Balken nicht in die Höhe gezogen werden – keine Lohn-Statistik, da der Monatslohn ohnehin gleich bleibt
- Automatische Cloud-Synchronisierung über Supabase, mit lokalem Speicher (localStorage) als Fallback, falls Supabase nicht erreichbar ist
- CSV-Export/-Import für OneDrive, Dropbox oder andere Cloud-Speicher
- Installierbar als PWA (Manifest + Service Worker für Offline-Nutzung)
- Mobile Optimierung für Handy und Tablet

## Lokale Nutzung

1. Am besten einen lokalen Webserver im Projektordner starten (z. B. `python3 -m http.server 8080`), damit der Service Worker und die Supabase-Anbindung korrekt funktionieren.
2. Die Datei `index.html` direkt im Browser öffnen funktioniert für die Grundfunktionen ebenfalls, allerdings ohne Offline-Unterstützung durch den Service Worker.
3. Ist Supabase erreichbar, werden Einträge automatisch synchronisiert. Andernfalls greift die App auf `localStorage` zurück und die Einträge bleiben lokal erhalten.

## Supabase-Anbindung

Die Zugangsdaten (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) sind zu Beginn von `app.js` hinterlegt und zeigen auf die Tabelle `arbeitsstunden`. Beim Start lädt die App die Einträge aus Supabase; jede Änderung (Anlegen, Bearbeiten, Löschen) wird sofort synchronisiert. Schlägt die Verbindung fehl, wird automatisch der lokale Stand aus `localStorage` verwendet. Die Einstellungen (Monatslohn, Stundenlohn, Beschäftigungszeitraum, Zahltag) werden nur lokal auf dem jeweiligen Gerät gespeichert, nicht über Supabase synchronisiert.

## GitHub Pages

1. Ein GitHub-Repository erstellen.
2. Alle Dateien in das Repository pushen.
3. In GitHub unter `Settings -> Pages` den Branch `main` auswählen.
4. Die Site wird dann öffentlich erreichbar.

## OneDrive-Synchronisierung (optional)

Falls zusätzlich zur Supabase-Cloud eine manuelle Sicherung gewünscht ist:

- App im Browser nutzen
- Einträge als CSV exportieren
- CSV-Datei im OneDrive-Ordner ablegen
- Bei Bedarf wieder importieren

## Datei-Struktur

- `index.html` – Grundgerüst und Markup
- `style.css` – Styling (warmes, minimalistisches Apple-Style Layout)
- `app.js` – Logik, Supabase-Synchronisierung und lokale Speicherung
- `manifest.webmanifest` – PWA-Manifest (installierbar auf dem Homescreen)
- `service-worker.js` – Offline-Caching der App-Dateien

## Beispiel-CSV

```csv
Datum,Angefangen,Aufgehört,Stunden(Ohne Pause),Tätigkeit,Stunden Lohn,Tages Lohn
2026-08-14,09:00,13:00,3.5,Minijob,13.9,48.65
```
