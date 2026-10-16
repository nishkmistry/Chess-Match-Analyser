# Chess Match Analyser ♟️

**Chess Match Analyser** is a full-stack web application designed for chess enthusiasts to import, track, analyze, and review chess games played on **Chess.com** and **Lichess**. Featuring Stockfish engine evaluation, interactive move-by-move analysis boards, custom match notes, AI-written coaching notes (via Groq's free API), and customizable board/ui themes.

---

## ✨ Features

- 📥 **Game Import**: Import games directly from Chess.com or Lichess by username.
- ♟️ **Interactive Analysis Board**:
  - Powered by `chess.js` and `react-chessboard`.
  - Integrated local **Stockfish.js** engine evaluation, best-move arrow and principal variation.
  - Full-game review: evaluation graph, plus inaccuracies (?!), mistakes (?) and blunders (??) marked in the move list. Suspect moves get a second, deeper search.
  - Move-by-move navigation with arrow keys or playback controls.
  - Interactive board flipper and move history annotation display.
  - Reviews are **saved in the database**, so a game is only ever analysed once.
  - **Clock analysis**: both players' clocks over the game, with mistakes marked on them, average time per move, longest think and when time trouble started (from the PGN's `[%clk]` times).
- 🤖 **AI Coach's Notes (engine-grounded)**: An LLM on Groq (`openai/gpt-oss-120b` by default) writes up the opening, turning point, costliest mistake and takeaways, with links that jump the board to each moment.
  - It gets Stockfish's score for every move, the list of moves the engine flagged, and the clock times. It refuses to run without engine scores.
  - Every move it cites is checked against the engine's flagged moves. If one isn't flagged it's asked to correct itself once, and anything still unverified is marked *not flagged by Stockfish*.
  - Notes are saved with the game. The API key stays on the server.
- 🔎 **Insights across games** (per account):
  - **Where you lose ground**: inaccuracies, mistakes, blunders and average loss per move in the opening, middlegame and endgame.
  - **The clock**: how often you go wrong in time trouble, on quick moves and after long thinks, compared with your normal pace.
  - **Openings**: score per opening and colour, and the average engine score after move 12.
  - **Recurring mistakes**: missed mates, walking into mates, letting a piece be won, missed tactics and quiet slips, each with links to examples.
  - Review every unreviewed game in one go, in the browser, several at a time.
- 🧩 **Training from your own mistakes**: every mistake Stockfish finds in your games becomes a puzzle (the position before the mistake; find the better move). Moves other than the engine's are checked by Stockfish, so equally good answers count. Spaced repetition: solved puzzles come back after 1 day, 3 days, then further apart; missed ones after 10 minutes.
- 🕵️ **Opponent scouting**: look at an opponent's recent Chess.com or Lichess games, without saving them, to see their first moves, replies to 1.e4 and 1.d4, score per opening, how their games end, how often they get into time trouble, and short preparation notes.
- 📊 **Dashboard & Performance Statistics**:
  - Win/Loss/Draw breakdown charts using Chart.js.
  - Rating trends and performance stats.
- 🎨 **Custom Themes**: Dynamic UI and chessboard theme customization with persistent user preferences.
- 📝 **Personal Notes**: Add custom notes and reflections to any stored match.
- 🗺️ **SEO & Dynamic Sitemap**: Automatic sitemap generation for match pages.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS, Lucide React icons
- **Chess Engine & UI**: `chess.js`, `react-chessboard`, `stockfish.js`
- **Data Visualization**: Chart.js (`react-chartjs-2`)
- **HTTP Client**: Axios

### **Backend & Database**
- **Server**: Node.js & Express.js
- **Database**: PostgreSQL (`pg`)
- **Validation**: Zod
- **Serverless Integration**: `serverless-http` for Netlify Functions

### **Deployment & Hosting**
- **Platform**: Netlify (Frontend & Serverless API routing)

---

## 📁 Project Structure

