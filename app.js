// Solo Leveling inspired productivity app
// Data is stored in localStorage under key 'hunterData'

const DEFAULT_CATEGORIES = ['Fitness', 'Business', 'Japanese', 'Routine', 'Money'];
const DAILY_XP_GOAL = 100; // used for red/green timer
const CLASS_DEFS = {
  fitness: { name: 'Fitness Hunter', buffs: { 'Fitness': 0.2 } },
  business: { name: 'Business Hunter', buffs: { 'Business': 0.2 } },
  scholar: { name: 'Scholar Hunter', buffs: { 'Japanese': 0.2 } },
  routine: { name: 'Routine Hunter', buffs: { 'Routine': 0.2 } },
  money: { name: 'Tycoon Hunter', buffs: { 'Money': 0.2 } }
};
const RANKS = [
  { level: 1, title: 'E' },
  { level: 6, title: 'D' },
  { level: 11, title: 'C' },
  { level: 21, title: 'B' },
  { level: 31, title: 'A' },
  { level: 41, title: 'S' },
  { level: 51, title: 'SS' },
  { level: 61, title: 'SSS' }
];

let data = {
  categories: [],
  quests: [],
  xp: 0,
  xpToday: 0,
  achievements: [],
  classKey: null,
  lastLogin: null
};

function loadData() {
  const stored = localStorage.getItem('hunterData');
  if (stored) {
    try { data = JSON.parse(stored); } catch(e) { /* ignore */ }
  }
  if (!data.categories || data.categories.length === 0) data.categories = [...DEFAULT_CATEGORIES];
  if (!data.quests) data.quests = [];
  if (!data.achievements) data.achievements = [];
  if (!data.lastLogin) data.lastLogin = todayStr();
}

function saveData() {
  localStorage.setItem('hunterData', JSON.stringify(data));
}

function todayStr() {
  return new Date().toISOString().slice(0,10);
}

function weekStr(d = new Date()) {
  const dt = new Date(d.getTime());
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() + 4 - (dt.getDay()||7));
  const yearStart = new Date(dt.getFullYear(),0,1);
  const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1)/7);
  return `${dt.getFullYear()}-W${weekNo}`;
}

function init() {
  loadData();
  dailyReset();
  setupUI();
  render();
  setInterval(updateIndicator, 60000);
}

document.addEventListener('DOMContentLoaded', init);

function setupUI() {
  document.getElementById('add-category').addEventListener('click', addCategory);
  document.getElementById('add-quest').addEventListener('click', addQuest);
  if (!data.classKey) {
    showClassModal();
  }
}

function showClassModal() {
  const modal = document.getElementById('class-selection');
  const list = document.getElementById('class-options');
  list.innerHTML = '';
  Object.keys(CLASS_DEFS).forEach(key => {
    const info = CLASS_DEFS[key];
    const btn = document.createElement('button');
    btn.textContent = info.name;
    btn.addEventListener('click', () => {
      data.classKey = key;
      saveData();
      modal.classList.add('hidden');
      render();
    });
    list.appendChild(btn);
  });
  modal.classList.remove('hidden');
}

function addCategory() {
  const input = document.getElementById('new-category');
  const val = input.value.trim();
  if (!val) return;
  data.categories.push(val);
  input.value = '';
  saveData();
  renderCategories();
  renderQuestCategoryOptions();
}

function addQuest() {
  const nameEl = document.getElementById('quest-name');
  const catEl = document.getElementById('quest-category');
  const xpEl = document.getElementById('quest-xp');
  const typeEl = document.getElementById('quest-type');
  const name = nameEl.value.trim();
  const cat = catEl.value;
  const xp = parseInt(xpEl.value,10) || 0;
  const type = typeEl.value;
  if (!name || !cat || xp <= 0) return;
  const quest = {
    id: Date.now(),
    name, category: cat, xp, type,
    lastCompleted: null,
    streak: 0
  };
  data.quests.push(quest);
  nameEl.value = '';
  xpEl.value = '';
  saveData();
  renderQuests();
}

function render() {
  renderCategories();
  renderQuestCategoryOptions();
  renderQuests();
  renderXP();
  renderAchievements();
  updateIndicator();
}

function renderCategories() {
  const list = document.getElementById('category-list');
  list.innerHTML = '';
  data.categories.forEach(cat => {
    const li = document.createElement('li');
    li.textContent = cat;
    list.appendChild(li);
  });
}

