import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import MatchForm from './components/MatchForm';
import MatchTable from './components/MatchTable';
import DashboardStats from './components/DashboardStats';
import AnalysisBoard from './components/AnalysisBoard';

const API_URL = import.meta.env.PROD ? '/api/matches' : 'http://localhost:5000/api/matches';

function Dashboard({ matches, setMatches, loading, fetchMatches }) {
  const handleMatchesFetched = (newMatches) => {
    fetchMatches(); // refresh to get updated state, or prepend them
  };

  const handleMatchDeleted = async (matchId) => {
    try {
      await axios.delete(`${API_URL}/${matchId}`);
      setMatches(matches.filter(m => m.match_id !== matchId));
    } catch (err) {
      console.error(err);
      alert('Failed to delete match');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <div className="lg:col-span-1 space-y-8">
        <MatchForm onMatchesFetched={handleMatchesFetched} apiUrl={API_URL} />
        <DashboardStats matches={matches} />
      </div>

      
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <MatchTable matches={matches} loading={loading} onDelete={handleMatchDeleted} />
      </div>
    </div>
  );
}

function App() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
    try {
      const response = await axios.get(API_URL);
      setMatches(response.data);
    } catch (error) {
      console.error('Failed to fetch matches', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  return (
    <Router>
      <div className="min-h-screen p-4 md:p-8 bg-slate-50 flex flex-col items-center">
        <ToastContainer position="top-right" autoClose={3000} />
        
        <header className="w-full max-w-7xl mb-8">
          <Link to="/">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight hover:text-blue-600 transition-colors">Chess Match Analyzer</h1>
          </Link>
          <p className="text-slate-500 mt-2 text-lg">Track, analyze, and improve your chess performance based on historical data.</p>
        </header>

        <main className="w-full max-w-7xl">
          <Routes>
            <Route path="/" element={<Dashboard matches={matches} setMatches={setMatches} loading={loading} fetchMatches={fetchMatches} />} />
            <Route path="/analysis/:matchId" element={<AnalysisBoard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

