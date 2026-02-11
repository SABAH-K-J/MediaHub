import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const MediaCard = ({ item }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const posterUrl = item.poster_url || 'https://via.placeholder.com/300x450?text=No+Poster';

  return (
    <Link to={`/details/${item.id}`} className="block group slide-up">
      <div className="relative overflow-hidden rounded-2xl glass-strong transform transition-all duration-500 hover:scale-105 hover-glow border border-white/10">
        {/* Poster Container */}
        <div className="aspect-[2/3] bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
          {/* Loading Skeleton */}
          {!imageLoaded && (
            <div className="absolute inset-0 skeleton"></div>
          )}
          
          {/* Poster Image */}
          <img 
            src={posterUrl} 
            alt={item.title} 
            className={`w-full h-full object-cover transition-all duration-700 ${
              imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
            } group-hover:scale-110`}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
          />
          
          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-70"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          {/* Shimmer Effect on Hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 shimmer"></div>
          
          {/* Media Type Badge */}
          <div className="absolute top-3 right-3 px-3 py-1 rounded-full glass text-xs font-semibold uppercase tracking-wider backdrop-blur-md border border-white/20">
            {item.media_type}
          </div>
          
          {/* Title Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
            <h3 className="text-white font-bold text-lg drop-shadow-2xl text-glow line-clamp-2">
              {item.title}
            </h3>
          </div>
        </div>
        
        {/* Info Section */}
        <div className="p-3 bg-gradient-to-b from-gray-900/50 to-gray-900/80 backdrop-blur-sm">
          <h3 className="text-white font-semibold truncate group-hover:text-gradient transition-all duration-300">
            {item.title}
          </h3>
          <div className="flex items-center justify-between mt-1">
            <p className="text-gray-400 text-xs capitalize">{item.media_type}</p>
            {item.year && (
              <span className="text-xs text-gray-500">{item.year}</span>
            )}
          </div>
        </div>
        
        {/* Hover Border Glow */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
             style={{
               background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.3), rgba(240, 147, 251, 0.3))',
               filter: 'blur(20px)',
               transform: 'scale(1.05)'
             }}>
        </div>
      </div>
    </Link>
  );
};

export default MediaCard;
