# Arbeitsstunden-App

Eine mobile, leicht nutzbare Web-App zur Erfassung von Arbeitsstunden für einen Minijob. Einträge werden automatisch mit Supabase in der Cloud synchronisiert (mit lokalem Speicher als Offline-Fallback) und können zusätzlich als CSV exportiert und wieder importiert werden.

## Features

- Eingabe von Datum, Start, Ende, Pause, Tätigkeit und Stundenlohn über ein einklappbares Formular
- Automatische Berechnung von Arbeitszeit (Format „xh xxmin“) und Lohn
- Wochen-, Monats- und Gesamtübersicht für Stunden **und** Lohn
- Bezahlt-Status pro Eintrag (Checkbox), inkl. Cloud-Synchronisierung
- Einträge bearbeiten über ein Modal, löschen per Klick, Rechtsklick-Menü oder Wisch-Geste (mobil)
- Monatsfilter für die Einträge-Liste
- Statistik-Tab mit Liniendiagrammen für Arbeitszeit und Lohn der letzten 6 Monate (inkl. höchstem/niedrigstem Monat)
- Automatische Cloud-Synchronisierung über Supabase, mit lokalem Speicher (localStorage) als Fallback, falls Supabase nicht erreichbar ist
- CSV-Export/-Import für OneDrive, Dropbox oder andere Cloud-Speicher
- Installierbar als PWA (Manifest + Service Worker für Offline-Nutzung)
- Mobile Optimierung für Handy und Tablet

## Lokale Nutzung

1. Am besten einen lokalen Webserver im Projektordner starten (z. B. `python3 -m http.server 8080`), damit der Service Worker und die Supabase-Anbindung korrekt funktionieren.
2. Die Datei `index.html` direkt im Browser öffnen funktioniert für die Grundfunktionen ebenfalls, allerdings ohne Offline-Unterstützung durch den Service Worker.
3. Ist Supabase erreichbar, werden Einträge automatisch synchronisiert. Andernfalls greift die App auf `localStorage` zurück und die Einträge bleiben lokal erhalten.

## Supabase-Anbindung

Die Zugangsdaten (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) sind zu Beginn von `app.js` hinterlegt und zeigen auf die Tabelle `arbeitsstunden`. Beim Start lädt die App die Einträge aus Supabase; jede Änderung (Anlegen, Bearbeiten, Löschen, Bezahlt-Status) wird sofort synchronisiert. Schlägt die Verbindung fehl, wird automatisch der lokale Stand aus `localStorage` verwendet.

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
Datum,Angefangen,Aufgehört,Stunden(Ohne Pause),Tätigkeit,Stunden Lohn,Tages Lohn,Bezahlt,Summe
2026-08-14,09:00,13:00,3.5,Minijob,13.9,48.65,ja,
```
