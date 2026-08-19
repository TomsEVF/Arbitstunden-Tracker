const STORAGE_KEY = 'arbeitsstunden_entries_v1';
const SETTINGS_KEY = 'arbeitsstunden_settings_v1';
const SUPABASE_URL = 'https://yshmaepjdgcyuddnheub.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bhnloJBb1UVdnH9bS_Pomw_6lfq9qvW';

const DEFAULT_SETTINGS = {
  monthlySalary: 602.25,
  hourlyWage: 13.9,
  contractStart: '2026-08-01',
  contractEnd: '2027-07-31',
  paydayDayOfMonth: null,
};

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
const toggleFormBtn = document.querySelector('#toggle-form-btn');
const entriesList = document.querySelector('#entries-list');
const filterMonth = document.querySelector('#filter-month');
const exportBtn = document.querySelector('#export-btn');
const importInput = document.querySelector('#import-file');
const syncStatus = document.querySelector('#sync-status');
const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const entriesTabPanel = document.querySelector('#entries-tab-panel');
const statisticsTabPanel = document.querySelector('#statistics-tab-panel');
const settingsTabPanel = document.querySelector('#settings-tab-panel');
const tabPanels = {
  entries: entriesTabPanel,
  statistics: statisticsTabPanel,
  settings: settingsTabPanel,
};

const settingsForm = document.querySelector('#settings-form');
const settingMonthlySalaryInput = document.querySelector('#setting-monthly-salary');
const settingHourlyWageInput = document.querySelector('#setting-hourly-wage');
const settingContractStartInput = document.querySelector('#setting-contract-start');
const settingContractEndInput = document.querySelector('#setting-contract-end');
const settingPaydayInput = document.querySelector('#setting-payday');
const paydayBanner = document.querySelector('#payday-banner');
const paydayText = document.querySelector('#payday-text');

const dateInput = document.querySelector('#date');
const startInput = document.querySelector('#start');
const endInput = document.querySelector('#end');
const breakInput = document.querySelector('#break');
const taskInput = document.querySelector('#task');

// Edit Modal
const editModal = document.querySelector('#edit-modal');
const editForm = document.querySelector('#edit-form');
const closeModalBtn = document.querySelector('#close-modal');
const cancelModalBtn = document.querySelector('#cancel-modal');
const editDateInput = document.querySelector('#edit-date');
const editStartInput = document.querySelector('#edit-start');
const editEndInput = document.querySelector('#edit-end');
const editBreakInput = document.querySelector('#edit-break');
const editTaskInput = document.querySelector('#edit-task');
const editHourlyRateInput = document.querySelector('#edit-hourly-rate');

let currentEditingEntryId = null;

let settings = loadSettings();
let entries = loadEntries();
let supabaseClient = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

initializeForm();
initializeSupabase();
render();

// Form accordion toggle
toggleFormBtn.addEventListener('click', () => {
  form.classList.toggle('hidden');
  toggleFormBtn.classList.toggle('collapsed');
});

// Modal event listeners
closeModalBtn.addEventListener('click', closeEditModal);
cancelModalBtn.addEventListener('click', closeEditModal);

editModal.addEventListener('click', (event) => {
  if (event.target === editModal) {
    closeEditModal();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const date = dateInput.value;
  const start = startInput.value;
  const end = endInput.value;
  const breakMinutes = Number(breakInput.value || 0);
  const task = taskInput.value.trim();

  if (!date || !start || !end) {
    alert('Bitte Datum, Start und Ende eingeben.');
    return;
  }

  const diffMinutes = calculateMinutes(start, end) - breakMinutes;
  if (diffMinutes <= 0) {
    alert('Die Arbeitszeit muss größer als 0 Minuten sein.');
    return;
  }

  const newEntry = {
    id: crypto.randomUUID(),
    date,
    start,
    end,
    breakMinutes,
    task,
    hourlyRate: settings.hourlyWage,
  };

  try {
    entries.unshift(newEntry);
    saveEntries();

    if (supabaseClient) {
      const row = mapEntryToRow(newEntry);
      const { error } = await supabaseClient.from('arbeitsstunden').insert([row]);
      if (error) throw error;
      await fetchFromSupabase();
      setSyncStatus('Eintrag in Supabase gespeichert.');
    }

    form.reset();
    initializeForm();
    form.classList.add('hidden');
    toggleFormBtn.classList.add('collapsed');
    render();
  } catch (error) {
    console.error('Supabase insert failed:', error);
    saveEntries();
    render();
    setSyncStatus('Lokaler Speicher verwendet, da Supabase nicht erreichbar war.');
  }
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

  if (supabaseClient) {
    const rows = importedEntries.map(mapEntryToRow);
    const { error } = await supabaseClient.from('arbeitsstunden').insert(rows);
    if (!error) {
      await fetchFromSupabase();
      event.target.value = '';
      return;
    }
    console.warn('Supabase insert from CSV failed:', error);
  }

  entries = importedEntries;
  saveEntries();
  render();
  event.target.value = '';
});

// Handle delete button click, right-click context menu, and swipe gestures
entriesList.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('.delete-btn');
  if (!deleteButton) {
    return;
  }

  const item = deleteButton.closest('.entry-item');
  const id = item?.dataset.id;
  if (!id) {
    return;
  }

  const shouldDelete = window.confirm('Diesen Eintrag wirklich löschen?');
  if (!shouldDelete) {
    return;
  }

  await deleteEntry(id);
});

