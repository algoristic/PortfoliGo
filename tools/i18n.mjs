// Translations of the runtime language switch (TS §11.9, E-36). The source of truth for
// translators is `src/locale/messages.en.xlf`: `messages.xlf` (German, `ng extract-i18n`) with a
// `<target>` per translated unit. The app loads `src/assets/i18n/messages.en.json` before it starts
// (`language-start.ts`), in the format of `loadTranslations()` of `@angular/localize`.
//
//   node tools/i18n.mjs merge            takes new and changed units of `messages.xlf` into the
//                                        translation (keeps targets, flags changed sources, drops
//                                        obsolete units and lists them) and writes the JSON
//   node tools/i18n.mjs build            writes the JSON from the translation
//   node tools/i18n.mjs check [--strict] reports missing, outdated, invalid and obsolete
//                                        translations; fails on a stale JSON, with `--strict` also
//                                        on every finding (the gate from AP 6.8b)
//
// The JSON has an entry for every unit: units without a valid translation keep the German text, so
// `$localize` never warns about a missing translation at runtime.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { Xliff1TranslationParser } from '@angular/localize/tools';

const LANGUAGE = 'en';
const SOURCE = resolve('messages.xlf');
const TRANSLATION = resolve(`src/locale/messages.${LANGUAGE}.xlf`);
const OUTPUT = resolve(`src/assets/i18n/messages.${LANGUAGE}.json`);
/** Target states that ask for a review after the German text changed (XLIFF 1.2). */
const REVIEW_STATE = 'needs-review-translation';

const UNIT = /(<trans-unit id="([^"]+)"[^>]*>)([\s\S]*?)(<\/trans-unit>)/g;
const SOURCE_ELEMENT = /<source>([\s\S]*?)<\/source>/;
const TARGET_ELEMENT = /\s*<target(?:\s+state="([^"]*)")?\s*>([\s\S]*?)<\/target>/;

const [command, ...flags] = process.argv.slice(2);
switch (command) {
  case 'merge':
    merge();
    build();
    break;
  case 'build':
    build();
    break;
  case 'check':
    check(flags.includes('--strict'));
    break;
  default:
    console.error('Usage: node tools/i18n.mjs merge | build | check [--strict]');
    process.exit(2);
}

function merge() {
  const source = readFileSync(SOURCE, 'utf8');
  const existing = existsSync(TRANSLATION) ? units(readFileSync(TRANSLATION, 'utf8')) : new Map();
  const sourceIds = new Set();
  let added = 0;
  let changed = 0;
  const merged = source
    .replace(
      /<file source-language="([^"]+)"/,
      `<file source-language="$1" target-language="${LANGUAGE}"`,
    )
    .replace(UNIT, (_unit, open, id, body, close) => {
      sourceIds.add(id);
      const sourceText = SOURCE_ELEMENT.exec(body)?.[1] ?? '';
      const previous = existing.get(id);
      if (previous?.target === undefined) {
        added += previous === undefined ? 1 : 0;
        return `${open}${body}${close}`;
      }
      let state = previous.state;
      if (previous.source !== sourceText) {
        state = REVIEW_STATE;
        changed++;
      }
      const target = `\n        <target${state ? ` state="${state}"` : ''}>${previous.target}</target>`;
      return `${open}${body.replace(/(<\/source>)/, `$1${target}`)}${close}`;
    });
  writeFileSync(TRANSLATION, merged);
  const obsolete = [...existing.keys()].filter((id) => !sourceIds.has(id));
  console.log(
    `${relative(TRANSLATION)}: ${sourceIds.size} units, ${added} new, ${changed} with a changed source (state "${REVIEW_STATE}").`,
  );
  for (const id of obsolete) {
    const target = existing.get(id).target;
    console.log(`  dropped obsolete unit ${id}${target ? `: ${target}` : ''}`);
  }
}

function build() {
  writeFileSync(ensureDir(OUTPUT), translationsJson().json);
  console.log(`${relative(OUTPUT)} written.`);
}

