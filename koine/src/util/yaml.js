'use strict';
// Minimal YAML subset loader with zero dependencies.
// Supported: block mappings, block sequences, "- key: value" inline mapping items,
// flow sequences [a, b], flow mappings {a: 1, b: 2}, quoted/unquoted scalars,
// comments, multi-line "|" / ">" block scalars, ints, floats, hex (0x17), bools, null, ~, .inf/-.inf.
// If the `yaml` or `js-yaml` npm package is installed it is preferred automatically.

let external = null;
try { external = require('yaml'); } catch (_) { /* optional */ }
if (!external) { try { const jy = require('js-yaml'); external = { parse: (s) => jy.load(s) }; } catch (_) { /* optional */ } }

function parse(text) {
  if (external) return external.parse(text);
  return new Parser(text).parseDocument();
}

class Parser {
  constructor(text) {
    this.lines = [];
    const raw = text.replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < raw.length; i++) {
      const line = raw[i];
      const stripped = stripComment(line);
      if (stripped.trim() === '' || stripped.trim() === '---') continue;
      this.lines.push({ indent: stripped.search(/\S/), text: stripped.trimEnd(), no: i + 1, rawText: line });
    }
    this.pos = 0;
  }

  parseDocument() {
    if (this.lines.length === 0) return null;
    return this.parseNode(this.lines[0].indent);
  }

  peek() { return this.lines[this.pos]; }

  parseNode(indent) {
    const line = this.peek();
    if (!line) return null;
    if (/^-(\s|$)/.test(line.text.trim())) return this.parseSequence(indent);
    return this.parseMapping(indent);
  }

  parseSequence(indent) {
    const out = [];
    while (this.pos < this.lines.length) {
      const line = this.peek();
      if (line.indent < indent) break;
      if (line.indent > indent) this.fail(line, 'unexpected indentation in sequence');
      const body = line.text.trim();
      if (!/^-(\s|$)/.test(body)) break;
      const rest = body.slice(1).trim();
      this.pos++;
      if (rest === '') {
        const next = this.peek();
        if (next && next.indent > indent) out.push(this.parseNode(next.indent));
        else out.push(null);
      } else if (isMappingEntry(rest)) {
        // "- key: value" -> inline mapping whose further keys are indented past the dash
        const virtualIndent = line.indent + (body.length - rest.length);
        this.lines.splice(this.pos, 0, { indent: virtualIndent, text: ' '.repeat(virtualIndent) + rest, no: line.no, rawText: line.rawText });
        out.push(this.parseMapping(virtualIndent));
      } else {
        out.push(this.parseScalarOrFlow(rest, line));
      }
    }
    return out;
  }

  parseMapping(indent) {
    const out = {};
    while (this.pos < this.lines.length) {
      const line = this.peek();
      if (line.indent < indent) break;
      if (line.indent > indent) this.fail(line, 'unexpected indentation in mapping');
      const body = line.text.trim();
      if (/^-(\s|$)/.test(body)) break;
      const m = splitKey(body);
      if (!m) this.fail(line, `expected "key: value", got "${body}"`);
      const [key, rest] = m;
      this.pos++;
      if (rest === '' || rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
        if (rest !== '') {
          out[key] = this.parseBlockScalar(indent, rest);
          continue;
        }
        const next = this.peek();
        if (next && next.indent > indent) out[key] = this.parseNode(next.indent);
        else if (next && next.indent === indent && /^-(\s|$)/.test(next.text.trim())) out[key] = this.parseSequence(indent);
        else out[key] = null;
      } else {
        out[key] = this.parseScalarOrFlow(rest, line);
      }
    }
    return out;
  }

  parseBlockScalar(indent, style) {
    const parts = [];
    let blockIndent = null;
    while (this.pos < this.lines.length) {
      const line = this.peek();
      if (line.indent <= indent) break;
      if (blockIndent === null) blockIndent = line.indent;
      parts.push(line.rawText.slice(blockIndent));
      this.pos++;
    }
    let s = style.startsWith('|') ? parts.join('\n') : parts.join(' ');
    if (!style.endsWith('-')) s += '\n';
    return s;
  }

  parseScalarOrFlow(text, line) {
    text = this.collectFlow(text);
    try { return parseScalar(text); } catch (e) { this.fail(line, e.message); }
  }

  /** A flow collection ([...] or {...}) may continue over following lines until brackets balance. */
  collectFlow(text) {
    if (!(text.startsWith('[') || text.startsWith('{'))) return text;
    let acc = text;
    while (!flowBalanced(acc) && this.pos < this.lines.length) {
      acc += ' ' + this.lines[this.pos].text.trim();
      this.pos++;
    }
    return acc;
  }

  fail(line, msg) { throw new Error(`YAML parse error at line ${line.no}: ${msg}`); }
}

