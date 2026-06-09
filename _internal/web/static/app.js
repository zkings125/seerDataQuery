const state = {
  categories: [],
  currentCategory: "",
  currentTable: "",
  page: 1,
  pageSize: 50,
  keyword: "",
  totalPages: 1,
  dbConnected: false,
  updating: false,
  queryReady: false,
  itemType: "",
  itemTypeOptions: [],
  monsterTypeOptions: [],
  sortBy: "",
  sortDir: "asc",
};

const categorySelectEl = document.getElementById("categorySelect");
const tableSelectEl = document.getElementById("tableSelect");
const itemTypeFieldEl = document.getElementById("itemTypeField");
const itemTypeStepLabelEl = document.getElementById("itemTypeStepLabel");
const itemTypeSelectEl = document.getElementById("itemTypeSelect");
const querySummaryEl = document.getElementById("querySummary");
const tableHeadEl = document.getElementById("tableHead");
const tableBodyEl = document.getElementById("tableBody");
const statusTextEl = document.getElementById("statusText");
const pageInfoEl = document.getElementById("pageInfo");
const searchInputEl = document.getElementById("searchInput");
const pageSizeEl = document.getElementById("pageSize");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageJumpInputEl = document.getElementById("pageJumpInput");
const pageJumpBtn = document.getElementById("pageJumpBtn");
const browseBtn = document.getElementById("browseBtn");
const searchBtn = document.getElementById("searchBtn");
const resetBtn = document.getElementById("resetBtn");
const statusDotEl = document.getElementById("statusDot");
const dbStatusTextEl = document.getElementById("dbStatusText");
const dbCountsEl = document.getElementById("dbCounts");
const updateLogEl = document.getElementById("updateLog");
const testResultLogEl = document.getElementById("testResultLog");
const testDbBtn = document.getElementById("testDbBtn");
const updateDbBtn = document.getElementById("updateDbBtn");

const COUNT_LABELS = {
  my_monsters: "我的精灵",
  my_items: "我的道具",
  raw_elf_data: "原始精灵",
  raw_items_data: "原始道具",
};

const DEFAULT_MONSTER_TYPE_OPTIONS = [
  { key: "", label: "全部分类" },
  { key: "normal", label: "精灵" },
  { key: "system", label: "系统精灵" },
  { key: "suit", label: "套装" },
  { key: "skin", label: "精灵皮肤" },
  { key: "other", label: "其他" },
];

const DEFAULT_ITEM_TYPE_OPTIONS = [
  { key: "", label: "全部分类" },
  { key: "part", label: "部件" },
  { key: "pet_item", label: "精灵道具" },
  { key: "material", label: "道具/材料" },
  { key: "throwable", label: "投掷道具" },
  { key: "nono_skin", label: "NoNo皮肤" },
  { key: "skill_stone", label: "技能石" },
  { key: "gem", label: "宝石道具" },
  { key: "monster_factor", label: "精灵因子" },
  { key: "limited", label: "限时道具" },
  { key: "other", label: "其他" },
];

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (!response.ok) {
      throw new Error(data.error || `请求失败：${response.status}`);
    }
    return data;
  } catch (error) {
    if (error instanceof SyntaxError || text.trim().startsWith("<")) {
      throw new Error("服务接口异常，请在 webSearch 目录重启 python app.py 后刷新页面");
    }
    throw error;
  }
}

function normalizeCategories(data) {
  if (Array.isArray(data.categories) && data.categories.length) {
    return data.categories;
  }

  if (Array.isArray(data.tables) && data.tables.length) {
    return [
      {
        key: "default",
        label: "数据查询",
        tables: data.tables.map((table) => ({
          ...table,
          search_hint: table.search_hint || "ID 或名称",
        })),
      },
    ];
  }

  return [];
}

function getCurrentCategory() {
  return state.categories.find((category) => category.key === state.currentCategory);
}

function getCurrentTableMeta() {
  const category = getCurrentCategory();
  if (!category) {
    return null;
  }
  return category.tables.find((table) => table.key === state.currentTable) || null;
}

