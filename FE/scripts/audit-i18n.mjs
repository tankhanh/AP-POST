import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseTemplate } from '@angular/compiler';
import ts from 'typescript';

const APP_ROOT = path.resolve('src/app');
const TRANSLATIONS_FILE = path.join(APP_ROOT, 'i18n/translations.ts');
const VIETNAMESE_CHARACTER =
  /[\u00c0-\u00c3\u00c8-\u00ca\u00cc\u00cd\u00d2-\u00d5\u00d9\u00da\u00dd\u00e0-\u00e3\u00e8-\u00ea\u00ec\u00ed\u00f2-\u00f5\u00f9\u00fa\u00fd\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01a0\u01a1\u01af\u01b0\u1ea0-\u1ef9]/;
const TRANSLATED_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'placeholder',
  'title',
]);

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function readDictionaries() {
  const source = fs.readFileSync(TRANSLATIONS_FILE, 'utf8');
  const sourceFile = ts.createSourceFile(
    TRANSLATIONS_FILE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const dictionaries = {
    ENGLISH_PHRASES: new Set(),
    ENGLISH_ATTRIBUTES: new Set(),
  };

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      const dictionary = dictionaries[declaration.name.getText()];
      if (
        !dictionary ||
        !declaration.initializer ||
        !ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        continue;
      }
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;

        // Prettier sẽ bỏ dấu nháy khỏi các key là JavaScript identifier hợp lệ,
        // bao gồm nhiều từ tiếng Việt như Có, Hủy, Lỗi, Tỉnh...
        if (ts.isStringLiteral(property.name)) {
          dictionary.add(property.name.text);
        } else if (ts.isIdentifier(property.name)) {
          dictionary.add(property.name.text);
        }
      }
    }
  });
  return dictionaries;
}

const sources = new Map();

function record(value, file, kind = 'text') {
  if (typeof value !== 'string') return;
  const phrase = normalize(value);
  if (!phrase || !VIETNAMESE_CHARACTER.test(phrase) || phrase.includes('<')) return;
  const key = `${kind}\0${phrase}`;
  if (!sources.has(key)) sources.set(key, { phrase, kind, files: new Set() });
  sources.get(key).files.add(path.relative(process.cwd(), file).replaceAll('\\', '/'));
}

function inspectAngularTemplate(source, file) {
  const parsed = parseTemplate(source, file, { preserveWhitespaces: true });
  if (parsed.errors?.length) {
    for (const error of parsed.errors) console.error(`${file}: ${error}`);
    process.exitCode = 1;
  }

  const seen = new WeakSet();
  function visit(node, depth = 0) {
    if (!node || typeof node !== 'object' || seen.has(node) || depth > 20) return;
    seen.add(node);
    const type = node.constructor?.name;
    if (type === 'Text' || type === 'LiteralPrimitive') record(node.value, file);
    if (type === 'TextAttribute' && TRANSLATED_ATTRIBUTES.has(node.name)) {
      record(node.value, file, 'attribute');
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          'endSourceSpan',
          'i18n',
          'keySpan',
          'location',
          'sourceSpan',
          'startSourceSpan',
          'valueSpan',
        ].includes(key)
      ) {
        continue;
      }
      if (Array.isArray(value)) value.forEach((child) => visit(child, depth + 1));
      else visit(value, depth + 1);
    }
  }
  parsed.nodes.forEach((node) => visit(node));
}

function isConsoleMessage(node) {
  let current = node.parent;
  while (current && !ts.isCallExpression(current)) current = current.parent;
  if (!current || !ts.isPropertyAccessExpression(current.expression)) return false;
  return current.expression.expression.getText() === 'console';
}

function inspectTypeScript(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText() === 'template' &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      inspectAngularTemplate(node.initializer.text, file);
      return;
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isConsoleMessage(node)
    ) {
      record(node.text, file);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const files = collectFiles(APP_ROOT);
for (const file of files.filter((item) => item.endsWith('.html'))) {
  inspectAngularTemplate(fs.readFileSync(file, 'utf8'), file);
}
for (const file of files.filter(
  (item) =>
    item.endsWith('.ts') &&
    !item.endsWith('.spec.ts') &&
    !item.startsWith(path.join(APP_ROOT, 'i18n') + path.sep),
)) {
  inspectTypeScript(file);
}

const dictionaries = readDictionaries();
const missing = [...sources.values()]
  .filter(({ phrase, kind }) => {
    if (dictionaries.ENGLISH_PHRASES.has(phrase)) return false;
    return kind !== 'attribute' || !dictionaries.ENGLISH_ATTRIBUTES.has(phrase);
  })
  .sort((left, right) => left.phrase.localeCompare(right.phrase, 'vi'));
const covered = sources.size - missing.length;
const coverage = sources.size ? ((covered / sources.size) * 100).toFixed(1) : '100.0';

console.log(
  `i18n coverage: ${covered}/${sources.size} (${coverage}%) across ${
    files.filter((file) => /\.(html|ts)$/.test(file)).length
  } Angular source files.`,
);
if (missing.length) {
  console.error(`Missing ${missing.length} Vietnamese translation(s):`);
  for (const item of missing) {
    console.error(`- [${item.kind}] ${item.phrase} (${[...item.files].slice(0, 3).join(', ')})`);
  }
  process.exitCode = 1;
}
