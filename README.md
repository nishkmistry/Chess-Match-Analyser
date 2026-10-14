# Chess Match Analyser ♟️

**Chess Match Analyser** is a full-stack web application designed for chess enthusiasts to import, track, analyze, and review chess games played on **Chess.com** and **Lichess**. Featuring Stockfish engine evaluation, interactive move-by-move analysis boards, custom match notes, AI-generated game summaries (powered by Google Gemini), and customizable board/ui themes.

---

## ✨ Features

- 📥 **Game Import**: Import games directly from Chess.com or Lichess by username.
- ♟️ **Interactive Analysis Board**:
  - Powered by `chess.js` and `react-chessboard`.
  - Integrated local **Stockfish.js** engine evaluation and move analysis.
  - Move-by-move navigation with arrow keys or playback controls.
  - Interactive board flipper and move history annotation display.
- 🤖 **AI Match Insights**: Generate detailed game reports and tactical analyses using Gemini AI.
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
│   │   ├── components/         # AnalysisBoard, MatchTable, DashboardStats, ThemePicker, etc.
│   │   ├── App.jsx             # Main router & app layout
│   │   ├── ThemeContext.jsx    # Theme provider & dynamic variable manager
│   │   └── themes.js           # Theme color palettes
│   └── package.json
├── server/                     # Express API server & PostgreSQL connection
│   ├── db.js                   # Postgres pool configuration
│   ├── db_init.js              # Database initialization helper
│   ├── index.js                # Express app entrypoint & API endpoints
│   ├── schema.sql              # Database schema definitions
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
```

### **Frontend Environment Variables** (`client/.env`):
```env
VITE_GEMINI_API_KEY=your_google_gemini_api_key
```

---

## 🗄️ Database Setup

The application uses PostgreSQL to store match details and player information.

1. Ensure PostgreSQL is running and a database is created.
2. Run the SQL schema script located at `schema.sql` to initialize tables:

```bash
psql -U your_pg_user -d your_pg_database_name -f schema.sql
```

The database includes:
- `players`: Stores unique player usernames.
- `chess_matches`: Stores match metadata, move PGNs, player color, ELO ratings, notes, and game hash.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18+ installed
- **PostgreSQL**: Running instance

### 2. Installation
Install root and module dependencies:

```bash
# Install root & server dependencies
npm install

# Install client dependencies
cd client && npm install
cd ..
```

### 3. Running Locally

#### **Start the Backend Server**
```bash
cd server
node index.js
# Server runs on http://localhost:5000
```

#### **Start the Frontend Development Server**
In a new terminal:
```bash
cd client
npm run dev
# Vite dev server runs on http://localhost:5173
```

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/matches` | Retrieve all analyzed matches. |
| `GET` | `/api/matches/:id` | Retrieve detailed information for a specific match. |
| `POST` | `/api/matches/fetch` | Fetch and import games for a user from **Chess.com**. |
| `POST` | `/api/matches/fetch-lichess` | Fetch and import games for a user from **Lichess**. |
| `PATCH` | `/api/matches/:id/notes` | Update personal notes for a stored match. |
| `DELETE` | `/api/matches/:id` | Delete a saved match from the database. |

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
