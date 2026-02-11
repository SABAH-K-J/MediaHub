import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMediaItem, getEpisodes, playMediaFile, markAsWatched, markAsUnwatched } from '../api';

const Details = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [media, setMedia] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const item = await getMediaItem(id);
      setMedia(item);
      
      if (item.media_type === 'series' || item.media_type === 'anime') {
        const eps = await getEpisodes(id);
        setEpisodes(eps);
      } else {
          const eps = await getEpisodes(id);
          setEpisodes(eps);
      }
    } catch (error) {
      console.error("Failed to load details:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handlePlay = async (fileId) => {
    try {
      await playMediaFile(fileId);
      // Reload to update watched status
      await loadData();
    } catch (error) {
      alert("Failed to start playback: " + error.message);
    }
  };

  const handleToggleWatched = async (episode) => {
    try {
      if (episode.watched) {
        await markAsUnwatched(episode.id);
      } else {
        await markAsWatched(episode.id);
      }
      // Reload to update UI
      await loadData();
    } catch (error) {
      alert("Failed to update watch status: " + error.message);
    }
  };

  if (loading) return <div className="text-center py-20 text-white">Loading...</div>;
  if (!media) return <div className="text-center py-20 text-white">Media not found</div>;

  // Group episodes by season
  const episodesBySeason = episodes.reduce((acc, ep) => {
    const season = ep.season_num || 1;
    if (!acc[season]) acc[season] = [];
    acc[season].push(ep);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <button onClick={() => navigate('/')} className="mb-4 text-blue-400 hover:underline">
          &larr; Back to Library
        </button>
        
        <div className="flex flex-col md:flex-row gap-8">
          {/* Metadata Section */}
          <div className="md:w-1/3">
             <div className="aspect-[2/3] bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
                <img 
                    src={media.poster_url || 'https://via.placeholder.com/300x450?text=No+Poster'} 
                    alt={media.title}
                    className="w-full h-full object-cover"
                />
             </div>
          </div>
          
          <div className="md:w-2/3">
            <h1 className="text-4xl font-bold mb-2">{media.title}</h1>
            <div className="flex items-center space-x-4 text-gray-400 mb-4">
                <span className="capitalize border border-gray-600 px-2 py-0.5 rounded text-sm">{media.media_type}</span>
                {media.year && <span>{media.year}</span>}
                {media.rating && <span className="text-yellow-500 font-bold">★ {media.rating}</span>}
            </div>
            
            {media.genre && <p className="text-gray-400 text-sm mb-4">{media.genre}</p>}
            
            {media.description && (
                <p className="text-gray-300 mb-6 leading-relaxed max-w-3xl">
                    {media.description}
                </p>
            )}
            
            {/* Play Button for Movie */}
            {media.media_type === 'movie' && episodes.length > 0 && (
                 <button 
                  onClick={() => handlePlay(episodes[0].id)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xl px-8 py-3 rounded-full font-bold shadow-lg transition-all duration-300 transform hover:scale-110 hover:glow pulse-slow"
                 >
                   {episodes[0].watched ? '▶ Play Again' : '▶ Play Movie'}
                 </button>
            )}

            {/* Episodes List for Series/Anime */}
            {(media.media_type === 'series' || media.media_type === 'anime') && (
              <div className="mt-8">
                {Object.keys(episodesBySeason).sort().map(season => (
                  <div key={season} className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">Season {season}</h2>
                    <div className="space-y-2">
                      {episodesBySeason[season].map(ep => (
                        <div 
                            key={ep.id} 
                            className="flex items-center justify-between p-3 bg-gray-800 rounded-md hover:bg-gray-700 transition group"
                        >
                            <div className="flex items-center space-x-3 flex-1">
                                {/* Watched Checkbox */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleWatched(ep);
                                    }}
                                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition ${
                                        ep.watched 
                                            ? 'bg-green-600 border-green-600' 
                                            : 'border-gray-500 hover:border-green-500'
                                    }`}
                                >
                                    {ep.watched && (
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                                <span className={`font-medium ${ep.watched ? 'text-gray-400' : 'text-white'}`}>
                                    Episode {ep.episode_num}
                                </span>
                            </div>
                            <button
                                onClick={() => handlePlay(ep.id)}
                                className="text-sm text-blue-400 hover:text-blue-300 px-4 py-1 rounded bg-gray-700 group-hover:bg-gray-600 transition"
                            >
                                {ep.watched ? 'Rewatch' : 'Play'}
                            </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Details;
