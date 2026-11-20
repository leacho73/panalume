import test from 'node:test';
import assert from 'node:assert/strict';
import { areaEntityIds, indicatorEntities, indicatorSummary, areaStatusWatch, lightLeaves, defaultIndicators, DEFAULT_INDICATOR_ORDER } from '../src/lib/area-status.js';

const entity = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
const registry = {
  devices: [{ id: 'room-device', area_id: 'room' }],
  entities: [
    { entity_id: 'sensor.temperature', device_id: 'room-device' },
    { entity_id: 'sensor.humidity', area_id: 'room' },
    { entity_id: 'sensor.preferred', area_id: 'room' },
    { entity_id: 'sensor.disabled', area_id: 'room', disabled_by: 'user' },
    { entity_id: 'light.a', area_id: 'room' }, { entity_id: 'light.b', area_id: 'room' },
    { entity_id: 'light.group', area_id: 'room' },
    { entity_id: 'binary_sensor.window', area_id: 'room' },
    { entity_id: 'binary_sensor.motion', area_id: 'room' },
    { entity_id: 'binary_sensor.door', area_id: 'room' },
    { entity_id: 'sensor.other_area', area_id: 'other', device_id: 'room-device' },
  ],
};
const fixture = () => new Map([
  ['sensor.temperature', entity('sensor.temperature', '23.5', { device_class: 'temperature', unit_of_measurement: '°C' })],
  ['sensor.preferred', entity('sensor.preferred', 'unavailable', { device_class: 'temperature' })],
  ['sensor.humidity', entity('sensor.humidity', '48', { device_class: 'humidity' })],
  ['light.a', entity('light.a', 'on')], ['light.b', entity('light.b', 'off')],
  ['light.group', entity('light.group', 'on', { entity_id: ['light.a', 'light.b'] })],
  ['binary_sensor.window', entity('binary_sensor.window', 'on', { device_class: 'window' })],
  ['binary_sensor.door', entity('binary_sensor.door', 'off', { device_class: 'door' })],
  ['binary_sensor.motion', entity('binary_sensor.motion', 'off', { device_class: 'occupancy' })],
]);

test('area uses entity overrides before device areas and skips disabled entities', () => {
  const ids = areaEntityIds('room', registry);
  assert.ok(ids.includes('sensor.temperature'));
  assert.ok(!ids.includes('sensor.other_area'));
  assert.ok(!ids.includes('sensor.disabled'));
  assert.deepEqual(areaEntityIds('', registry), []);
});

test('automatic readings choose an available sensor without averaging; manual choice remains authoritative', () => {
  const states = fixture();
  const item = { kind: 'temperature' };
  assert.deepEqual(indicatorEntities({ area: 'room' }, item, registry, states), ['sensor.temperature']);
  item.entities = ['sensor.preferred', 'sensor.temperature'];
  assert.deepEqual(indicatorEntities({ area: 'room' }, item, registry, states), ['sensor.preferred']);
  assert.equal(indicatorSummary('temperature', ['sensor.preferred'], states).text, 'Unavailable');
});

test('light counts deduplicate groups, members and nested groups; exclusions also apply inside groups', () => {
  const states = fixture();
  states.set('light.nested', entity('light.nested', 'on', { entity_id: ['light.group', 'light.a'] }));
  const ids = lightLeaves(['light.nested', 'light.a', 'light.b'], states);
  assert.deepEqual(ids.sort(), ['light.a', 'light.b']);
  assert.equal(indicatorSummary('lights', ids, states).text, '1 on');
  assert.deepEqual(lightLeaves(['light.group'], states, ['light.a']), ['light.b']);
  assert.deepEqual(indicatorEntities({ area: 'room' }, { kind: 'lights' }, registry, states).sort(), ['light.a', 'light.b']);
});

test('cyclic light groups cannot recurse forever or create duplicate lights', () => {
  const states = fixture();
  states.set('light.loop', entity('light.loop', 'on', { entity_id: ['light.loop', 'light.a'] }));
  assert.deepEqual(lightLeaves(['light.loop'], states), ['light.a']);
});

