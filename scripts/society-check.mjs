import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const context = vm.createContext({ window: {} });
for (const name of ['terrain', 'society', 'warfare', 'logistics', 'minerals', 'economy', 'politics', 'territory', 'nations', 'engine']) {
  vm.runInContext(await readFile(new URL(`../${name}.js`, import.meta.url), 'utf8'), context);
}
const E = context.window.CivilEngine, S = context.window.CivilSociety;
const plain = value => JSON.parse(JSON.stringify(value));
const villageTemplate = E.create(48271, '溪岸');
const cityTemplate = E.create(48271, '溪岸', 'city');
const village = () => E.initialize(plain(villageTemplate));
const city = (currency = false) => {
  const state = E.initialize(plain(cityTemplate));
  // Explicit legacy barter fixture preserves tests of pre-currency institutions.
  if(!currency){state.currency.adopted=false;state.resources.treasury=0;for(const key of Object.keys(state.taxation.rates))state.taxation.rates[key]=0;}
  return state;
};
let serial = 0, passed = 0;
function complete(state, type, size = 1) {
  state.buildings.push({ id: `society-fixture-${++serial}`, type, size, x: 2380, y: 2100, settlementId: 'home', status: 'complete', progress: 100 });
}
function close(actual, expected, message, epsilon = 1e-7) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} != ${expected}`);
}
function check(name, run) {
  run(); passed++; console.log(`✓ ${name}`);
}
const taxLine = (state, id) => S.taxQuote(state).lines.find(line => line.id === id);

check('village and legacy barter saves retain physical exchange until currency adoption', () => {
  for (const state of [village(), city()]) {
    assert.equal(E.hasCurrency(state), false);
    assert.equal(S.taxOptions(state).length, 0);
    assert.equal(S.taxQuote(state).total, 0);
    E.tick(state, 1);
    assert.equal(state.resources.treasury, 0);
    assert.equal(E.hasCurrency(state), false);
  }
  const state = city();
  assert.ok(state.settlements.length >= 2);
  assert.ok(state.settlements.every(settlement => settlement.population >= 2400));
  assert.ok(state.neighbors.length >= 2);
  assert.ok(state.nobles.influence > 0 && state.nobles.landShare > 0);
  assert.equal(S.nobleOptions(village()).length, 0);
  assert.ok(E.stats(state).housing > state.population);
  assert.ok(E.stats(state).foodProduction > E.stats(state).foodConsumption);
  assert.ok(E.introduceCurrency(state).ok);
  assert.equal(S.taxQuote(state).total, 0, 'currency adoption must not automatically select a tax');
});

check('tax definitions remain hidden until their specific administration and production exist', () => {
  const state = village();
  state.currency.adopted = true;
  assert.equal(S.taxOptions(state).length, 0);
  complete(state, 'council');
  assert.deepEqual(plain(S.taxOptions(state).map(option => option.id)), ['poll']);
  complete(state, 'market');
  assert.ok(S.taxOptions(state).some(option => option.id === 'domestic'));
  assert.ok(!S.taxOptions(state).some(option => option.id === 'customs'));
  const medieval = city(true);
  assert.deepEqual(plain(S.taxOptions(medieval).map(option => option.id)), ['poll', 'land', 'domestic', 'customs']);
  medieval.knowledge = 300;
  complete(medieval, 'taxoffice');
  assert.ok(!S.taxOptions(medieval).some(option => option.id === 'vat'));
  medieval.industrialized = true;
  assert.ok(S.taxOptions(medieval).some(option => option.id === 'vat'));
  medieval.knowledge = 239;
  assert.ok(!S.taxOptions(medieval).some(option => option.id === 'vat'));
});

check('population, agricultural land, transactions and actual border trade have distinct tax bases', () => {
  const state = city(true);
  for (const id of ['poll', 'land', 'domestic', 'customs']) assert.ok(S.setTax(state, id, .1).ok);
  const before = Object.fromEntries(S.taxQuote(state).lines.map(line => [line.id, line.base]));
  complete(state, 'estate');
  assert.ok(taxLine(state, 'land').base > before.land);
  close(taxLine(state, 'poll').base, before.poll, 'farmland must not create taxpayers');
  const domesticBefore = taxLine(state, 'domestic').base;
  complete(state, 'market');
  assert.ok(taxLine(state, 'domestic').base > domesticBefore);
  close(taxLine(state, 'poll').base, before.poll, 'market must not create taxpayers');
  assert.equal(taxLine(state, 'customs').revenue, 0, 'contact without trade cannot produce tariffs');
  const peopleBefore = taxLine(state, 'poll').base;
  state.population += 500; state.settlements[0].population += 500;
  assert.ok(taxLine(state, 'poll').base > peopleBefore);
});

check('quotes and reports do not collect money; an engine update collects each tax exactly once', () => {
  const state = city(true);
  state.neighbors = [];
  assert.ok(S.setTax(state, 'poll', .08).ok);
  assert.ok(S.setTax(state, 'land', .1).ok);
  const before = state.resources.treasury;
  const domesticRate = E.stats(state).domesticTreasuryRate;
  for (let index = 0; index < 6; index++) { E.stats(state); S.taxQuote(state); S.cultureSummary(state); }
  assert.equal(state.resources.treasury, before);
  E.tick(state, .25);
  close(state.resources.treasury - before, domesticRate * .25 + state.taxation.last.collected, 'single collection');
  close(state.taxation.last.collected, state.taxation.last.total * .25, 'recorded collection');
  assert.ok(state.taxation.last.total > 0);
  close(E.stats(state).taxRevenue, S.taxQuote(state).total, 'report tax revenue');
});

check('tariffs follow actual trade, reduce trade incentives and stop when routes close', () => {
  const untaxed = city(true), taxed = city(true);
  for (const state of [untaxed, taxed]) assert.ok(E.foreignAction(state, state.neighbors[0].id, 'trade').ok);
  assert.ok(S.setTax(taxed, 'customs', .2).ok);
  assert.equal(taxLine(taxed, 'customs').revenue, 0);
  const before = taxed.resources.treasury, domestic = E.stats(taxed).domesticTreasuryRate;
  E.tick(untaxed, .25); E.tick(taxed, .25);
  const flow = taxed.neighbors[0].tradeLast;
  assert.ok(flow.imported > 0 && flow.exported > 0);
  assert.ok(flow.imported < untaxed.neighbors[0].tradeLast.imported);
  close(taxLine(taxed, 'customs').revenue, flow.imported * .2, 'tariff base');
  close(flow.tariff, taxLine(taxed, 'customs').revenue, 'diplomacy tariff report');
  close(taxed.resources.treasury - before, domestic * .25 + taxed.taxation.last.collected + taxed.neighbors[0].tradeLast.treasuryRate * .25, 'taxes and paid trade settle exactly once');
  assert.ok(E.foreignAction(taxed, taxed.neighbors[0].id, 'trade').ok);
  E.tick(taxed, .25);
  assert.equal(taxLine(taxed, 'customs').revenue, 0);
  assert.equal(taxed.neighbors[0].tradeLast.tariff, 0);
});

check('tax burden affects production, confidence and privileged exemptions', () => {
  const state = city(true), before = E.stats(state), trust = state.stability;
  for (const id of ['poll', 'land', 'domestic']) assert.ok(S.setTax(state, id, .18).ok);
  assert.ok(E.stats(state).foodProduction < before.foodProduction);
  assert.ok(E.stats(state).woodProduction < before.woodProduction);
  assert.ok(state.stability < trust);
  const revenue = S.taxQuote(state).total, nobleSupport = state.nobles.support;
  assert.ok(S.setExemption(state, 'nobles', false).ok);
  assert.ok(S.taxQuote(state).total > revenue);
  assert.ok(state.nobles.support < nobleSupport);
  const church = state.culture.organizations.find(organization => organization.id === 'clergy');
  const churchSupport = church.support, beforeClergy = S.taxQuote(state).total;
  assert.ok(S.setExemption(state, 'clergy', false).ok);
  assert.ok(S.taxQuote(state).total > beforeClergy);
  assert.ok(church.support < churchSupport);
  const unchanged = plain(state.resources);
  for (const [id, rate] of [['poll', NaN], ['poll', -.1], ['poll', 1], ['future', .1]]) assert.equal(S.setTax(state, id, rate).ok, false);
  assert.equal(S.setExemption(state, 'unknown', false).ok, false);
  assert.deepEqual(plain(state.resources), unchanged);
});

check('empty populations, starvation and idle borders cannot generate tax revenue', () => {
  const state = city(true);
  for (const id of ['poll', 'land', 'domestic', 'customs']) assert.ok(S.setTax(state, id, .1).ok);
  state.resources.food = 0;
  assert.equal(S.taxQuote(state).total, 0);
  state.resources.food = 10000; state.population = 0;
  state.settlements.forEach(settlement => { settlement.population = 0; });
  assert.equal(S.taxQuote(state).total, 0);
  const treasury = state.resources.treasury;
  S.tick(state, 1);
  assert.equal(state.resources.treasury, treasury);
  assert.ok(S.taxQuote(state).lines.every(line => line.base === 0 && line.revenue === 0));
});

check('religious institutions provide gradual change and never expose future secular reforms', () => {
  const early = village(), state = city();
  assert.ok(!S.cultureOptions(early).actions.some(action => action.id === 'statefaith'));
  assert.ok(!S.cultureOptions(state).actions.some(action => action.id === 'secular'));
  assert.equal(S.cultureAction(state, 'secular').ok, false);
  const initialFaith = plain(state.culture.regions.home.faith);
  const influence = S.cultureSummary(state).clergyInfluence;
  const food = state.resources.food;
  assert.ok(S.cultureAction(state, 'statefaith').ok);
  assert.ok(state.resources.food < food, 'pre-currency reforms consume physical resources');
  assert.deepEqual(plain(state.culture.regions.home.faith), initialFaith);
  close(S.cultureSummary(state).clergyInfluence, influence, 'institutional influence is gradual');
  E.tick(state, 1);
  assert.ok(state.culture.regions.home.faith.organized > initialFaith.organized);
  assert.ok(state.culture.regions.home.faith.organized < 85);
  assert.ok(S.cultureSummary(state).transition.progress > 0 && S.cultureSummary(state).transition.progress < 100);
  complete(state, 'publicschool'); state.industrialized = true;
  assert.ok(S.cultureOptions(state).actions.some(action => action.id === 'secular'));
});

check('regional festivals cost resources, develop cohesion and cannot be repeatedly stacked', () => {
  const control = city(), state = city(), target = state.settlements[1].id;
  const before = state.resources.food;
  assert.ok(S.cultureAction(state, 'festival', target).ok);
  assert.ok(state.resources.food < before);
  assert.equal(S.cultureAction(state, 'festival', target).ok, false);
  assert.equal(S.cultureAction(state, 'festival', 'missing').ok, false);
  E.tick(state, 1); E.tick(control, 1);
  assert.ok(state.culture.regions[target].cohesion > control.culture.regions[target].cohesion);
  // National confidence can carry a tiny secondary effect to other regions.
  close(state.culture.regions.home.cohesion, control.culture.regions.home.cohesion, 'untargeted region', .001);
  const empty = city(); empty.resources = {...empty.resources, food: 0, wood: 0, stone: 0, treasury: 0 };
  const resources = plain(empty.resources);
  assert.equal(S.cultureAction(empty, 'festival').ok, false);
  assert.deepEqual(plain(empty.resources), resources);
});

check('cultural diversity itself adds no instability and faith shares remain normalized', () => {
  const uniform = city(), diverse = city();
  for (const settlement of diverse.settlements) {
    uniform.culture.regions[settlement.id].faith = { local: 0, organized: 100, secular: 0 };
    diverse.culture.regions[settlement.id].faith = { local: 30, organized: 50, secular: 20 };
  }
  E.tick(uniform, 2); E.tick(diverse, 2);
  close(S.cultureSummary(uniform).cohesion, S.cultureSummary(diverse).cohesion, 'tolerated diversity');
  close(uniform.stability, diverse.stability, 'tolerated beliefs');
  assert.ok(S.cultureAction(diverse, 'restrictive').ok);
  E.tick(diverse, 3);
  for (const region of Object.values(diverse.culture.regions)) {
    close(Object.values(region.faith).reduce((sum, share) => sum + share, 0), 100, 'faith shares');
    assert.ok(Object.values(region.faith).every(share => share >= 0 && share <= 100));
  }
  const support = S.cultureSummary(diverse).warSupport;
  assert.ok(support >= 0 && support <= 100);
});

check('noble charters consume resources and political support before privileges gradually change', () => {
  const state = city(), beforeFood = state.resources.food, beforeSupport = state.nobles.support, beforeInfluence = state.nobles.influence;
  assert.ok(S.nobleAction(state, 'charter').ok);
  assert.ok(state.resources.food < beforeFood);
  assert.ok(state.nobles.support < beforeSupport);
  assert.equal(state.nobles.influence, beforeInfluence);
  const duration = state.nobles.reform.years;
  assert.equal(S.nobleAction(state, 'charter').ok, false);
  assert.equal(S.nobleAction(state, 'privileges').ok, false);
  E.tick(state, duration / 2);
  assert.ok(state.nobles.influence < beforeInfluence);
  assert.ok(state.nobles.reform.progress >= 49 && state.nobles.reform.progress <= 51);
  assert.equal(state.nobles.privilege, 'estates');
  E.tick(state, duration / 2 + .25);
  assert.equal(state.nobles.reform, null);
  assert.equal(state.nobles.privilege, 'limited');
  assert.ok(state.history.some(item => item.title === '领地宪章落实'));
  const supported = city();
  assert.ok(S.nobleAction(supported, 'service').ok);
  assert.equal(S.nobleAction(supported, 'service').ok, false);
});

check('new society state migrates legacy saves once and preserves ongoing work on re-entry', () => {
  const state = city(true);
  delete state.taxation; delete state.culture; delete state.nobles;
  state.budget.taxRate = .12;
  E.initialize(state);
  close(state.taxation.rates.poll, .12, 'legacy poll tax');
  state.resources.treasury = 2000;
  assert.ok(S.cultureAction(state, 'festival', 'home').ok);
  assert.ok(S.nobleAction(state, 'charter').ok);
  E.tick(state, 1);
  const expected = plain({ taxation: state.taxation, culture: state.culture, nobles: state.nobles });
  const restored = E.initialize(plain(state));
  for (let index = 0; index < 4; index++) E.initialize(restored);
  assert.deepEqual(plain(restored.taxation), expected.taxation);
  assert.deepEqual(plain(restored.nobles), expected.nobles);
  assert.equal(restored.culture.cooldowns['festival:home'], expected.culture.cooldowns['festival:home']);
  assert.equal(restored.culture.organizations.length, expected.culture.organizations.length);
  E.tick(restored, 1);
  assert.ok(restored.nobles.reform.progress > expected.nobles.reform.progress);
  assert.ok(Number.isFinite(E.stats(restored).treasuryRate));
});

console.log(`${passed} society integration checks passed.`);
