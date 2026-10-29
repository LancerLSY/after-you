import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { buildPortable } from '../scripts/build-portable.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = '<!doctype html><html><head><link rel="stylesheet" href="style.css"><link rel="icon" href="assets/icon.svg" type="image/svg+xml"></head><body><a class="brand" href="./">Home</a><script type="module" src="app.js"></script></body></html>';

async function fixture(t, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'after-you-portable-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  const source = {
    'index.html': HTML,
    'style.css': "body{background:url('assets/arena.png')}@font-face{font-family:Test;src:url('assets/test.ttf')}",
    'assets/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'assets/arena.png': Buffer.from([137, 80, 78, 71]),
    'assets/test.ttf': Buffer.from([0, 1, 0, 0]),
    'assets/FONT-LICENSE.txt': 'Test font license <do not execute> & preserve $& verbatim.',
    'app.js': "globalThis.fixtureStarted = true;\nawait Promise.resolve();",
    ...files,
  };
  for (const [name, content] of Object.entries(source)) {
    await mkdir(dirname(join(dist, name)), { recursive: true });
    await writeFile(join(dist, name), content);
  }
  return { root, distDir: dist, outputPath: join(root, 'packed.html') };
}

function inlineScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  return scripts[0][1];
}

async function execute(html) {
  const errors = [];
  const home = {};
  const context = { URL, Blob, location: { href: 'file:///tmp/after-you.html?seed=demo#boss=abc' },
    document: { querySelector: () => home, getElementById: () => null },
    console: { error: (error) => errors.push(error) } };
  await new Script(inlineScript(html)).runInNewContext(context);
  assert.deepEqual(errors, []);
  return { context, home };
}

test('current game builds with inline modules, CSS, images and fonts and no automatic external loads', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'after-you-release-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const built = await buildPortable({ outputPath: join(folder, 'offline.html') });
  const html = await readFile(built.path, 'utf8');
  assert.ok(built.bytes > 1_000_000);
  assert.equal(built.bytes, Buffer.byteLength(html));
  assert.ok(built.modules.includes('boss-codec.js'));
  assert.ok(built.modules.indexOf('engine.js') < built.modules.indexOf('app.js'));
  assert.ok(built.embeddedResources >= 4);
  assert.doesNotMatch(html, /<script\b[^>]+\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]+rel="stylesheet"/i);
  assert.doesNotMatch(html, /\bimport\.meta\b/);
  assert.doesNotMatch(inlineScript(html), /^\s*(?:import|export)\s/m);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /data:font\/ttf;base64,/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /id="portable-font-license"/);
  assert.match(html, /SIL OPEN FONT LICENSE/);
  for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const [, reference] of css.matchAll(/url\("([^"]+)"\)/g)) assert.ok(reference.startsWith('data:'), reference);
  }
  new Script(inlineScript(html));
});

test('dependency graph supports new const/class modules, aliases, top-level await and asset URLs', async (t) => {
  const options = await fixture(t, {
    'data.js': 'export const demoReplay = { score: 17 };',
    'clip.js': "export class ReplayClip { source() { return new URL('./assets/arena.png', import.meta.url).href; } }",
    'app.js': "import { demoReplay as replay } from './data.js';\nimport { ReplayClip } from './clip.js';\nawait Promise.resolve();\nglobalThis.fixtureScore = replay.score;\nglobalThis.fixtureImage = new ReplayClip().source();",
  });
  const built = await buildPortable(options);
  assert.deepEqual(built.modules, ['data.js', 'clip.js', 'app.js']);
  const { context, home } = await execute(await readFile(built.path, 'utf8'));
  assert.equal(context.fixtureScore, 17);
  assert.equal(context.fixtureImage, 'data:image/png;base64,iVBORw==');
  assert.equal(home.href, 'file:///tmp/after-you.html');
});

test('script closing strings, HTML comment tokens and replacement metacharacters remain inert data', async (t) => {
  const payload = '</ScRiPt><script>globalThis.injected = true</script><!--<script></body></head>export $&$`$\'';
  const options = await fixture(t, { 'app.js': `globalThis.literal = ${JSON.stringify(payload)};` });
  const built = await buildPortable(options);
  const html = await readFile(built.path, 'utf8');
  const source = inlineScript(html);
  assert.doesNotMatch(source, /<\/script|<!--/i);
  const { context } = await execute(html);
  assert.equal(context.literal, payload);
  assert.equal(context.injected, undefined);
  assert.match(html, /Test font license &lt;do not execute&gt; &amp; preserve \$&amp; verbatim\./);
});

test('CSS end tags cannot close the generated style element', async (t) => {
  const options = await fixture(t, { 'style.css': 'body::after{content:"</style><script>bad()</script>"}' });
  const built = await buildPortable(options);
  const html = await readFile(built.path, 'utf8');
  assert.equal([...html.matchAll(/<\/style>/g)].length, 1);
  assert.match(html, /<\\\/style>/);
  const outsideStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  assert.equal([...outsideStyles.matchAll(/<script>/g)].length, 1);
});

