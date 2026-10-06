// Optional staged objectives, conditional dialogue choices, keyboard navigation and save reloads for #100.
import {chromium} from 'playwright';
import http from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../dist/', import.meta.url);
const types = {html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml'};
const server = http
  .createServer((request, response) => {
    const name = decodeURIComponent(request.url.split('?')[0].slice(1)) || 'index.html';
    const file = new URL(name, root);
    if (!existsSync(file)) return void response.writeHead(404).end();
    response.writeHead(200, {'content-type': types[name.split('.').pop()] || 'application/octet-stream'}).end(readFileSync(file));
  })
  .listen(0);
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined});
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://localhost:${server.address().port}/?debug`;
  await page.goto(url);
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);

  const interactAt = async (ref, grantSeal = false) =>
    page.evaluate(
      ({ref, grantSeal}) => {
        const state = window.mossvale.getState();
        const object = state.world.objects.find(item => item.ref === ref);
        if (!object) throw new Error(`missing ${ref}`);
        if (grantSeal && !state.save.badges.includes(0)) state.save.badges.push(0);
        Object.assign(state.player, {x: object.x, y: object.y});
        window.mossvale.interact();
      },
      {ref, grantSeal},
    );

  await interactAt('ranger', true);
  await page.locator('#speech-bubble').waitFor({state: 'visible'});
  await page.keyboard.press('Enter');
  await page.locator('#speech-choices').waitFor({state: 'visible'});
  assert.deepEqual(await page.locator('#speech-choices button').evaluateAll(buttons => buttons.map(button => button.dataset.speechChoice)), [
    'ask-about-trail',
    'ask-about-shrine',
  ]);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.speechChoice), 'ask-about-shrine');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#speech-text').textContent.includes('Follow the orchard trail east.'));
  await page.waitForFunction(() => document.querySelector('#coins').textContent === '20');
  await page.keyboard.press('Enter');
  await page.locator('#modal').waitFor({state: 'visible'});
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);
  assert.equal(await page.locator('#coins').textContent(), '20', 'the conditional choice reward survives reload');
  await interactAt('ranger');
  await page.locator('#speech-bubble').waitFor({state: 'visible'});
  await page.keyboard.press('Enter');
  await page.locator('#speech-choices').waitFor({state: 'visible'});
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#speech-text').textContent.includes('Follow the orchard trail east.'));
  assert.equal(await page.locator('#coins').textContent(), '20', 'repeating the conversation never pays twice');
  await page.keyboard.press('Enter');
  await page.locator('#modal').waitFor({state: 'visible'});
  await page.keyboard.press('Escape');

  await page.waitForTimeout(300);
  await interactAt('old-well');
  await page.locator('#speech-bubble').waitFor({state: 'visible'});
  await page.keyboard.press('Enter');
  await page.reload();
  await page.waitForFunction(() => window.mossvale && document.querySelector('#loading').hidden);
  assert.match(await page.locator('#optional-objectives').textContent(), /In progress · Compare it with the trail sign/);
  await interactAt('sign');
  await page.locator('#speech-bubble').waitFor({state: 'visible'});
  await page.waitForFunction(() => document.querySelector('#coins').textContent === '28');
  assert.match(await page.locator('#optional-objectives').textContent(), /Complete · reward claimed/);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await interactAt('sign');
  await page.locator('#speech-bubble').waitFor({state: 'visible'});
  assert.equal(await page.locator('#coins').textContent(), '28', 'revisiting the final stage does not grant its reward twice');
  assert.deepEqual(errors, []);
  console.log('ok conditional speech choices, arrow-key selection, two-stage reload progress and once-only rewards');
} finally {
  await browser.close();
  server.close();
}
