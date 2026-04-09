import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Trophy, TrendingUp, Users, Activity } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function DashboardStats({ matches }) {
  
  const last10Matches = [...matches].slice(0, 10).reverse();

  const chartData = {
    labels: last10Matches.map((m) => {
        if(m.white_username && m.black_username) return `${m.white_username} vs ${m.black_username}`;
        return `Match ${m.match_id}`;
    }),
    datasets: [
      {
        label: 'Your ELO',
        data: last10Matches.map((m) => m.white_elo || 0),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        ticks: { display: false }
        
      },
      y: {
        beginAtZero: false,
      },
    },
  };

  
  let whiteSum = 0;
  let whiteCount = 0;
  let blackSum = 0;
  let blackCount = 0;
  
  let totalWins = 0;

  matches.forEach(m => {
    if (m.result === 'Win') totalWins++;
    if (m.white_elo) {
      whiteSum += m.white_elo;
      whiteCount++;
    }
    if (m.black_elo) {
      blackSum += m.black_elo;
      blackCount++;
    }
  });

  const avgWhite = whiteCount > 0 ? (whiteSum / whiteCount).toFixed(1) : 'N/A';
  const avgBlack = blackCount > 0 ? (blackSum / blackCount).toFixed(1) : 'N/A';

  const overallWinRate = matches.length > 0 ? ((totalWins / matches.length) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-500" />
          ELO Progression (Last 10)
        </h2>
        {last10Matches.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-8 text-center bg-slate-50 rounded-md">
            No matches logged yet. Include ELO to see chart.
          </p>
        ) : (
          <div className="h-48 w-full">
            <Line options={chartOptions} data={chartData} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-6 rounded-xl shadow-sm text-white relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10"></div>
          
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2 relative z-10">
            <Activity size={20} className="text-yellow-300" />
            Overall Performance
          </h2>
          <div className="text-2xl font-extrabold truncate relative z-10">
            {totalWins} Wins
          </div>
          <p className="text-indigo-100 mt-1 text-sm font-medium relative z-10">
            Win Rate: {overallWinRate}% across {matches.length} matches
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Users size={20} className="text-slate-500" />
            Avg. Pool Ratings
          </h2>
          
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded border border-slate-100">
              <span className="text-sm text-slate-500 font-medium tracking-wide">White</span>
              <span className="font-bold text-slate-800">{avgWhite}</span>
            </div>
            
            <div className="flex justify-between items-center bg-slate-800 px-3 py-2 rounded">
              <span className="text-sm text-slate-300 font-medium tracking-wide">Black</span>
              <span className="font-bold text-white">{avgBlack}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
