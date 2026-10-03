import {assets} from './data/assets.js';
import {species} from './data/species.js';
import {validateMaps} from './domain/mapdata.js';

const $ = selector => document.querySelector(selector);
const mapsUrl = new URL('../maps/', import.meta.url);
const terrainColors = {'.': '#00000000', g: '#86ab68', p: '#d4c58c', t: '#4e7943', w: '#62a8ae'};
const kinds = {prop: 'props', landmark: 'landmarks', exit: 'exits', zone: 'zones', trigger: 'triggers', instance: 'instances'};
const canvas = $('#map-canvas');
const ctx = canvas.getContext('2d');
let mapIndex;
let maps = [];
let selectedMap = null;
let selectedCell = null;
let selectedRecord = null;
let undo = [];
let redo = [];
let cleanSnapshot = '';

const clone = value => JSON.parse(JSON.stringify(value));
const snapshot = () => JSON.stringify(selectedMap);
function changed(before) {
  const after = snapshot();
  if (after === before) return;
  undo.push(before);
  if (undo.length > 100) undo.shift();
  redo = [];
  updateStatus();
  draw();
  validate();
}
function updateStatus() {
  const dirty = snapshot() !== cleanSnapshot;
  $('#dirty').textContent = dirty ? 'Unsaved changes' : 'Saved';
  $('#dirty').classList.toggle('unsaved', dirty);
  $('#undo').disabled = !undo.length;
  $('#redo').disabled = !redo.length;
}
const coord = (x, y) => {
  const scale = Math.min(canvas.width / ((selectedMap.size.w + selectedMap.size.h) * 14), canvas.height / ((selectedMap.size.w + selectedMap.size.h) * 7));
  const tw = 28 * scale;
  const th = 14 * scale;
  const px = canvas.width / 2 + ((x - y) * tw) / 2;
  const py = 18 + ((x + y) * th) / 2;
  return {x: px, y: py, tw, th};
};
function draw() {
  if (!selectedMap) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < selectedMap.size.h; y++)
    for (let x = 0; x < selectedMap.size.w; x++) {
      const {x: px, y: py, tw, th} = coord(x, y);
      const color = terrainColors[selectedMap.terrain[y][x]];
      if (color !== '#00000000') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px, py - th / 2);
        ctx.lineTo(px + tw / 2, py);
        ctx.lineTo(px, py + th / 2);
        ctx.lineTo(px - tw / 2, py);
        ctx.closePath();
        ctx.fill();
      }
      if (selectedCell?.x === x && selectedCell?.y === y) {
        ctx.strokeStyle = '#fff4ad';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  for (const [field, records] of Object.entries({landmarks: selectedMap.landmarks ?? [], exits: selectedMap.exits ?? []}))
    for (const record of records) {
      const [x, y] = record.at ?? [0, 0];
      const {x: px, y: py} = coord(x, y);
      ctx.fillStyle = field === 'exits' ? '#8de6ef' : '#f0b76e';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17372d';
      ctx.font = '12px sans-serif';
      ctx.fillText(record.id, px + 7, py - 5);
    }
  for (const [name, at] of Object.entries(selectedMap.spawns ?? {})) {
    const {x, y} = coord(at[0], at[1]);
    ctx.fillStyle = '#e8685a';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = '#17372d';
    ctx.font = '11px sans-serif';
    ctx.fillText(name, x + 6, y + 12);
  }
  $('#map-name').textContent = `${selectedMap.name} · ${selectedMap.size.w} × ${selectedMap.size.h}`;
}
function validate() {
  if (!selectedMap) return;
  const candidate = maps.map(map => (map.id === selectedMap.id ? selectedMap : map));
  const errors = validateMaps(candidate, {spriteNames: new Set(assets.map(asset => asset.name)), speciesIds: new Set(species.map(entry => entry.id))});
  const panel = $('#validation');
  panel.classList.toggle('invalid', errors.length > 0);
  panel.textContent = errors.length ? errors.slice(0, 8).join('\n') : 'Valid map data. Runtime and editor use this same schema.';
}
function syncRecord() {
  if (!selectedRecord) {
    $('#record').value = '';
    $('#delete-record').disabled = true;
    return;
  }
  const list = selectedMap[kinds[selectedRecord.kind]] ?? [];
  $('#record').value = JSON.stringify(list[selectedRecord.index], null, 2);
  $('#delete-record').disabled = false;
}
function selectMap(id) {
  selectedMap = clone(maps.find(map => map.id === id));
  selectedCell = null;
  selectedRecord = null;
  undo = [];
  redo = [];
  cleanSnapshot = snapshot();
  syncRecord();
  updateStatus();
  draw();
  validate();
}
function selectAt(x, y) {
  selectedCell = {x, y};
  $('#coords').textContent = `Tile ${x}, ${y}`;
  const entities = ['landmarks', 'exits', 'props', 'zones', 'triggers', 'instances']
    .flatMap(kind => (selectedMap[kind] ?? []).map((record, index) => ({kind, index, record})))
    .find(({kind, record}) => {
      const at = kind === 'props' ? record.at?.[0] : (record.at ?? (record.rect && [record.rect.x, record.rect.y]));
      return at && Math.round(at[0]) === x && Math.round(at[1]) === y;
    });
  selectedRecord = entities ? {kind: Object.keys(kinds).find(name => kinds[name] === entities.kind), index: entities.index} : null;
  syncRecord();
  draw();
}
canvas.addEventListener('pointerdown', event => {
  if (!selectedMap) return;
  const rect = canvas.getBoundingClientRect();
  const sx = ((event.clientX - rect.left) * canvas.width) / rect.width;
  const sy = ((event.clientY - rect.top) * canvas.height) / rect.height;
  const scale = Math.min(canvas.width / ((selectedMap.size.w + selectedMap.size.h) * 14), canvas.height / ((selectedMap.size.w + selectedMap.size.h) * 7));
  const u = (sx - canvas.width / 2) / (14 * scale);
  const v = (sy - 18) / (7 * scale);
  const x = Math.round((u + v) / 2),
    y = Math.round((v - u) / 2);
  if (x < 0 || y < 0 || x >= selectedMap.size.w || y >= selectedMap.size.h) return;
  selectAt(x, y);
  if (selectedRecord) return;
  const before = snapshot();
  const row = [...selectedMap.terrain[y]];
  row[x] = $('#terrain').value;
  selectedMap.terrain[y] = row.join('');
  changed(before);
});
$('#terrain').addEventListener('change', () => {
  if (!selectedCell) return;
  const before = snapshot();
  const row = [...selectedMap.terrain[selectedCell.y]];
  row[selectedCell.x] = $('#terrain').value;
  selectedMap.terrain[selectedCell.y] = row.join('');
  changed(before);
});
$('#map').onchange = event => selectMap(event.target.value);
$('#undo').onclick = () => {
  if (!undo.length) return;
  redo.push(snapshot());
  selectedMap = JSON.parse(undo.pop());
  selectedRecord = null;
  syncRecord();
  updateStatus();
  draw();
  validate();
};
$('#redo').onclick = () => {
  if (!redo.length) return;
  undo.push(snapshot());
  selectedMap = JSON.parse(redo.pop());
  selectedRecord = null;
  syncRecord();
  updateStatus();
  draw();
  validate();
};
$('#apply-record').onclick = () => {
  if (!selectedRecord) return;
  let value;
  try {
    value = JSON.parse($('#record').value);
  } catch (error) {
    $('#validation').textContent = `Record JSON error: ${error.message}`;
    $('#validation').classList.add('invalid');
    return;
  }
  const before = snapshot();
  selectedMap[kinds[selectedRecord.kind]][selectedRecord.index] = value;
  changed(before);
  syncRecord();
};
$('#delete-record').onclick = () => {
  if (!selectedRecord) return;
  const before = snapshot();
  selectedMap[kinds[selectedRecord.kind]].splice(selectedRecord.index, 1);
  selectedRecord = null;
  syncRecord();
  changed(before);
};
$('#add-content').onclick = () => {
  if (!selectedCell) {
    $('#add-help').textContent = 'Choose a tile first.';
    return;
  }
  const field = kinds[$('#add-kind').value];
  if ($('#add-kind').value === 'instance' && !mapIndex.prefabs) {
    $('#add-help').textContent = 'This pack has no prefab catalog yet; import a map that defines instances or add a catalog to the pack manifest.';
    return;
  }
  const defaults = {
    props: {id: 'new-prop', kind: 'scenery', sprite: assets.find(asset => asset.kind === 'prop').name, at: [[selectedCell.x, selectedCell.y]], w: 40},
    landmarks: {id: 'new-landmark', kind: 'sign', sprite: 'signpost-wood', at: [selectedCell.x, selectedCell.y], w: 36, text: 'Add a short hint.'},
    exits: {
      id: 'new-exit',
      sprite: 'signpost-wood',
      at: [selectedCell.x, selectedCell.y],
      w: 36,
      to: {map: maps.find(map => map.id !== selectedMap.id)?.id ?? selectedMap.id, spawn: 'camp'},
    },
    zones: {id: 'new-zone', terrain: ['t'], rect: {x: selectedCell.x, y: selectedCell.y, w: 3, h: 3}, pool: [species[0].id], level: [2, 3]},
    triggers: {
      id: 'new-trigger',
      at: [selectedCell.x, selectedCell.y],
      radius: 1,
      on: 'interact',
      once: true,
      do: [],
      events: [{id: 'new-scene', repeatable: false, actions: [{type: 'dialogue', speaker: 'narrator', text: 'Write a short line.'}]}],
    },
    instances: {id: 'new-instance', prefab: Object.keys(mapIndex.prefabs ?? {})[0] ?? 'new-prefab', at: [selectedCell.x, selectedCell.y]},
  };
  const before = snapshot();
  selectedMap[field] ??= [];
  selectedMap[field].push(defaults[field]);
  selectedRecord = {kind: $('#add-kind').value, index: selectedMap[field].length - 1};
  changed(before);
  syncRecord();
};
$('#set-spawn').onclick = () => {
  if (!selectedCell) return;
  const name = $('#spawn-name')
    .value.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!name) return;
  const before = snapshot();
  selectedMap.spawns[name] = [selectedCell.x, selectedCell.y];
  changed(before);
};
$('#validate').onclick = validate;
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(selectedMap, null, 2) + '\n'], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${selectedMap.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
  cleanSnapshot = snapshot();
  updateStatus();
};
$('#import').onclick = () => $('#file').click();
$('#file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const value = JSON.parse(await file.text());
    if (!value || !value.id || !value.size || !value.terrain) throw Error('Expected a map JSON record.');
    const index = maps.findIndex(map => map.id === value.id);
    if (index < 0) maps.push(value);
    else maps[index] = value;
    const option = [...$('#map').options].find(item => item.value === value.id);
    if (!option) $('#map').add(new Option(value.name || value.id, value.id));
    $('#map').value = value.id;
    selectMap(value.id);
  } catch (error) {
    $('#validation').textContent = `Import failed: ${error.message}`;
    $('#validation').classList.add('invalid');
  }
  event.target.value = '';
};

mapIndex = await fetch(new URL('index.json', mapsUrl)).then(response => response.json());
maps = await Promise.all(mapIndex.maps.map(id => fetch(new URL(`${id}.json`, mapsUrl)).then(response => response.json())));
for (const map of maps) $('#map').add(new Option(map.name, map.id));
selectMap(maps[0].id);