function updateQueryControls() {
  const category = getCurrentCategory();
  const tableMeta = getCurrentTableMeta();
  state.queryReady = Boolean(state.dbConnected && category && tableMeta);

  const canQuery = state.queryReady;
  browseBtn.disabled = !canQuery || state.updating;
  searchBtn.disabled = !canQuery || state.updating;
  resetBtn.disabled = !canQuery || state.updating;
  searchInputEl.disabled = !canQuery || state.updating;

  if (!state.dbConnected) {
    searchInputEl.placeholder = "请先连接数据库";
    querySummaryEl.textContent = "请先测试数据库连接";
    return;
  }

  if (!category || !tableMeta) {
    searchInputEl.placeholder = "请先选择查询类型";
    querySummaryEl.textContent = "请按顺序选择「数据分类」和「查询类型」";
    return;
  }

  const categoryOptions = getActiveCategoryOptions(tableMeta);
  const itemTypeMeta = categoryOptions.find((option) => option.key === state.itemType);
  const showCategoryHint = (tableMeta.supports_item_category || tableMeta.supports_monster_category)
    && itemTypeMeta
    && itemTypeMeta.key;
  const itemTypeHint = showCategoryHint ? ` / ${itemTypeMeta.label}` : "";

  if (tableMeta.key === "my_items" && state.itemType === "monster_factor") {
    searchInputEl.placeholder = "因子名、精灵名，或 ID（逗号分隔 / 范围如 150-200），留空查看全部";
  } else {
    searchInputEl.placeholder = `按${tableMeta.search_hint}搜索，ID 支持逗号或范围（如 150-200），留空查看全部`;
  }
  querySummaryEl.textContent = `当前选择：${category.label} / ${tableMeta.label}${itemTypeHint}`;
  updateItemTypeField();
}

function getActiveCategoryOptions(tableMeta) {
  if (tableMeta && tableMeta.supports_monster_category) {
    return state.monsterTypeOptions;
  }
  return state.itemTypeOptions;
}

function renderItemTypeSelect(options) {
  itemTypeSelectEl.innerHTML = options
    .map(
      (option) =>
        `<option value="${option.key}" ${option.key === state.itemType ? "selected" : ""}>${option.label}</option>`
    )
    .join("");
}

function updateItemTypeField() {
  const tableMeta = getCurrentTableMeta();
  const showItemType = Boolean(tableMeta && tableMeta.supports_item_category);
  const showMonsterType = Boolean(tableMeta && tableMeta.supports_monster_category);
  const showCategoryField = showItemType || showMonsterType;

  itemTypeFieldEl.classList.toggle("hidden", !showCategoryField);
  itemTypeSelectEl.disabled = !showCategoryField || state.updating || !state.queryReady;

  if (showMonsterType) {
    itemTypeStepLabelEl.textContent = "3. 精灵分类";
    renderItemTypeSelect(state.monsterTypeOptions);
  } else if (showItemType) {
    itemTypeStepLabelEl.textContent = "3. 道具分类";
    renderItemTypeSelect(state.itemTypeOptions);
  } else {
    state.itemType = "";
  }
}

function applyItemTypeOptions(options) {
  state.itemTypeOptions = options && options.length ? options : DEFAULT_ITEM_TYPE_OPTIONS;
}

function applyMonsterTypeOptions(options) {
  state.monsterTypeOptions = options && options.length ? options : DEFAULT_MONSTER_TYPE_OPTIONS;
}

async function loadCategoryOptions() {
  try {
    const data = await fetchJson("/api/item-categories");
    applyItemTypeOptions(data.categories);
  } catch {
    applyItemTypeOptions(DEFAULT_ITEM_TYPE_OPTIONS);
  }

  try {
    const data = await fetchJson("/api/monster-categories");
    applyMonsterTypeOptions(data.categories);
  } catch {
    applyMonsterTypeOptions(DEFAULT_MONSTER_TYPE_OPTIONS);
  }
}

function showPendingQueryMessage() {
  tableHeadEl.innerHTML = "";
  tableBodyEl.innerHTML =
    '<tr class="empty-row"><td colspan="6">已选择查询类型，请点击「查看全部」浏览数据，或输入关键词后点击「搜索」</td></tr>';
  statusTextEl.textContent = "等待查询";
  updatePaginationControls(1, 1);
  prevBtn.disabled = true;
  nextBtn.disabled = true;
  pageJumpBtn.disabled = true;
  pageJumpInputEl.disabled = true;
}

function setDbBusy(busy) {
  state.updating = busy;
  testDbBtn.disabled = busy;
  updateDbBtn.disabled = busy;
  updateQueryControls();
}

