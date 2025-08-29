import React from 'react';
import './animations.css';

const StatisticsCards = ({ stats, loading, activeOperation, OPERATIONS, formatFileSize }) => {
  // 防御性编程：确保所有必需的props都存在
  if (!OPERATIONS || !formatFileSize) {
    console.error('StatisticsCards: Missing required props', { OPERATIONS: !!OPERATIONS, formatFileSize: !!formatFileSize });
    return null;
  }

  if (loading && activeOperation === OPERATIONS.STATS && !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl animate-pulse">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-3 bg-slate-300/50 rounded w-16 mb-2"></div>
                <div className="h-6 bg-slate-300/50 rounded w-12"></div>
              </div>
              <div className="w-8 h-8 bg-slate-300/50 rounded-xl"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats || typeof stats !== 'object') return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* 记录总数 */}
      <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl card-smooth relative">
        {loading && activeOperation === OPERATIONS.STATS && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full spin-smooth"></div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">记录总数</p>
            <p className="text-lg font-bold text-slate-800 mt-1">
              {Number(stats.total_records || 0).toLocaleString()}
            </p>
            {Number(stats.total_records || 0) > 100000 && (
              <p className="text-xs text-amber-600 mt-1">可在系统设置中配置自动清理</p>
            )}
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 数据库大小 */}
      <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl card-smooth relative">
        {loading && activeOperation === OPERATIONS.STATS && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full spin-smooth"></div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">数据库大小</p>
            <p className="text-lg font-bold text-slate-800 mt-1">
              {formatFileSize(Number(stats.database_size_mb || 0))}
            </p>
            {Number(stats.database_size_mb || 0) > 100 && (
              <p className="text-xs text-amber-600 mt-1">数据库较大</p>
            )}
          </div>
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500/20 to-pink-600/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
        </div>
      </div>

      {/* WAL页数 */}
      <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl card-smooth relative">
        {loading && activeOperation === OPERATIONS.STATS && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full spin-smooth"></div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">WAL页数</p>
            <p className="text-lg font-bold text-slate-800 mt-1">
              {Number(stats.wal_pages || 0).toLocaleString()}
            </p>
            {Number(stats.wal_pages || 0) > 1000 && (
              <p className="text-xs text-blue-600 mt-1">系统将自动维护</p>
            )}
          </div>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center backdrop-blur-sm ${
            Number(stats.wal_pages || 0) > 1000
              ? 'bg-gradient-to-br from-red-500/20 to-rose-600/20'
              : 'bg-gradient-to-br from-amber-500/20 to-orange-600/20'
          }`}>
            <svg className={`w-4 h-4 ${Number(stats.wal_pages || 0) > 1000 ? 'text-red-600' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* WAL模式状态 */}
      <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl card-smooth relative">
        {loading && activeOperation === OPERATIONS.STATS && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full spin-smooth"></div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">WAL模式</p>
            <p className="text-lg font-bold text-slate-800 mt-1">
              {Boolean(stats.wal_mode_enabled) ? '已启用' : '未启用'}
            </p>
            {!Boolean(stats.wal_mode_enabled) && (
              <p className="text-xs text-amber-600 mt-1">建议启用WAL</p>
            )}
          </div>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center backdrop-blur-sm ${Boolean(stats.wal_mode_enabled)
            ? 'bg-gradient-to-br from-green-500/20 to-emerald-600/20'
            : 'bg-gradient-to-br from-red-500/20 to-rose-600/20'
            }`}>
            <svg className={`w-4 h-4 ${Boolean(stats.wal_mode_enabled) ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticsCards;