/* global CSS, document, fetch, navigator, window */
const payload = window.MOSSVALE_CATALOGUE;
const visuals = payload.visuals;
const entries = new Map((payload.entries ?? []).map(entry => [entry.id, entry]));
const elements = {
  search: document.querySelector('#search'),
  kind: document.querySelector('#kind'),
  element: document.querySelector('#element'),
  tag: document.querySelector('#tag'),
  status: document.querySelector('#status'),
  results: document.querySelector('#results'),
  details: document.querySelector('#details'),
  resultCount: document.querySelector('#result-count'),
  copySelection: document.querySelector('#copy-selection'),
  copyStatus: document.querySelector('#copy-status'),
};
const selected = new Set();
let activeId = null;

function optionList(select, values) {
  for (const value of [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'))) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

optionList(
  elements.kind,
  visuals.map(item => item.kind),
);
optionList(
  elements.element,
  visuals.flatMap(item => item.elements),
);
optionList(
  elements.tag,
  visuals.flatMap(item => item.tags),
);
optionList(
  elements.status,
  visuals.map(item => item.status),
);

function displayKind(item) {
  return item.kind;
}

function imageUrl(path) {
  const relativePath = payload.imagePrefix === './' ? path.split('/').map(encodeURIComponent).join('/') : encodeURIComponent(path);
  return `${payload.imagePrefix}${relativePath}`;
}

function makePreview(item, detailed = false) {
  const preview = item.preview;
  if (!preview) {
    const missing = document.createElement('p');
    missing.className = 'notice';
    missing.textContent = 'No preview image is registered for this resource.';
    return missing;
  }
  if (!detailed && item.frame) {
    const crop = document.createElement('div');
    crop.className = 'sheet-crop';
    crop.style.setProperty('--frame-ratio', `${item.frame.frameWidth} / ${item.frame.frameHeight}`);
    const image = document.createElement('img');
    image.src = imageUrl(preview.path);
    image.alt = `${preview.description}; ${item.frame.columnLabel}, ${item.frame.rowLabel} preview frame`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.style.width = `${item.frame.columns * 100}%`;
    image.style.height = `${item.frame.rows * 100}%`;
    image.style.left = `${-item.frame.column * 100}%`;
    image.style.top = `${-item.frame.row * 100}%`;
    crop.append(image);
    return crop;
  }
  const image = document.createElement('img');
  image.src = imageUrl(preview.path);
  image.alt = preview.description || `${item.name} preview`;
  image.loading = detailed ? 'eager' : 'lazy';
  image.decoding = 'async';
  if (detailed) image.className = 'full-preview';
  return image;
}

function renderCards() {
  const query = elements.search.value.trim().toLocaleLowerCase('en');
  const kind = elements.kind.value;
  const element = elements.element.value;
  const tag = elements.tag.value;
  const status = elements.status.value;
  const filtered = visuals.filter(item => {
    const cardKind = displayKind(item);
    return (
      (!query || item.searchable.includes(query)) &&
      (!kind || kind === cardKind) &&
      (!element || item.elements.includes(element)) &&
      (!tag || item.tags.includes(tag)) &&
      (!status || status === item.status)
    );
  });
  elements.results.replaceChildren();
  elements.resultCount.textContent = `${filtered.length} of ${visuals.length} visual resources`;
  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No visuals match these filters.';
    elements.results.append(empty);
    return;
  }
  for (const item of filtered) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = item.id;
    card.setAttribute('aria-pressed', String(activeId === item.id));
    card.setAttribute('aria-label', `${item.name}; ${item.summary}; ${item.status}`);
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = item.name;
    const preview = document.createElement('span');
    preview.className = 'thumb';
    preview.append(makePreview(item));
    const summary = document.createElement('span');
    summary.className = 'card-summary';
    summary.textContent = item.summary;
    const footer = document.createElement('span');
    footer.className = 'card-footer';
    const statusText = document.createElement('span');
    statusText.textContent = item.status;
    const typeText = document.createElement('span');
    typeText.textContent = item.elements.join(', ') || displayKind(item);
    footer.append(statusText, typeText);
    card.append(title, preview, summary, footer);
    card.addEventListener('click', () => {
      activeId = item.id;
      elements.details.replaceChildren(document.createTextNode('Loading fiche…'));
      void loadEntry(item)
        .then(entry => {
          if (activeId === item.id) renderDetails(item, entry);
        })
        .catch(error => {
          if (activeId === item.id) elements.details.replaceChildren(document.createTextNode(`Unable to load this fiche: ${error.message}`));
        });
      renderCards();
      elements.results.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.focus();
    });
    elements.results.append(card);
  }
}

function row(list, label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  list.append(term, description);
}

async function loadEntry(item) {
  if (entries.has(item.id)) return entries.get(item.id);
  if (!payload.ficheEndpoint) return null;
  const response = await fetch(`${payload.ficheEndpoint}${encodeURIComponent(item.id)}`);
  if (!response.ok) throw new Error(`Fiche request failed (${response.status}).`);
  const entry = await response.json();
  if (entry.id !== item.id || entry.kind !== 'visual') throw new Error('Fiche identity did not match the selected visual.');
  entries.set(entry.id, entry);
  return entry;
}

function renderDetails(item, entry) {
  const content = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = item.name;
  const id = document.createElement('p');
  id.className = 'notice';
  id.textContent = item.id;
  const preview = makePreview(item, true);
  const openImage = document.createElement('a');
  if (item.preview) {
    openImage.href = imageUrl(item.preview.path);
    openImage.target = '_blank';
    openImage.rel = 'noreferrer';
    openImage.textContent = 'Open full source image';
  }
  const summary = document.createElement('p');
  summary.textContent = item.summary;
  const details = document.createElement('dl');
  row(details, 'Availability', item.status);
  row(details, 'Scope', item.scope);
  row(details, 'Kind', displayKind(item));
  row(details, 'Element', item.elements.join(', ') || 'Not associated with a creature element');
  row(details, 'Appearance tags', item.tags.join(', '));
  row(
    details,
    'Art metadata',
    item.artIdentityReviewed ? 'Reviewed identity metadata is available.' : 'No reviewed appearance tags; only the registered source kind is shown.',
  );
  row(details, 'Preview', item.preview?.description ?? 'Not registered');
  if (item.frame) row(details, 'Frame shown', `${item.frame.columnLabel} / ${item.frame.rowLabel} (${item.frame.frameWidth}×${item.frame.frameHeight})`);
  const ownDetails = document.createElement('section');
  const detailsTitle = document.createElement('h3');
  detailsTitle.textContent = 'Fiche';
  const ficheFields = document.createElement('dl');
  for (const [name, value] of Object.entries(entry.details)) row(ficheFields, name, value);
  const limitsTitle = document.createElement('h3');
  limitsTitle.textContent = 'Limits';
  const limits = document.createElement('ul');
  for (const value of entry.limits) {
    const li = document.createElement('li');
    li.textContent = value;
    limits.append(li);
  }
  const selectionLabel = document.createElement('label');
  selectionLabel.className = 'selection';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected.has(item.id);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? selected.add(item.id) : selected.delete(item.id);
    elements.copyStatus.textContent = `${selected.size} visual ID${selected.size === 1 ? '' : 's'} selected for export.`;
  });
  selectionLabel.append(checkbox, document.createTextNode(' Include this preview in the writer context'));
  const referencesTitle = document.createElement('h3');
  referencesTitle.textContent = 'Builder references';
  const references = document.createElement('ul');
  for (const value of entry.references) {
    const li = document.createElement('li');
    li.textContent = value;
    references.append(li);
  }
  ownDetails.append(detailsTitle, ficheFields, limitsTitle, limits, referencesTitle, references);
  content.append(title, id, preview, openImage, summary, details, selectionLabel, ownDetails);
  const contactSheets = item.referencePreviews ?? [];
  const contactTitle = document.createElement('h3');
  contactTitle.textContent = 'Existing review previews';
  if (contactSheets.length) {
    const contactSection = document.createElement('section');
    contactSection.append(contactTitle);
    for (const reference of contactSheets) {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = imageUrl(reference.path);
      image.alt = reference.description;
      image.loading = 'lazy';
      image.className = 'full-preview';
      const caption = document.createElement('figcaption');
      caption.textContent = reference.description;
      figure.append(image, caption);
      contactSection.append(figure);
    }
    content.append(contactSection);
  } else {
    contactTitle.textContent = 'No separate contact sheet is registered for this image.';
    content.append(contactTitle);
  }
  elements.details.replaceChildren(content);
}

for (const select of [elements.kind, elements.element, elements.tag, elements.status]) select.addEventListener('change', renderCards);
elements.search.addEventListener('input', renderCards);
elements.copySelection.addEventListener('click', async () => {
  const ids = [...selected].sort((a, b) => a.localeCompare(b, 'en'));
  if (!ids.length) {
    elements.copyStatus.textContent = 'Select one or more visuals in the details panel first.';
    return;
  }
  const text = ids.join(',');
  try {
    await navigator.clipboard.writeText(text);
    elements.copyStatus.textContent = `${ids.length} stable ID${ids.length === 1 ? '' : 's'} copied. Use them with catalogue:export.`;
  } catch {
    elements.copyStatus.textContent = `Copy these IDs: ${text}`;
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeId) {
    activeId = null;
    elements.details.replaceChildren(document.createTextNode('Select a resource to inspect its catalogue fiche and full image.'));
    renderCards();
  }
});
renderCards();
