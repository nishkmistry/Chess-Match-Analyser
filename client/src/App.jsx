import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { format } from 'date-fns';

import MatchForm from './components/MatchForm';
import MatchTable from './components/MatchTable';
import { StatStrip, RatingChart, ResultsByColor } from './components/DashboardStats';
import AnalysisBoard from './components/AnalysisBoard';
import InsightsPage from './components/InsightsPage';
import TrainPage from './components/TrainPage';
import ScoutPage from './components/ScoutPage';
import ThemePicker from './components/ThemePicker';
import { useTheme } from './ThemeContext';
import { API_URL } from './lib/api';
import { sourceLabel } from './lib/matches';

const NAV = [
  { to: '/', label: 'Games', end: true },
  { to: '/insights', label: 'Insights' },
  { to: '/train', label: 'Training' },
  { to: '/scout', label: 'Scout' },
];

function Nav({ className = '' }) {
  return (
    <nav className={`tabs ${className}`} aria-label="Main">
      {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
    </nav>
  );
}

function Masthead({ matches, loading }) {
  const { handle, subline } = useMemo(() => {
    if (matches.length === 0) return { handle: null, subline: null };
    const counts = {};
    for (const m of matches) if (m.tracked_username) counts[m.tracked_username] = (counts[m.tracked_username] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const sites = [...new Set(matches.map((m) => sourceLabel(m.source)))].join(' and ');
    return {
      handle: top,
      subline: `${matches.length} games from ${sites}. Last played ${format(new Date(matches[0].played_at), 'd MMMM')}.`,
    };
  }, [matches]);

  return (
    <div className="min-w-0">
      <h1 className="truncate font-serif text-4xl font-semibold tracking-[-0.02em] text-ink md:text-5xl">
        {loading ? <span className="skeleton inline-block h-10 w-56 align-middle" /> : handle ?? 'Your games'}
      </h1>
      <p className="mt-2 text-muted">
        {loading ? <span className="skeleton inline-block h-4 w-72" /> : subline ?? 'Nothing here yet. Import a username to pull in recent games.'}
      </p>
    </div>
  );
}

function Dashboard({ matches, setMatches, loading, fetchMatches }) {
  const handleMatchDeleted = async (matchId) => {
    try {
      await axios.delete(`${API_URL}/${matchId}`);
      setMatches((prev) => prev.filter((m) => m.match_id !== matchId));
      toast.success('Game deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete match');
    }
  };

  return (
    <>
      <div className="flex flex-col gap-8 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <Masthead matches={matches} loading={loading} />
        <MatchForm onMatchesFetched={fetchMatches} apiUrl={API_URL} />
      </div>

      <StatStrip matches={matches} loading={loading} />

      <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <RatingChart matches={matches} loading={loading} />
        <ResultsByColor matches={matches} loading={loading} />
      </div>

      <MatchTable matches={matches} loading={loading} onDelete={handleMatchDeleted} />
    </>
  );
}

const ACCOUNT_KEY = 'chess-account';

function App() {
  const { theme } = useTheme();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  // Whose games Insights and Training look at; remembered per browser
  const [account, setAccount] = useState(() => {
    try {
      return localStorage.getItem(ACCOUNT_KEY);
    } catch {
      return null;
    }
  });
  const chooseAccount = useCallback((key) => {
    setAccount(key);
    try {
      localStorage.setItem(ACCOUNT_KEY, key);
    } catch {
      // Storage blocked: the choice just won't survive a reload
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      const response = await axios.get(API_URL);
      setMatches(response.data);
    } catch (error) {
      console.error('Failed to fetch matches', error);
      toast.error('Could not load your games. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  return (
    <Router>
      <ToastContainer position="bottom-right" autoClose={3500} theme={theme.mode} hideProgressBar />

      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={`https://lichess1.org/assets/piece/${theme.pieces}/${theme.mode === 'dark' ? 'w' : 'b'}N.svg`}
              alt=""
              className="size-8"
            />
            <span className="font-serif text-xl font-semibold tracking-[-0.01em] text-ink">Chess Match Analyser</span>
          </Link>
          <Nav className="hidden md:flex" />
          <ThemePicker />
        </div>
        <Nav className="mx-auto max-w-6xl px-5 pb-2.5 md:hidden" />
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-10 md:px-8 md:pt-12">
        <Routes>
          <Route path="/" element={<Dashboard matches={matches} setMatches={setMatches} loading={loading} fetchMatches={fetchMatches} />} />
          <Route path="/analysis/:matchId" element={<AnalysisBoard />} />
          <Route path="/insights" element={<InsightsPage matches={matches} loading={loading} account={account} onAccountChange={chooseAccount} />} />
          <Route path="/train" element={<TrainPage matches={matches} loading={loading} account={account} onAccountChange={chooseAccount} />} />
          <Route path="/scout" element={<ScoutPage />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
