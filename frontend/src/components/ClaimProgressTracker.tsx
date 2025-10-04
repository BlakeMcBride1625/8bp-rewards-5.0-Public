import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';
import { 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users, 
  Activity,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ClaimProgress {
  processId: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  currentUser: string | null;
  totalUsers: number;
  completedUsers: number;
  failedUsers: number;
  userProgress: UserProgress[];
  logs: LogEntry[];
  exitCode?: number;
}

interface UserProgress {
  userId: string;
  status: 'starting' | 'in_progress' | 'completed' | 'failed';
  startTime: string;
  steps: Step[];
}

interface Step {
  step: string;
  timestamp: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'warning';
}

interface ClaimProgressTrackerProps {
  processId?: string;
  onClose?: () => void;
}

const stepLabels: Record<string, string> = {
  'navigating': 'Navigating to shop',
  'login_modal': 'Login modal appeared',
  'logged_in': 'Successfully logged in',
  'entering_id': 'Entering user ID',
  'go_clicked': 'Clicked Go button',
  'claimed': 'Successfully claimed',
  'failed': 'Failed to claim'
};

const stepIcons: Record<string, React.ReactNode> = {
  'navigating': <Activity className="w-3 h-3" />,
  'login_modal': <AlertCircle className="w-3 h-3" />,
  'logged_in': <CheckCircle className="w-3 h-3 text-green-500" />,
  'entering_id': <Users className="w-3 h-3" />,
  'go_clicked': <Play className="w-3 h-3" />,
  'claimed': <CheckCircle className="w-3 h-3 text-green-500" />,
  'failed': <XCircle className="w-3 h-3 text-red-500" />
};

const ClaimProgressTracker: React.FC<ClaimProgressTrackerProps> = ({ 
  processId, 
  onClose 
}) => {
  const [progress, setProgress] = useState<ClaimProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!processId) return;
    
    try {
      const response = await axios.get(API_ENDPOINTS.ADMIN_CLAIM_PROGRESS_BY_ID(processId), {
        withCredentials: true
      });
      setProgress(response.data);
      setError(null);
      
      // Stop auto-refresh if process is completed or failed
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        setAutoRefresh(false);
      }
    } catch (err: any) {
      setError('Failed to fetch progress');
      console.error('Progress fetch error:', err);
      // Don't stop auto-refresh on error, let user retry
    } finally {
      setIsLoading(false);
    }
  }, [processId]);

  useEffect(() => {
    if (processId) {
      setIsLoading(true);
      fetchProgress();
    }
  }, [processId, fetchProgress]);

  useEffect(() => {
    if (processId && autoRefresh) {
      const interval = setInterval(() => {
        fetchProgress();
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [processId, autoRefresh, fetchProgress]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'running': return 'text-blue-500';
      case 'starting': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'starting': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (!processId) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="text-center">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-2">
              No Active Claim Process
            </h3>
            <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
              Start a manual claim to see progress tracking here
            </p>
            <div className="flex space-x-4 justify-center">
              {onClose && (
                <button
                  onClick={onClose}
                  className="btn-primary"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            {progress && getStatusIcon(progress.status)}
            <div>
              <h3 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
                Claim Progress Tracker
              </h3>
              <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                Process ID: {processId}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="btn-secondary"
            >
              {showLogs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showLogs ? 'Hide' : 'Show'} Logs
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`btn-secondary ${autoRefresh ? 'bg-green-100 dark:bg-green-900' : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              Auto Refresh
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="btn-primary"
              >
                Close
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-text-secondary dark:text-text-dark-secondary">Loading progress...</p>
          </div>
        ) : error || !progress ? (
          <div className="text-center py-8">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-2">
              Error Loading Progress
            </h3>
            <p className="text-text-secondary dark:text-text-dark-secondary mb-4">
              {error || 'Progress data not found'}
            </p>
            <div className="flex space-x-4 justify-center">
              <button
                onClick={() => {
                  setAutoRefresh(true); // Re-enable auto-refresh on retry
                  fetchProgress();
                }}
                className="btn-secondary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="btn-primary"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">

                {/* Progress Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-medium text-text-secondary dark:text-text-dark-secondary">
                        Total
                      </span>
                    </div>
                    <p className="text-lg font-bold text-text-primary dark:text-text-dark-primary">
                      {progress.totalUsers}
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-xs font-medium text-text-secondary dark:text-text-dark-secondary">
                        Completed
                      </span>
                    </div>
                    <p className="text-lg font-bold text-green-500">
                      {progress.completedUsers}
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-medium text-text-secondary dark:text-text-dark-secondary">
                        Failed
                      </span>
                    </div>
                    <p className="text-lg font-bold text-red-500">
                      {progress.failedUsers}
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-medium text-text-secondary dark:text-text-dark-secondary">
                        Current
                      </span>
                    </div>
                    <p className="text-sm font-bold text-text-primary dark:text-text-dark-primary">
                      {progress.currentUser || 'None'}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-xs text-text-secondary dark:text-text-dark-secondary mb-1">
                    <span>Overall Progress</span>
                    <span>{progress.completedUsers + progress.failedUsers} / {progress.totalUsers}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${progress.totalUsers > 0 ? ((progress.completedUsers + progress.failedUsers) / progress.totalUsers) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>

                {/* User Progress List */}
                <div>
                  <h4 className="text-sm font-semibold text-text-primary dark:text-text-dark-primary mb-3">
                    User Progress
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    <AnimatePresence>
                      {progress.userProgress.slice(-5).map((user, index) => (
                        <motion.div
                          key={user.userId}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.1 }}
                          className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
                                User ID: {user.userId}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(user.status)} bg-opacity-20`}>
                                {user.status.replace('_', ' ')}
                              </span>
                            </div>
                            <span className="text-xs text-text-secondary dark:text-text-dark-secondary">
                              {formatTime(user.startTime)}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            {user.steps.slice(-3).map((step, stepIndex) => (
                              <div
                                key={stepIndex}
                                className="flex items-center space-x-1 text-xs bg-white dark:bg-gray-600 px-2 py-1 rounded"
                              >
                                {stepIcons[step.step]}
                                <span>{stepLabels[step.step] || step.step}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

            {/* Progress Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="card">
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium text-text-secondary dark:text-text-dark-secondary">
                    Total Users
                  </span>
                </div>
                <p className="text-2xl font-bold text-text-primary dark:text-text-dark-primary">
                  {progress.totalUsers}
                </p>
              </div>
              
              <div className="card">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-text-secondary dark:text-text-dark-secondary">
                    Completed
                  </span>
                </div>
                <p className="text-2xl font-bold text-green-500">
                  {progress.completedUsers}
                </p>
              </div>
              
              <div className="card">
                <div className="flex items-center space-x-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-text-secondary dark:text-text-dark-secondary">
                    Failed
                  </span>
                </div>
                <p className="text-2xl font-bold text-red-500">
                  {progress.failedUsers}
                </p>
              </div>
              
              <div className="card">
                <div className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium text-text-secondary dark:text-text-dark-secondary">
                    Current User
                  </span>
                </div>
                <p className="text-lg font-bold text-text-primary dark:text-text-dark-primary">
                  {progress.currentUser || 'None'}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm text-text-secondary dark:text-text-dark-secondary mb-2">
                <span>Overall Progress</span>
                <span>{progress.completedUsers + progress.failedUsers} / {progress.totalUsers}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${progress.totalUsers > 0 ? ((progress.completedUsers + progress.failedUsers) / progress.totalUsers) * 100 : 0}%`
                  }}
                />
              </div>
            </div>

            {/* User Progress List */}
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                User Progress
              </h4>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                <AnimatePresence>
                  {progress.userProgress.map((user, index) => (
                    <motion.div
                      key={user.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ delay: index * 0.1 }}
                      className="card"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-text-primary dark:text-text-dark-primary">
                            User ID: {user.userId}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(user.status)} bg-opacity-20`}>
                            {user.status.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-xs text-text-secondary dark:text-text-dark-secondary">
                          Started: {formatTime(user.startTime)}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {user.steps.map((step, stepIndex) => (
                          <div
                            key={stepIndex}
                            className="flex items-center space-x-1 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"
                          >
                            {stepIcons[step.step]}
                            <span>{stepLabels[step.step] || step.step}</span>
                            <span className="text-text-secondary dark:text-text-dark-secondary">
                              ({formatTime(step.timestamp)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Logs Section */}
            <AnimatePresence>
              {showLogs && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6"
                >
                  <h4 className="text-lg font-semibold text-text-primary dark:text-text-dark-primary mb-4">
                    Live Logs
                  </h4>
                  <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
                    {progress.logs.slice(-50).map((log, index) => (
                      <div key={index} className="mb-1">
                        <span className="text-gray-500">[{formatTime(log.timestamp)}]</span>
                        <span className={`ml-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-green-400'}`}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Timestamps */}
            <div className="mt-6 text-xs text-text-secondary dark:text-text-dark-secondary">
              <p>Started: {formatTime(progress.startTime)}</p>
              {progress.endTime && <p>Ended: {formatTime(progress.endTime)}</p>}
              {progress.exitCode !== undefined && <p>Exit Code: {progress.exitCode}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaimProgressTracker;
