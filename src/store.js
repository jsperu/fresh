import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { receipts: [] };
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(this.data.receipts)) this.data = { receipts: [] };
      this.mtime = fs.statSync(this.file).mtimeMs;
    } catch {
      this.data = { receipts: [] };
      this.mtime = null;
    }
  }

  refresh() {
    try {
      const m = fs.statSync(this.file).mtimeMs;
      if (m !== this.mtime) this.load();
    } catch {
      /* fichier absent : on garde l'état en mémoire */
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  add(receipt) {
    this.refresh();
    const row = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...receipt,
    };
    this.data.receipts.push(row);
    this.save();
    return row;
  }

  get(id) {
    this.refresh();
    return this.data.receipts.find((r) => r.id === id || r.id.startsWith(id));
  }

  findByHash(hash) {
    this.refresh();
    return this.data.receipts.find((r) => r.hash === hash);
  }

  all(filter = {}) {
    this.refresh();
    return this.data.receipts.filter((r) => !filter.status || r.status === filter.status);
  }

  update(id, patch) {
    this.refresh();
    const r = this.data.receipts.find((x) => x.id === id || x.id.startsWith(id));
    if (!r) return null;
    Object.assign(r, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return r;
  }
}
