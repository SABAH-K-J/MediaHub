import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import MediaCard from '../components/MediaCard';
import { getMediaItems, scanLibrary } from '../api';

const Dashboard = () => {
  const [mediaItems, setMediaItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchMedia();
  }, []);

  useEffect(() => {
    if (activeTab === 'all') {
      setFilteredItems(mediaItems);
    } else {
      setFilteredItems(mediaItems.filter(item => item.media_type === activeTab));
    }
  }, [activeTab, mediaItems]);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const items = await getMediaItems();
      setMediaItems(items);
    } catch (error) {
      console.error("Failed to fetch media:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    const rootDir = prompt("Enter directory path to scan:");
    if (!rootDir) return;
    
    setScanning(true);
    try {
      await scanLibrary(rootDir);
      await fetchMedia();
      alert("Scan complete!");
    } catch (error) {
      alert("Scan failed: " + error.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="container mx-auto px-4 py-8 fade-in">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 space-y-4 md:space-y-0">
          <div className="space-y-2">
            <h2 className="text-5xl font-bold text-gradient">
              {activeTab === 'all' ? 'My Library' : 
               activeTab === 'movie' ? 'Movies' :
               activeTab === 'series' ? 'TV Series' : 'Anime Collection'}
            </h2>
            <p className="text-gray-400 text-lg">
              {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} available
            </p>
          </div>
          
          <button 
            onClick={handleScan}
            disabled={scanning}
            className={`
              group relative px-8 py-4 rounded-2xl font-semibold text-lg
              transition-all duration-500 transform hover:scale-105
              ${scanning 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover-lift'
              }
            `}
          >
            {/* Button Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl opacity-100 group-hover:opacity-90 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
            
            {/* Button Content */}
            <span className="relative flex items-center space-x-3">
              <span className="text-2xl">{scanning ? '⏳' : '🔍'}</span>
              <span>{scanning ? 'Scanning Library...' : 'Scan Library'}</span>
            </span>
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <div className="relative">
              <div className="w-20 h-20 spinner"></div>
              <div className="absolute inset-0 w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 blur-xl opacity-50 animate-pulse"></div>
            </div>
            <p className="text-2xl text-gray-300 font-medium">Loading your collection...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6 slide-up">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center backdrop-blur-xl border border-white/10">
              <span className="text-7xl">📚</span>
            </div>
            <div className="text-center space-y-2">
              <p className="text-3xl font-bold text-white">No Media Found</p>
              <p className="text-gray-400 text-lg">Click "Scan Library" to discover your content</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 stagger-children">
            {filteredItems.map(item => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