```
chess-match-analyser/
├── client/                     # Frontend Vite + React application
│   ├── public/                 # Static assets & generated sitemap.xml
│   ├── src/
│   │   ├── components/         # AnalysisBoard, InsightsPage, TrainPage, ScoutPage, MatchTable, etc.
│   │   ├── lib/                # chess, clock, evaluation (Stockfish), insights, review, scout helpers
│   │   ├── App.jsx             # Main router & app layout
│   │   ├── ThemeContext.jsx    # Theme provider & dynamic variable manager
│   │   └── themes.js           # Theme color palettes
│   └── package.json
├── server/                     # Express API server & PostgreSQL connection
│   ├── db.js                   # Postgres pool configuration
│   ├── db_init.js              # Creates the local database & applies schema.sql
│   ├── index.js                # Express app entrypoint & API endpoints
│   ├── migrate_analysis.js     # Adds the game_analysis and puzzles tables
│   ├── migrate_player_color.js # Backfills colour/username on older imports
│   └── package.json
├── netlify/
│   └── functions/
│       └── api.js              # Serverless Netlify Function wrapper
├── netlify.toml                # Netlify deployment configuration
├── schema.sql                  # Root database schema SQL script
└── package.json                # Root package configuration
```

---

## ⚙️ Environment Variables

### **Backend / Root Environment Variables** (`server/.env` or deployment settings):
```env
PORT=5000
DB_USER=your_pg_user
DB_PASSWORD=your_pg_password
DB_HOST=your_pg_host
DB_PORT=5432
DB_NAME=your_pg_database_name
# Or single connection string:
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Groq key for AI coach's notes (free tier): https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key
# Optional
# GROQ_MODEL=openai/gpt-oss-120b   # must support strict structured outputs (gpt-oss / qwen3)
# GROQ_REASONING_EFFORT=low          # set empty when using a non-reasoning model
```

