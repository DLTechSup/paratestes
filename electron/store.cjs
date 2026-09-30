const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_SETTINGS = {
  autostart: true,
  autoBackup: true,
  backupDir: '',
  backupKeep: 10,
  theme: 'auto',
  lastAutoBackup: 0,
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'notedeck-data.json');
    this.data = { version: 1, notes: [], settings: { ...DEFAULT_SETTINGS } };
    this._timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.notes = Array.isArray(raw.notes) ? raw.notes : [];
      this.data.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    } catch {
      // primeiro uso ou arquivo corrompido: tenta recuperar do .bak
      try {
        const raw = JSON.parse(fs.readFileSync(this.file + '.bak', 'utf8'));
        this.data.notes = raw.notes || [];
        this.data.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
      } catch { /* vazio */ }
    }
    if (!this.data.settings.backupDir) {
      this.data.settings.backupDir = path.join(app.getPath('documents'), 'NoteDeck Backups');
    }
  }

  saveSoon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this._timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('Falha ao salvar', e);
    }
  }

  get notes() { return this.data.notes; }
  get settings() { return this.data.settings; }
}

module.exports = { Store, DEFAULT_SETTINGS };