function renderQuestCategoryOptions() {
  const sel = document.getElementById('quest-category');
  sel.innerHTML = '';
  data.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function renderQuests() {
  const list = document.getElementById('quest-list');
  list.innerHTML = '';
  data.quests.forEach(q => {
    const li = document.createElement('li');
    li.className = 'quest-item';
    if (q.type === 'daily' && q.lastCompleted === todayStr()) li.classList.add('completed');
    if (q.type === 'weekly' && q.lastCompleted === weekStr()) li.classList.add('completed');
    li.innerHTML = `<strong>${q.name}</strong> [${q.category}] - ${q.xp} XP <br>Streak: ${q.streak}`;
    const btn = document.createElement('button');
    btn.textContent = 'Complete';
    btn.addEventListener('click', () => completeQuest(q.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function classBuff(category) {
  if (!data.classKey) return 0;
  return CLASS_DEFS[data.classKey].buffs[category] || 0;
}

function completeQuest(id) {
  const quest = data.quests.find(q => q.id === id);
  if (!quest) return;
  if (quest.type === 'daily') {
    const today = todayStr();
    if (quest.lastCompleted === today) return; // already done
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate()-1);
    const yStr = yesterday.toISOString().slice(0,10);
    if (quest.lastCompleted === yStr) quest.streak++; else quest.streak = 1;
    quest.lastCompleted = today;
  } else if (quest.type === 'weekly') {
    const currentWeek = weekStr();
    if (quest.lastCompleted === currentWeek) return;
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate()-7);
    if (quest.lastCompleted === weekStr(lastWeekDate)) quest.streak++; else quest.streak = 1;
    quest.lastCompleted = currentWeek;
  }
  let gain = quest.xp;
  gain *= (1 + classBuff(quest.category));
  if (quest.streak >= 7) gain *= 1.1; // passive buff
  gain = Math.round(gain);
  data.xp += gain;
  data.xpToday += gain;
  saveData();
  render();
  checkAchievements();
}

function calcLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

function calcRank(level) {
  let title = RANKS[0].title;
  for (const r of RANKS) {
    if (level >= r.level) title = r.title; else break;
  }
  return title;
}

function renderXP() {
  const level = calcLevel(data.xp);
  const rank = calcRank(level);
  const progress = (data.xp % 100) / 100 * 100;
  document.getElementById('xp-progress').style.width = `${progress}%`;
  document.getElementById('rank-display').textContent = `Rank: ${rank} (Level ${level})`;
}

function updateIndicator() {
  const now = new Date();
  const dayProgress = (now.getHours()*60 + now.getMinutes()) / 1440;
  const expected = DAILY_XP_GOAL * dayProgress;
  const el = document.getElementById('daily-indicator');
  if (data.xpToday >= expected) {
    el.textContent = 'On Track';
    el.classList.remove('red');
    el.classList.add('green');
  } else {
    el.textContent = 'Behind Schedule';
    el.classList.remove('green');
    el.classList.add('red');
  }
}

function dailyReset() {
  const today = todayStr();
  if (data.lastLogin === today) return;
  const unfinished = data.quests.filter(q => q.type === 'daily' && q.lastCompleted !== data.lastLogin);
  if (unfinished.length > 0) {
    alert('Punishment activated! Complete your quests next time.');
  } else if (data.quests.length > 0) {
    alert('Rewards unlocked! Great job finishing your quests.');
  }
  data.xpToday = 0;
  data.lastLogin = today;
  saveData();
}

const ACHIEVEMENTS = [
  { id: 'first', name: 'First Blood', test: d => d.xp > 0 },
  { id: 'level10', name: 'Rising Hunter', test: d => calcLevel(d.xp) >= 10 },
  { id: 'streak7', name: 'Persistent', test: d => d.quests.some(q => q.streak >= 7) }
];

function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!data.achievements.includes(a.id) && a.test(data)) {
      data.achievements.push(a.id);
      alert(`Achievement unlocked: ${a.name}`);
    }
  });
  saveData();
  renderAchievements();
}

function renderAchievements() {
  const list = document.getElementById('achievement-list');
  list.innerHTML = '';
  data.achievements.forEach(id => {
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return;
    const li = document.createElement('li');
    li.className = 'achievement';
    li.textContent = def.name;
    list.appendChild(li);
  });
}