test('windows, doors and occupancy are separated and reflect live state changes', () => {
  const states = fixture(), props = { area: 'room' };
  const windows = indicatorEntities(props, { kind: 'windows' }, registry, states);
  assert.deepEqual(windows, ['binary_sensor.window']);
  assert.equal(indicatorSummary('windows', windows, states).text, '1 open');
  assert.equal(indicatorSummary('doors', ['binary_sensor.door'], states).text, 'Closed');
  assert.equal(indicatorSummary('motion', ['binary_sensor.motion'], states).text, 'Clear');
  states.set('binary_sensor.motion', entity('binary_sensor.motion', 'on', { device_class: 'occupancy' }));
  assert.equal(indicatorSummary('motion', ['binary_sensor.motion'], states).active, true);
});

test('missing data is never shown as closed, clear or zero lights on', () => {
  const states = fixture();
  for (const kind of ['lights', 'windows', 'motion']) {
    assert.equal(indicatorSummary(kind, ['missing.entity'], states).text, 'Unavailable');
    assert.equal(indicatorSummary(kind, [], states).text, '—');
  }
  assert.equal(indicatorSummary('lights', ['light.a', 'light.missing'], states).text, '1 on · 1 unavailable');
  assert.equal(indicatorSummary('windows', ['binary_sensor.door', 'binary_sensor.missing'], states).text, '0 open · 1 unavailable');
  assert.equal(indicatorSummary('motion', ['binary_sensor.motion', 'binary_sensor.missing'], states).text, '0 detected · 1 unavailable');
});

test('manual entities and exclusions work without any area registry', () => {
  const states = fixture();
  assert.deepEqual(indicatorEntities({}, { kind: 'windows', entities: ['binary_sensor.window'], excluded: ['binary_sensor.window'] }, {}, states), []);
  assert.deepEqual(indicatorEntities({}, { kind: 'entity', entities: ['sensor.humidity'] }, {}, states), ['sensor.humidity']);
});

test('filtered subscriptions include area entities, manual overrides and nested group members', () => {
  const states = fixture();
  states.set('light.b', entity('light.b', 'on', { entity_id: ['light.deep'] }));
  const ids = areaStatusWatch({ area: 'room', indicators: [{ entities: ['sensor.manual'] }] }, registry, states);
  assert.ok(ids.includes('sensor.temperature'));
  assert.ok(ids.includes('sensor.manual'));
  assert.ok(ids.includes('light.deep'));
  assert.ok(!ids.includes('sensor.other_area'));
  states.set('light.deep', entity('light.deep', 'on', { entity_id: ['light.last'] }));
  const nested = areaStatusWatch({ indicators: [{ entities: ['light.b'] }] }, {}, states);
  assert.deepEqual(nested.sort(), ['light.b', 'light.deep', 'light.last']);
});

test('indicator order and visibility belong to each card instance', () => {
  const first = defaultIndicators(), second = defaultIndicators();
  first.reverse(); first[0].enabled = false;
  assert.equal(second[0].kind, 'lights');
  assert.equal(second.at(-1).enabled, true);
  assert.equal(first[0].kind, 'smoke');
});

test('hidden and disabled entities are excluded from automatic and explicit selections', () => {
  const states = fixture();
  for (const flag of ['hidden_by', 'disabled_by']) {
    for (const source of ['user', 'integration']) {
      const reg = structuredClone(registry);
      reg.entities.find((e) => e.entity_id === 'sensor.temperature')[flag] = source;
      reg.entities.find((e) => e.entity_id === 'binary_sensor.window')[flag] = source;
      assert.ok(!areaEntityIds('room', reg).includes('sensor.temperature'));
      assert.deepEqual(indicatorEntities({}, { kind: 'temperature', entities: ['sensor.temperature'] }, reg, states), []);
      assert.deepEqual(indicatorEntities({ area: 'room' }, { kind: 'windows' }, reg, states), []);
      assert.ok(!areaStatusWatch({ area: 'room', indicators: [{ entities: ['sensor.temperature', 'binary_sensor.window'] }] }, reg, states).includes('sensor.temperature'));
    }
  }
});

