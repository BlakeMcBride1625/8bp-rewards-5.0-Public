import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useScreenshots } from '../hooks/useWebSocket';
import { Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';
import { detectDevice, DeviceInfo } from '../utils/deviceDetection';
import Skeleton from '../components/Skeleton';
import { 
  User, 
  Link2, 
  Camera, 
  LogOut,
  ExternalLink,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  AlertCircle,
  Send,
  RefreshCw,
  Shield,
  Monitor,
  Smartphone,
  Tablet,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface LinkedAccount {
  user_id: string; // username from registration or verification
  username: string;
  eightBallPoolId: string;
  dateLinked: string;
  successfulClaims: number;
  failedClaims: number;
  account_level?: number | null;
  account_rank?: string | null;
  verified_at?: string | null;
}

interface Screenshot {
  eightBallPoolId: string;
  username: string;
  screenshotUrl: string;
  claimedAt: string | null;
  capturedAt?: string | null;
  filename: string;
}

interface ScreenshotGroup {
  eightBallPoolId: string;
  username: string;
  screenshots: Screenshot[];
}

interface DeregistrationRequest {
  id: string;
  eight_ball_pool_id: string;
  status: 'pending' | 'approved' | 'denied';
  requested_at: string;
  reviewed_at?: string;
  review_notes?: string;
}

interface UserInfo {
  discordId: string;
  username: string;
  discriminator: string;
  avatar: string;
  currentIp: string;
  lastLoginAt: string | null;
}

const UserDashboardPage: React.FC = () => {
  const { user, isAuthenticated, isLoading, isAdmin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'accounts' | 'screenshots' | 'deregister'>('accounts');
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [deregistrationRequests, setDeregistrationRequests] = useState<DeregistrationRequest[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [selectedAccountForDeregister, setSelectedAccountForDeregister] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmittingDeregister, setIsSubmittingDeregister] = useState(false);
  const [screenshotRefreshKey, setScreenshotRefreshKey] = useState<number>(Date.now());
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editUsernameValue, setEditUsernameValue] = useState<string>('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      fetchAllData();
      // Detect device info on mount
      setDeviceInfo(detectDevice());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  // Import WebSocket hook for screenshots
  const { shouldRefresh, consumeRefresh } = useScreenshots(
    activeTab === 'screenshots' && user?.id ? user.id : null
  );

  // Auto-refresh screenshots when screenshots tab is active
  useEffect(() => {
    if (!isAuthenticated || isLoading || activeTab !== 'screenshots') {
      return;
    }

    // Fetch screenshots immediately when tab becomes active
    fetchScreenshots();
  }, [isAuthenticated, isLoading, activeTab]);

  // Listen for WebSocket screenshot updates
  useEffect(() => {
    if (activeTab === 'screenshots' && shouldRefresh) {
      fetchScreenshots();
      consumeRefresh();
    }
  }, [shouldRefresh, activeTab, consumeRefresh]);

  const fetchAllData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      await Promise.all([
        fetchLinkedAccounts(),
        fetchScreenshots(),
        fetchDeregistrationRequests(),
        fetchUserInfo()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  const fetchLinkedAccounts = async () => {
    try {
      // Add timestamp to force fresh request
      const url = `${API_ENDPOINTS.USER_LINKED_ACCOUNTS}?_t=${Date.now()}`;
      console.log('🔍 Fetching linked accounts from:', url);
      const response = await axios.get(url, {
        withCredentials: true,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      console.log('📥 Linked accounts API response:', JSON.stringify(response.data, null, 2));
      console.log('📊 Response success:', response.data.success);
      console.log('📊 Account count from API:', response.data.accounts?.length || 0);
      console.log('📊 Accounts array:', response.data.accounts);
      
      if (response.data.success) {
        const accounts = response.data.accounts || [];
        console.log('✅ Setting linked accounts:', accounts);
        console.log('✅ Account count being set:', accounts.length);
        console.log('✅ Accounts being set:', accounts.map((a: any) => ({
          username: a.username,
          eightBallPoolId: a.eightBallPoolId,
          dateLinked: a.dateLinked
        })));
        setLinkedAccounts(accounts);
      } else {
        console.error('❌ API returned success=false:', response.data);
      }
    } catch (error: any) {
      console.error('❌ Error fetching linked accounts:', error);
      console.error('❌ Error response:', error.response?.data);
    }
  };

  const fetchScreenshots = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_SCREENSHOTS, {
        withCredentials: true
      });
      if (response.data.success) {
        setScreenshots(response.data.screenshots);
        // Update refresh key to force image reload
        setScreenshotRefreshKey(Date.now());
      }
    } catch (error) {
      console.error('Error fetching screenshots:', error);
    }
  };

  const groupedScreenshots = useMemo<ScreenshotGroup[]>(() => {
    if (screenshots.length === 0) {
      return [];
    }

    const map = new Map<string, ScreenshotGroup>();

    screenshots.forEach((shot) => {
      const key = `${shot.eightBallPoolId}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          eightBallPoolId: shot.eightBallPoolId,
          username: shot.username,
          screenshots: [shot]
        });
      } else {
        existing.screenshots.push(shot);
      }
    });

    return Array.from(map.values()).map((group) => ({
      ...group,
      screenshots: [...group.screenshots].sort((a, b) => {
        const aTime = new Date(a.capturedAt ?? a.claimedAt ?? 0).getTime();
        const bTime = new Date(b.capturedAt ?? b.claimedAt ?? 0).getTime();
        return bTime - aTime;
      })
    })).sort((a, b) => {
      // Sort groups by most recent screenshot
      const aTime = new Date(a.screenshots[0].capturedAt ?? a.screenshots[0].claimedAt ?? 0).getTime();
      const bTime = new Date(b.screenshots[0].capturedAt ?? b.screenshots[0].claimedAt ?? 0).getTime();
      return bTime - aTime;
    });
  }, [screenshots]);

  const fetchDeregistrationRequests = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_DEREGISTRATION_REQUESTS, {
        withCredentials: true
      });
      if (response.data.success) {
        setDeregistrationRequests(response.data.requests);
      }
    } catch (error) {
      console.error('Error fetching deregistration requests:', error);
    }
  };

  const fetchUserInfo = async () => {
    try {
      const response = await axios.get(API_ENDPOINTS.USER_INFO, {
        withCredentials: true
      });
      if (response.data.success) {
        // Backend returns user, currentIp, lastLoginAt at top level
        setUserInfo({
          ...response.data.user,
          currentIp: response.data.currentIp || 'Unknown',
          lastLoginAt: response.data.lastLoginAt || null
        });
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  };

  const handleEditUsername = (account: LinkedAccount) => {
    setEditingUsername(account.eightBallPoolId);
    setEditUsernameValue(account.username || '');
  };

  const handleCancelEdit = () => {
    setEditingUsername(null);
    setEditUsernameValue('');
  };

  const handleSaveUsername = async (eightBallPoolId: string) => {
    if (!editUsernameValue.trim()) {
      toast.error('Username cannot be empty');
      return;
    }

    if (editUsernameValue.trim().length < 2 || editUsernameValue.trim().length > 50) {
      toast.error('Username must be between 2 and 50 characters');
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const response = await axios.put(
        API_ENDPOINTS.USER_UPDATE_USERNAME,
        {
          eightBallPoolId,
          newUsername: editUsernameValue.trim()
        },
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success('Username updated successfully');
        // Update the account in the linkedAccounts state
        setLinkedAccounts(prevAccounts =>
          prevAccounts.map(account =>
            account.eightBallPoolId === eightBallPoolId
              ? { ...account, username: editUsernameValue.trim(), user_id: editUsernameValue.trim() }
              : account
          )
        );
        setEditingUsername(null);
        setEditUsernameValue('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update username');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleDeregistrationRequest = async () => {
    if (!selectedAccountForDeregister) {
      toast.error('Please select an account to deregister');
      return;
    }

    setIsSubmittingDeregister(true);
    try {
      const response = await axios.post(
        API_ENDPOINTS.USER_DEREGISTRATION_REQUEST,
        { eightBallPoolId: selectedAccountForDeregister },
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success('Deregistration request submitted successfully. An admin will review it shortly.');
        setSelectedAccountForDeregister('');
        await fetchDeregistrationRequests();
        await fetchLinkedAccounts();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to submit deregistration request');
    } finally {
      setIsSubmittingDeregister(false);
    }
  };

  const getDiscordAvatarUrl = (userId: string, avatar: string | null) => {
    if (avatar) {
      return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
    }
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-primary dark:text-text-dark-primary">Loading...</div>
      </div>
    );
  }

  // Only redirect if we've finished loading and user is not authenticated
  if (!isLoading && !isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen pt-8 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
            <div className="flex items-center space-x-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-primary-500/30 dark:bg-dark-accent-blue/30 rounded-full blur-lg group-hover:blur-xl transition-all duration-300" />
                <img
                  src={getDiscordAvatarUrl(user?.id || '', user?.avatar || null)}
                  alt={user?.username}
                  className="relative w-24 h-24 rounded-full border-4 border-white dark:border-background-dark-secondary shadow-xl"
                />
                <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-white dark:border-background-dark-secondary rounded-full" />
              </div>
              
              <div className="text-center md:text-left">
                <h1 className="text-4xl font-bold text-text-primary dark:text-white mb-1 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
                  {user?.username}
                </h1>
                <div className="flex items-center justify-center md:justify-start space-x-2">
                  {user?.discriminator && user.discriminator !== '0' && (
                    <span className="px-3 py-1 rounded-full bg-primary-100/50 dark:bg-white/10 text-primary-700 dark:text-gray-300 text-sm font-medium backdrop-blur-sm">
                      #{user.discriminator}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="px-3 py-1 rounded-full bg-purple-100/50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-sm font-medium backdrop-blur-sm border border-purple-200/50 dark:border-purple-500/30">
                      Admin
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {isAdmin && (
                <Link
                  to="/admin-dashboard"
                  className="btn-secondary flex items-center space-x-2 px-5 py-2.5 shadow-lg shadow-gray-200/50 dark:shadow-none"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Panel</span>
                </Link>
              )}
              <button
                onClick={logout}
                className="btn-outline flex items-center space-x-2 px-5 py-2.5 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-500/30 transition-all duration-300"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* User Stats Grid */}
          {userInfo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-10">
              <motion.div 
                whileHover={{ y: -4 }}
                className="card p-6 flex items-center space-x-4 bg-gradient-to-br from-white/80 to-white/40 dark:from-background-dark-secondary/80 dark:to-background-dark-secondary/40"
              >
                <div className="p-3 rounded-2xl bg-blue-100/50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Current IP</p>
                  <p className="text-lg font-bold text-text-primary dark:text-white font-mono">
                    {userInfo.currentIp}
                  </p>
                </div>
              </motion.div>

              {deviceInfo && (
                <motion.div 
                  whileHover={{ y: -4 }}
                  className="card p-6 flex items-center space-x-4 bg-gradient-to-br from-white/80 to-white/40 dark:from-background-dark-secondary/80 dark:to-background-dark-secondary/40"
                >
                  <div className="p-3 rounded-2xl bg-purple-100/50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
                    {deviceInfo.type === 'mobile' ? (
                      <Smartphone className="w-6 h-6" />
                    ) : deviceInfo.type === 'tablet' ? (
                      <Tablet className="w-6 h-6" />
                    ) : (
                      <Monitor className="w-6 h-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Device</p>
                    <p className="text-lg font-bold text-text-primary dark:text-white truncate" title={`${deviceInfo.os} • ${deviceInfo.browser}`}>
                      {deviceInfo.os}
                    </p>
                    <p className="text-xs text-text-muted dark:text-gray-500">
                      {deviceInfo.browser}
                    </p>
                  </div>
                </motion.div>
              )}

              <motion.div 
                whileHover={{ y: -4 }}
                className="card p-6 flex items-center space-x-4 bg-gradient-to-br from-white/80 to-white/40 dark:from-background-dark-secondary/80 dark:to-background-dark-secondary/40"
              >
                <div className="p-3 rounded-2xl bg-green-100/50 dark:bg-green-500/20 text-green-600 dark:text-green-400">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-secondary dark:text-gray-400">Last Login</p>
                  <p className="text-lg font-bold text-text-primary dark:text-white">
                    {userInfo.lastLoginAt ? new Date(userInfo.lastLoginAt).toLocaleDateString() : 'Never'}
                  </p>
                  <p className="text-xs text-text-muted dark:text-gray-500">
                    {userInfo.lastLoginAt ? new Date(userInfo.lastLoginAt).toLocaleTimeString() : ''}
                  </p>
                </div>
              </motion.div>
            </div>
          )}

          {/* Link Account Banner */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#5865F2] via-[#5865F2] to-[#4752C4] dark:from-[#5865F2] dark:via-[#4752C4] dark:to-[#3C45A5] shadow-2xl shadow-[#5865F2]/30 border border-[#5865F2]/20"
          >
            {/* Decorative elements */}
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
            
            <div className="relative p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-start space-x-4 flex-1">
                {/* Discord Icon */}
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg border border-white/30">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24" aria-label="Discord">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </div>
                </div>
                
                {/* Text Content */}
                <div className="text-white space-y-3 flex-1">
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight">Link Your 8 Ball Pool Account</h3>
                  <p className="text-white/90 text-base md:text-lg leading-relaxed max-w-2xl">
                    Join our Discord server and use the{' '}
                    <code className="bg-white/25 backdrop-blur-sm px-3 py-1 rounded-lg text-white font-mono text-sm md:text-base border border-white/30 shadow-sm">
                      /link-account
                    </code>{' '}
                    command to start claiming rewards automatically.
                  </p>
                </div>
              </div>
              
              {/* CTA Button */}
              <a
                href={process.env.REACT_APP_DISCORD_INVITE_URL || 'https://discord.gg/7EgQJSXY6d'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 group relative overflow-hidden bg-white text-[#5865F2] font-semibold px-6 py-3.5 rounded-xl shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border-2 border-white/20 hover:border-white/40"
              >
                <span className="relative z-10 flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span>Join Discord Server</span>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </a>
            </div>
          </motion.div>
        </motion.div>

        {/* Tabs Navigation */}
        <div className="mb-10">
          <div className="flex p-1 bg-gray-100/50 dark:bg-background-dark-tertiary/50 backdrop-blur-md rounded-xl border border-white/20 dark:border-white/5 w-fit mx-auto md:mx-0">
            {[
              { id: 'accounts', label: 'Linked Accounts', icon: Link2 },
              { id: 'screenshots', label: 'Screenshots', icon: Camera },
              { id: 'deregister', label: 'Deregister', icon: Send }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'text-primary-700 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white dark:bg-background-dark-secondary rounded-lg shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center space-x-2">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-primary-500 dark:text-dark-accent-blue' : ''}`} />
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {isLoadingData ? (
            <div className="space-y-8">
              {/* Skeleton Loading State */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="card p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <Skeleton className="h-20 rounded-xl" />
                      <Skeleton className="h-20 rounded-xl" />
                    </div>
                    <div className="flex justify-between pt-4 border-t border-gray-100 dark:border-white/5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ... existing tab content ... */}
              {/* Linked Accounts Tab */}
              {activeTab === 'accounts' && (
                <div className="space-y-8">
                  {linkedAccounts.length === 0 ? (
                    <div className="card p-12 text-center">
                      <div className="w-20 h-20 bg-gray-100 dark:bg-background-dark-tertiary rounded-full flex items-center justify-center mx-auto mb-6">
                        <Link2 className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">No Accounts Linked</h3>
                      <p className="text-text-secondary dark:text-gray-400 max-w-md mx-auto mb-8">
                        Link your 8 Ball Pool account via Discord to start earning automated rewards.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                      {linkedAccounts.map((account) => (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          key={account.eightBallPoolId}
                          className="card overflow-hidden group hover:border-primary-200 dark:hover:border-dark-accent-blue/30 transition-all duration-300"
                        >
                          <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1 min-w-0">
                                {editingUsername === account.eightBallPoolId ? (
                                  <div className="flex items-center space-x-2 mb-1">
                                    <input
                                      type="text"
                                      value={editUsernameValue}
                                      onChange={(e) => setEditUsernameValue(e.target.value)}
                                      className="flex-1 px-3 py-1.5 text-xl font-bold bg-white dark:bg-background-dark-secondary border border-primary-300 dark:border-dark-accent-blue rounded-lg text-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-dark-accent-blue"
                                      disabled={isUpdatingUsername}
                                      maxLength={50}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveUsername(account.eightBallPoolId);
                                        } else if (e.key === 'Escape') {
                                          handleCancelEdit();
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleSaveUsername(account.eightBallPoolId)}
                                      disabled={isUpdatingUsername}
                                      className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                                      title="Save username"
                                    >
                                      <Save className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      disabled={isUpdatingUsername}
                                      className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                                      title="Cancel editing"
                                    >
                                      <X className="w-5 h-5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-xl font-bold text-text-primary dark:text-white truncate flex-1">
                                      {account.username || account.user_id}
                                    </h3>
                                    <button
                                      onClick={() => handleEditUsername(account)}
                                      className="flex items-center justify-center p-2 text-primary-600 dark:text-dark-accent-blue hover:text-primary-700 dark:hover:text-dark-accent-blue hover:bg-primary-100 dark:hover:bg-dark-accent-blue/20 rounded-lg transition-all duration-200 border border-primary-200 dark:border-dark-accent-blue/30 hover:border-primary-300 dark:hover:border-dark-accent-blue/50 shadow-sm hover:shadow"
                                      title="Edit username"
                                      aria-label="Edit username"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                <div className="flex items-center space-x-2 text-sm text-text-secondary dark:text-gray-400 mt-1">
                                  <span className="font-mono bg-gray-100 dark:bg-background-dark-tertiary px-2 py-0.5 rounded text-xs">
                                    ID: {account.eightBallPoolId}
                                  </span>
                                </div>
                              </div>
                              <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-dark-accent-blue/10 flex items-center justify-center text-primary-600 dark:text-dark-accent-blue flex-shrink-0">
                                <User className="w-5 h-5" />
                              </div>
                            </div>

                            {/* Account Level and Rank - Always visible section */}
                            <div className="mb-6 flex items-center gap-2 flex-wrap">
                              {account.account_level ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  Level {account.account_level}
                                </span>
                              ) : null}
                              {account.account_rank ? (
                                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                                  account.account_rank.toLowerCase().includes('grandmaster') || account.account_rank.toLowerCase().includes('master') ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' :
                                  account.account_rank.toLowerCase().includes('expert') || account.account_rank.toLowerCase().includes('professional') ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' :
                                  account.account_rank.toLowerCase().includes('advanced') || account.account_rank.toLowerCase().includes('intermediate') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' :
                                  account.account_rank.toLowerCase().includes('rookie') || account.account_rank.toLowerCase().includes('beginner') ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' :
                                  'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                                } border`}>
                                  {account.account_rank}
                                </span>
                              ) : null}
                              {(!account.account_level && !account.account_rank) && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                                  Verify via Discord to show Level & Rank
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-500/5 border border-green-100 dark:border-green-500/10">
                                <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Successful Claims</p>
                                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{account.successfulClaims}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10">
                                <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Failed Claims</p>
                                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{account.failedClaims}</p>
                              </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-sm">
                              <span className="text-text-secondary dark:text-gray-400">Linked on {formatDate(account.dateLinked)}</span>
                              <span className="flex items-center text-primary-600 dark:text-dark-accent-blue font-medium">
                                Active <CheckCircle className="w-4 h-4 ml-1.5" />
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Screenshots Tab */}
              {activeTab === 'screenshots' && (
                <div className="space-y-6">
                  {groupedScreenshots.length === 0 ? (
                    <div className="card p-12 text-center">
                      <div className="w-20 h-20 bg-gray-100 dark:bg-background-dark-tertiary rounded-full flex items-center justify-center mx-auto mb-6">
                        <Camera className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                      </div>
                      <h3 className="text-xl font-bold text-text-primary dark:text-white mb-2">No Screenshots Yet</h3>
                      <p className="text-text-secondary dark:text-gray-400 max-w-md mx-auto">
                        Confirmation screenshots will appear here after your rewards are claimed.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-8">
                      {groupedScreenshots.map((group) => (
                        <div key={group.eightBallPoolId} className="space-y-4">
                          <div className="flex items-center space-x-3 px-2">
                            <h3 className="text-lg font-bold text-text-primary dark:text-white">
                              {group.username}
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-xs font-medium text-gray-600 dark:text-gray-300">
                              {group.screenshots.length} images
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {group.screenshots.map((shot) => (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={`${shot.eightBallPoolId}-${shot.filename}`}
                                className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-gray-100 dark:bg-background-dark-tertiary shadow-lg border border-white/20 dark:border-white/5"
                              >
                                <img
                                  src={`${shot.screenshotUrl}?t=${screenshotRefreshKey}`}
                                  alt={`Proof for ${shot.username}`}
                                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  loading="lazy"
                                  crossOrigin="anonymous"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    console.error('Screenshot load error:', shot.screenshotUrl, 'Status:', target.complete ? 'complete' : 'incomplete');
                                    target.style.display = 'none';
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = 'flex';
                                  }}
                                  onLoad={() => {
                                    console.log('Screenshot loaded:', shot.filename);
                                  }}
                                />
                                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-100 dark:bg-background-dark-tertiary" style={{ display: 'none' }}>
                                  <div className="text-center text-gray-500 dark:text-gray-400">
                                    <Camera className="w-8 h-8 mx-auto mb-2" />
                                    <p className="text-sm">Image not found</p>
                                  </div>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                  <p className="text-white text-xs font-medium mb-1">
                                    {formatDate(shot.claimedAt || shot.capturedAt)}
                                  </p>
                                  <button 
                                    onClick={() => window.open(shot.screenshotUrl, '_blank')}
                                    className="w-full btn bg-white/20 backdrop-blur-md text-white hover:bg-white/30 border-none text-xs py-2"
                                  >
                                    View Full Size
                                  </button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Deregistration Tab */}
              {activeTab === 'deregister' && (
                <div className="max-w-2xl mx-auto">
                  <div className="card p-8 mb-8 border-l-4 border-l-yellow-500">
                    <div className="flex items-start space-x-4">
                      <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 flex-shrink-0">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-text-primary dark:text-white mb-2">Warning</h3>
                        <p className="text-text-secondary dark:text-gray-300 text-sm leading-relaxed">
                          Submitting a deregistration request will unlink your 8 Ball Pool account. 
                          This requires admin approval. Once approved, you will stop receiving automated rewards.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-8">
                    <h3 className="text-xl font-bold text-text-primary dark:text-white mb-6">Submit Request</h3>
                    
                    {linkedAccounts.length === 0 ? (
                      <div className="text-center py-8 text-text-secondary dark:text-gray-400">
                        No eligible accounts found to deregister.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <label className="label mb-2">Select Account</label>
                          <div className="relative">
                            <select
                              value={selectedAccountForDeregister}
                              onChange={(e) => setSelectedAccountForDeregister(e.target.value)}
                              className="input appearance-none"
                            >
                              <option value="">Select an account...</option>
                              {linkedAccounts.map((account) => {
                                const hasPending = deregistrationRequests.some(
                                  req => req.eight_ball_pool_id === account.eightBallPoolId && req.status === 'pending'
                                );
                                return (
                                  <option 
                                    key={account.eightBallPoolId} 
                                    value={account.eightBallPoolId}
                                    disabled={hasPending}
                                  >
                                    {account.username} ({account.eightBallPoolId}) {hasPending ? '[Pending]' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                              <User className="w-4 h-4" />
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={handleDeregistrationRequest}
                          disabled={!selectedAccountForDeregister || isSubmittingDeregister}
                          className="btn-primary w-full py-3 text-base shadow-lg shadow-primary-500/20"
                        >
                          {isSubmittingDeregister ? (
                            <span className="flex items-center space-x-2">
                              <RefreshCw className="w-5 h-5 animate-spin" />
                              <span>Processing...</span>
                            </span>
                          ) : (
                            <span className="flex items-center space-x-2">
                              <Send className="w-5 h-5" />
                              <span>Submit Request</span>
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {deregistrationRequests.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-lg font-bold text-text-primary dark:text-white mb-4 px-2">Request History</h3>
                      <div className="space-y-3">
                        {deregistrationRequests.map((req) => (
                          <div key={req.id} className="card p-4 flex items-center justify-between">
                            <div>
                              <p className="font-mono text-sm text-text-primary dark:text-white mb-1">
                                {req.eight_ball_pool_id}
                              </p>
                              <p className="text-xs text-text-secondary dark:text-gray-400">
                                {formatDate(req.requested_at)}
                              </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' :
                              req.status === 'denied' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                              'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                            }`}>
                              {req.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default UserDashboardPage;

