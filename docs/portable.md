# Portable offline edition

Build a self-contained HTML file with Node.js 20 or later:

```sh
node scripts/build-portable.mjs
```

The default output is `output/after-you.html`. Double-click that file to open it in a modern browser; no development server, package installation, or internet connection is needed to play. The generated file can be copied to another computer. Generated output is ignored through `output/.gitignore`.

An explicit output location is useful for browser QA:

```sh
node scripts/build-portable.mjs /absolute/path/after-you.html
```

The script reports its absolute output path, byte count, module order and number of embedded resources. Paths are resolved from the script location, so the command can run from another working directory. It does not publish, upload, or change hosting permissions.

## What is embedded

The packer starts at `dist/app.js`, follows its static dependency graph and wraps each module in a separate readable asynchronous IIFE. Dependency exports are provided through a private namespace map. This produces a classic inline script that can run from `file://` without browser restrictions on external ES modules.

Local CSS, the favicon, arena artwork, character sprites and the font become base64 data URLs. The original font license is retained as escaped text in a hidden template. Modules added to the app, such as the replay-video helper and deterministic demo replay, are included automatically when imported. Art referenced both by CSS and a module may be repeated in the output; the packer favors straightforward self-containment over compression.

The offline document includes a Content Security Policy that forbids network connections and permits only embedded data/blob image, font and media resources. The explicit GitHub link can still open when the user clicks it. Sharing keeps the application's own URL policy; the packer does not replace its logic. The local home link is adjusted to reopen this same HTML file rather than navigate to its containing directory.

A video preview element without `src`, `source` or `poster` resources is supported. After a user records a replay, the app may assign a variable produced by `URL.createObjectURL(blob)` to its `src`; the packer verifies the narrow create/reset lifecycle and adds a runtime `blob:` guard. This permits local preview before the user explicitly downloads it. Static video/source URLs, poster resources, arbitrary source variables and variables reassigned to external URLs still fail the build.

Core gameplay, daily/free/Boss modes, trajectory forging, replay playback, score cards and supported replay-video exports use the same application code as the hosted version. Clipboard access, local storage, audio and video recording remain subject to the browser's `file://` permissions and codec support. Existing application fallbacks remain in place. A share URL may lead to the hosted game when the user chooses to share; merely opening or playing the offline edition makes no network request.

## Supported syntax and failure boundaries

This is a repository-specific packer, not a general JavaScript bundler. It supports the syntax used in this repository:

- Named imports from a same-directory `./name.js` module, including `as` aliases. Each import declaration must occupy its own statement line; the binding list may span lines.
- Named `export function`, `export async function`, `export class`, and single-binding `export const` declarations at the start of a line. Constant object exports such as the demo replay are supported.
- Top-level `await`, run inside the module's asynchronous IIFE.
- Local asset references of the exact form `new URL('./assets/name.ext', import.meta.url).href`.
- The existing `style.css` resource link, ordinary CSS `url(...)` references, favicon link and single `app.js` module entry tag.

Default, namespace, side-effect, re-export, dynamic and outside-directory imports are rejected. Cyclic module dependencies, missing exported bindings, unknown `import.meta` expressions, mutable export forms, unembedded runtime image sources, remote resources, network/worker APIs, `eval`, and dynamic function constructors also fail the build. The conservative checks may reject unfamiliar text or syntax; extend the packer deliberately rather than weakening them to make a build pass.

Resource paths cannot traverse outside `dist`, including through symlinks. Unknown HTML loading elements or resource links require an explicit implementation. Inline JavaScript and CSS closing tags are escaped so string content cannot terminate their containing elements. License text is HTML-escaped. Replacements use callbacks so literal `$&`, `$\`` and `$'` in source data cannot expand as replacement directives.

The IIFE namespace is appropriate for the repository's stable function/class/constant exports. It does not emulate general ESM live bindings, cyclic initialization, or arbitrary module resolution. Do not introduce such semantics without updating this packaging path and its tests.

## Verification

```sh
node --test tests/portable.test.js
```

Static and execution-fixture tests cover the real game build, inline resources, dependency ordering, new class/data modules, aliases, top-level await, exact string preservation, script/style breakout strings, unsafe resource references, path/symlink escapes, unsupported module forms, circular imports, and absolute output paths.

Browser acceptance is a separate step: open the generated file with networking disabled; verify startup, controls, each mode, replay, forging and the share lock, then exercise score-card and supported video downloads. Inspect the network panel for unexpected resource requests. No headless test result is presented as completed browser acceptance.