// Right-click context menu for delete
entriesList.addEventListener('contextmenu', (event) => {
  const item = event.target.closest('.entry-item');
  if (!item) {
    return;
  }

  event.preventDefault();
  const id = item.dataset.id;
  if (!id) {
    return;
  }

  const shouldDelete = window.confirm('Diesen Eintrag wirklich löschen?');
  if (shouldDelete) {
    deleteEntry(id);
  }
});

// Swipe detection for delete
const swipeState = { startX: 0, startY: 0, currentItem: null };

entriesList.addEventListener('touchstart', (event) => {
  const item = event.target.closest('.entry-item');
  if (!item) return;
  swipeState.startX = event.touches[0].clientX;
  swipeState.startY = event.touches[0].clientY;
  swipeState.currentItem = item;
});

entriesList.addEventListener('touchend', async (event) => {
  if (!swipeState.currentItem) return;

  const endX = event.changedTouches[0].clientX;
  const endY = event.changedTouches[0].clientY;
  const diffX = swipeState.startX - endX;
  const diffY = Math.abs(swipeState.startY - endY);

  // Swipe left (at least 50px) and not vertical (less than 30px vertical)
  if (diffX > 50 && diffY < 30) {
    const id = swipeState.currentItem.dataset.id;
    if (id) {
      const shouldDelete = window.confirm('Diesen Eintrag wirklich löschen?');
      if (shouldDelete) {
        await deleteEntry(id);
      }
    }
  }

  swipeState.startX = 0;
  swipeState.startY = 0;
  swipeState.currentItem = null;
});

async function deleteEntry(id) {
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from('arbeitsstunden').delete().eq('id', id);
      if (error) throw error;
    }

    entries = entries.filter((entry) => entry.id !== id);
    saveEntries();
    render();
    setSyncStatus('Eintrag gelöscht.');
  } catch (error) {
    console.error('Delete failed:', error);
    entries = entries.filter((entry) => entry.id !== id);
    saveEntries();
    render();
    setSyncStatus('Eintrag lokal gelöscht.');
  }
}

filterMonth.addEventListener('change', render);

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    setActiveTab(targetTab);
  });
});

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const monthlySalary = Number(settingMonthlySalaryInput.value || 0);
  const hourlyWage = Number(settingHourlyWageInput.value || 0);
  const paydayRaw = Number(settingPaydayInput.value);
  const paydayDayOfMonth = Number.isFinite(paydayRaw) && paydayRaw >= 1 && paydayRaw <= 31 ? paydayRaw : null;

  if (!hourlyWage) {
    alert('Bitte einen gültigen Stundenlohn eingeben.');
    return;
  }

  settings = {
    monthlySalary: Number.isFinite(monthlySalary) ? monthlySalary : 0,
    hourlyWage,
    contractStart: settingContractStartInput.value || null,
    contractEnd: settingContractEndInput.value || null,
    paydayDayOfMonth,
  };
  saveSettings();
  render();
  setSyncStatus('Einstellungen gespeichert.');
});

async function initializeSupabase() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setSyncStatus('Supabase-Script fehlt oder Konfiguration unvollständig.');
    return;
  }

  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseClient = client;
    setSyncStatus('Supabase wird automatisch synchronisiert…');
    await fetchFromSupabase();
  } catch (error) {
    console.warn('Supabase connection failed:', error);
    supabaseClient = null;
    entries = loadEntries();
    render();
    setSyncStatus('Supabase-Verbindung fehlgeschlagen. Lokaler Modus aktiv.');
  }
}

