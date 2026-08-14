const STORAGE_KEY = 'arbeitsstunden_entries_v1';
const SUPABASE_URL = 'https://yshmaepjdgcyuddnheub.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_bhnloJBb1UVdnH9bS_Pomw_6lfq9qvW';

const DEFAULT_ENTRIES = [
  {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    start: '09:00',
    end: '13:30',
    breakMinutes: 30,
    task: 'Beispiel: Minijob',
    hourlyRate: 13.9,
    paid: false,
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

const dateInput = document.querySelector('#date');
const startInput = document.querySelector('#start');
const endInput = document.querySelector('#end');
const breakInput = document.querySelector('#break');
const taskInput = document.querySelector('#task');
const hourlyRateInput = document.querySelector('#hourly-rate');

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

  const newEntry = {
    id: crypto.randomUUID(),
    date,
    start,
    end,
    breakMinutes,
    task,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    paid: false,
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

function setSyncStatus(message) {
  if (syncStatus) {
    syncStatus.textContent = message;
  }
}

function render() {
  renderFilterOptions();
  renderSummary();
  renderCharts();
  renderEntries();
  updateTabView();
}

function updateTabView() {
  const activeTab = document.querySelector('.tab-button.active')?.dataset.tab || 'entries';

  entriesTabPanel.classList.toggle('hidden', activeTab !== 'entries');
  statisticsTabPanel.classList.toggle('hidden', activeTab !== 'statistics');
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
  });

  entriesTabPanel.classList.toggle('hidden', tabName !== 'entries');
  statisticsTabPanel.classList.toggle('hidden', tabName !== 'statistics');
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

  const weekPay = getCurrentWeekPay();
  const monthPay = getMonthPay(thisMonth);
  const totalPay = getTotalPay();

  document.querySelector('#week-hours').textContent = weekHours;
  document.querySelector('#month-hours').textContent = monthHours;
  document.querySelector('#total-hours').textContent = totalHours;

  document.querySelector('#week-pay').textContent = formatMoney(weekPay);
  document.querySelector('#month-pay').textContent = formatMoney(monthPay);
  document.querySelector('#total-pay').textContent = formatMoney(totalPay);
}

function renderCharts() {
  const container = document.querySelector('#statistics-tab-panel');
  if (!container) return;

  const months = getRecentMonthKeys(6);
  const timeData = months.map((monthKey) => ({
    month: monthKey,
    label: formatShortMonth(monthKey),
    minutes: getMinutesForMonth(monthKey),
  }));
  const payData = months.map((monthKey) => ({
    month: monthKey,
    label: formatShortMonth(monthKey),
    pay: getMonthPay(monthKey),
  }));

  // Find best and worst months
  const bestWorkMonth = timeData.reduce((best, current) => 
    current.minutes > best.minutes ? current : best, timeData[0] || {});
  const worstWorkMonth = timeData.reduce((worst, current) => 
    current.minutes < worst.minutes ? current : worst, timeData[0] || {});
  const bestPayMonth = payData.reduce((best, current) => 
    current.pay > best.pay ? current : best, payData[0] || {});
  const lowestPayMonth = payData.reduce((lowest, current) => 
    current.pay < lowest.pay ? current : lowest, payData[0] || {});

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
      <h3>Arbeitszeit Übersicht</h3>
      <div id="time-chart" class="line-chart" aria-label="Arbeitszeit pro Monat"></div>
      <div class="chart-stats">
        <p>💪 Meiste Arbeit: ${bestWorkMonth.label || 'Keine Daten'} (${formatHours(bestWorkMonth.minutes || 0)})</p>
        <p>📉 Wenigste Arbeit: ${worstWorkMonth.label || 'Keine Daten'} (${formatHours(worstWorkMonth.minutes || 0)})</p>
      </div>
    </div>

    <div class="chart-card">
      <h3>Lohn Übersicht</h3>
      <div id="pay-chart" class="line-chart" aria-label="Lohn pro Monat"></div>
      <div class="chart-stats">
        <p>💰 Höchster Lohn: ${bestPayMonth.label || 'Keine Daten'} (${formatMoney(bestPayMonth.pay || 0)})</p>
        <p>📊 Niedrigster Lohn: ${lowestPayMonth.label || 'Keine Daten'} (${formatMoney(lowestPayMonth.pay || 0)})</p>
      </div>
    </div>
  `;

  renderLineChart('time-chart', timeData, (value) => formatHours(value));
  renderLineChart('pay-chart', payData.map(d => ({ ...d, value: d.pay })), (value) => formatMoney(value));
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
    const paidCheckbox = fragment.querySelector('.paid-toggle');

    item.dataset.id = entry.id;
    item.classList.toggle('paid', entry.paid);
    fragment.querySelector('.entry-date').textContent = formatDate(entry.date);
    fragment.querySelector('.entry-times').textContent = `${startTime || '00:00'} – ${endTime || '00:00'}`;
    fragment.querySelector('.entry-task').textContent = entry.task || 'Keine Tätigkeit';
    fragment.querySelector('.entry-hours').textContent = formatHours(minutes);
    fragment.querySelector('.entry-pay').textContent = formatMoney(pay);

    if (paidCheckbox) {
      paidCheckbox.checked = entry.paid;
      paidCheckbox.addEventListener('change', async (event) => {
        const newPaidStatus = event.target.checked;
        
        try {
          if (supabaseClient) {
            // Update in Supabase first
            const { error } = await supabaseClient
              .from('arbeitsstunden')
              .update({ bezahlt: newPaidStatus })
              .eq('id', entry.id);
            
            if (error) {
              throw error;
            }

            entry.paid = newPaidStatus;
            saveEntries();
            setSyncStatus('Bezahl-Status in Supabase aktualisiert.');
          } else {
            // Fallback if Supabase is not available
            entry.paid = newPaidStatus;
            saveEntries();
            setSyncStatus('Bezahl-Status lokal aktualisiert (offline).');
          }
        } catch (error) {
          console.error('Failed to update paid status:', error);
          // Revert checkbox on error
          event.target.checked = !newPaidStatus;
          setSyncStatus(`Fehler beim Aktualisieren: ${error.message}`);
        }
      });
    }

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

function renderLineChart(containerId, data, formatter) {
  const container = document.querySelector(`#${containerId}`);
  if (!container || !data.length) {
    return;
  }

  const values = data.map((item) => item.value || item.minutes || 0);
  const maxValue = Math.max(...values, 1);
  const minValue = 0;

  const chartHeight = 200;
  const chartWidth = 100;
  const barWidth = Math.max(4, chartWidth / data.length);
  const padding = 40;

  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${chartWidth * 8 + padding * 2} ${chartHeight + padding * 2}`);
  svg.setAttribute('class', 'line-chart-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Draw grid lines
  const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gridGroup.setAttribute('class', 'grid-lines');
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + ((chartHeight / 4) * i);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padding);
    line.setAttribute('y1', y);
    line.setAttribute('x2', chartWidth * 8 + padding);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#e0e0e0');
    line.setAttribute('stroke-width', '1');
    gridGroup.appendChild(line);
  }
  svg.appendChild(gridGroup);

  // Draw axes
  const axisGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  axisGroup.setAttribute('class', 'axes');
  const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  xAxis.setAttribute('x1', padding);
  xAxis.setAttribute('y1', padding + chartHeight);
  xAxis.setAttribute('x2', chartWidth * 8 + padding);
  xAxis.setAttribute('y2', padding + chartHeight);
  xAxis.setAttribute('stroke', '#333');
  xAxis.setAttribute('stroke-width', '2');
  axisGroup.appendChild(xAxis);

  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', padding);
  yAxis.setAttribute('y1', padding);
  yAxis.setAttribute('x2', padding);
  yAxis.setAttribute('y2', padding + chartHeight);
  yAxis.setAttribute('stroke', '#333');
  yAxis.setAttribute('stroke-width', '2');
  axisGroup.appendChild(yAxis);
  svg.appendChild(axisGroup);

  // Draw line and points
  const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  lineGroup.setAttribute('class', 'line-data');
  let pathData = '';

  const pointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pointsGroup.setAttribute('class', 'points');

  data.forEach((item, index) => {
    const value = item.value || item.minutes || 0;
    const x = padding + (index * chartWidth * 8) / data.length + (chartWidth * 8) / (data.length * 2);
    const y = padding + chartHeight - ((value / maxValue) * chartHeight);

    if (index === 0) {
      pathData = `M ${x} ${y}`;
    } else {
      pathData += ` L ${x} ${y}`;
    }

    // Add point
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', '#3563e9');
    circle.setAttribute('class', 'data-point');

    // Add tooltip
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${item.label}: ${formatter(value)}`;
    circle.appendChild(title);

    pointsGroup.appendChild(circle);

    // Add label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', padding + chartHeight + 20);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '12');
    label.setAttribute('fill', '#666');
    label.textContent = item.label;
    svg.appendChild(label);

    // Add value label
    const valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    valueLabel.setAttribute('x', x);
    valueLabel.setAttribute('y', y - 10);
    valueLabel.setAttribute('text-anchor', 'middle');
    valueLabel.setAttribute('font-size', '11');
    valueLabel.setAttribute('fill', '#3563e9');
    valueLabel.setAttribute('font-weight', 'bold');
    valueLabel.textContent = formatter(value);
    svg.appendChild(valueLabel);
  });

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', '#3563e9');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  lineGroup.appendChild(path);
  svg.appendChild(lineGroup);
  svg.appendChild(pointsGroup);

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

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
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

