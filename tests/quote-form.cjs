// Local browser tests only: Formspree is intercepted; no real submissions.
// Run: NODE_PATH=/tmp/doon-form-tests/node_modules node tests/quote-form.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === '/' ? 'index.html' : req.url);
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html'); res.end(fs.readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    let calls = 0;
    await page.route('https://formspree.io/f/mlgozybg', async route => {
      calls++;
      assert.equal(route.request().method(), 'POST');
      assert.equal(route.request().headers().accept, 'application/json');
      assert.match(route.request().postData(), /TEST LOCAL/);
      await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:true})});
    });
    await page.goto(base);
    await page.fill('#name', 'TEST LOCAL');
    await page.fill('#phone', '4036503466');
    await page.selectOption('#type', 'Other');
    await page.click('form.quote button');
    await page.waitForURL(base + '/thank-you.html', {timeout:5000});
    assert.equal(calls, 1);
    console.log('PASS: JSON AJAX success redirects to local thank-you page');
    for (const scenario of ['422', '500', 'network', 'invalid-json', 'unconfirmed']) {
      await page.unroute('https://formspree.io/f/mlgozybg');
      calls = 0;
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      await page.route('https://formspree.io/f/mlgozybg', async route => {
        calls++;
        await pending;
        if (scenario === 'network') return route.abort('failed');
        await route.fulfill({status: /^\d+$/.test(scenario) ? Number(scenario) : 200,
          contentType:'application/json', body: scenario === 'invalid-json' ? '<html>error</html>' : JSON.stringify({ok:false, errors:[{message:'Test rejection'}]})});
      });
      await page.goto(base);
      await page.click('form.quote button');
      assert.equal(calls, 0, 'browser validation prevents empty submissions');
      await page.fill('#name', 'TEST LOCAL');
      await page.fill('#phone', '4036503466');
      await page.fill('#email', 'test@example.com');
      await page.selectOption('#type', 'Other');
      await page.fill('#details', 'Retain these details');
      const before = await page.locator('form.quote').evaluate(f => Object.fromEntries(new FormData(f)));
      assert.equal('_next' in before, false);
      await page.click('form.quote button');
      await page.waitForFunction(() => document.querySelector('form.quote button').disabled);
      await page.locator('form.quote').evaluate(f => {
        f.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
        f.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
      });
      release();
      await page.waitForFunction(() => document.querySelector('#quote-status').textContent.length > 0);
      assert.equal(calls, 1, 'duplicate submissions blocked');
      assert.equal(page.url(), base + '/');
      assert.deepEqual(await page.locator('form.quote').evaluate(f => Object.fromEntries(new FormData(f))), before);
      assert.equal(await page.locator('#quote-status').getAttribute('role'), 'alert');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'quote-status');
      assert.equal(await page.locator('form.quote button').isEnabled(), true);
      assert.equal(await page.locator('form.quote button').textContent(), 'Send Quote Request →');
      console.log(`PASS: ${scenario} stays on form, preserves every field, accessible error, retry enabled, duplicates blocked`);
    }
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