test('unknown imports, exports, dynamic loading and missing exports fail closed', async (t) => {
  for (const app of [
    "import value from './data.js';",
    "import * as data from './data.js';",
    "import './data.js';",
    "import { value } from '../data.js';",
    "import { value } from 'https://example.test/data.js';",
    "await import('./data.js');",
    'export default 1;',
    'export let changing = 1;',
    "fetch('https://example.test/file');",
    "import { absent } from './data.js';",
  ]) {
    const options = await fixture(t, { 'app.js': app, 'data.js': 'export const value = 1;' });
    await assert.rejects(buildPortable(options), /Unsupported|Missing export/);
  }
});

test('circular dependencies and unknown import.meta expressions fail closed', async (t) => {
  const circular = await fixture(t, {
    'app.js': "import { value } from './data.js';\nexport const back = 2;",
    'data.js': "import { back } from './app.js';\nexport const value = back;",
  });
  await assert.rejects(buildPortable(circular), /Circular/);
  const meta = await fixture(t, { 'app.js': 'globalThis.bad = import.meta.url;' });
  await assert.rejects(buildPortable(meta), /Unsupported import/);
  const runtime = await fixture(t, { 'app.js': "const image = new Image(); image.src = 'assets/arena.png';" });
  await assert.rejects(buildPortable(runtime), /Unembedded runtime resource/);
});

test('remote CSS, traversal, symlink escape, and new unembedded HTML resources fail closed', async (t) => {
  for (const css of ["@import 'other.css';", "body{background:url(https://example.test/a.png)}", "body{background:url('../outside.png')}"]) {
    const options = await fixture(t, { 'style.css': css });
    await assert.rejects(buildPortable(options), /Unsupported|nonlocal/);
  }
  const external = await fixture(t, { 'style.css': "body{background:url('assets/escape.png')}" });
  await writeFile(join(external.root, 'outside.png'), 'not-public');
  await symlink(join(external.root, 'outside.png'), join(external.distDir, 'assets/escape.png'));
  await assert.rejects(buildPortable(external), /escapes dist/);
  const extra = await fixture(t, { 'index.html': HTML.replace('<body>', '<body><img src="assets/arena.png">') });
  await assert.rejects(buildPortable(extra), /Unembedded/);
});

test('CLI accepts an absolute output path without depending on the current directory', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'after-you-cli-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const target = join(folder, 'nested', 'portable.html');
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts/build-portable.mjs'), target], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).path, target);
  assert.match(await readFile(target, 'utf8'), /AFTER YOU/);
});

test('a sourceless video can preview an explicitly created local Blob URL', async (t) => {
  const options = await fixture(t, {
    'index.html': HTML.replace('<body>', '<body><video id="clip-preview" controls playsinline preload="metadata"></video>'),
    'app.js': 'const recorded = new Blob(["local video"]);\nlet clipURL = null;\nclipURL = URL.createObjectURL(recorded);\nglobalThis.preview = {};\nglobalThis.preview.src = clipURL;',
  });
  const built = await buildPortable(options);
  const html = await readFile(built.path, 'utf8');
  assert.match(html, /<video id="clip-preview" controls playsinline preload="metadata"><\/video>/);
  assert.match(html, /media-src data: blob:/);
  assert.match(inlineScript(html), /\.src = __portableBlobURL\(clipURL\)/);
  const { context } = await execute(html);
  assert.ok(context.preview.src.startsWith('blob:'));
  URL.revokeObjectURL(context.preview.src);
});

test('video src, source src and poster resources remain rejected, including empty URLs', async (t) => {
  for (const media of [
    '<video src="https://example.test/movie.mp4"></video>',
    '<video src=""></video>',
    '<video poster="assets/arena.png"></video>',
    '<video><source src="https://example.test/movie.webm"></video>',
    '<video><source srcset="movie.webm 1x"></video>',
  ]) {
    const options = await fixture(t, { 'index.html': HTML.replace('<body>', `<body>${media}`) });
    await assert.rejects(buildPortable(options), /Unembedded HTML resource/);
  }
  const reassigned = await fixture(t, {
    'app.js': 'const recorded = new Blob([]);\nlet clipURL = null;\nclipURL = URL.createObjectURL(recorded);\nclipURL = "https://example.test/movie.mp4";\nvideo.src = clipURL;',
  });
  await assert.rejects(buildPortable(reassigned), /Unembedded runtime resource/);
  const arbitrary = await fixture(t, { 'app.js': 'const clipURL = location.hash;\nvideo.src = clipURL;' });
  await assert.rejects(buildPortable(arbitrary), /Unembedded runtime resource/);
});