function renderDbStatus(data) {
  state.dbConnected = data.ok;
  statusDotEl.className = `status-dot ${data.ok ? "ok" : "error"}`;
  dbStatusTextEl.textContent = data.ok
    ? `${data.database} @ ${data.host}：${data.message}`
    : data.message;

  const countItems = Object.entries(data.counts || {}).map(([table, count]) => {
    const label = COUNT_LABELS[table] || table;
    const value = count === null || count === undefined ? "表不存在" : `${count} 条`;
    return `<span class="count-badge">${label}：${value}</span>`;
  });

  dbCountsEl.innerHTML = countItems.join("") || '<span class="count-badge">暂无统计信息</span>';
  updateQueryControls();
}

function hideDbLogs() {
  testResultLogEl.classList.add("hidden");
  updateLogEl.classList.add("hidden");
}

function showUpdateLogPanel(result) {
  hideDbLogs();
  updateLogEl.classList.remove("hidden");
  const lines = (result.steps || []).map((step) => {
    const status = step.ok ? "成功" : "失败";
    return `[${status}] ${step.label}\n${step.output}`;
  });
  updateLogEl.textContent = `${result.message}\n\n${lines.join("\n\n")}`;
}

function formatTestResult(data) {
  const statusText = data.ok ? "连接成功" : "连接失败";
  const lines = [
    `测试结果：${statusText}`,
    `时间：${new Date().toLocaleString()}`,
    `数据库：${data.database || "未知"}`,
    `主机：${data.host || "未知"}`,
    `说明：${data.message || "无"}`,
  ];

  const counts = data.counts || {};
  const countLines = Object.entries(counts).map(([table, count]) => {
    const label = COUNT_LABELS[table] || table;
    const value = count === null || count === undefined ? "表不存在" : `${count} 条`;
    return `- ${label}：${value}`;
  });

  if (countLines.length) {
    lines.push("表记录数：", ...countLines);
  }

  if (data.tables && data.tables.length) {
    lines.push(`共检测到 ${data.tables.length} 张表`);
  }

  return lines.join("\n");
}

function showTestResult(data) {
  hideDbLogs();
  const text = formatTestResult(data);
  testResultLogEl.textContent = text;
  testResultLogEl.classList.remove("hidden", "ok", "error");
  testResultLogEl.classList.add(data.ok ? "ok" : "error");
}

async function testDatabase({ showLog = true, showLoading = true } = {}) {
  if (showLoading) {
    dbStatusTextEl.textContent = "正在测试数据库连接...";
    if (showLog) {
      hideDbLogs();
      testResultLogEl.classList.remove("hidden", "ok", "error");
      testResultLogEl.textContent = "正在测试数据库连接，请稍候...";
    }
  }

  try {
    const data = await fetchJson("/api/db/status");
    renderDbStatus(data);
    if (showLog) {
      showTestResult(data);
    }
    return data.ok;
  } catch (error) {
    const data = {
      ok: false,
      message: `连接测试失败：${error.message}`,
      database: "seerNew",
      host: "localhost",
      counts: {},
      tables: [],
    };
    renderDbStatus(data);
    if (showLog) {
      showTestResult(data);
    }
    return false;
  }
}

async function updateDatabase() {
  if (state.updating) {
    return;
  }

  const confirmed = window.confirm(
    "将依次执行图鉴导入、用户精灵/道具导入，并重新生成查询表。整个过程可能需要几分钟，是否继续？"
  );
  if (!confirmed) {
    return;
  }

  setDbBusy(true);
  hideDbLogs();
  updateLogEl.classList.remove("hidden");
  updateLogEl.textContent = "正在更新数据库，请稍候...\n\n1. 导入图鉴\n2. 导入用户精灵\n3. 导入用户道具\n4. 生成我的精灵表\n5. 生成我的道具表";

  try {
    const response = await fetch("/api/db/update", { method: "POST" });
    const data = await response.json();
    showUpdateLogPanel(data);
    await testDatabase({ showLog: false });
    if (data.ok && state.queryReady) {
      state.page = 1;
      await fetchData();
    }
  } catch (error) {
    hideDbLogs();
    updateLogEl.classList.remove("hidden");
    updateLogEl.textContent = `更新失败：${error.message}`;
  } finally {
    setDbBusy(false);
  }
}

function renderCategorySelect() {
  categorySelectEl.innerHTML = state.categories
    .map(
      (category) =>
        `<option value="${category.key}" ${category.key === state.currentCategory ? "selected" : ""}>${category.label}</option>`
    )
    .join("");
}