The frontend needs no environment variables. AI requests go through the server so the Groq key is never shipped to the browser.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v20.19+ or v22.12+ (Vite 8 won't start on older versions). Check with `node -v`.
- **PostgreSQL**: a local install, or a hosted database such as [Neon](https://neon.tech).
- **Groq API key** *(optional)*: only needed for AI coach's notes. Free at https://console.groq.com/keys.

### 2. Install dependencies
From the project root:

```bash
# Installs root packages, then server packages (via postinstall)
npm install

# Client packages
cd client
npm install
cd ..
```

### 3. Configure the server
Copy the example env file and fill it in (every variable is listed under **Environment Variables** above):

```bash
cp server/.env.example server/.env
```

- **Local Postgres**: set `DB_USER`, `DB_PASSWORD`, `DB_HOST=localhost`, `DB_PORT=5432` and `DB_NAME=chess_analyzer`. A password is required; the server refuses to start without `DB_PASSWORD` or `DATABASE_URL`.
- **Hosted Postgres**: set `DATABASE_URL` instead. It always connects over SSL.
- **AI notes**: set `GROQ_API_KEY`. Leave it empty and everything else still works.

`server/.env` is git-ignored, so your keys stay out of the repo.

### 4. Create the tables
The database has four tables:
- `players`: unique usernames.
- `chess_matches`: PGN, ratings, result, colour, notes and source site.
- `game_analysis`: saved Stockfish reviews (a score and best move per position) and the AI coach's notes, one row per game.
- `puzzles`: training positions from your mistakes, with their spaced-repetition schedule.

Deleting a game also deletes its review and puzzles.

**Local Postgres**: the init script creates a `chess_analyzer` database and applies `schema.sql`:
```bash
cd server
node db_init.js
cd ..
```

**Hosted or existing database**: run `schema.sql` yourself, or paste it into your provider's SQL editor:
```bash
psql -U your_pg_user -d your_pg_database_name -f schema.sql
```

**Upgrading an older database?** Two scripts bring it up to date. Both are safe to run more than once.
```bash
cd server
# Adds the game_analysis and puzzles tables
node migrate_analysis.js

# Games imported before the player_color / tracked_username columns existed show from White's side.
node migrate_player_color.js          # dry run: prints what it would change
node migrate_player_color.js --apply  # writes it
cd ..
```

### 5. Start the backend
```bash
cd server
node index.js
# Server running on port 5000
```

Check it's talking to the database. A fresh database returns `[]`:
```bash
curl http://localhost:5000/api/matches
```

### 6. Start the frontend
In a second terminal:
```bash
cd client
npm run dev
# Vite dev server runs on http://localhost:5173
```

Open **http://localhost:5173**. In development the client calls the API at `http://localhost:5000`, so keep the backend on port 5000. If you change `PORT`, update `client/src/lib/api.js` too.

### 7. Try it out
1. Pick **Chess.com** or **Lichess**, enter a username, choose how many games, and press **Import**.
2. The dashboard fills in: score, rating trend, results by colour and the games table.
3. Press **Review** on a game to open the analysis board. Step through moves with ← / →.
4. Press **Review all moves** to have Stockfish score every position and mark ?!, ? and ?? moves. The review is saved, your mistakes become training puzzles, and the **Clock** section shows how your time went.
5. With a Groq key set, press **Write the notes** under **Coach’s notes**. Each moment it mentions links back to that position on the board.
6. Open **Insights** and press **Review all** to analyse the rest of your games, then read where you lose ground, how the clock affects you, your openings and your recurring mistakes. If you've imported more than one account, choose whose games to look at.
7. Open **Training** to work through puzzles from your own mistakes.
8. Open **Scout**, enter an opponent's username, and read their preparation notes before you play them.

### Troubleshooting
| Symptom | Fix |
| :--- | :--- |
| `Missing database credentials` on server start | `server/.env` is missing, or has neither `DB_PASSWORD` nor `DATABASE_URL`. |
| `EADDRINUSE` on port 5000 or 5173 | Another copy is already running. Stop it, or free the port. |
| Dashboard empty / network errors in the console | The backend isn't running on port 5000. |
| "AI reports are not configured" | `GROQ_API_KEY` is empty. Set it and restart the server. |
| "Groq rate limit reached" | Free-tier limit; wait a minute and try again. |
| "Run the engine review first" | The coach needs Stockfish's scores. Press **Review all moves**, or **Review moves and write notes**. |
| `relation "game_analysis" does not exist` | The database predates saved reviews. Run `node migrate_analysis.js` in `server/`. |
| Training deck empty | Puzzles come from engine reviews. Review some games first (Insights → **Review all**). |
| Vite fails with a Node version error | Upgrade Node to v20.19+ or v22.12+. |

### Production build
```bash
npm run build   # builds the client into client/dist
```
For deployment, see **Deployment (Netlify)** below.

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/matches` | Retrieve all imported matches. |
| `GET` | `/api/matches/:id` | Retrieve detailed information for a specific match. |
| `POST` | `/api/matches/fetch` | Fetch and import games for a user from **Chess.com**. |
| `POST` | `/api/matches/fetch-lichess` | Fetch and import games for a user from **Lichess**. |
| `PATCH` | `/api/matches/:id/notes` | Update personal notes for a stored match. |
| `DELETE` | `/api/matches/:id` | Delete a saved match from the database. |
| `POST` | `/api/matches/:id/report` | Generate and save AI coach's notes via Groq. Body: `moves` (SAN list), `evals` (one score per position; at least 90% must be present) and optional `clocks` (`{ left, spent, pressure }` per move). The response includes `checks`: whether each cited move was flagged by the engine. |
| `GET` | `/api/matches/:id/analysis` | The saved engine review and coach's notes for a game, or `null` if it hasn't been reviewed. |
| `PUT` | `/api/matches/:id/analysis` | Save an engine review. Body: `evals`, `best_moves` (UCI per position) and `puzzles` (the tracked player's mistakes). Replaces the game's puzzles but keeps the schedule of any that survive. |
| `GET` | `/api/analyses` | Every saved review, for the cross-game insights. |
| `GET` | `/api/puzzles` | Due training puzzles (up to 50) plus deck counts. `?all=1` includes puzzles not yet due; `?username=&source=` limits it to one account. |
| `POST` | `/api/puzzles/:id/attempt` | Record an attempt. Body: `{ "solved": true }`. Returns the next due date. |
| `GET` | `/api/scout?platform=&username=&limit=` | An opponent's recent standard games from `chess.com` or `lichess` (5–100, default 50). Nothing is saved. |

---

## 🌐 Deployment (Netlify)

This project is configured for seamless deployment on **Netlify** using Netlify Functions.

1. Build command defined in `netlify.toml`:
   ```bash
   npm run build
   ```
2. Publish directory: `client/dist`
3. Functions directory: `netlify/functions`
4. Set required database connection and API keys in your Netlify Environment Variables settings.

---

## 📜 License

This project is open-source and available under the [ISC License](LICENSE).
