#!/usr/bin/env node
/**
 * Small, dependency-free QA helper for an isolated Chrome DevTools session.
 * Node 22+ is required for the built-in WebSocket client.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaults = {
  port: 9333,
  url: 'http://127.0.0.1:4173/',
  timeout: 12000,
  wait: 350,
};

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function connectPage(options = {}) {
  const config = { ...defaults, ...options };
  if (typeof WebSocket !== 'function') {
    throw new Error('This helper needs Node 22+ with a built-in WebSocket client.');
  }
  const response = await fetch(`http://127.0.0.1:${config.port}/json/list`, {
    signal: AbortSignal.timeout(config.timeout),
  });
  if (!response.ok) throw new Error(`Chrome target discovery failed: HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find((item) => item.type === 'page' && item.url.startsWith(config.url));
  if (!target) {
    throw new Error(`No isolated Chrome page matches ${config.url}. Open that address in the headless session first.`);
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  const errors = [];
  let sequence = 0;
  let closed = false;

  function rejectPending(error) {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  }

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result || {});
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      errors.push(message.params.entry);
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params);
  });
  socket.addEventListener('close', () => {
    closed = true;
    rejectPending(new Error('Chrome DevTools connection closed.'));
  });
  socket.addEventListener('error', () => rejectPending(new Error('Chrome DevTools WebSocket failed.')));

  await new Promise((resolveOpen, rejectOpen) => {
    const timer = setTimeout(() => rejectOpen(new Error('Timed out connecting to Chrome.')), config.timeout);
    socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); rejectOpen(new Error('Could not connect to Chrome.')); }, { once: true });
  });

  function send(method, params = {}) {
    if (closed) return Promise.reject(new Error('Chrome DevTools connection is closed.'));
    return new Promise((resolveCommand, rejectCommand) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectCommand(new Error(`${method} timed out after ${config.timeout}ms.`));
      }, config.timeout);
      pending.set(id, { method, timer, resolve: resolveCommand, reject: rejectCommand });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    const value = result.result;
    if (value.subtype === 'error') throw new Error(value.description);
    return Object.hasOwn(value, 'value') ? value.value : value.unserializableValue || value.description || null;
  }

  async function waitForReady() {
    const deadline = Date.now() + config.timeout;
    while (Date.now() < deadline) {
      try {
        if (await evaluate('document.readyState === "complete"')) return;
      } catch (error) {
        if (!/context|navigat/i.test(error.message)) throw error;
      }
      await delay(80);
    }
    throw new Error('Page did not finish loading.');
  }

  await Promise.all([send('Runtime.enable'), send('Page.enable'), send('Log.enable')]);
  return {
    config,
    target,
    errors,
    send,
    evaluate,
    waitForReady,
    async viewport(width, height) {
      if (![width, height].every((value) => Number.isInteger(value) && value >= 200 && value <= 10000)) {
        throw new Error('Viewport width and height must be integers from 200 to 10000.');
      }
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await delay(config.wait);
      return evaluate('({ width: innerWidth, height: innerHeight, devicePixelRatio })');
    },
    async reload() {
      errors.length = 0;
      const loaded = new Promise((resolveLoaded, rejectLoaded) => {
        const timer = setTimeout(() => {
          listeners.delete('Page.loadEventFired');
          rejectLoaded(new Error('Timed out waiting for page reload.'));
        }, config.timeout);
        listeners.set('Page.loadEventFired', [() => {
          clearTimeout(timer);
          listeners.delete('Page.loadEventFired');
          resolveLoaded();
        }]);
      });
      await send('Page.reload', { ignoreCache: true });
      await loaded;
      await waitForReady();
      await delay(config.wait);
    },
    async screenshot(output = 'artifacts/browser.png') {
      const image = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        fromSurface: true,
      });
      const outputPath = resolve(output);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from(image.data, 'base64'));
      return outputPath;
    },
    close() { socket.close(); },
  };
}

export async function readPageStatus(browser) {
  const [page, http] = await Promise.all([
    browser.evaluate(`({
      title: document.title,
      url: location.href,
      ready: document.readyState,
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      canvas: document.querySelectorAll('canvas').length,
      buttons: document.querySelectorAll('button').length,
      body: document.body.innerText.slice(0, 1200)
    })`),
    fetch(browser.config.url, { signal: AbortSignal.timeout(browser.config.timeout) })
      .then((response) => ({ status: response.status, contentType: response.headers.get('content-type') })),
  ]);
  return { http, page, errors: browser.errors };
}

function help() {
  console.log(`Usage: node scripts/browser-check.mjs [options] <command> [arguments]

Commands:
  status                        Read DOM, viewport, HTTP status and observed errors
  evaluate '<expression>'       Evaluate a page expression; promises are supported
  screenshot [output.png]        Save a page screenshot (default artifacts/browser.png)
  viewport <width> <height>      Set an exact viewport size
  reload                        Reload without cache, then print status and errors

Options (before command):
  --port <number>                DevTools port (default 9333)
  --url <url>                    Page target URL (default http://127.0.0.1:4173/)
  --timeout <milliseconds>       Command timeout (default 12000)
  --wait <milliseconds>          Settling time after viewport/reload (default 350)

For the current Mac environment, run Node through VS Code:
  ELECTRON_RUN_AS_NODE=1 '/Applications/Visual Studio Code.app/Contents/MacOS/Code' scripts/browser-check.mjs status`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  while (args[0]?.startsWith('--') && args[0] !== '--help') {
    const key = args.shift().slice(2);
    if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown option --${key}`);
    const value = args.shift();
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    options[key] = key === 'url' ? value : Number(value);
    if (key !== 'url' && (!Number.isFinite(options[key]) || options[key] < 0)) throw new Error(`Invalid --${key} value.`);
  }
  const command = args.shift() || 'status';
  if (command === '--help' || command === 'help') return help();
  if (!['status', 'evaluate', 'eval', 'screenshot', 'viewport', 'reload'].includes(command)) {
    throw new Error(`Unknown command ${command}. Use --help for usage.`);
  }
  const browser = await connectPage(options);
  try {
    let result;
    if (command === 'evaluate' || command === 'eval') {
      if (!args.length) throw new Error('evaluate needs a JavaScript expression.');
      result = await browser.evaluate(args.join(' '));
    } else if (command === 'screenshot') {
      result = { screenshot: await browser.screenshot(args[0]) };
    } else if (command === 'viewport') {
      result = await browser.viewport(Number(args[0]), Number(args[1]));
    } else {
      if (command === 'reload') await browser.reload();
      result = await readPageStatus(browser);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`browser-check: ${error.message}`);
    process.exitCode = 1;
  });
}