function renderTableSelect() {
  const category = getCurrentCategory();
  if (!category) {
    tableSelectEl.innerHTML = "";
    return;
  }

  tableSelectEl.innerHTML = category.tables
    .map(
      (table) =>
        `<option value="${table.key}" ${table.key === state.currentTable ? "selected" : ""}>${table.label}</option>`
    )
    .join("");
}

function resetSort() {
  state.sortBy = "";
  state.sortDir = "asc";
}

function onCategoryChange() {
  const category = state.categories.find((item) => item.key === categorySelectEl.value);
  if (!category || !category.tables.length) {
    return;
  }

  hideDbLogs();
  resetSort();
  state.currentCategory = category.key;
  state.currentTable = category.tables[0].key;
  state.page = 1;
  state.keyword = "";
  state.itemType = "";
  searchInputEl.value = "";
  itemTypeSelectEl.value = "";

  renderTableSelect();
  updateQueryControls();
  showPendingQueryMessage();
}

function onTableChange() {
  hideDbLogs();
  resetSort();
  state.currentTable = tableSelectEl.value;
  state.page = 1;
  state.keyword = "";
  state.itemType = "";
  searchInputEl.value = "";
  itemTypeSelectEl.value = "";

  updateQueryControls();
  showPendingQueryMessage();
}

function onItemTypeChange() {
  hideDbLogs();
  resetSort();
  state.itemType = itemTypeSelectEl.value;
  state.page = 1;
  updateQueryControls();
  showPendingQueryMessage();
}

function updatePaginationControls(page, totalPages) {
  pageInfoEl.textContent = `第 ${page} / ${totalPages} 页`;
  pageJumpInputEl.value = String(page);
  pageJumpInputEl.max = String(totalPages);
  pageJumpInputEl.min = "1";
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;
  pageJumpBtn.disabled = totalPages <= 1;
  pageJumpInputEl.disabled = totalPages <= 1;
}

function jumpToPage() {
  const targetPage = Number(pageJumpInputEl.value);
  if (!Number.isInteger(targetPage) || targetPage < 1) {
    pageJumpInputEl.value = String(state.page);
    return;
  }

  const clampedPage = Math.min(Math.max(targetPage, 1), state.totalPages);
  pageJumpInputEl.value = String(clampedPage);
  if (clampedPage === state.page) {
    return;
  }

  hideDbLogs();
  state.page = clampedPage;
  fetchData();
}

function formatCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function getSortIndicator(columnKey) {
  if (state.sortBy !== columnKey) {
    return "";
  }
  return state.sortDir === "desc" ? " ↓" : " ↑";
}

function handleSort(columnKey) {
  if (state.sortBy === columnKey) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortBy = columnKey;
    state.sortDir = "asc";
  }
  state.page = 1;
  hideDbLogs();
  fetchData();
}

function renderTable(columns, rows) {
  tableHeadEl.innerHTML = `<tr>${columns
    .map((col) => {
      if (!col.sortable) {
        return `<th>${col.label}</th>`;
      }
      const activeClass = state.sortBy === col.key ? "sortable-th active" : "sortable-th";
      return `<th class="${activeClass}" data-sort-key="${col.key}" title="点击排序">${col.label}${getSortIndicator(col.key)}</th>`;
    })
    .join("")}</tr>`;

  tableHeadEl.querySelectorAll("[data-sort-key]").forEach((header) => {
    header.addEventListener("click", () => handleSort(header.dataset.sortKey));
  });

  if (!rows.length) {
    tableBodyEl.innerHTML = `<tr class="empty-row"><td colspan="${columns.length}">暂无数据</td></tr>`;
    return;
  }

  tableBodyEl.innerHTML = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const text = formatCell(row[col.key]);
          const display = text.length > 120 ? `${text.slice(0, 120)}…` : text;
          const title = text.length > 120 ? ` title="${text.replace(/"/g, "&quot;")}"` : "";
          return `<td${title}>${display}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
}

async function fetchData() {
  if (!state.queryReady) {
    showPendingQueryMessage();
    return;
  }

  statusTextEl.textContent = "查询中...";
  const params = new URLSearchParams({
    q: state.keyword,
    page: String(state.page),
    page_size: String(state.pageSize),
  });
  const tableMeta = getCurrentTableMeta();
  if (state.itemType && tableMeta && tableMeta.supports_item_category) {
    params.set("item_type", state.itemType);
  }
  if (state.itemType && tableMeta && tableMeta.supports_monster_category) {
    params.set("monster_type", state.itemType);
  }
  if (state.sortBy) {
    params.set("sort_by", state.sortBy);
    params.set("sort_dir", state.sortDir);
  }

  try {
    const data = await fetchJson(`/api/search/${state.currentTable}?${params.toString()}`);

    if (data.sort_by) {
      state.sortBy = data.sort_by;
      state.sortDir = data.sort_dir || "asc";
    }

    renderTable(data.columns, data.rows);
    state.totalPages = data.total_pages;
    state.page = data.page;
    const keywordHint = state.keyword ? `，关键词「${state.keyword}」` : "";
    const itemTypeMeta = state.itemTypeOptions.find((option) => option.key === state.itemType);
    const itemTypeHint = itemTypeMeta && itemTypeMeta.key ? `，分类「${itemTypeMeta.label}」` : "";
    statusTextEl.textContent = `${data.label}：共 ${data.total} 条记录${itemTypeHint}${keywordHint}`;
    updatePaginationControls(data.page, data.total_pages);
  } catch (error) {
    tableHeadEl.innerHTML = "";
    tableBodyEl.innerHTML = `<tr class="empty-row"><td>加载失败：${error.message}</td></tr>`;
    statusTextEl.textContent = "查询失败";
    updatePaginationControls(state.page, state.totalPages);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    pageJumpBtn.disabled = true;
    pageJumpInputEl.disabled = true;
  }
}

function browseAll() {
  hideDbLogs();
  state.keyword = "";
  searchInputEl.value = "";
  state.page = 1;
  fetchData();
}

function runSearch() {
  if (!state.queryReady) {
    return;
  }
  hideDbLogs();
  state.keyword = searchInputEl.value.trim();
  state.page = 1;
  fetchData();
}

async function loadTableOptions() {
  const data = await fetchJson("/api/tables");
  state.categories = normalizeCategories(data);

  if (!state.categories.length) {
    throw new Error("未获取到可查询的数据类型");
  }

  if (data.item_categories && data.item_categories.length) {
    applyItemTypeOptions(data.item_categories);
  } else if (!state.itemTypeOptions.length) {
    applyItemTypeOptions(DEFAULT_ITEM_TYPE_OPTIONS);
  }

  state.currentCategory = state.categories[0].key;
  state.currentTable = state.categories[0].tables[0].key;
  renderCategorySelect();
  renderTableSelect();
}

async function init() {
  statusTextEl.textContent = "等待查询";

  try {
    await testDatabase({ showLog: true, showLoading: false });
    await loadTableOptions();
    updateQueryControls();
    showPendingQueryMessage();
  } catch (error) {
    statusDotEl.className = "status-dot error";
    dbStatusTextEl.textContent = `页面加载失败：${error.message}`;
    applyItemTypeOptions(DEFAULT_ITEM_TYPE_OPTIONS);
    showTestResult({
      ok: false,
      message: error.message,
      database: "seerNew",
      host: "localhost",
      counts: {},
      tables: [],
    });
    showPendingQueryMessage();
  }
}

categorySelectEl.addEventListener("change", onCategoryChange);
tableSelectEl.addEventListener("change", onTableChange);
itemTypeSelectEl.addEventListener("change", onItemTypeChange);

browseBtn.addEventListener("click", browseAll);
searchBtn.addEventListener("click", runSearch);

resetBtn.addEventListener("click", () => {
  hideDbLogs();
  searchInputEl.value = "";
  state.keyword = "";
  if (state.queryReady && tableBodyEl.querySelector("tr:not(.empty-row)")) {
    state.page = 1;
    fetchData();
  }
});

searchInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runSearch();
  }
});

pageSizeEl.addEventListener("change", () => {
  hideDbLogs();
  state.pageSize = Number(pageSizeEl.value);
  state.page = 1;
  if (state.queryReady && tableBodyEl.querySelector("tr:not(.empty-row)")) {
    fetchData();
  }
});

prevBtn.addEventListener("click", () => {
  if (state.page > 1) {
    hideDbLogs();
    state.page -= 1;
    fetchData();
  }
});

nextBtn.addEventListener("click", () => {
  if (state.page < state.totalPages) {
    hideDbLogs();
    state.page += 1;
    fetchData();
  }
});

pageJumpBtn.addEventListener("click", jumpToPage);

pageJumpInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    jumpToPage();
  }
});

testDbBtn.addEventListener("click", async () => {
  await testDatabase({ showLog: true, showLoading: true });
  updateQueryControls();
});

updateDbBtn.addEventListener("click", updateDatabase);

init();
