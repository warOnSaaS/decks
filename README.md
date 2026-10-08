# wOS Decks

Pitch decks and presentations your team owns. Make slides by hand, or let your own AI (Claude, ChatGPT, Claude Code, Codex) build the whole deck through Decks' tools. Present with notes and a timer, share a link, embed it on a page, export to PDF and PowerPoint.

Decks has **no AI of its own** and never sells AI credits. Every generative act happens in the AI app you already pay for, connected over MCP.

Look around at **[decks.waronsaas.com](https://decks.waronsaas.com)**: three example decks (Acme Dental, Birch Law, Relay, all made up) open without an account. Making and editing decks needs a free warOnSaaS account.

## Two ways to run it

| Host it yourself, free | Host it with us |
|---|---|
| One `docker compose up` and it is yours. Any Postgres, or SQLite on one computer. No licence key, no limits, no AI bill. | We run it for you and charge what it costs us, times two, with the price shown openly. Move to your own server any time with one export. |

### Self-hosting in five minutes

```sh
git clone https://github.com/warOnSaaS/decks && cd decks
echo "OAUTH_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d          # Postgres and Decks, on http://localhost:3996
```

Open it and sign in with an email link. **The first person to sign in becomes the owner**; add teammates in Settings. Until you set up email (`SMTP_URL`), sign-in links are written to the server log (`docker compose logs decks`). The database sets itself up when the app starts.

Without Docker you need Node 20 or newer: `npm ci && npm start` for SQLite in `./data`, or `DATABASE_URL=postgres://... npm start`. PDF export needs Chromium: `npx playwright-core install chromium` (the Docker image has it).

### Settings

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres address. Without it, SQLite at `SQLITE_FILE` (default `./data/decks.db`) |
| `DATABASE_URL_UNPOOLED` | A direct Postgres address for live editing, when `DATABASE_URL` goes through a pooler (Neon, PgBouncer) |
| `OAUTH_SECRET` | A long random string that signs sign-in cookies and tokens. **Set it.** |
| `AUTH_PROVIDER` | `local` (email links, the default), `github` (GitHub plus email links) or `waronsaas` (the shared warOnSaaS account) |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | Sign in with GitHub. Callback: `https://your-host/oauth/github/callback` |
| `WOS_ACCOUNT_CLIENT_ID`, `WOS_ACCOUNT_CLIENT_SECRET`, `WOS_ACCOUNT_URL` | Sign in with a warOnSaaS account. Callback: `https://your-host/auth/waronsaas/callback` |
| `SMTP_URL`, `MAIL_FROM` | Send sign-in links, for example `smtp://user:pass@smtp.example.com:587` |
| `DECKS_TEAM_NAME` | The team's name (default "Our decks") |
| `DECKS_OPEN_SIGNUP=1` | Anyone who signs in gets a team of their own with the example decks (the hosted demo) |
| `DECKS_EXAMPLES=0` | Do not make the three example decks |
| `FILES_STORAGE=db` | Keep uploads in the database instead of on disk (`FILES_DIR`, default `./data/files`) |
| `FILES_MAX_MB` | Largest upload (default 20) |
| `CHROMIUM_PATH` | A Chromium to use for PDF export and slide previews |
| `CRM_URL` | Where links to CRM records point when Decks runs on its own |
| `PUBLIC_URL` | The address people use, for links in tool results |
| `PORT` | Default 3996 |

## What it does

- **Slides from ui-design kit blocks**, in eleven layouts (title, section, title and content, two columns, image left and right, full image, big number, quote, closing, blank): text, bullets, quotes, stats, cards, tables, charts (column, bar, line, area, donut), images, steps, timelines, checklists, callouts, the kit's agent answer blocks, scores, facts and buttons.
- **Every kit v2 scheme and style as a deck theme**: eight colour schemes in light and dark, corners, faces, card surfaces and density, plus eight ready looks. A brand on top: logo, accent colour, fonts, footer. On the hosted version, a warOnSaaS team's brand kit applies in one step.
- **An editor** with the slide list, the canvas and a properties panel. Keyboard-first: arrows or j and k between slides, n for a new slide, Enter to type on the slide, Cmd+D to duplicate, Alt+arrows to move, p to present, Cmd+K for every action, ? for the keys.
- **Live editing together** with [Yjs](https://github.com/yjs/yjs) (MIT): several people and AI apps in one deck at once; typing merges letter by letter. Each person's slide and block shows to the others.
- **Present mode** with a presenter view in its own window (notes, a timer, the clock, the next slide); the two follow each other.
- **Share** a view-only link (no account needed to look) or an embed for any web page. Links can be turned off.
- **Export** to PDF (Chromium through Playwright) and PowerPoint ([PptxGenJS](https://github.com/gitbrent/PptxGenJS), MIT) with real text boxes, tables and charts you can edit, and speaker notes.
- **Import PowerPoint**, best effort: titles, text and bullets, pictures, tables, charts (from the numbers in the file), speaker notes and the accent colour come across on the closest layout. The import report says what did not: exact positions, animations and transitions, drawn shapes and SmartArt, video, other chart kinds and the file's own fonts and colours.
- **Comments** on slides, with replies and resolving.
- **Linked work**: tie a deck to a CRM record (a deck for a deal), or ask for a review as a task on the board.
- **Export everything** at any time as one JSON file.

## For agents: the tools

Every action is a tool, served the same way to people and agents:

- **MCP** at `/mcp` (Streamable HTTP, with OAuth sign-in: discovery, dynamic client registration, PKCE). The app's Connect your AI page has one-click tiles for Claude and ChatGPT and one-line commands for Claude Code and Codex. Tool names on the wire are `decks_verb_noun`.
- **REST** at `POST /api/tools/<name>` (`decks.create_deck` or `decks_create_deck`), OpenAPI at `/api/openapi.json`. The screens use exactly this.

The full catalogue with schemas is [`tools.json`](tools.json) (`npm run tools:json`). The ones an agent builds decks with:

| Tool | What it does |
|---|---|
| `decks_list_layouts`, `decks_list_themes` | The vocabulary: layouts, block types with examples, themes, brand options, tips for good decks |
| `decks_create_deck` | A deck with a title, theme, brand and its slides in one call, or from an example |
| `decks_add_slide`, `decks_set_slide_content`, `decks_set_notes` | Slides with layouts, words, typed blocks, images and speaker notes |
| `decks_add_block`, `decks_update_block`, `decks_move_block`, `decks_remove_block` | One block at a time |
| `decks_add_chart`, `decks_add_image`, `decks_upload_file` | Charts from data, images by address or upload |
| `decks_apply_theme`, `decks_set_brand`, `decks_apply_team_brand` | The look |
| `decks_reorder_slides`, `decks_duplicate_slide`, `decks_delete_slide`, `decks_duplicate_deck` | Order and copies |
| `decks_preview_slide` | A picture of a slide, so the agent can check its own work |
| `decks_export_pdf`, `decks_export_pptx`, `decks_import_pptx` | Files in and out |
| `decks_share_deck`, `decks_unshare_deck` | View and embed links (an app asks the person first) |
| `decks_add_comment`, `decks_resolve_comment`, `decks_link_record`, `decks_request_review` | Working with the team, the CRM and the board |

Each tool has a scope (read, write, delete, admin). Tools marked `confirm: human` (sharing a public link, deleting a deck, removing someone) wait for a person's yes in Settings when an app calls them.

## Agent parity

Everything a person can do on screen, an agent can do through the same tools, and the build fails if that slips:

- `test/parity.test.mjs` (Playwright) opens every screen, panel and dialog at 1440 and 390 wide and checks that every button, link, field, file picker and editable text names a tool from the catalogue, or says `data-tool="none"` with a reason. Last run: **100%**, 3,687 screen actions on 70 screens. It writes `.shots/parity-report.json`.
- No side doors: screen code only calls `/api/tools/*`, uploads to `/files/decks` and listens on `/ws`.
- `test/tools.test.mjs` reaches every tool over MCP alone.
- `npm run agent-run`: an AI app signs in with MCP OAuth, builds a 10-slide deck from nothing over MCP only, looks at slide pictures, exports a PDF and a PowerPoint, and opens the PowerPoint with python-pptx (`PYTHON=... npm run agent-run`).

## Inside the wOS suite

Decks follows the suite's app contract ([warOnSaaS/suite](https://github.com/warOnSaaS/suite)):

| Part | File |
|---|---|
| Manifest | `wos-app.json` |
| Tool catalogue | `tools.json` |
| Tables | `migrations/0001_init.postgres.sql` and `0001_init.sqlite.sql`, every table `decks_*` with `team_id` |
| Server part | `server.mjs` default-exports `register(ctx)` (`lib/suite.mjs`): one handler per tool, files under `/files/decks/`, `exportTeam` |
| Screen part | `screens.mjs` exports `{ mount(el, ctx) }` (built from `src/client` and `public/app/decks.css` by `npm run bundle`) |

`node scripts/suite-check.mjs` (Node 22.6 or newer, the suite checked out next to this repo) loads Decks into a real suite core and drives it.

## How it is built

| Piece | How |
|---|---|
| A deck | A Yjs document saved in the database: a saved state plus the changes since, merged now and then. Tools change it on the server; the editor types into its own copy and sends changes through `decks.sync_doc` |
| Live | WebSockets at `/ws?deck=...`; several server copies share changes through Postgres `LISTEN/NOTIFY`; the editor catches up with `decks.get_changes` whenever the socket is down |
| Slides | One renderer (`lib/shared/render.mjs`) for the editor, present mode, share links, embeds, PDFs and previews; 960 by 540, scaled to fit |
| Themes | The kit's `tokens.css` rewritten to apply to a slide instead of the page (`public/app/deck-themes.css`, `npm run bundle`) |

## Development

```sh
npm ci
npm run dev                  # http://localhost:3996, SQLite, sign-in links in the log
npm test                     # every test on SQLite
DECKS_TEST_DATABASE_URL=postgres://... npm test   # adds two server copies sharing live changes on Postgres
npm run bundle               # rebuild public/app/decks.js, deck-themes.css and screens.mjs
npm run shots                # screenshots of every screen at 1440 and 390 into .shots/
npm run sync-kit             # copy the ui-design kit into public/ui
```

## License

AGPL-3.0. The ui-design kit in `public/ui` is Apache-2.0 and its fonts are under the SIL Open Font License (see `public/ui/NOTICE`). Yjs, PptxGenJS, JSZip and fast-xml-parser are MIT.
