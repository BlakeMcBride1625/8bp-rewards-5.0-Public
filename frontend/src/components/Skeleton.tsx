import React from 'react';

interface SkeletonProps {
  className?: string;
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div 
      className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-lg ${className}`}
    />
  );
};

export default Skeleton;



