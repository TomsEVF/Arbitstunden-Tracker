const STORAGE_KEY = 'arbeitsstunden_entries_v1';
const DEFAULT_ENTRIES = [
  {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    start: '09:00',
    end: '13:30',
    breakMinutes: 30,
    task: 'Beispiel: Minijob',
    hourlyRate: 13.9,
  },
];

const form = document.querySelector('#hours-form');
const entriesList = document.querySelector('#entries-list');
const filterMonth = document.querySelector('#filter-month');
const exportBtn = document.querySelector('#export-btn');
const importInput = document.querySelector('#import-file');

const dateInput = document.querySelector('#date');
const startInput = document.querySelector('#start');
const endInput = document.querySelector('#end');
const breakInput = document.querySelector('#break');
const taskInput = document.querySelector('#task');
const hourlyRateInput = document.querySelector('#hourly-rate');

let entries = loadEntries();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

initializeForm();
render();

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const date = dateInput.value;
  const start = startInput.value;
  const end = endInput.value;
  const breakMinutes = Number(breakInput.value || 0);
  const task = taskInput.value.trim();
  const hourlyRate = Number(hourlyRateInput.value || 0);

  if (!date || !start || !end) {
    alert('Bitte Datum, Start und Ende eingeben.');
    return;
  }

  const diffMinutes = calculateMinutes(start, end) - breakMinutes;
  if (diffMinutes <= 0) {
    alert('Die Arbeitszeit muss größer als 0 Minuten sein.');
    return;
  }

  entries.unshift({
    id: crypto.randomUUID(),
    date,
    start,
    end,
    breakMinutes,
    task,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
  });

  saveEntries();
  form.reset();
  initializeForm();
  render();
});

exportBtn.addEventListener('click', () => {
  const csv = toCsv(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'arbeitsstunden.csv';
  link.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  const text = await file.text();
  const importedEntries = parseCsv(text);

  if (!importedEntries.length) {
    alert('Keine gültigen Einträge in der CSV gefunden.');
    return;
  }

  entries = importedEntries;
  saveEntries();
  render();
  event.target.value = '';
});

entriesList.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('.delete-btn');
  if (!deleteButton) {
    return;
  }

  const item = deleteButton.closest('.entry-item');
  const id = item?.dataset.id;
  if (!id) {
    return;
  }

  entries = entries.filter((entry) => entry.id !== id);
  saveEntries();
  render();
});

filterMonth.addEventListener('change', render);

function initializeForm() {
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);
  startInput.value = '09:00';
  endInput.value = '13:00';
  breakInput.value = '0';
  taskInput.value = '';
  hourlyRateInput.value = '13.90';
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ENTRIES;
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ENTRIES;
  } catch (error) {
    console.warn('Could not read localStorage entries:', error);
    return DEFAULT_ENTRIES;
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function render() {
  renderFilterOptions();
  renderSummary();
  renderEntries();
}

function renderFilterOptions() {
  const availableMonths = getAvailableMonths();
  const selected = filterMonth.value || availableMonths[0] || '';

  filterMonth.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Alle Monate';
  filterMonth.appendChild(allOption);

  availableMonths.forEach((monthKey) => {
    const option = document.createElement('option');
    option.value = monthKey;
    option.textContent = formatMonthLabel(monthKey);
    filterMonth.appendChild(option);
  });

  if (availableMonths.includes(selected)) {
    filterMonth.value = selected;
  } else if (availableMonths.length) {
    filterMonth.value = availableMonths[0];
  } else {
    filterMonth.value = 'all';
  }
}

function renderSummary() {
  const totalMinutes = entries.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
  const thisMonth = getCurrentMonthKey();
  const thisWeek = getCurrentWeekMinutes();

  const weekHours = formatHours(thisWeek);
  const monthHours = formatHours(getMinutesForMonth(thisMonth));
  const totalHours = formatHours(totalMinutes);

  document.querySelector('#week-hours').textContent = weekHours;
  document.querySelector('#month-hours').textContent = monthHours;
  document.querySelector('#total-hours').textContent = totalHours;
}

function renderEntries() {
  const selectedMonth = filterMonth.value;
  const visibleEntries = selectedMonth === 'all'
    ? [...entries].sort((a, b) => new Date(b.date) - new Date(a.date))
    : entries.filter((entry) => getMonthKey(entry.date) === selectedMonth).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!visibleEntries.length) {
    entriesList.innerHTML = '<div class="empty-state">Noch keine Arbeitsstunden für diesen Zeitraum gespeichert.</div>';
    return;
  }

  const template = document.querySelector('#entry-template');
  entriesList.innerHTML = '';

  visibleEntries.forEach((entry) => {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector('.entry-item');
    const minutes = calculateEntryMinutes(entry);
    const pay = calculateEntryPay(entry, minutes);

    item.dataset.id = entry.id;
    fragment.querySelector('.entry-date').textContent = formatDate(entry.date);
    fragment.querySelector('.entry-times').textContent = `${entry.start} – ${entry.end}`;
    fragment.querySelector('.entry-task').textContent = entry.task || 'Keine Tätigkeit';
    fragment.querySelector('.entry-hours').textContent = formatHours(minutes);
    fragment.querySelector('.entry-pay').textContent = formatMoney(pay);

    entriesList.appendChild(fragment);
  });
}

