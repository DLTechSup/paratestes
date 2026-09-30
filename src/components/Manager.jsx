import React, { useEffect, useMemo, useState } from 'react';
import {
  StickyNote, Trash2, DatabaseBackup, Settings, Plus, Search, Eye, EyeOff, Copy, RotateCcw,
  Download, Upload, FolderOpen, FileClock, Sparkles, ExternalLink, Pin,
} from 'lucide-react';
import { PALETTE, fmtDate } from '../palette.js';

const NAV = [
  { id: 'notes', label: 'Minhas notas', icon: StickyNote },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
  { id: 'backup', label: 'Backup', icon: DatabaseBackup },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

function Switch({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function TitleInput({ note, color }) {
  const [v, setV] = useState(note.title || '');
  useEffect(() => setV(note.title || ''), [note.title]);
  const commit = () => { if (v !== (note.title || '')) window.api.updateNote(note.id, { title: v.trim() }); };
  return (
    <input className="cardtitle" style={{ color }} value={v} placeholder="Sem nome — clique para nomear" maxLength={60} spellCheck={false}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

function NotesPage({ notes, trash }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes
      .filter((n) => !!n.deleted === trash)
      .filter((n) => (filter === 'on' ? n.visible : filter === 'off' ? !n.visible : true))
      .filter((n) => !s || (n.text || '').toLowerCase().includes(s) || (n.title || '').toLowerCase().includes(s))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [notes, q, filter, trash]);
  const active = notes.filter((n) => !n.deleted);
  const onCount = active.filter((n) => n.visible).length;

  return (
    <>
      <header className="pagehead">
        <div>
          <h1>{trash ? 'Lixeira' : 'Minhas notas'}</h1>
          <p>{trash ? 'Notas removidas ficam aqui até você esvaziar a lixeira.' : `${onCount} de ${active.length} notas aparecendo na tela`}</p>
        </div>
        {trash ? (
          <button className="btn danger" disabled={!list.length} onClick={() => confirm('Excluir definitivamente todas as notas da lixeira?') && window.api.emptyTrash()}>
            <Trash2 size={16} /> Esvaziar lixeira
          </button>
        ) : (
          <button className="btn primary" onClick={() => window.api.createNote({})}><Plus size={16} /> Nova nota</button>
        )}
      </header>

      <div className="controls">
        <div className="search"><Search size={16} /><input placeholder="Buscar nas notas…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!trash && (
          <>
            <div className="chips">
              {[['all', 'Todas'], ['on', 'Na tela'], ['off', 'Ocultas']].map(([k, l]) => (
                <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <div className="grow" />
            <button className="btn ghost" onClick={() => window.api.setAllVisible(true)}><Eye size={15} /> Mostrar todas</button>
            <button className="btn ghost" onClick={() => window.api.setAllVisible(false)}><EyeOff size={15} /> Ocultar todas</button>
          </>
        )}
      </div>

      {!list.length ? (
        <div className="empty">
          <Sparkles size={34} />
          <h3>{q ? 'Nada encontrado' : trash ? 'Lixeira vazia' : 'Nenhuma nota ainda'}</h3>
          <p>{q ? 'Tente outro termo de busca.' : trash ? 'Tudo em ordem por aqui.' : 'Crie sua primeira nota ou importe um backup na aba Backup.'}</p>
        </div>
      ) : (
        <div className="grid">
          {list.map((n) => {
            const c = PALETTE[n.color] || PALETTE.yellow;
            return (
              <article key={n.id} className={'card' + (n.visible ? ' live' : '')}>
                <div className="cardtop" style={{ background: c.bar }}>
                  <span className={'dot' + (n.visible ? ' on' : '')} title={n.visible ? 'Na tela' : 'Oculta'} />
                  <TitleInput note={n} color={c.text} />
                  {n.pinned && <Pin size={13} style={{ color: c.text }} />}
                </div>
                <div className="cardbody" style={{ background: c.bg, color: c.text }} onDoubleClick={() => !trash && window.api.focusNote(n.id)}>
                  {(n.text || '').trim() ? n.text.slice(0, 260) : <em>Nota vazia</em>}
                </div>
                <div className="cardfoot">
                  <small>{fmtDate(n.updatedAt)}</small>
                  <div className="grow" />
                  {trash ? (
                    <>
                      <button className="icon" title="Restaurar" onClick={() => window.api.restoreNote(n.id)}><RotateCcw size={16} /></button>
                      <button className="icon danger" title="Excluir definitivamente" onClick={() => confirm('Excluir esta nota para sempre?') && window.api.deleteNote(n.id)}><Trash2 size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button className="icon" title="Trazer para frente" disabled={!n.visible} onClick={() => window.api.focusNote(n.id)}><ExternalLink size={16} /></button>
                      <button className="icon" title="Duplicar" onClick={() => window.api.duplicateNote(n.id)}><Copy size={16} /></button>
                      <button className="icon danger" title="Mover para lixeira" onClick={() => window.api.trashNote(n.id)}><Trash2 size={16} /></button>
                      <Switch on={n.visible} label="Mostrar na tela" onChange={(v) => window.api.setVisible(n.id, v)} />
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function BackupPage({ settings, setSettings, flash }) {
  const [schema, setSchema] = useState(null);
  const report = (r, what) => {
    if (r.ok) flash(r.file ? `${what} concluído: ${r.file}` : `${what} concluído: ${r.added ?? 0} nova(s), ${r.updated ?? 0} atualizada(s).`);
    else if (r.error) flash(r.error, true);
    if (r.schema && !r.ok) setSchema(r.schema);
  };
  return (
    <>
      <header className="pagehead"><div><h1>Backup</h1><p>Proteja suas notas e traga as do Simple Sticky Notes.</p></div></header>
      <div className="panels">
        <section className="panel">
          <h3><Download size={18} /> Exportar backup</h3>
          <p>Salva todas as notas (com formatação, cores e posições) em um arquivo <code>.json</code>.</p>
          <button className="btn primary" onClick={async () => report(await window.api.exportBackup(), 'Exportação')}>Exportar agora…</button>
        </section>
        <section className="panel">
          <h3><Upload size={18} /> Importar backup do NoteDeck</h3>
          <p>Restaura um arquivo <code>.json</code>. Você escolhe entre mesclar ou substituir.</p>
          <button className="btn" onClick={async () => report(await window.api.importBackup(), 'Importação')}>Importar arquivo…</button>
        </section>
        <section className="panel accent">
          <h3><FileClock size={18} /> Importar .db do Simple Sticky Notes</h3>
          <p>Escolha o arquivo <code>.db</code> gerado pelo backup do outro programa. As notas entram <b>ocultas</b>; depois é só ligar as que quiser na tela.</p>
          <button className="btn primary" onClick={async () => report(await window.api.importDb(), 'Importação do .db')}>Importar arquivo .db…</button>
          {schema && (
            <div className="schema">
              <b>Não reconheci as notas neste arquivo. Estrutura encontrada:</b>
              <pre>{schema.join('\n')}</pre>
            </div>
          )}
        </section>
        <section className="panel">
          <h3><DatabaseBackup size={18} /> Backup automático</h3>
          <div className="row"><span>Fazer backup automático (1 por dia)</span><Switch on={settings.autoBackup} label="Backup automático" onChange={(v) => setSettings({ autoBackup: v })} /></div>
          <div className="row"><span>Manter os últimos</span>
            <input type="number" min="1" max="100" value={settings.backupKeep} onChange={(e) => setSettings({ backupKeep: Math.max(1, +e.target.value || 1) })} /> <span>backups</span></div>
          <div className="row path"><code>{settings.backupDir}</code></div>
          <div className="btnrow">
            <button className="btn ghost" onClick={async () => setSettings(await window.api.pickBackupDir(), true)}>Trocar pasta…</button>
            <button className="btn ghost" onClick={() => window.api.openBackupDir()}><FolderOpen size={15} /> Abrir pasta</button>
            <button className="btn" onClick={async () => report(await window.api.backupNow(), 'Backup')}>Fazer backup agora</button>
          </div>
        </section>
      </div>
    </>
  );
}

function SettingsPage({ settings, setSettings, info }) {
  return (
    <>
      <header className="pagehead"><div><h1>Configurações</h1><p>Como o NoteDeck se comporta no Windows.</p></div></header>
      <div className="panels one">
        <section className="panel">
          <div className="row big"><div><b>Iniciar com o Windows</b><small>Abre em segundo plano e mostra apenas as notas marcadas como “Na tela”.{info && !info.packaged ? ' (só funciona no programa instalado)' : ''}</small></div>
            <Switch on={settings.autostart} label="Iniciar com o Windows" onChange={(v) => setSettings({ autostart: v })} /></div>
          <div className="row big"><div><b>Encaixar notas (ímã)</b><small>Ao arrastar uma nota perto de outra (ou da borda da tela), ela gruda e alinha. Segure <b>Alt</b> ao arrastar para não encaixar.</small></div>
            <Switch on={settings.snap !== false} label="Encaixar notas" onChange={(v) => setSettings({ snap: v })} /></div>
          <div className="row big"><div><b>Tema do gerenciador</b><small>Aparência desta janela.</small></div>
            <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value })}>
              <option value="auto">Automático</option><option value="dark">Escuro</option><option value="light">Claro</option>
            </select></div>
        </section>
        <section className="panel">
          <h3>Dicas</h3>
          <ul className="tips">
            <li>Fechar esta janela mantém o NoteDeck rodando na <b>bandeja do sistema</b> (perto do relógio). Clique no ícone para abrir ou use o botão direito para ligar/desligar notas.</li>
            <li>O <b>X</b> de cada nota só a oculta da tela — ela continua salva aqui.</li>
            <li>Na barra <b>Aa</b> da nota: cores, marca-texto, fontes, listas e checklist. O texto digitado depois de um trecho marcado <b>não</b> herda a cor.</li>
            <li>Selecione um texto e clique com o <b>botão direito</b> para escolher a cor do <b>realce</b> (marca-texto) ou do texto. Também dá para Copiar/Colar; use Ctrl+Shift+V para colar sem formatação.</li>
          </ul>
        </section>
        <section className="panel about">
          <h3>Sobre</h3>
          <p><b>NoteDeck</b> {info && `v${info.version}`} — desenvolvido por <b>DLTechSup</b>.</p>
          {info && <small>Dados em: <code>{info.dataFile}</code></small>}
          <div className="btnrow"><button className="btn danger" onClick={() => window.api.quit()}>Encerrar NoteDeck</button></div>
        </section>
      </div>
    </>
  );
}

export default function Manager() {
  const [page, setPage] = useState('notes');
  const [notes, setNotes] = useState([]);
  const [settings, setSettingsState] = useState(null);
  const [info, setInfo] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    window.api.listNotes().then(setNotes);
    window.api.getSettings().then(setSettingsState);
    window.api.getInfo().then(setInfo);
    const a = window.api.onNotesChanged(setNotes);
    const b = window.api.onSettingsChanged(setSettingsState);
    return () => { a(); b(); };
  }, []);

  useEffect(() => {
    if (!settings) return;
    const t = settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : settings.theme;
    document.documentElement.dataset.theme = t;
  }, [settings?.theme]);

  const setSettings = async (patch, whole) => {
    if (whole) return setSettingsState(patch);
    setSettingsState((s) => ({ ...s, ...patch }));
    setSettingsState(await window.api.setSettings(patch));
  };
  const flash = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 6000); };
  const trashCount = notes.filter((n) => n.deleted).length;
  if (!settings) return null;

  return (
    <div className="mgr">
      <aside className="side">
        <div className="brand"><img src="./icon.png" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><div><b>NoteDeck</b><small>by DLTechSup</small></div></div>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>
              <Icon size={18} /> {label}{id === 'trash' && trashCount > 0 && <em>{trashCount}</em>}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {page === 'notes' && <NotesPage notes={notes} trash={false} />}
        {page === 'trash' && <NotesPage notes={notes} trash />}
        {page === 'backup' && <BackupPage settings={settings} setSettings={setSettings} flash={flash} />}
        {page === 'settings' && <SettingsPage settings={settings} setSettings={setSettings} info={info} />}
      </main>
      {toast && <div className={'toast' + (toast.err ? ' err' : '')} onClick={() => setToast(null)}>{toast.msg}</div>}
    </div>
  );
}
