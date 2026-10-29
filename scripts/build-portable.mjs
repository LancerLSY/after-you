import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function htmlText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// HTML raw-text end tags are recognized even when they occur in a JS/CSS string.
// Escaping the slash preserves the string value but prevents closing the element.
export function safeInlineScript(source) {
  return source.replace(/<\/script/gi, (match) => match.replace('/', '\\/')).replaceAll('<!--', '<\\!--');
}

function safeInlineStyle(source) {
  return source.replace(/<\/style/gi, (match) => match.replace('/', '\\/'));
}

async function replaceAsync(text, pattern, replacement) {
  let result = ''; let offset = 0;
  for (const match of text.matchAll(pattern)) {
    result += text.slice(offset, match.index) + await replacement(match);
    offset = match.index + match[0].length;
  }
  return result + text.slice(offset);
}

function attributes(tag) {
  const attrs = Object.create(null);
  for (const match of tag.matchAll(/\b([\w-]+)\s*=\s*(["'])(.*?)\2/gs)) attrs[match[1].toLowerCase()] = match[3];
  return attrs;
}

function isLocalBlobVariable(name, source) {
  if (!IDENTIFIER.test(name)) return false;
  const escaped = name.replaceAll('$', '\\$');
  const assignments = [...source.matchAll(new RegExp(`\\b${escaped}\\s*=(?!=)\\s*([^;\\n]+)`, 'g'))];
  const createsBlob = /^URL\.createObjectURL\([A-Za-z_$][\w$]*\)$/;
  return assignments.some((match) => createsBlob.test(match[1].trim()))
    && assignments.every((match) => match[1].trim() === 'null' || createsBlob.test(match[1].trim()));
}

/** This is a deliberately narrow repository packer, not a general JS bundler. */
export async function buildPortable({ distDir = resolve(ROOT, 'dist'), outputPath = resolve(ROOT, 'output/after-you.html') } = {}) {
  const root = await realpath(distDir);
  const assets = new Map();
  const modules = new Map();
  const visiting = new Set();
  const order = [];

  async function localFile(reference) {
    if (!/^(?:\.\/)?[A-Za-z0-9_.\/-]+$/.test(reference) || reference.split('/').includes('..') || isAbsolute(reference)) {
      throw new Error(`Unsupported or nonlocal resource: ${reference}`);
    }
    const path = await realpath(resolve(root, reference));
    const within = relative(root, path);
    if (within.startsWith(`..${sep}`) || within === '..' || isAbsolute(within)) throw new Error(`Resource escapes dist: ${reference}`);
    return path;
  }

  async function dataURL(reference) {
    const path = await localFile(reference);
    if (!assets.has(path)) {
      const mime = MIME[extname(path).toLowerCase()];
      if (!mime) throw new Error(`Unsupported embedded resource type: ${reference}`);
      assets.set(path, `data:${mime};base64,${(await readFile(path)).toString('base64')}`);
    }
    return assets.get(path);
  }

  async function visit(name) {
    if (modules.has(name)) return modules.get(name);
    if (visiting.has(name)) throw new Error(`Circular module dependency: ${name}`);
    if (!/^[A-Za-z0-9_-]+\.js$/.test(name)) throw new Error(`Unsupported module path: ${name}`);
    visiting.add(name);
    let source = await readFile(await localFile(name), 'utf8');
    const imports = [];
    source = source.replace(/^[ \t]*import\s*\{([^}]+)\}\s*from\s*(['"])(\.\/[A-Za-z0-9_-]+\.js)\2\s*;[ \t]*$/gm, (_, list, quote, reference) => {
      const names = list.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
        const parts = item.split(/\s+as\s+/);
        if (parts.length > 2 || !parts.every((part) => IDENTIFIER.test(part))) throw new Error(`Unsupported import binding in ${name}: ${item}`);
        return { imported: parts[0], local: parts[1] || parts[0] };
      });
      if (!names.length) throw new Error(`Empty import in ${name}`);
      imports.push({ dependency: reference.slice(2), names });
      return '';
    });
    // Only the existing import.meta resource expression is supported.
    source = await replaceAsync(source, /new\s+URL\(\s*(['"])(\.\/assets\/[A-Za-z0-9_.-]+)\1\s*,\s*import\.meta\.url\s*\)\.href/g,
      async (match) => JSON.stringify(await dataURL(match[2])));
    const exports = [];
    source = source.replace(/^export\s+(?:(async)\s+)?(function|class|const)\s+([A-Za-z_$][\w$]*)/gm, (_, asyncKeyword, kind, symbol) => {
      if (asyncKeyword && kind !== 'function') throw new Error(`Unsupported async export in ${name}`);
      exports.push(symbol);
      return `${asyncKeyword ? 'async ' : ''}${kind} ${symbol}`;
    });
    // Conservative detection is intentional: unfamiliar ESM is never guessed.
    if (/^\s*(?:import|export)\b/m.test(source) || /\bimport\s*[.(]/.test(source)) throw new Error(`Unsupported import/export syntax in ${name}`);
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\s*(?:\(|\b)/.test(source)) {
      throw new Error(`Unsupported network/worker API in ${name}`);
    }
    if (/\b(?:eval\s*\(|new\s+Function\b)/.test(source)) throw new Error(`Dynamic code execution is not supported: ${name}`);
    const resourceSource = source;
    source = source.replace(/\.(src|srcset|poster)(\s*=\s*)([^;\n]+)/g, (assignment, property, spacing, expression) => {
      const value = expression.trim();
      if (/^["']data:/.test(value)) return assignment;
      if (property === 'src' && isLocalBlobVariable(value, resourceSource)) {
        // The build check recognizes only the existing object-URL lifecycle;
        // the runtime guard also prevents a future reassignment loading a URL.
        return `.${property}${spacing}__portableBlobURL(${value})`;
      }
      throw new Error(`Unembedded runtime resource in ${name}`);
    });

    for (const item of imports) {
      const dependency = await visit(item.dependency);
      for (const binding of item.names) if (!dependency.exports.includes(binding.imported)) {
        throw new Error(`Missing export ${binding.imported} from ${item.dependency}`);
      }
    }
    const bindings = imports.map((item) => `const { ${item.names.map(({ imported, local }) => imported === local ? imported : `${imported}: ${local}`).join(', ')} } = __modules[${JSON.stringify(item.dependency)}];`).join('\n');
    const body = `${bindings}\n${source}\nreturn Object.freeze({ ${exports.join(', ')} });`;
    try { new Script(`(async () => { 'use strict';\n${body}\n})()`, { filename: name }); }
    catch (error) { throw new Error(`Unsupported module syntax in ${name}: ${error.message}`); }
    const module = { exports, body };
    visiting.delete(name);
    modules.set(name, module);
    order.push(name);
    return module;
  }

  await visit('app.js');
  let html = await readFile(await localFile('index.html'), 'utf8');
  if (/<(?:base|iframe|object|embed)\b/i.test(html) || /\bon\w+\s*=/i.test(html)) throw new Error('Unsupported active HTML content.');
  // Social image metadata is not needed in a local download, and contains an
  // external URL. The user-initiated GitHub anchor remains available.
  html = html.replace(/\s*<meta\b[^>]*\bproperty\s*=\s*['"]og:image['"][^>]*>/gi, '');
  const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)];
  if (scripts.length !== 1) throw new Error('Expected exactly one module entry script.');
  const entry = attributes(scripts[0][0]);
  if (entry.type !== 'module' || entry.src !== 'app.js' || !/^<script\b[^>]*>\s*<\/script\s*>$/i.test(scripts[0][0])) {
    throw new Error('Unsupported HTML script entry.');
  }
  const placeholder = '<!-- AFTER-YOU-PORTABLE-SCRIPT -->';
  html = html.replace(scripts[0][0], placeholder);
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  html = html.replace(/<head>/i, `<head>\n  <meta http-equiv="Content-Security-Policy" content="${htmlText(csp)}">`);
  const license = await readFile(await localFile('assets/FONT-LICENSE.txt'), 'utf8');
  html = html.replace(/<\/body>/i, () => `<template id="portable-font-license">${htmlText(license)}</template>\n</body>`);
  html = await replaceAsync(html, /<link\b[^>]*>/gi, async ([tag]) => {
    const attr = attributes(tag);
    if (attr.rel === 'stylesheet' && attr.href) {
      const path = await localFile(attr.href);
      let css = await readFile(path, 'utf8');
      if (/@import\b|expression\s*\(/i.test(css)) throw new Error('Unsupported external/dynamic CSS.');
      css = await replaceAsync(css, /url\(\s*(?:(["'])(.*?)\1|([^\s)]+))\s*\)/gi,
        async (match) => `url("${await dataURL(match[2] || match[3])}")`);
      return `<style data-portable-source="${htmlText(attr.href)}">${safeInlineStyle(css)}</style>`;
    }
    if (attr.rel === 'icon' && attr.href) return `<link rel="icon" href="${await dataURL(attr.href)}" type="${htmlText(attr.type || 'image/svg+xml')}">`;
    throw new Error(`Unsupported resource link: ${tag}`);
  });
  // All currently supported automatic HTML resources are handled above. New
  // image/media/source/srcset forms must be reviewed rather than left external.
  if (/<[^>]+\b(?:src|srcset|poster)\s*=/i.test(html)) throw new Error('Unembedded HTML resource attribute.');

  const bundled = `/* AFTER YOU portable edition; readable modules, no runtime dependencies. */\n(async () => {\n'use strict';\nconst __modules = Object.create(null);\nfunction __portableBlobURL(value) { if (typeof value !== 'string' || !value.startsWith('blob:')) throw new Error('The offline preview requires a local Blob URL.'); return value; }\n${order.map((name) => `// ${name}\n__modules[${JSON.stringify(name)}] = await (async () => {\n${modules.get(name).body}\n})();`).join('\n')}\nconst home = document.querySelector('.brand');\nif (home) { const localHome = new URL(location.href); localHome.search = ''; localHome.hash = ''; home.href = localHome.href; }\n})().catch((error) => { console.error(error); const status = document.getElementById('status'); if (status) status.textContent = 'The offline game could not start. Please reopen the file.'; });`;
  const safeScript = safeInlineScript(bundled);
  new Script(safeScript, { filename: 'after-you-portable.js' });
  html = html.replace(placeholder, () => `<script>${safeScript}</script>`);
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html);
  return { path: destination, bytes: Buffer.byteLength(html), modules: order, embeddedResources: assets.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 3 || process.argv[2]?.startsWith('-')) {
    console.error('Usage: node scripts/build-portable.mjs [output.html]');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await buildPortable({ outputPath: process.argv[2] || resolve(ROOT, 'output/after-you.html') }), null, 2)); }
    catch (error) { console.error(`Portable build failed: ${error.message}`); process.exitCode = 1; }
  }
}
