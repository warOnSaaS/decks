// Files: images people upload for slides, and exports (PDF, PPTX, the data export).
// Kept in the database (FILES_STORAGE=db, the default on serverless hosts) or in a folder on disk
// (FILES_DIR, the default elsewhere). Images are served to anyone with the address, so share links
// and embeds can show them; the address carries 22 random characters. Exports are private to the team.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './ids.mjs';
import { DeckError } from './decks.mjs';

const IMAGE = /^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/;

export class Files {
  constructor(db, env = {}) {
    this.db = db;
    this.mode = env.FILES_STORAGE === 'db' || (!env.FILES_DIR && env.VERCEL) ? 'db' : 'disk';
    this.dir = env.FILES_DIR || path.resolve('data', 'files');
    this.max = Number(env.FILES_MAX_MB || 20) * 1024 * 1024;
  }

  async put(me, { name, type, data, isPublic }) {
    if (!data?.length) throw new DeckError('The file is empty.');
    if (data.length > this.max) throw new DeckError(`The file is over ${Math.round(this.max / 1048576)} MB.`, 413);
    type = String(type || guessType(name)).toLowerCase();
    const pub = isPublic ?? IMAGE.test(type);
    const id = `f_${crypto.randomBytes(16).toString('base64url')}`;
    const clean = String(name || 'file').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 100) || 'file';
    if (this.mode === 'disk') {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, id), data);
    }
    await this.db.run('insert into decks_files (id, team_id, name, type, size, storage, public, data, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, me.team_id, clean, type, data.length, this.mode, pub ? 1 : 0, this.mode === 'db' ? data.toString('base64') : null, me.id, nowIso()]);
    return view({ id, name: clean, type, size: data.length });
  }

  async row(id) { return this.db.get('select id, team_id, name, type, size, storage, public, created_at from decks_files where id = $1', [id]); }

  async read(row) {
    if (row.storage === 'db') {
      const r = await this.db.get('select data from decks_files where id = $1', [row.id]);
      return Buffer.from(r?.data ?? '', 'base64');
    }
    const p = path.join(this.dir, row.id);
    if (!fs.existsSync(p)) throw new DeckError('The file is missing from storage.', 404);
    return fs.readFileSync(p);
  }

  // A file of this team, by id or by its /files/decks/... address.
  async readable(me, ref) {
    const id = /f_[\w-]+/.exec(String(ref ?? ''))?.[0];
    const row = id ? await this.row(id) : null;
    if (!row || row.team_id !== me.team_id) throw new DeckError('No file with that id.', 404);
    return row;
  }
}

export const view = (r) => ({ id: r.id, name: r.name, type: r.type, size: Number(r.size), url: `/files/decks/${r.id}/${encodeURIComponent(r.name)}` });

export function guessType(name) {
  const e = String(name).toLowerCase().split('.').pop();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', pdf: 'application/pdf', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip', json: 'application/json' }[e] ?? 'application/octet-stream';
}
