'use strict';

// Identité v1.0.2 : icônes, tokens, usage du rouge, textes du manifest et pied de page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const LOCALES = ['en', 'fr', 'es', 'pt_BR', 'pt_PT', 'it', 'de', 'nl'];
const messages = (locale) => JSON.parse(read(`_locales/${locale}/messages.json`));

// --- PNG (RGBA 8 bits) décodé en Node standard ------------------------------------------------------------
function decodePng(file) {
  const data = fs.readFileSync(path.join(root, file));
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString('ascii', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
    }
    if (type === 'IDAT') idat.push(body);
    pos += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  return { width, height, colorType, alpha: (x, y) => (colorType === 6 ? pixels[(y * width + x) * 4 + 3] : 255) };
}

test('icônes : 16, 32, 48, 128 en RGBA, déclarées dans manifest.icons et action.default_icon', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const expected = { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' };
  assert.deepEqual(manifest.icons, expected);
  assert.deepEqual(manifest.action.default_icon, expected);
  for (const [size, file] of Object.entries(expected)) {
    const png = decodePng(file);
    assert.equal(png.width, Number(size), file);
    assert.equal(png.height, Number(size), file);
    assert.equal(png.colorType, 6, `${file} doit avoir un canal alpha`);
  }
});

test('icône 128 : 96 px de dessin + 16 px de marge transparente', () => {
  const png = decodePng('icons/128.png');
  let minX = 128;
  let minY = 128;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      if (png.alpha(x, y) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert.deepEqual([minX, minY, maxX, maxY], [16, 16, 111, 111]);
  assert.equal(png.alpha(64, 64), 255); // le dessin est opaque
});

test('icônes 16/32/48 : plein cadre (le dessin touche les bords)', () => {
  for (const size of [16, 32, 48]) {
    const png = decodePng(`icons/${size}.png`);
    const middle = size >> 1;
    assert.equal(png.alpha(middle, 0), 255, `${size} : bord haut`);
    assert.equal(png.alpha(0, middle), 255, `${size} : bord gauche`);
  }
});

test('icon.svg : source propre (5 formes, aucune métadonnée C2PA)', () => {
  const svg = read('icons/icon.svg');
  assert.ok(!/metadata|c2pa/i.test(svg));
  assert.equal((svg.match(/<rect\b/g) || []).length, 4);
  assert.equal((svg.match(/<circle\b/g) || []).length, 1);
});

// --- Badge : seule la couleur du point change ---------------------------------------------------------------
test('badge : point #ff6b61, plus d’orange', () => {
  const css = require('../lib/chip.js').chipModel('x').css;
  assert.match(css, /\.chip::before \{[^}]*background: #ff6b61;/);
  assert.ok(!css.includes('#e9964a'));
});

// --- Feuilles de style ---------------------------------------------------------------------------------------
const STYLESHEETS = ['ui/tokens.css', 'ui/components.css', 'options.css', 'popup.css'];

test('CSS : aucune ressource externe ni @import ; seules url() : la police locale', () => {
  for (const file of STYLESHEETS) {
    const css = read(file);
    assert.ok(!css.includes('@import'), `${file} : @import`);
    for (const [, target] of css.matchAll(/url\(\s*['"]?([^'")]+)/g)) {
      assert.equal(target, 'fonts/BricolageGrotesque.woff2', `${file} : url(${target})`);
    }
  }
  assert.ok(fs.existsSync(path.join(root, 'ui/fonts/BricolageGrotesque.woff2')));
  assert.match(read('ui/fonts/OFL.txt'), /SIL Open Font License/);
});

test('CSS : le rouge (--signal) seulement sur le point de la puce et sur le bouton « en lecture »', () => {
  const allowed = ['.profile-pill__dot', '.btn.is-playing::before'];
  for (const file of STYLESHEETS) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/var\(--signal(-text|-on-dark)?\)/.test(body)) {
        assert.ok(allowed.includes(selector.trim()), `${file} : rouge sur « ${selector.trim()} »`);
      }
    }
  }
});

test('pages : options et popup chargent les tokens et les composants', () => {
  for (const page of ['options.html', 'popup.html']) {
    const html = read(page);
    assert.ok(html.indexOf('ui/tokens.css') < html.indexOf('ui/components.css'), page);
  }
  assert.match(read('popup.css'), /width: 320px/);
});

// --- Manifest et textes ---------------------------------------------------------------------------------
test('manifest : version 1.0.2 et homepage_url', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.version, '1.0.2');
  assert.equal(manifest.homepage_url, 'https://whichprofile.app');
});

test('extDescription : EN et FR mot pour mot, ≤ 132 caractères partout', () => {
  assert.equal(
    messages('en').extDescription.message,
    'Says which Chrome profile just got a notification — by voice or a sound. Nothing leaves your computer.',
  );
  assert.equal(
    messages('fr').extDescription.message,
    'Dit quel profil Chrome vient de recevoir une notification — à voix haute ou par un son. Rien ne quitte votre ordinateur.',
  );
  for (const locale of LOCALES) assert.ok(messages(locale).extDescription.message.length <= 132, locale);
});

test('pied de page : footerPrivacy, footerContact, footerSource et footerLegal dans les 8 langues', () => {
  const legal = 'Independent project, not affiliated with Google. Product names are trademarks of their owners.';
  for (const locale of LOCALES) {
    const m = messages(locale);
    for (const key of ['footerPrivacy', 'footerContact', 'footerSource', 'footerLegal']) {
      assert.ok(m[key] && m[key].message.trim(), `${locale}.${key}`);
    }
    assert.equal(m.footerLegal.message, legal, `${locale}.footerLegal doit rester en anglais`);
  }
  const html = read('options.html');
  assert.match(html, /href="https:\/\/whichprofile\.app\/privacy"/);
  assert.match(html, /href="mailto:hello@whichprofile\.app"/);
  assert.match(html, /href="https:\/\/github\.com\/jsala1\/whichprofile"/);
});

test('LICENSE : MIT, Julian Salaun', () => {
  const license = read('LICENSE');
  assert.match(license, /^MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Julian Salaun/);
});

test('README « Sites covered » : les 15 hôtes de lib/sites.js, un par ligne ; Teams en détection de base comme Instagram', () => {
  const { HOSTS } = require('../lib/sites.js');
  const readme = read('README.md');
  const section = readme.slice(readme.indexOf('## Sites couverts (Sites covered)'), readme.indexOf('\n## ', readme.indexOf('## Sites couverts (Sites covered)') + 5));
  assert.equal(HOSTS.length, 15);
  for (const host of HOSTS) assert.match(section, new RegExp('\\| `' + host.replace(/\./g, '\\.') + '` \\|'), host);
  assert.equal((section.match(/^\| \d+ \|/gm) || []).length, 15);
  const basic = (host) => section.split('\n').find((line) => line.includes('`' + host + '`')).includes('détection de base');
  for (const host of ['www.instagram.com', 'teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft']) assert.ok(basic(host), host);
});
