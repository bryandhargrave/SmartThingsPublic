'use strict';
// Persistent store for everything editable from the UI (rules, pins, devices added at runtime).
// Kept separate from the hand-written YAML config so comments and structure there are never
// rewritten. Store entries are merged on top of the config at start-up.
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ version: 1, devices: [], rules: [], ui: null });

class Store {
  constructor(file) {
    this.file = file || null;
    this.data = EMPTY();
    if (this.file && fs.existsSync(this.file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = { ...EMPTY(), ...parsed };
        if (!Array.isArray(this.data.devices)) this.data.devices = [];
        if (!Array.isArray(this.data.rules)) this.data.rules = [];
      } catch (e) {
        throw new Error(`cannot read store ${this.file}: ${e.message}`);
      }
    }
  }

  save() {
    if (!this.file) return false;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
    return true;
  }
}

let counter = 0;
function newId(prefix = 'r') { counter++; return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`; }

module.exports = { Store, newId };