function getAvailableMonths() {
  const unique = [...new Set(entries.map((entry) => getMonthKey(entry.date)))].sort((a, b) => b.localeCompare(a));
  return unique;
}

function getMonthKey(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getMinutesForMonth(monthKey) {
  return entries
    .filter((entry) => getMonthKey(entry.date) === monthKey)
    .reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
}

function getCurrentWeekMinutes() {
  const now = new Date();
  const currentDay = now.getDay();
  const diffToMonday = (currentDay + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - diffToMonday);

  const startMs = monday.getTime();
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000;

  return entries.reduce((sum, entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    const ms = date.getTime();
    if (ms >= startMs && ms < endMs) {
      return sum + calculateEntryMinutes(entry);
    }
    return sum;
  }, 0);
}

function calculateEntryMinutes(entry) {
  return Math.max(0, calculateMinutes(entry.start, entry.end) - Number(entry.breakMinutes || 0));
}

function calculateEntryPay(entry, minutes = calculateEntryMinutes(entry)) {
  const rate = Number(entry.hourlyRate || 0);
  const hours = minutes / 60;
  return hours * rate;
}

function calculateMinutes(start, end) {
  const startDate = new Date(`2000-01-01T${start}:00`);
  const endDate = new Date(`2000-01-01T${end}:00`);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function formatHours(totalMinutes) {
  const hours = totalMinutes / 60;
  return `${hours.toFixed(2).replace('.', ',')}h`;
}

function formatMoney(amount) {
  return `${Number(amount || 0).toFixed(2).replace('.', ',')} €`;
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function toCsv(rows) {
  const header = ['Datum', 'Angefangen', 'Aufgehört', 'Stunden(Ohne Pause)', 'Tätigkeit', 'Stunden Lohn', 'Tages Lohn', 'Bezahlt', 'Summe'];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    const totalMinutes = calculateEntryMinutes(row);
    const pay = calculateEntryPay(row, totalMinutes);
    const csvRow = [
      row.date,
      row.start,
      row.end,
      totalMinutes / 60,
      escapeCsv(row.task || ''),
      Number(row.hourlyRate || 0),
      pay,
      '',
      '',
    ];
    lines.push(csvRow.join(','));
  });

  return lines.join('\n');
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((value) => normalizeHeader(value));
  const rows = lines.slice(1).map((line) => parseCsvLine(line));

  return rows.map((values) => {
    const map = {};
    header.forEach((key, index) => {
      map[key] = values[index] ?? '';
    });

    const date = map.datum || map.date || '';
    const start = map.angefangen || map.start || '';
    const end = map.aufgehört || map.end || '';
    const breakMinutes = Number(map.pause || map.break_minutes || 0);
    const task = map.tätigkeit || map.task || map.notiz || map.note || '';
    const hourlyRate = Number(map.stundenlohn || map.hourlyrate || map.hourly_rate || 13.9);

    if (!date || !start || !end) {
      return null;
    }

    return {
      id: crypto.randomUUID(),
      date,
      start,
      end,
      breakMinutes: Number.isFinite(breakMinutes) ? breakMinutes : 0,
      task,
      hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 13.9,
    };
  }).filter(Boolean);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
