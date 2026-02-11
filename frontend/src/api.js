import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

export const getMediaItems = async (skip = 0, limit = 100) => {
  const response = await axios.get(`${API_URL}/media`, { params: { skip, limit } });
  return response.data;
};

export const getMediaItem = async (id) => {
  const response = await axios.get(`${API_URL}/media/${id}`);
  return response.data;
};

export const getEpisodes = async (id) => {
  const response = await axios.get(`${API_URL}/media/${id}/episodes`);
  return response.data;
};

export const playMediaFile = async (fileId) => {
  const response = await axios.post(`${API_URL}/play/${fileId}`);
  return response.data;
};

export const markAsWatched = async (fileId) => {
  const response = await axios.post(`${API_URL}/media/file/${fileId}/watch`);
  return response.data;
};

export const markAsUnwatched = async (fileId) => {
  const response = await axios.post(`${API_URL}/media/file/${fileId}/unwatch`);
  return response.data;
};

export const scanLibrary = async (rootDir) => {
  const response = await axios.post(`${API_URL}/scan`, null, { params: { root_dir: rootDir } });
  return response.data;
};
