import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';
import { toast } from 'react-hot-toast';
import { RotateCcw, RefreshCw, CheckCircle, XCircle, Mail, Clock, Shield, X } from 'lucide-react';

interface ResetLeaderboardAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ResetLeaderboardAccessStatus {
  isAllowed: boolean;
  hasActiveCode: boolean;
  dualChannelAuth?: boolean;
}

const ResetLeaderboardAuthModal: React.FC<ResetLeaderboardAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [step, setStep] = useState<'check' | 'request' | 'verify' | 'success'>('check');
  const [discordCode, setDiscordCode] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [accessStatus, setAccessStatus] = useState<ResetLeaderboardAccessStatus | null>(null);
  const [codesSent, setCodesSent] = useState<{discord: boolean; telegram: boolean}>({discord: false, telegram: false});

  // Check access status when modal opens
  useEffect(() => {
    if (isOpen) {
      checkAccessStatus();
    }
  }, [isOpen]);

  // Timer for code expiration
  useEffect(() => {
    if (step === 'verify' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, timeLeft]);

  const checkAccessStatus = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(API_ENDPOINTS.ADMIN_RESET_LEADERBOARD_ACCESS_STATUS, {
        withCredentials: true
      });
      setAccessStatus(response.data);
      
      if (!response.data.isAllowed) {
        toast.error('Access denied. You are not authorized to reset the leaderboard.');
        onClose();
        return;
      }
      
      setStep('request');
    } catch (error: any) {
      console.error('Failed to check access status:', error);
      toast.error('Failed to check access status');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const requestDiscordCode = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post(API_ENDPOINTS.ADMIN_RESET_LEADERBOARD_REQUEST_ACCESS, { channel: 'discord' }, {
        withCredentials: true
      });
      
      if (response.data.discordSent) {
        setCodesSent(prev => ({ ...prev, discord: true }));
        toast.success('Discord access code sent!');
        setTimeLeft(5 * 60); // 5 minutes
      } else {
        toast.error('Failed to send Discord access code.');
      }
    } catch (error: any) {
      console.error('Failed to request Discord code:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. You are not authorized to reset the leaderboard.');
      } else {
        toast.error('Failed to send Discord code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const requestTelegramCode = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post(API_ENDPOINTS.ADMIN_RESET_LEADERBOARD_REQUEST_ACCESS, { channel: 'telegram' }, {
        withCredentials: true
      });
      
      if (response.data.telegramSent) {
        setCodesSent(prev => ({ ...prev, telegram: true }));
        toast.success('Telegram access code sent!');
        setTimeLeft(5 * 60); // 5 minutes
      } else {
        toast.error('Failed to send Telegram access code.');
      }
    } catch (error: any) {
      console.error('Failed to request Telegram code:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. You are not authorized to reset the leaderboard.');
      } else {
        toast.error('Failed to send Telegram code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAccessCode = async () => {
    // Check if user has Telegram access based on codes sent
    const needsTelegramCode = codesSent.telegram;
    
    if (!discordCode.trim()) {
      toast.error('Please enter the Discord access code');
      return;
    }
    
    if (needsTelegramCode && !telegramCode.trim()) {
      toast.error('Please enter the Telegram access code');
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post(API_ENDPOINTS.ADMIN_RESET_LEADERBOARD_VERIFY_ACCESS, {
        discordCode: discordCode.trim(),
        telegramCode: telegramCode.trim()
      }, {
        withCredentials: true
      });
      
      const successMessage = needsTelegramCode 
        ? 'Access granted! Both codes verified successfully.'
        : 'Access granted! Discord code verified successfully.';
      
      toast.success(successMessage);
      setStep('success');
      
      // Wait a moment then close and call success
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Failed to verify access codes:', error);
      if (error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error('Invalid access codes');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white dark:bg-background-dark-secondary rounded-lg shadow-xl max-w-md w-full p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <RotateCcw className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary dark:text-text-dark-primary">
                  Reset Leaderboard Access
                </h2>
                <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
                  Dual-channel authentication required
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-background-dark-tertiary rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary dark:text-text-dark-secondary" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Step 1: Request Code */}
            {step === 'request' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <Mail className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-text-primary dark:text-text-dark-primary mb-2">
                    Request Access Codes
                  </h3>
                  <p className="text-text-secondary dark:text-text-dark-secondary">
                    Request access codes via Discord{accessStatus?.dualChannelAuth ? ' and/or Telegram' : ''} DMs.
                    You'll need the provided code{accessStatus?.dualChannelAuth ? 's' : ''} to reset the leaderboard.
                  </p>
                </div>
                
                <div className="space-y-4">
                  {/* Discord Section */}
                  <div className="space-y-2">
                    <button
                      onClick={requestDiscordCode}
                      disabled={isLoading || codesSent.discord}
                      className="w-full btn-primary flex items-center justify-center space-x-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Sending...</span>
                        </>
                      ) : codesSent.discord ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Discord Code Sent ✓</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4" />
                          <span>Send Discord Code</span>
                        </>
                      )}
                    </button>
                    
                    {codesSent.discord && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-text-primary dark:text-text-dark-primary">
                          Discord Access Code
                        </label>
                        <input
                          type="text"
                          value={discordCode}
                          onChange={(e) => setDiscordCode(e.target.value.toUpperCase())}
                          placeholder="Enter Discord code"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-background-dark-tertiary text-text-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-red-500"
                          maxLength={16}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Telegram Section */}
                  {accessStatus?.dualChannelAuth && (
                    <div className="space-y-2">
                      <button
                        onClick={requestTelegramCode}
                        disabled={isLoading || codesSent.telegram}
                        className="w-full btn-secondary flex items-center justify-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                            <span>Sending...</span>
                          </>
                        ) : codesSent.telegram ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Telegram Code Sent ✓</span>
                          </>
                        ) : (
                          <>
                            <Mail className="w-4 h-4" />
                            <span>Send Telegram Code</span>
                          </>
                        )}
                      </button>
                      
                      {codesSent.telegram && (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-text-primary dark:text-text-dark-primary">
                            Telegram Access Code
                          </label>
                          <input
                            type="text"
                            value={telegramCode}
                            onChange={(e) => setTelegramCode(e.target.value.toUpperCase())}
                            placeholder="Enter Telegram code"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-background-dark-tertiary text-text-primary dark:text-text-dark-primary focus:outline-none focus:ring-2 focus:ring-red-500"
                            maxLength={16}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Verify Button */}
                  {(codesSent.discord || codesSent.telegram) && (
                    <div className="pt-2">
                      {timeLeft > 0 && (
                        <div className="flex items-center justify-center space-x-2 text-sm text-orange-600 dark:text-orange-400 mb-3">
                          <Clock className="w-4 h-4" />
                          <span>Codes expire in {formatTime(timeLeft)}</span>
                        </div>
                      )}
                      
                      <button
                        onClick={verifyAccessCode}
                        disabled={isLoading || !discordCode.trim() || (codesSent.telegram && !telegramCode.trim()) || timeLeft === 0}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Verify Access</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 3: Success */}
            {step === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-4"
              >
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                <h3 className="text-lg font-medium text-text-primary dark:text-text-dark-primary">
                  Access Granted!
                </h3>
                <p className="text-text-secondary dark:text-text-dark-secondary">
                  You now have access to reset the leaderboard. Opening...
                </p>
              </motion.div>
            )}

            {/* Loading State */}
            {step === 'check' && isLoading && (
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto"></div>
                <p className="text-text-secondary dark:text-text-dark-secondary">
                  Checking access permissions...
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-text-secondary dark:text-text-dark-secondary text-center">
              🔒 Secure dual-channel authentication via Discord & Telegram • Messages auto-delete after use
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ResetLeaderboardAuthModal;
