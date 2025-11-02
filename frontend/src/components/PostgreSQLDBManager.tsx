import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  Users, 
  FileText, 
  Settings, 
  HardDrive, 
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

interface User {
  id: string;
  eight_ball_pool_id: string;
  username: string;
  email: string | null;
  discord_id: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

interface ClaimRecord {
  id: string;
  eight_ball_pool_id: string;
  website_user_id: string;
  status: string;
  items_claimed: string[];
  error_message: string | null;
  claimed_at: string;
  metadata: any;
}

interface DatabaseStats {
  success: boolean;
  database: {
    type: string;
    status: string;
    userCount: number;
    timestamp: string;
  };
}

const PostgreSQLDBManager: React.FC = () => {
  const [activeView, setActiveView] = useState<'overview' | 'users' | 'claims' | 'tables' | 'query'>('overview');
  const [users, setUsers] = useState<User[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showQuery, setShowQuery] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);

  const itemsPerPage = 20;

  useEffect(() => {
    if (activeView === 'overview') {
      fetchStats();
    } else if (activeView === 'users') {
      fetchUsers();
    } else if (activeView === 'claims') {
      fetchClaims();
    } else if (activeView === 'tables') {
      fetchTables();
    }
  }, [activeView, currentPage]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/postgresql-db/');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError('Failed to fetch database stats');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * itemsPerPage;
      const response = await fetch(`/api/postgresql-db/users?limit=${itemsPerPage}&offset=${offset}`);
      const data = await response.json();
      setUsers(data.users);
      setTotalPages(Math.ceil(data.pagination.total / itemsPerPage));
    } catch (err) {
      setError('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchClaims = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * itemsPerPage;
      const response = await fetch(`/api/postgresql-db/claims?limit=${itemsPerPage}&offset=${offset}`);
      const data = await response.json();
      setClaims(data.claims);
      setTotalPages(Math.ceil(data.pagination.total / itemsPerPage));
    } catch (err) {
      setError('Failed to fetch claim records');
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/postgresql-db/tables');
      const data = await response.json();
      setTables(data.tables);
    } catch (err) {
      setError('Failed to fetch tables');
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/postgresql-db/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sqlQuery }),
      });
      const data = await response.json();
      setQueryResult(data);
    } catch (err) {
      setError('Failed to execute query');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.eight_ball_pool_id.includes(searchTerm)
  );

  const filteredClaims = claims.filter(claim => 
    claim.eight_ball_pool_id.includes(searchTerm) ||
    claim.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Total Users
              </span>
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
              {stats.database.userCount}
            </div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                Database Status
              </span>
            </div>
            <div className="text-sm font-bold text-green-900 dark:text-green-100 mt-1">
              {stats.database.status}
            </div>
          </div>
          
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
                Last Updated
              </span>
            </div>
            <div className="text-sm font-bold text-purple-900 dark:text-purple-100 mt-1">
              {formatDate(stats.database.timestamp)}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <button 
              onClick={() => setActiveView('users')}
              className="w-full btn-outline inline-flex items-center justify-center space-x-2"
            >
              <Users className="w-4 h-4" />
              <span>View All Users</span>
            </button>
            
            <button 
              onClick={() => setActiveView('claims')}
              className="w-full btn-outline inline-flex items-center justify-center space-x-2"
            >
              <FileText className="w-4 h-4" />
              <span>View Claim Records</span>
            </button>
            
            <button 
              onClick={() => setActiveView('tables')}
              className="w-full btn-outline inline-flex items-center justify-center space-x-2"
            >
              <Settings className="w-4 h-4" />
              <span>View Tables</span>
            </button>
          </div>
        </div>
        
        <div className="card">
          <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
            Database Information
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-text-secondary dark:text-text-dark-secondary">Type:</span>
              <span className="text-text-primary dark:text-text-dark-primary">PostgreSQL 15</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary dark:text-text-dark-secondary">Host:</span>
              <span className="text-text-primary dark:text-text-dark-primary">localhost:5432</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary dark:text-text-dark-secondary">Database:</span>
              <span className="text-text-primary dark:text-text-dark-primary">8bp_rewards</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
          Users ({users.length})
        </h3>
        <div className="flex items-center space-x-2">
          <Search className="w-4 h-4 text-text-secondary dark:text-text-dark-secondary" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">ID</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Username</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">8BP ID</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Created</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 px-3 text-text-primary dark:text-text-dark-primary font-mono text-xs">
                  {user.id.substring(0, 8)}...
                </td>
                <td className="py-2 px-3 text-text-primary dark:text-text-dark-primary">
                  {user.username}
                </td>
                <td className="py-2 px-3 text-text-primary dark:text-text-dark-primary font-mono">
                  {user.eight_ball_pool_id}
                </td>
                <td className="py-2 px-3 text-text-secondary dark:text-text-dark-secondary text-sm">
                  {formatDate(user.created_at)}
                </td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    user.is_active 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="btn-outline disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-text-secondary dark:text-text-dark-secondary">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="btn-outline disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  const renderClaims = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
          Claim Records ({claims.length})
        </h3>
        <div className="flex items-center space-x-2">
          <Search className="w-4 h-4 text-text-secondary dark:text-text-dark-secondary" />
          <input
            type="text"
            placeholder="Search claims..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">8BP ID</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Status</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Items</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Claimed At</th>
              <th className="text-left py-2 px-3 text-text-secondary dark:text-text-dark-secondary">Error</th>
            </tr>
          </thead>
          <tbody>
            {filteredClaims.map((claim) => (
              <tr key={claim.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 px-3 text-text-primary dark:text-text-dark-primary font-mono">
                  {claim.eight_ball_pool_id}
                </td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    claim.status === 'success' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {claim.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-text-primary dark:text-text-dark-primary">
                  {claim.items_claimed?.join(', ') || 'N/A'}
                </td>
                <td className="py-2 px-3 text-text-secondary dark:text-text-dark-secondary text-sm">
                  {formatDate(claim.claimed_at)}
                </td>
                <td className="py-2 px-3 text-text-secondary dark:text-text-dark-secondary text-sm">
                  {claim.error_message || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="btn-outline disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-text-secondary dark:text-text-dark-secondary">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="btn-outline disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  const renderTables = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
        Database Tables
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tables.map((table) => (
          <div key={table.table_name} className="card">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-text-primary dark:text-text-dark-primary">
                {table.table_name}
              </h4>
              <span className="text-xs text-text-secondary dark:text-text-dark-secondary">
                {table.table_type}
              </span>
            </div>
            <p className="text-sm text-text-secondary dark:text-text-dark-secondary mt-1">
              Schema: {table.table_schema}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderQuery = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary">
          SQL Query Interface
        </h3>
        <button
          onClick={() => setShowQuery(!showQuery)}
          className="btn-outline inline-flex items-center space-x-2"
        >
          {showQuery ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span>{showQuery ? 'Hide' : 'Show'} Query</span>
        </button>
      </div>

      {showQuery && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary dark:text-text-dark-secondary mb-2">
              SQL Query (SELECT only)
            </label>
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM registrations LIMIT 10;"
              className="w-full h-32 input font-mono text-sm"
            />
          </div>
          
          <button
            onClick={executeQuery}
            disabled={loading || !sqlQuery.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Execute Query
          </button>
        </div>
      )}

      {queryResult && (
        <div className="card">
          <h4 className="font-medium text-text-primary dark:text-text-dark-primary mb-2">
            Query Result
          </h4>
          <div className="overflow-x-auto">
            <pre className="text-sm text-text-secondary dark:text-text-dark-secondary">
              {JSON.stringify(queryResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
            PostgreSQL Database Management
          </h2>
          <div className="flex items-center space-x-3">
            <Database className="w-6 h-6 text-primary-500" />
            <span className="text-sm text-text-secondary dark:text-text-dark-secondary">
              Database: PostgreSQL
            </span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex space-x-2 mb-6">
          {[
            { id: 'overview', label: 'Overview', icon: Database },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'claims', label: 'Claims', icon: FileText },
            { id: 'tables', label: 'Tables', icon: Settings },
            { id: 'query', label: 'Query', icon: Search },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveView(tab.id as any);
                  setCurrentPage(1);
                  setSearchTerm('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeView === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-text-secondary dark:text-text-dark-secondary hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 inline mr-2" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-primary-500" />
            <span className="ml-2 text-text-secondary dark:text-text-dark-secondary">Loading...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {activeView === 'overview' && renderOverview()}
            {activeView === 'users' && renderUsers()}
            {activeView === 'claims' && renderClaims()}
            {activeView === 'tables' && renderTables()}
            {activeView === 'query' && renderQuery()}
          </>
        )}
      </div>
    </div>
  );
};

export default PostgreSQLDBManager;
