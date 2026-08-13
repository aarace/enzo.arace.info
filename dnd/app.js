// Persistent storage and rules used to calculate the character sheet.
const STORAGE_KEY = "verdant-ledger-character-v1";
const PAGE_NAMES = ["core", "details", "spells"];
const PAGE_TITLES = {
  core: "Core Sheet · DnD Character Sheet",
  details: "Story & Allies · DnD Character Sheet",
  spells: "Spellbook · DnD Character Sheet",
};

const defaultAbilities = {
  str: 10,
  dex: 18,
  con: 14,
  int: 12,
  wis: 16,
  cha: 11,
};

const defaultProficiencies = new Set([
  "save.str.proficient",
  "save.dex.proficient",
  "skill.animalHandling.proficient",
  "skill.athletics.proficient",
  "skill.nature.proficient",
  "skill.perception.proficient",
  "skill.stealth.proficient",
  "skill.survival.proficient",
]);

const skillAbilities = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
};

const spellDefaults = {
  0: ["Druidcraft", "Guidance", "", "", "", ""],
  1: [
    "Hunter's Mark",
    "Goodberry",
    "Cure Wounds",
    "Ensnaring Strike",
    "",
    "",
    "",
    "",
  ],
  2: [
    "Pass Without Trace",
    "Spike Growth",
    "Lesser Restoration",
    "",
    "",
    "",
    "",
    "",
  ],
  3: ["Conjure Barrage", "Plant Growth", "", "", "", "", ""],
  4: ["", "", "", "", "", "", ""],
  5: ["", "", "", "", "", "", ""],
  6: ["", "", "", "", "", ""],
  7: ["", "", "", "", "", ""],
  8: ["", "", "", "", "", ""],
  9: ["", "", "", "", "", ""],
};

let characterState = readState();
let saveStatusTimer;

init();

// Build dynamic controls before restoring saved values and binding events.
function init() {
  migrateClassLevelState();
  migrateInspirationState();
  buildSpellRows();
  restoreFields();
  bindFieldPersistence();
  bindActions();
  bindPageTabs();
  setActivePage(getRequestedPage());
  updateDerivedValues();
  updateCharacterIdentity();
  initForestParticles();
}

// Local state and one-time migrations for earlier versions of the sheet.
function readState() {
  try {
    const savedState = window.localStorage.getItem(STORAGE_KEY);
    return savedState ? JSON.parse(savedState) : {};
  } catch {
    return {};
  }
}

function migrateClassLevelState() {
  const legacyField = "character.classLevel";

  if (!Object.prototype.hasOwnProperty.call(characterState, legacyField)) {
    return;
  }

  const legacyValue = String(characterState[legacyField] || "").trim();
  const levelMatch = legacyValue.match(/(\d+)\s*$/);
  const className = levelMatch
    ? legacyValue.slice(0, levelMatch.index).trim()
    : legacyValue;

  if (
    className &&
    !Object.prototype.hasOwnProperty.call(characterState, "character.class")
  ) {
    characterState["character.class"] = className;
  }

  if (
    levelMatch &&
    !Object.prototype.hasOwnProperty.call(characterState, "character.level")
  ) {
    characterState["character.level"] = levelMatch[1];
  }

  delete characterState[legacyField];
  writeState();
}

function migrateInspirationState() {
  const fieldName = "combat.inspiration";

  if (
    !Object.prototype.hasOwnProperty.call(characterState, fieldName) ||
    typeof characterState[fieldName] !== "boolean"
  ) {
    return;
  }

  characterState[fieldName] = characterState[fieldName] ? "1" : "0";
  writeState();
}

function writeState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(characterState));
  } catch {
    setSaveStatus("Changes unavailable", true);
  }
}

// Spell rows share one template so every level behaves consistently.
function buildSpellRows() {
  document.querySelectorAll("[data-spell-list]").forEach((spellList) => {
    const level = Number(spellList.dataset.spellList);
    const rowCount = Number(spellList.dataset.spellRows) || 6;
    const levelDefaults = spellDefaults[level] || [];

    for (let index = 0; index < rowCount; index += 1) {
      const line = document.createElement("div");
      const preparedLabel = document.createElement("label");
      const preparedInput = document.createElement("input");
      const nameLabel = document.createElement("label");
      const hiddenLabel = document.createElement("span");
      const nameInput = document.createElement("input");
      const fieldBase = `spell.level${level}.row${index + 1}`;

      line.className = "spell-line";
      preparedLabel.setAttribute(
        "aria-label",
        `Prepare level ${level} spell ${index + 1}`,
      );

      preparedInput.type = "checkbox";
      preparedInput.dataset.field = `${fieldBase}.prepared`;
      preparedInput.checked = Boolean(levelDefaults[index]);

      hiddenLabel.className = "visually-hidden";
      hiddenLabel.textContent = `Level ${level} spell ${index + 1} name`;

      nameInput.type = "text";
      nameInput.dataset.field = `${fieldBase}.name`;
      nameInput.value = levelDefaults[index] || "";
      nameInput.autocomplete = "off";
      nameInput.placeholder = "Add spell…";

      preparedLabel.append(preparedInput);
      nameLabel.append(hiddenLabel, nameInput);
      line.append(preparedLabel, nameLabel);
      spellList.append(line);
    }
  });
}

function readControlValue(field) {
  return field.type === "checkbox" ? field.checked : field.value;
}

function writeControlValue(field, value) {
  if (field.type === "checkbox") {
    field.checked = Boolean(value);
  } else {
    field.value = value;
  }
}

function restoreFields() {
  document.querySelectorAll("[data-field]").forEach((field) => {
    const fieldName = field.dataset.field;

    if (!Object.prototype.hasOwnProperty.call(characterState, fieldName)) {
      return;
    }

    writeControlValue(field, characterState[fieldName]);
  });
}

function syncMatchingFields(sourceField) {
  const fieldName = sourceField.dataset.field;

  document.querySelectorAll(`[data-field="${fieldName}"]`).forEach((field) => {
    if (field !== sourceField) {
      writeControlValue(field, readControlValue(sourceField));
    }
  });
}

function bindFieldPersistence() {
  document.querySelectorAll("[data-field]").forEach((field) => {
    const eventName = field.matches("select, input[type='checkbox']")
      ? "change"
      : "input";

    field.addEventListener(eventName, () => {
      const fieldName = field.dataset.field;
      characterState[fieldName] = readControlValue(field);
      syncMatchingFields(field);

      writeState();
      setSaveStatus("Saving…");
      updateDerivedValues();
      updateCharacterIdentity();
    });
  });
}

function bindActions() {
  document.querySelectorAll("[data-print-sheet]").forEach((button) => {
    button.addEventListener("click", () => window.print());
  });

  document.querySelectorAll("[data-reset-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      const shouldReset = window.confirm(
        "Reset every page of DnD Character Sheet to the demo character? This clears locally saved edits.",
      );

      if (!shouldReset) {
        return;
      }

      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Reloading still restores the document defaults when storage is unavailable.
      }

      window.location.reload();
    });
  });
}

// Hash navigation keeps all three views in one CodePen document.
function getRequestedPage() {
  const requestedPage = window.location.hash.slice(1);
  return PAGE_NAMES.includes(requestedPage) ? requestedPage : "core";
}

function bindPageTabs() {
  document.querySelectorAll("[data-page-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      navigateToPage(link.dataset.pageTarget);
    });
  });

  const showRequestedPage = () => {
    navigateToPage(getRequestedPage(), { updateHistory: false });
  };

  window.addEventListener("hashchange", showRequestedPage);
}

function navigateToPage(
  pageName,
  { updateHistory = true, focusContent = true } = {},
) {
  if (!PAGE_NAMES.includes(pageName)) {
    return;
  }

  const updatePage = () => {
    setActivePage(pageName);
    window.scrollTo(0, 0);

    if (updateHistory && window.location.hash !== `#${pageName}`) {
      window.history.pushState({ page: pageName }, "", `#${pageName}`);
    }
  };

  const transition = document.startViewTransition?.(updatePage);

  if (!transition) {
    updatePage();
  }

  if (focusContent) {
    Promise.resolve(transition?.finished).then(() => {
      document.querySelector("#main-content")?.focus({ preventScroll: true });
    });
  }
}

function setActivePage(pageName) {
  const activePage = PAGE_NAMES.includes(pageName) ? pageName : "core";

  document.documentElement.dataset.activePage = activePage;
  document.body.dataset.page = activePage;
  document.title = PAGE_TITLES[activePage];

  document.querySelectorAll("[data-page-target]").forEach((link) => {
    if (link.dataset.pageTarget === activePage) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function setSaveStatus(message, isError = false) {
  const saveStatus = document.querySelector("[data-save-status]");
  const saveStatusText = saveStatus?.querySelector("[data-save-status-text]");

  if (!saveStatus || !saveStatusText) {
    return;
  }

  window.clearTimeout(saveStatusTimer);
  saveStatus.classList.toggle("is-saving", message === "Saving…");
  saveStatus.classList.toggle("is-error", isError);
  saveStatusText.textContent = message;

  if (message === "Saving…") {
    saveStatusTimer = window.setTimeout(() => {
      saveStatus.classList.remove("is-saving");
      saveStatusText.textContent = "Saved locally";
    }, 420);
  }
}

// D&D modifiers and proficiencies are derived from editable source fields.
function getFieldValue(fieldName, fallback = "") {
  const field = document.querySelector(`[data-field="${fieldName}"]`);

  if (field) {
    return field.type === "checkbox" ? field.checked : field.value;
  }

  if (Object.prototype.hasOwnProperty.call(characterState, fieldName)) {
    return characterState[fieldName];
  }

  return fallback;
}

function getBooleanField(fieldName) {
  const value = getFieldValue(fieldName, defaultProficiencies.has(fieldName));
  return value === true || value === "true";
}

function getAbilityScore(ability) {
  const score = Number(
    getFieldValue(`ability.${ability}`, defaultAbilities[ability]),
  );
  return Number.isFinite(score) ? score : defaultAbilities[ability];
}

function abilityModifier(ability) {
  return Math.floor((getAbilityScore(ability) - 10) / 2);
}

function signedNumber(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function updateOutputs(selector, value) {
  document.querySelectorAll(selector).forEach((output) => {
    output.value = value;
    output.textContent = value;
  });
}

function updateDerivedValues() {
  const proficiency = Number(getFieldValue("combat.proficiency", 3)) || 0;

  Object.keys(defaultAbilities).forEach((ability) => {
    const modifier = abilityModifier(ability);
    const proficient = getBooleanField(`save.${ability}.proficient`);
    const saveTotal = modifier + (proficient ? proficiency : 0);

    updateOutputs(`[data-mod-for="${ability}"]`, signedNumber(modifier));
    updateOutputs(`[data-save-value="${ability}"]`, signedNumber(saveTotal));
  });

  Object.entries(skillAbilities).forEach(([skill, ability]) => {
    const proficient = getBooleanField(`skill.${skill}.proficient`);
    const total = abilityModifier(ability) + (proficient ? proficiency : 0);

    updateOutputs(`[data-skill-value="${skill}"]`, signedNumber(total));
  });

  updateOutputs("[data-initiative]", signedNumber(abilityModifier("dex")));

  const passivePerception =
    10 +
    abilityModifier("wis") +
    (getBooleanField("skill.perception.proficient") ? proficiency : 0);

  updateOutputs("[data-passive-perception]", String(passivePerception));
}

function updateCharacterIdentity() {
  const name =
    String(getFieldValue("character.name", "Character Name")).trim() ||
    "Unnamed Wanderer";
  const race =
    String(getFieldValue("character.race", "Wood Elf")).trim() ||
    "Unknown lineage";
  const className =
    String(getFieldValue("character.class", "Ranger")).trim() ||
    "Unchosen class";
  const rawLevel = Number(getFieldValue("character.level", 5));
  const level =
    Number.isFinite(rawLevel) && rawLevel > 0
      ? String(Math.trunc(rawLevel))
      : "—";
  const classLevel = level === "—" ? className : `${className} ${level}`;
  const background =
    String(getFieldValue("character.background", "Outlander")).trim() ||
    "Unknown origin";
  document
    .querySelectorAll("[data-character-name-display]")
    .forEach((element) => {
      element.textContent = name;
    });

  document.querySelectorAll("[data-character-summary]").forEach((element) => {
    element.textContent = `${race} · ${classLevel} · ${background}`;
  });

  document
    .querySelectorAll("[data-character-level-display]")
    .forEach((element) => {
      element.textContent = level;
    });
}

// Lightweight ambient particles pause when the page is hidden.
function initForestParticles() {
  const canvas = document.querySelector("[data-particle-canvas]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!canvas || reducedMotion.matches) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const particles = [];
  let animationFrame;
  let viewportWidth = 0;
  let viewportHeight = 0;

  function resizeCanvas() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    canvas.width = Math.floor(viewportWidth * pixelRatio);
    canvas.height = Math.floor(viewportHeight * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function seedParticles() {
    particles.length = 0;
    const particleCount = Math.max(
      18,
      Math.min(42, Math.floor(viewportWidth / 34)),
    );

    for (let index = 0; index < particleCount; index += 1) {
      particles.push({
        x: Math.random() * viewportWidth,
        y: Math.random() * viewportHeight,
        radius: Math.random() * 1.8 + 0.45,
        drift: Math.random() * 0.16 + 0.04,
        sway: Math.random() * 0.45 + 0.08,
        phase: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.42 + 0.15,
      });
    }
  }

  function drawParticles(time) {
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.shadowBlur = 10;
    context.shadowColor = "rgba(238, 205, 112, 0.65)";

    particles.forEach((particle) => {
      particle.y -= particle.drift;
      particle.x +=
        Math.sin(time * 0.00045 + particle.phase) * particle.sway * 0.08;

      if (particle.y < -8) {
        particle.y = viewportHeight + 8;
        particle.x = Math.random() * viewportWidth;
      }

      context.beginPath();
      context.fillStyle = `rgba(238, 215, 139, ${particle.alpha})`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    });

    animationFrame = window.requestAnimationFrame(drawParticles);
  }

  function resetParticles() {
    resizeCanvas();
    seedParticles();
  }

  function handleVisibility() {
    window.cancelAnimationFrame(animationFrame);

    if (!document.hidden) {
      animationFrame = window.requestAnimationFrame(drawParticles);
    }
  }

  window.addEventListener("resize", resetParticles, { passive: true });
  document.addEventListener("visibilitychange", handleVisibility);
  resetParticles();
  animationFrame = window.requestAnimationFrame(drawParticles);
}