async function fetchFromSupabase() {
  if (!supabaseClient) {
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('arbeitsstunden')
      .select('*')
      .order('datum', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if ((data || []).length) {
      entries = (data || []).map(mapRowToEntry);
      saveEntries();
      render();
      setSyncStatus('Daten aus Supabase synchronisiert.');
      return;
    }

    if (entries.length) {
      const rows = entries.map(mapEntryToRow);
      const { error: insertError } = await supabaseClient.from('arbeitsstunden').insert(rows);
      if (insertError) {
        throw insertError;
      }
      setSyncStatus('Lokale Einträge wurden in Supabase hochgeladen.');
      await fetchFromSupabase();
      return;
    }

    saveEntries();
    render();
    setSyncStatus('Supabase ist leer. Lokaler Stand bleibt erhalten.');
  } catch (error) {
    console.warn('Supabase sync failed:', error);
    entries = loadEntries();
    render();
    setSyncStatus('Synchronisierung fehlgeschlagen. Lokaler Modus aktiv.');
  }
}

function initializeForm() {
  const today = new Date();
  dateInput.value = today.toISOString().slice(0, 10);
  startInput.value = '09:00';
  endInput.value = '13:00';
  breakInput.value = '0';
  taskInput.value = '';
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    const monthlySalary = Number(parsed.monthlySalary);
    const hourlyWage = Number(parsed.hourlyWage);
    const paydayDayOfMonth = Number(parsed.paydayDayOfMonth);

    return {
      monthlySalary: Number.isFinite(monthlySalary) ? monthlySalary : DEFAULT_SETTINGS.monthlySalary,
      hourlyWage: Number.isFinite(hourlyWage) && hourlyWage > 0 ? hourlyWage : DEFAULT_SETTINGS.hourlyWage,
      contractStart:
        typeof parsed.contractStart === 'string' && parsed.contractStart
          ? parsed.contractStart
          : DEFAULT_SETTINGS.contractStart,
      contractEnd:
        typeof parsed.contractEnd === 'string' && parsed.contractEnd ? parsed.contractEnd : DEFAULT_SETTINGS.contractEnd,
      paydayDayOfMonth:
        Number.isFinite(paydayDayOfMonth) && paydayDayOfMonth >= 1 && paydayDayOfMonth <= 31 ? paydayDayOfMonth : null,
    };
  } catch (error) {
    console.warn('Could not read settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

function setSyncStatus(message) {
  if (syncStatus) {
    syncStatus.textContent = message;
  }
}

function render() {
  renderFilterOptions();
  renderSummary();
  renderSettingsTab();
  renderCharts();
  renderEntries();
  updateTabView();
}

function updateTabView() {
  const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'entries';
  setActiveTabPanels(activeTab);
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
  });

  setActiveTabPanels(tabName);
}

function setActiveTabPanels(tabName) {
  Object.entries(tabPanels).forEach(([key, panel]) => {
    panel.classList.toggle('hidden', key !== tabName);
  });
}

function renderSettingsTab() {
  settingMonthlySalaryInput.value = settings.monthlySalary;
  settingHourlyWageInput.value = settings.hourlyWage;
  settingContractStartInput.value = settings.contractStart || '';
  settingContractEndInput.value = settings.contractEnd || '';
  settingPaydayInput.value = settings.paydayDayOfMonth || '';

  document.querySelector('#setting-month-hours').textContent = formatHoursFromDecimal(getMonthlyTargetHours());
  document.querySelector('#setting-week-hours').textContent = formatHoursFromDecimal(getAverageWeeklyTargetHours());

  renderPaydayInfo();
}

function getNextPayday(referenceDate = new Date()) {
  if (!settings.paydayDayOfMonth) {
    return null;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const paydayInMonth = (year, month) => {
    const day = Math.min(settings.paydayDayOfMonth, getDaysInMonth(year, month));
    return new Date(year, month - 1, day);
  };

  let candidate = paydayInMonth(today.getFullYear(), today.getMonth() + 1);
  if (candidate < today) {
    const nextMonthFirst = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    candidate = paydayInMonth(nextMonthFirst.getFullYear(), nextMonthFirst.getMonth() + 1);
  }

  const daysUntil = Math.round((candidate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return { date: candidate, daysUntil };
}

function renderPaydayInfo() {
  const next = getNextPayday();
  const preview = document.querySelector('#payday-preview');

  if (!next) {
    if (paydayBanner) paydayBanner.classList.add('hidden');
    if (preview) preview.textContent = 'Kein Zahltag eingestellt.';
    return;
  }

  const dateLabel = next.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const daysLabel = next.daysUntil <= 0 ? 'heute' : next.daysUntil === 1 ? 'in 1 Tag' : `in ${next.daysUntil} Tagen`;
  const text = `Nächste Auszahlung: ${dateLabel} (${daysLabel}) · ${formatMoney(settings.monthlySalary)}`;

  if (paydayBanner && paydayText) {
    paydayText.textContent = text;
    paydayBanner.classList.remove('hidden');
  }
  if (preview) {
    preview.textContent = `→ ${text}`;
  }
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
  const week = getWeekProgress();
  const month = getMonthProgress();

  document.querySelector('#week-actual-hours').textContent = formatHoursFromDecimal(week.actualHours);
  document.querySelector('#week-target-hours').textContent = formatHoursFromDecimal(week.adjustedTargetHours);

  const weekBalanceEl = document.querySelector('#week-balance');
  weekBalanceEl.textContent = formatSignedHours(week.balanceHours);
  weekBalanceEl.classList.toggle('ahead', week.balanceHours > 1 / 60);
  weekBalanceEl.classList.toggle('behind', week.balanceHours < -1 / 60);

  const weekFill = document.querySelector('#week-progress-fill');
  weekFill.style.width = `${
    week.adjustedTargetHours > 0 ? Math.min(100, (week.actualHours / week.adjustedTargetHours) * 100) : 0
  }%`;

  document.querySelector('#month-actual-hours').textContent = formatHoursFromDecimal(month.actualHours);
  document.querySelector('#month-target-hours').textContent = formatHoursFromDecimal(month.targetHours);

  const monthRemainingEl = document.querySelector('#month-remaining');
  monthRemainingEl.textContent =
    month.remainingHours > 0 ? `${formatHoursFromDecimal(month.remainingHours)} übrig` : 'Monatsziel erreicht';

  const monthFill = document.querySelector('#month-progress-fill');
  monthFill.style.width = `${
    month.targetHours > 0 ? Math.min(100, (month.actualHours / month.targetHours) * 100) : 0
  }%`;

  const totalMinutes = entries.reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
  document.querySelector('#total-hours').textContent = formatHours(totalMinutes);
  document.querySelector('#total-pay').textContent = formatMoney(getTotalPay());
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getMonthlyTargetHours() {
  if (!settings.hourlyWage) {
    return 0;
  }
  return settings.monthlySalary / settings.hourlyWage;
}

function getAverageWeeklyTargetHours() {
  return (getMonthlyTargetHours() * 12) / 52;
}

function monthKeyToDate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function getEarliestEntryDate() {
  if (!entries.length) {
    return null;
  }
  return entries.reduce((earliest, entry) => {
    const date = new Date(`${entry.date}T00:00:00`);
    return !earliest || date < earliest ? date : earliest;
  }, null);
}

// The employment contract's start/end dates are the authoritative bound for
// carry-over and statistics; without them, fall back to the first logged entry.
function getTrackingStartDate() {
  if (settings.contractStart) {
    return new Date(`${settings.contractStart}T00:00:00`);
  }
  return getEarliestEntryDate();
}

function getTrackingStartMonthKey() {
  const date = getTrackingStartDate();
  return date ? getMonthKeyForDate(date) : null;
}

function getTrackingEndDate() {
  return settings.contractEnd ? new Date(`${settings.contractEnd}T23:59:59`) : null;
}

// Deficit/surplus hours accumulated over every fully completed month since
// tracking began (see getTrackingStartMonthKey), so a light month raises a
// later month's target (and a strong month lowers it) until it's worked off.
function getMonthCarryOverHours(monthKey) {
  const earliestKey = getTrackingStartMonthKey();
  if (!earliestKey || monthKey <= earliestKey) {
    return 0;
  }

  const baseTarget = getMonthlyTargetHours();
  let carryOverHours = 0;
  let cursor = monthKeyToDate(monthKey);
  cursor.setMonth(cursor.getMonth() - 1);

  while (getMonthKeyForDate(cursor) >= earliestKey) {
    carryOverHours += getMinutesForMonth(getMonthKeyForDate(cursor)) / 60 - baseTarget;
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return carryOverHours;
}

function getAdjustedMonthlyTargetHours(monthKey) {
  const trackingEndDate = getTrackingEndDate();
  if (trackingEndDate && monthKey > getMonthKeyForDate(trackingEndDate)) {
    return 0;
  }
  return Math.max(0, getMonthlyTargetHours() - getMonthCarryOverHours(monthKey));
}

function getWeekStart(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  return date;
}

function isDateWithinContract(date) {
  const start = getTrackingStartDate();
  const end = getTrackingEndDate();
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

// The first day of `monthKey` that's actually within the contract — usually the
// 1st, but later if the contract started partway through this month.
function getMonthContractStart(monthKey) {
  const monthStart = monthKeyToDate(monthKey);
  const trackingStart = getTrackingStartDate();
  return trackingStart && trackingStart > monthStart ? trackingStart : monthStart;
}

// Flat daily target for a given month: that month's carry-over-adjusted target
// spread evenly across its calendar days.
function getMonthDailyRate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return getAdjustedMonthlyTargetHours(monthKey) / getDaysInMonth(year, month);
}

// Deficit/surplus accumulated so far *within* monthKey, from the first
// contract day of that month up to (not including) `beforeDate` — the
// day-exact version of "how far ahead/behind pace am I this month right now."
function getMonthCarryOverBeforeDate(monthKey, beforeDate) {
  const rangeStart = getMonthContractStart(monthKey);
  const dailyRate = getMonthDailyRate(monthKey);
  const daysBefore = Math.max(0, Math.round((beforeDate.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)));
  const expectedHours = dailyRate * daysBefore;

  const startMs = rangeStart.getTime();
  const endMs = beforeDate.getTime();
  const actualMinutes = entries.reduce((sum, entry) => {
    const ms = new Date(`${entry.date}T00:00:00`).getTime();
    return ms >= startMs && ms < endMs ? sum + calculateEntryMinutes(entry) : sum;
  }, 0);

  return actualMinutes / 60 - expectedHours;
}

// Splits a Mon-Sun week into contiguous per-month segments, clipped to the
// contract period — e.g. a week with a Wednesday month-change becomes a
// 2-day segment in the old month and a 5-day segment in the new one, and a
// week at the very start/end of the contract loses its out-of-contract days.
function getWeekSegments(weekStart) {
  const segments = [];

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    if (!isDateWithinContract(day)) continue;

    const monthKey = getMonthKeyForDate(day);
    const last = segments[segments.length - 1];
    if (last && last.monthKey === monthKey) {
      last.days += 1;
    } else {
      segments.push({ monthKey, start: day, days: 1 });
    }
  }

  return segments;
}

function getWeekMinutes(weekStart) {
  const startMs = weekStart.getTime();
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000;

  return entries.reduce((sum, entry) => {
    const ms = new Date(`${entry.date}T00:00:00`).getTime();
    if (ms >= startMs && ms < endMs) {
      return sum + calculateEntryMinutes(entry);
    }
    return sum;
  }, 0);
}

function getMonthKeyForDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Weekly target for the Mon-Sun week containing referenceDate. Still shown as
// a single week, but under the hood it's built from one segment per month the
// week touches — each segment uses that month's own daily rate and its own
// carry-over from earlier in that month, so a mid-week month change (or the
// contract's start/end) is accounted for exactly on the correct side of the
// boundary instead of assigning the whole week to one month.
function getWeekProgress(referenceDate = new Date()) {
  const weekStart = getWeekStart(referenceDate);
  const segments = getWeekSegments(weekStart);

  let baseWeeklyTarget = 0;
  let adjustedTargetHours = 0;
  let carryOverHours = 0;

  segments.forEach((segment) => {
    const dailyRate = getMonthDailyRate(segment.monthKey);
    const segmentTarget = dailyRate * segment.days;
    const segmentCarryOver = getMonthCarryOverBeforeDate(segment.monthKey, segment.start);

    baseWeeklyTarget += segmentTarget;
    carryOverHours += segmentCarryOver;
    adjustedTargetHours += Math.max(0, segmentTarget - segmentCarryOver);
  });

  const actualMinutes = getWeekMinutes(weekStart);
  const actualHours = actualMinutes / 60;
  const remainingHours = Math.max(0, adjustedTargetHours - actualHours);
  const balanceHours = actualHours - adjustedTargetHours;

  return { baseWeeklyTarget, adjustedTargetHours, actualHours, remainingHours, balanceHours, carryOverHours };
}

function getMonthProgress(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  const monthKey = getMonthKeyForDate(referenceDate);
  const daysInMonthCount = getDaysInMonth(year, month);
  const dayOfMonth = referenceDate.getDate();

  const targetHours = getAdjustedMonthlyTargetHours(monthKey);
  const actualMinutes = getMinutesForMonth(monthKey);
  const actualHours = actualMinutes / 60;
  const remainingHours = Math.max(0, targetHours - actualHours);
  const expectedByNowHours = targetHours * (dayOfMonth / daysInMonthCount);
  const balanceHours = actualHours - expectedByNowHours;

  return {
    monthKey,
    targetHours,
    actualHours,
    remainingHours,
    balanceHours,
    daysRemaining: daysInMonthCount - dayOfMonth,
    daysInMonthCount,
  };
}

function renderCharts() {
  const container = document.querySelector('#statistics-tab-panel');
  if (!container) return;

  // Only chart periods within the employment period (contract start/end, or
  // the first logged entry as a fallback) — everything else has no data and
  // would otherwise show as a hollow "missed target" bar.
  const trackingStartDate = getTrackingStartDate();
  const earliestWeekStart = trackingStartDate ? getWeekStart(trackingStartDate) : null;
  const earliestMonthKey = getTrackingStartMonthKey();
  const trackingEndDate = getTrackingEndDate();
  const latestMonthKey = trackingEndDate ? getMonthKeyForDate(trackingEndDate) : null;

  const weekData = getRecentWeekStarts(8)
    .filter((weekStart) => !earliestWeekStart || weekStart >= earliestWeekStart)
    .filter((weekStart) => !trackingEndDate || weekStart <= trackingEndDate)
    .map((weekStart) => {
      const progress = getWeekProgress(weekStart);
      return {
        label: formatShortDate(weekStart),
        soll: progress.adjustedTargetHours,
        ist: progress.actualHours,
        balance: progress.balanceHours,
      };
    });

  const monthData = getRecentMonthKeys(6)
    .filter((monthKey) => !earliestMonthKey || monthKey >= earliestMonthKey)
    .filter((monthKey) => !latestMonthKey || monthKey <= latestMonthKey)
    .map((monthKey) => {
      const soll = getAdjustedMonthlyTargetHours(monthKey);
      const ist = getMinutesForMonth(monthKey) / 60;
      return { label: formatShortMonth(monthKey), soll, ist, balance: ist - soll };
    });

  const bestWeek = weekData.reduce((best, cur) => (cur.balance > best.balance ? cur : best), weekData[0] || {});
  const worstWeek = weekData.reduce((worst, cur) => (cur.balance < worst.balance ? cur : worst), weekData[0] || {});
  const bestMonth = monthData.reduce((best, cur) => (cur.balance > best.balance ? cur : best), monthData[0] || {});
  const worstMonth = monthData.reduce((worst, cur) => (cur.balance < worst.balance ? cur : worst), monthData[0] || {});

  // Get existing chart container or create new one
  let chartLayout = container.querySelector('.chart-layout');
  if (!chartLayout) {
    chartLayout = document.createElement('div');
    chartLayout.className = 'chart-layout';
    const listHeader = container.querySelector('.list-header');
    if (listHeader) {
      listHeader.parentNode.insertBefore(chartLayout, listHeader.nextSibling);
    } else {
      container.appendChild(chartLayout);
    }
  }

  chartLayout.innerHTML = `
    <div class="chart-card">
      <h3>Wochen-Statistik</h3>
      <div id="week-chart" class="comparison-chart" aria-label="Soll- und Ist-Stunden pro Woche"></div>
      <div class="chart-legend">
        <span><i class="legend-swatch legend-soll"></i>Soll</span>
        <span><i class="legend-swatch legend-ist"></i>Ist</span>
      </div>
      <div class="chart-stats">
        <p>💪 Beste Woche: ${bestWeek.label || 'Keine Daten'} (${formatSignedHours(bestWeek.balance || 0)})</p>
        <p>📉 Schwächste Woche: ${worstWeek.label || 'Keine Daten'} (${formatSignedHours(worstWeek.balance || 0)})</p>
      </div>
    </div>

    <div class="chart-card">
      <h3>Monats-Statistik</h3>
      <div id="month-chart" class="comparison-chart" aria-label="Soll- und Ist-Stunden pro Monat"></div>
      <div class="chart-legend">
        <span><i class="legend-swatch legend-soll"></i>Soll</span>
        <span><i class="legend-swatch legend-ist"></i>Ist</span>
      </div>
      <div class="chart-stats">
        <p>💪 Bester Monat: ${bestMonth.label || 'Keine Daten'} (${formatSignedHours(bestMonth.balance || 0)})</p>
        <p>📉 Schwächster Monat: ${worstMonth.label || 'Keine Daten'} (${formatSignedHours(worstMonth.balance || 0)})</p>
      </div>
    </div>
  `;

  renderComparisonChart('week-chart', weekData, (value) => formatHoursFromDecimal(value));
  renderComparisonChart('month-chart', monthData, (value) => formatHoursFromDecimal(value));
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
    const startTime = normalizeTimeValue(entry.start);
    const endTime = normalizeTimeValue(entry.end);

    item.dataset.id = entry.id;
    fragment.querySelector('.entry-date').textContent = formatDate(entry.date);
    fragment.querySelector('.entry-times').textContent = `${startTime || '00:00'} – ${endTime || '00:00'}`;
    fragment.querySelector('.entry-task').textContent = entry.task || 'Keine Tätigkeit';
    fragment.querySelector('.entry-hours').textContent = formatHours(minutes);
    fragment.querySelector('.entry-pay').textContent = formatMoney(pay);

    // Add edit button handler
    const editBtn = fragment.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        openEditModal(entry);
      });
    }

    entriesList.appendChild(fragment);
  });
}

// Grouped-bar chart comparing a target ("Soll") against the actual ("Ist") value
// for each period, so a shortfall or surplus against the hours target is visible at a glance.
function renderComparisonChart(containerId, items, formatter) {
  const container = document.querySelector(`#${containerId}`);
  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = '<p class="chart-empty">Noch keine Daten für diesen Zeitraum.</p>';
    return;
  }

  const maxValue = Math.max(...items.flatMap((item) => [item.soll, item.ist]), 1);
  const chartHeight = 180;
  const slotWidth = 60;
  const barWidth = 16;
  const barGap = 6;
  const padding = 32;
  const chartWidth = items.length * slotWidth;
  const totalWidth = chartWidth + padding * 2;
  const totalHeight = chartHeight + padding * 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
  // Explicit width/height give the SVG a real intrinsic size (matching the
  // actual number of bars) instead of being stretched to fill the container
  // width — without this, a chart with only one or two bars renders far too
  // tall once its narrow aspect ratio is scaled up to the panel's full width.
  svg.setAttribute('width', totalWidth);
  svg.setAttribute('height', totalHeight);
  svg.setAttribute('class', 'comparison-chart-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gridGroup.setAttribute('class', 'grid-lines');
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (chartHeight / 4) * i;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padding);
    line.setAttribute('y1', y);
    line.setAttribute('x2', chartWidth + padding);
    line.setAttribute('y2', y);
    gridGroup.appendChild(line);
  }
  svg.appendChild(gridGroup);

  items.forEach((item, index) => {
    const centerX = padding + index * slotWidth + slotWidth / 2;
    const sollHeight = (item.soll / maxValue) * chartHeight;
    const istHeight = (item.ist / maxValue) * chartHeight;
    const sollX = centerX - barGap / 2 - barWidth;
    const istX = centerX + barGap / 2;

    const sollRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    sollRect.setAttribute('x', sollX);
    sollRect.setAttribute('y', padding + chartHeight - sollHeight);
    sollRect.setAttribute('width', barWidth);
    sollRect.setAttribute('height', Math.max(0, sollHeight));
    sollRect.setAttribute('rx', 3);
    sollRect.setAttribute('class', 'bar-soll');
    const sollTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    sollTitle.textContent = `${item.label} – Soll: ${formatter(item.soll)}`;
    sollRect.appendChild(sollTitle);
    svg.appendChild(sollRect);

    const istRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    istRect.setAttribute('x', istX);
    istRect.setAttribute('y', padding + chartHeight - istHeight);
    istRect.setAttribute('width', barWidth);
    istRect.setAttribute('height', Math.max(0, istHeight));
    istRect.setAttribute('rx', 3);
    istRect.setAttribute('class', item.ist >= item.soll ? 'bar-ist bar-ist-ahead' : 'bar-ist bar-ist-behind');
    const istTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    istTitle.textContent = `${item.label} – Ist: ${formatter(item.ist)}`;
    istRect.appendChild(istTitle);
    svg.appendChild(istRect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', centerX);
    label.setAttribute('y', padding + chartHeight + 18);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'chart-axis-label');
    label.textContent = item.label;
    svg.appendChild(label);
  });

  container.innerHTML = '';
  container.appendChild(svg);
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

