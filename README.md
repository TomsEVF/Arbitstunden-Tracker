# Arbeitsstunden-App

Eine mobile, leicht nutzbare Web-App zur Erfassung von Arbeitsstunden für einen Minijob. Sie speichert die Einträge lokal im Browser und kann als CSV exportiert und wieder importiert werden.

## Features

- Eingabe von Datum, Start, Ende und Pause
- Automatische Berechnung der Gesamtstunden
- Monat- und Wochenübersichten
- Mobile Optimierung für Handy und Tablet
- CSV-Export für OneDrive, Dropbox oder andere Cloud-Speicher
- CSV-Import zum Wiederherstellen früherer Daten

## Lokale Nutzung

1. Im Projektordner ein Browser-Tab öffnen oder einen lokalen Webserver starten.
2. Die Datei `index.html` direkt im Browser öffnen funktioniert ebenfalls.
3. Einträge werden im Browser lokal gespeichert und bleiben nach dem Neustart erhalten.

## GitHub Pages

1. Ein GitHub-Repository erstellen.
2. Alle Dateien in das Repository pushen.
3. In GitHub unter `Settings -> Pages` den Branch `main` auswählen.
4. Die Site wird dann öffentlich erreichbar.

## OneDrive-Synchronisierung

Da GitHub Pages eine statische Website ist, kann sie keine direkte Verbindung zu OneDrive-API herstellen. Die praktische Lösung ist:

- App im Browser nutzen
- Einträge als CSV exportieren
- CSV-Datei im OneDrive-Ordner ablegen
- Bei Bedarf wieder importieren

Damit bleibt die Datei synchronisiert und in der Cloud erreichbar.

## Datei-Struktur

- `index.html` – Grundgerüst
- `style.css` – mobile Styling
- `app.js` – Logik und Speicherung

## Beispiel-CSV

```csv
date,start,end,break_minutes,total_minutes,note
2026-08-14,09:00,13:00,30,210,Minijob
```