function flowBalanced(s) {
  let depth = 0, inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS && s[i - 1] !== '\\') inD = !inD;
    else if (!inS && !inD) { if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') depth--; }
  }
  return depth <= 0;
}

function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS && line[i - 1] !== '\\') inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function isMappingEntry(text) {
  return splitKey(text) !== null;
}

function splitKey(text) {
  if (text.startsWith('[') || text.startsWith('{') || text.startsWith('"') || text.startsWith("'")) {
    if (text.startsWith('"') || text.startsWith("'")) {
      const q = text[0];
      const end = text.indexOf(q, 1);
      if (end > 0 && text[end + 1] === ':' && (text[end + 2] === ' ' || end + 2 === text.length)) {
        return [text.slice(1, end), text.slice(end + 2).trim()];
      }
    }
    return null;
  }
  const m = /^([^\s:][^:]*?)\s*:(\s+|$)/.exec(text);
  if (!m) return null;
  return [m[1].trim(), text.slice(m[0].length).trim()];
}

function parseScalar(text) {
  text = text.trim();
  if (text === '') return null;
  if (text[0] === '[' || text[0] === '{') return new FlowParser(text).parse();
  if (text[0] === '"') return JSON.parse(text.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1'));
  if (text[0] === "'") {
    if (!text.endsWith("'")) throw new Error('unterminated single-quoted string');
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return plainScalar(text);
}

function plainScalar(t) {
  if (t === 'null' || t === '~' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE' || t === 'yes' || t === 'on') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE' || t === 'no' || t === 'off') return false;
  if (t === '.inf' || t === '+.inf' || t === '.Inf') return Infinity;
  if (t === '-.inf' || t === '-.Inf') return -Infinity;
  if (t === '.nan' || t === '.NaN') return NaN;
  if (/^[-+]?0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  if (/^[-+]?0o[0-7]+$/.test(t)) return parseInt(t.replace(/0o/, ''), 8);
  if (/^[-+]?(\d+)$/.test(t)) return parseInt(t, 10);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t)) return parseFloat(t);
  return t;
}

class FlowParser {
  constructor(text) { this.s = text; this.i = 0; }
  parse() {
    const v = this.value();
    this.ws();
    if (this.i !== this.s.length) throw new Error(`unexpected trailing text in flow collection: "${this.s.slice(this.i)}"`);
    return v;
  }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  value() {
    this.ws();
    const c = this.s[this.i];
    if (c === '[') return this.seq();
    if (c === '{') return this.map();
    if (c === '"') return this.dq();
    if (c === "'") return this.sq();
    return plainScalar(this.plain(/[,\]}]/));
  }
  plain(stopRe) {
    let start = this.i;
    while (this.i < this.s.length && !stopRe.test(this.s[this.i])) this.i++;
    return this.s.slice(start, this.i).trim();
  }
  dq() {
    let j = this.i + 1;
    while (j < this.s.length && !(this.s[j] === '"' && this.s[j - 1] !== '\\')) j++;
    if (j >= this.s.length) throw new Error('unterminated string');
    const out = JSON.parse(this.s.slice(this.i, j + 1));
    this.i = j + 1;
    return out;
  }
  sq() {
    let j = this.i + 1;
    while (j < this.s.length && this.s[j] !== "'") j++;
    if (j >= this.s.length) throw new Error('unterminated string');
    const out = this.s.slice(this.i + 1, j);
    this.i = j + 1;
    return out;
  }
  seq() {
    this.i++; const out = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') { this.i++; return out; }
      out.push(this.value());
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === ']') { this.i++; return out; }
      throw new Error('expected , or ] in flow sequence');
    }
  }
  map() {
    this.i++; const out = {};
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') { this.i++; return out; }
      let key;
      if (this.s[this.i] === '"') key = this.dq();
      else if (this.s[this.i] === "'") key = this.sq();
      else key = this.plain(/[:,}]/);
      this.ws();
      if (this.s[this.i] !== ':') throw new Error(`expected : after key "${key}" in flow mapping`);
      this.i++;
      out[String(key)] = this.value();
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === '}') { this.i++; return out; }
      throw new Error('expected , or } in flow mapping');
    }
  }
}

module.exports = { parse, usingExternalParser: () => !!external };