test('light groups never reintroduce hidden members or hidden nested groups', () => {
  const states = fixture(), reg = structuredClone(registry);
  reg.entities.find((e) => e.entity_id === 'light.a').hidden_by = 'user';
  assert.deepEqual(indicatorEntities({ area: 'room' }, { kind: 'lights' }, reg, states), ['light.b']);
  assert.equal(indicatorSummary('lights', ['light.b'], states).text, '0 on');
  assert.ok(!areaStatusWatch({ area: 'room' }, reg, states).includes('light.a'));
  reg.entities.find((e) => e.entity_id === 'light.group').hidden_by = 'integration';
  states.set('light.outer', entity('light.outer', 'on', { entity_id: ['light.group'] }));
  assert.deepEqual(indicatorEntities({}, { kind: 'lights', entities: ['light.outer'] }, reg, states), []);
});

test('manual selections wait for registry visibility metadata to load', () => {
  assert.deepEqual(indicatorEntities({}, { kind: 'entity', entities: ['sensor.temperature'] }, { ready: false }, fixture()), []);
});

test('new defaults put lights and covers before all sensor indicators', () => {
  assert.deepEqual(defaultIndicators().map((i) => i.kind), DEFAULT_INDICATOR_ORDER);
  assert.deepEqual(DEFAULT_INDICATOR_ORDER.slice(0, 2), ['lights', 'covers']);
  for (const kind of ['illuminance', 'smoke', 'doors']) assert.ok(DEFAULT_INDICATOR_ORDER.includes(kind));
});

test('illuminance, smoke, doors and covers are detected automatically by domain and class', () => {
  const states = fixture(), reg = structuredClone(registry);
  const samples = [entity('sensor.lux', '125', { device_class: 'illuminance', unit_of_measurement: 'lx' }), entity('binary_sensor.smoke', 'on', { device_class: 'smoke' }), entity('cover.blind', 'open')];
  for (const e of samples) { states.set(e.entity_id, e); reg.entities.push({ entity_id: e.entity_id, area_id: 'room' }); }
  for (const [kind, id] of [['illuminance', 'sensor.lux'], ['smoke', 'binary_sensor.smoke'], ['doors', 'binary_sensor.door'], ['covers', 'cover.blind']]) {
    assert.deepEqual(indicatorEntities({ area: 'room' }, { kind }, reg, states), [id]);
    reg.entities.find((e) => e.entity_id === id).hidden_by = 'user';
    assert.deepEqual(indicatorEntities({ area: 'room' }, { kind }, reg, states), []);
  }
  assert.equal(indicatorSummary('illuminance', ['sensor.lux'], states).entity.attributes.unit_of_measurement, 'lx');
  assert.equal(indicatorSummary('smoke', ['binary_sensor.smoke'], states).text, 'Detected');
});

test('covers deduplicate groups and report moving, closed and unavailable states', () => {
  const states = new Map([['cover.a', entity('cover.a', 'open')], ['cover.b', entity('cover.b', 'opening')], ['cover.group', entity('cover.group', 'open', { entity_id: ['cover.a', 'cover.b'] })]]);
  const ids = indicatorEntities({}, { kind: 'covers', entities: ['cover.group', 'cover.a'] }, {}, states);
  assert.deepEqual(ids, ['cover.a', 'cover.b']);
  assert.equal(indicatorSummary('covers', ids, states).text, '1 open · 1 moving');
  states.set('cover.a', entity('cover.a', 'closed')); states.set('cover.b', entity('cover.b', 'closed'));
  assert.equal(indicatorSummary('covers', ids, states).text, 'Closed');
  assert.equal(indicatorSummary('covers', ['cover.missing'], states).text, 'Unavailable');
  assert.ok(areaStatusWatch({ indicators: [{ entities: ['cover.group'] }] }, {}, states).includes('cover.b'));
});