function getMinutesForMonth(monthKey) {
  return entries
    .filter((entry) => getMonthKey(entry.date) === monthKey)
    .reduce((sum, entry) => sum + calculateEntryMinutes(entry), 0);
}

function getTotalPayForMonth(monthKey) {
  return entries
    .filter((entry) => getMonthKey(entry.date) === monthKey)
    .reduce((sum, entry) => sum + calculateEntryPay(entry), 0);
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

function mapEntryToRow(entry) {
  return {
    id: entry.id,
    datum: entry.date,
    angefangen: entry.start,
    aufgehört: entry.end,
    pause_minuten: Number(entry.breakMinutes || 0),
    taetigkeit: entry.task || '',
    stunden_lohn: Number(entry.hourlyRate || 0),
    bezahlt: entry.paid || false,
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
    hourlyRate: Number(row.stunden_lohn || 13.9),
    paid: row.bezahlt || false,
  };
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
      row.paid ? 'ja' : 'nein',
      '',
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
    const hourlyRate = Number(map.stundenlohn || map.hourlyrate || map.hourly_rate || 13.9);
    const paid = String(map.bezahlt || map.paid || '').toLowerCase();

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
      paid: paid === 'true' || paid === '1' || paid === 'ja' || paid === 'yes',
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

function getCurrentWeekPay() {
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
      const minutes = calculateEntryMinutes(entry);
      return sum + calculateEntryPay(entry, minutes);
    }
    return sum;
  }, 0);
}

function getMonthPay(monthKey) {
  return entries
    .filter((entry) => getMonthKey(entry.date) === monthKey)
    .reduce((sum, entry) => {
      const minutes = calculateEntryMinutes(entry);
      return sum + calculateEntryPay(entry, minutes);
    }, 0);
}

function getTotalPay() {
  return entries.reduce((sum, entry) => {
    const minutes = calculateEntryMinutes(entry);
    return sum + calculateEntryPay(entry, minutes);
  }, 0);
}

// Edit Modal Functions
function openEditModal(entry) {
  currentEditingEntryId = entry.id;
  editDateInput.value = entry.date;
  editStartInput.value = entry.start;
  editEndInput.value = entry.end;
  editBreakInput.value = entry.breakMinutes || 0;
  editTaskInput.value = entry.task || '';
  editHourlyRateInput.value = entry.hourlyRate || 13.9;
  
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
