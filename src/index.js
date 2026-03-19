import { onRequestPost, onRequestOptions as uploadOptions } from '../functions/api/upload.js';
import { onRequestGet, onRequestOptions as photosOptions } from '../functions/api/photos.js';
import { onRequestPost as authPost, onRequestOptions as authOptions } from '../functions/api/auth.js';
import { onRequestPost as deletePost, onRequestOptions as deleteOptions } from '../functions/api/delete.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    // API routes
    if (url.pathname === '/api/auth') {
      if (request.method === 'OPTIONS') return authOptions();
      if (request.method === 'POST') return authPost(context);
    }

    if (url.pathname === '/api/upload') {
      if (request.method === 'OPTIONS') return uploadOptions();
      if (request.method === 'POST') return onRequestPost(context);
    }

    if (url.pathname === '/api/delete') {
      if (request.method === 'OPTIONS') return deleteOptions();
      if (request.method === 'POST') return deletePost(context);
    }

    if (url.pathname === '/api/photos') {
      if (request.method === 'OPTIONS') return photosOptions();
      if (request.method === 'GET') return onRequestGet(context);
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  }
};
