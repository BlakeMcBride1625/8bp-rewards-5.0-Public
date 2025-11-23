import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, User, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const DashboardSelectionPage: React.FC = () => {
  const { user, isAuthenticated, isAdmin, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-text-secondary dark:text-text-dark-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary dark:text-text-dark-primary mb-4">
            Welcome back, {user?.username}!
          </h1>
          <p className="text-xl text-text-secondary dark:text-text-dark-secondary">
            Choose where you'd like to go.
          </p>
        </motion.div>

        {/* Dashboard Selection Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* User Dashboard Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <Link
              to="/user-dashboard"
              className="card group hover:shadow-lg transition-all duration-300 block h-full"
            >
              <div className="flex flex-col items-center text-center p-8">
                <div className="w-20 h-20 bg-primary-100 dark:bg-dark-accent-navy/30 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <User className="w-10 h-10 text-primary-600 dark:text-dark-accent-navy" />
                </div>
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-3">
                  My User Dashboard
                </h2>
                <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
                  View your linked accounts, confirmation screenshots, and manage your registration requests.
                </p>
                <div className="btn-primary w-full inline-flex items-center justify-center space-x-2">
                  <User className="w-5 h-5" />
                  <span>Go to My User Dashboard</span>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Admin Dashboard Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <Link
              to="/admin-dashboard"
              className="card group hover:shadow-lg transition-all duration-300 block h-full"
            >
              <div className="flex flex-col items-center text-center p-8">
                <div className="w-20 h-20 bg-primary-100 dark:bg-dark-accent-navy/30 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="w-10 h-10 text-primary-600 dark:text-dark-accent-navy" />
                </div>
                <h2 className="text-2xl font-bold text-text-primary dark:text-text-dark-primary mb-3">
                  Admin Dashboard
                </h2>
                <p className="text-text-secondary dark:text-text-dark-secondary mb-6">
                  Manage the 8BP Rewards system, view registrations, monitor claims, and handle user requests.
                </p>
                <div className="btn-primary w-full inline-flex items-center justify-center space-x-2">
                  <Shield className="w-5 h-5" />
                  <span>Go to Admin Dashboard</span>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>

        {/* Logout Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center"
        >
          <button
            onClick={logout}
            className="btn-outline inline-flex items-center space-x-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardSelectionPage;