function check(strict) {
  const source = units(readFileSync(SOURCE, 'utf8'));
  const translation = existsSync(TRANSLATION)
    ? units(readFileSync(TRANSLATION, 'utf8'))
    : new Map();
  const missing = [];
  const outdated = [];
  for (const [id, unit] of source) {
    const translated = translation.get(id);
    if (translated?.target === undefined || translated.target.trim() === '') {
      missing.push(id);
    } else if (translated.source !== unit.source || translated.state?.startsWith('needs-review')) {
      outdated.push(id);
    }
  }
  const obsolete = [...translation.keys()].filter((id) => !source.has(id));
  const { json, invalid } = translationsJson();
  const stale = !existsSync(OUTPUT) || readFileSync(OUTPUT, 'utf8') !== json;

  const translatedCount = source.size - missing.length;
  console.log(
    `i18n (${LANGUAGE}): ${translatedCount} of ${source.size} units translated, ${missing.length} missing, ${outdated.length} outdated, ${invalid.length} invalid, ${obsolete.length} obsolete.`,
  );
  report('Missing translations', missing);
  report('Outdated translations (German text changed; review and remove the state)', outdated);
  report('Invalid translations (placeholders differ; the app shows German)', invalid);
  report('Obsolete units (not in messages.xlf; run `npm run translate`)', obsolete);
  if (stale) {
    console.error(
      `${relative(OUTPUT)} is out of date; run \`npm run i18n:build\` (or \`npm run translate\`).`,
    );
  }
  const findings = missing.length + outdated.length + invalid.length + obsolete.length;
  if (stale || (strict && findings > 0)) {
    process.exit(1);
  }
  if (findings > 0) {
    console.log('Report only: `--strict` turns these findings into errors (gate from AP 6.8b).');
  }
}

/** The JSON the app loads and the IDs whose translation can't be used. */
function translationsJson() {
  const german = parse(SOURCE, withSourcesAsTargets(readFileSync(SOURCE, 'utf8')));
  const translationXml = existsSync(TRANSLATION) ? readFileSync(TRANSLATION, 'utf8') : null;
  const english = translationXml ? parse(TRANSLATION, onlyTranslatedUnits(translationXml)) : {};
  const translations = {};
  const invalid = [];
  for (const [id, fallback] of Object.entries(german)) {
    const translation = english[id];
    if (translation !== undefined && samePlaceholders(translation, fallback)) {
      translations[id] = translation.text;
    } else {
      if (translation !== undefined) {
        invalid.push(id);
      }
      translations[id] = fallback.text;
    }
  }
  return {
    json: `${JSON.stringify({ locale: LANGUAGE, translations }, null, 2)}\n`,
    invalid,
  };
}

function samePlaceholders(translation, source) {
  const names = (parsed) => [...parsed.placeholderNames].sort().join(' ');
  return names(translation) === names(source);
}

/** Parses an XLIFF 1.2 file with the parser of `ng build --localize`. */
function parse(filePath, contents) {
  const parser = new Xliff1TranslationParser();
  const analysis = parser.analyze(filePath, contents);
  if (!analysis.canParse) {
    fail(`${relative(filePath)} is no XLIFF 1.2 file.`, analysis.diagnostics);
  }
  const bundle = parser.parse(filePath, contents, analysis.hint);
  if (bundle.diagnostics.hasErrors) {
    fail(`${relative(filePath)} has errors.`, bundle.diagnostics);
  }
  return bundle.translations;
}

function fail(message, diagnostics) {
  console.error(message);
  console.error(diagnostics.formatDiagnostics(''));
  process.exit(1);
}

/** The German file read as a translation: every source is its own target. */
function withSourcesAsTargets(xml) {
  return xml
    .replace(/<file source-language="([^"]+)"/, '<file source-language="$1" target-language="$1"')
    .replace(/<source>([\s\S]*?)<\/source>/g, '<source>$1</source><target>$1</target>');
}

/** The translation without the units that have no target yet (the parser needs a target). */
function onlyTranslatedUnits(xml) {
  return xml.replace(UNIT, (unit, _open, _id, body) => {
    const target = TARGET_ELEMENT.exec(body);
    return target !== null && target[2].trim() !== '' ? unit : '';
  });
}

/** Units of an XLIFF file by ID, with the raw XML of source and target. */
function units(xml) {
  const result = new Map();
  for (const [, , id, body] of xml.matchAll(UNIT)) {
    const target = TARGET_ELEMENT.exec(body);
    result.set(id, {
      source: SOURCE_ELEMENT.exec(body)?.[1] ?? '',
      target: target?.[2],
      state: target?.[1],
    });
  }
  return result;
}

function report(title, ids) {
  if (ids.length === 0) {
    return;
  }
  const shown = ids.slice(0, 20);
  console.log(`${title}: ${ids.length}`);
  for (const id of shown) {
    console.log(`  ${id}`);
  }
  if (ids.length > shown.length) {
    console.log(`  … and ${ids.length - shown.length} more`);
  }
}

function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

function relative(file) {
  return file.slice(process.cwd().length + 1);
}
