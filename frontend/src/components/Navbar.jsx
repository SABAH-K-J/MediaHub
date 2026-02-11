import React from 'react';

const Navbar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'all', label: 'All', icon: '🎬' },
    { id: 'movie', label: 'Movies', icon: '🎥' },
    { id: 'series', label: 'Series', icon: '📺' },
    { id: 'anime', label: 'Anime', icon: '⚡' }
  ];

  return (
    <nav className="glass-strong border-b border-white/10 sticky top-0 z-50 backdrop-blur-2xl">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center space-x-3 scale-in">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 flex items-center justify-center shadow-lg pulse-glow">
              <span className="text-2xl">🎬</span>
            </div>
            <h1 className="text-2xl font-bold text-gradient">MediaHub</h1>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-2 glass rounded-full p-1.5">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  relative px-6 py-2.5 rounded-full font-medium text-sm transition-all duration-500 transform
                  ${activeTab === tab.id 
                    ? 'text-white scale-105' 
                    : 'text-gray-400 hover:text-white hover:scale-105'
                  }
                `}
                style={{
                  animationDelay: `${index * 0.1}s`
                }}
              >
                {/* Active Background */}
                {activeTab === tab.id && (
                  <span className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-full scale-in"></span>
                )}
                
                {/* Content */}
                <span className="relative flex items-center space-x-2">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