function getRecentMonthKeys(count = 6) {
  const today = new Date();
  const keys = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    keys.push(`${year}-${month}`);
  }

  return keys;
}

function getRecentWeekStarts(count = 8) {
  const currentWeekStart = getWeekStart();
  const starts = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() - index * 7);
    starts.push(date);
  }

  return starts;
}

function getMinutesForMonth(monthKey) {
  return entries
    .filter((entry) => getMonthKey(entry.date) === monthKey)
    .reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
}

function calculateEntryMinutes(entry) {
  return Math.max(0, calculateMinutes(entry.start, entry.end) - Number(entry.breakMinutes || 0));
}

function calculateEntryPay(entry, minutes = calculateEntryMinutes(entry)) {
  const rate = Number(entry.hourlyRate || 0);
  const hours = minutes / 60;
  return hours * rate;
}

function normalizeTimeValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const match = trimmed.match(/^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?$/);
  if (!match) {
    return trimmed;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return trimmed;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function calculateMinutes(start, end) {
  const startTime = normalizeTimeValue(start);
  const endTime = normalizeTimeValue(end);

  if (!startTime || !endTime) {
    return 0;
  }

  const startDate = new Date(`2000-01-01T${startTime}:00`);
  const endDate = new Date(`2000-01-01T${endTime}:00`);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function formatHours(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return minutes > 0 ? `${minutes}min` : '0min';
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}min`;
}

function formatHoursFromDecimal(hoursDecimal) {
  return formatHours(Math.round(hoursDecimal * 60));
}

function formatSignedHours(hoursDecimal) {
  if (Math.abs(hoursDecimal) < 1 / 60) {
    return '±0min';
  }
  const sign = hoursDecimal > 0 ? '+' : '−';
  return `${sign}${formatHoursFromDecimal(Math.abs(hoursDecimal))}`;
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

function formatShortMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('de-DE', { month: 'short' });
}

function formatShortDate(date) {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function mapEntryToRow(entry) {
  return {
    id: entry.id,
    datum: entry.date,
    angefangen: entry.start,
    aufgehört: entry.end,
    pause_minuten: Number(entry.breakMinutes || 0),
    taetigkeit: entry.task || '',
    stunden_lohn: Number(entry.hourlyRate || 0),
  };
}

function mapRowToEntry(row) {
  return {
    id: row.id,
    date: row.datum,
    start: normalizeTimeValue(row.angefangen),
    end: normalizeTimeValue(row.aufgehört),
    breakMinutes: Number(row.pause_minuten || 0),
    task: row.taetigkeit || '',
    hourlyRate: Number(row.stunden_lohn || settings.hourlyWage),
  };
}

function toCsv(rows) {
  const header = ['Datum', 'Angefangen', 'Aufgehört', 'Stunden(Ohne Pause)', 'Tätigkeit', 'Stunden Lohn', 'Tages Lohn'];
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
    ];
    lines.push(csvRow.join(','));
  });

  return lines.join('\n');
}

function detectCsvDelimiter(firstLine) {
  // Count unquoted delimiters to determine the correct one
  let inQuotes = false;
  let semiCount = 0;
  let commaCount = 0;

  for (let i = 0; i < firstLine.length; i += 1) {
    const char = firstLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes) {
      if (char === ';') semiCount += 1;
      if (char === ',') commaCount += 1;
    }
  }

  return semiCount > commaCount ? ';' : ',';
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const header = parseCsvLine(lines[0], delimiter).map((value) => normalizeHeader(value));
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));

  return rows.map((values) => {
    const map = {};
    header.forEach((key, index) => {
      map[key] = values[index] ?? '';
    });

    const date = map.datum || map.date || '';
    const start = map.angefangen || map.start || '';
    const end = map.aufgehoert || map.end || '';
    const breakMinutes = Number(map.pause || map.break_minutes || 0);
    const task = map.taetigkeit || map.task || map.notiz || map.note || '';
    const hourlyRate = Number(map.stundenlohn || map.hourlyrate || map.hourly_rate || settings.hourlyWage);

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
      hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : settings.hourlyWage,
    };
  }).filter(Boolean);
}

function parseCsvLine(line, delimiter = ',') {
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

    if (char === delimiter && !inQuotes) {
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
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// "Gesamt"-Lohn zählt nur abgeschlossene Monate: der laufende Monat läuft noch
// und sein Stand steht schon in den Wochen-/Monats-Zielkarten. Die "Gesamt
// Stunden" daneben zählen dagegen live mit (siehe renderSummary).
function getCompletedEntries() {
  const currentMonthKey = getMonthKeyForDate(new Date());
  return entries.filter((entry) => getMonthKey(entry.date) !== currentMonthKey);
}

function getTotalPay() {
  return getCompletedEntries().reduce((sum, entry) => sum + calculateEntryPay(entry), 0);
}

// Edit Modal Functions
function openEditModal(entry) {
  currentEditingEntryId = entry.id;
  editDateInput.value = entry.date;
  editStartInput.value = entry.start;
  editEndInput.value = entry.end;
  editBreakInput.value = entry.breakMinutes || 0;
  editTaskInput.value = entry.task || '';
  editHourlyRateInput.value = entry.hourlyRate || settings.hourlyWage;
  
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  currentEditingEntryId = null;
  editModal.classList.add('hidden');
  editForm.reset();
}

// Edit form submit
editForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentEditingEntryId) {
    return;
  }

  const date = editDateInput.value;
  const start = editStartInput.value;
  const end = editEndInput.value;
  const breakMinutes = Number(editBreakInput.value || 0);
  const task = editTaskInput.value.trim();
  const hourlyRate = Number(editHourlyRateInput.value || 0);

  if (!date || !start || !end) {
    alert('Bitte Datum, Start und Ende eingeben.');
    return;
  }

  const diffMinutes = calculateMinutes(start, end) - breakMinutes;
  if (diffMinutes <= 0) {
    alert('Die Arbeitszeit muss größer als 0 Minuten sein.');
    return;
  }

  try {
    const entryIndex = entries.findIndex((e) => e.id === currentEditingEntryId);
    if (entryIndex === -1) {
      throw new Error('Eintrag nicht gefunden');
    }

    const updatedEntry = {
      ...entries[entryIndex],
      date,
      start,
      end,
      breakMinutes,
      task,
      hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    };

    if (supabaseClient) {
      const row = mapEntryToRow(updatedEntry);
      const { error } = await supabaseClient
        .from('arbeitsstunden')
        .update(row)
        .eq('id', currentEditingEntryId);
      
      if (error) throw error;
      setSyncStatus('Eintrag in Supabase aktualisiert.');
    }

    entries[entryIndex] = updatedEntry;
    saveEntries();
    closeEditModal();
    render();
  } catch (error) {
    console.error('Update failed:', error);
    alert(`Fehler beim Aktualisieren: ${error.message}`);
  }
});
