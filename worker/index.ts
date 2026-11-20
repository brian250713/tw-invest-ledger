import { handleQuotesRequest } from './quotes';

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json(
        {
          ok: true,
          mode: 'local-first',
          phase: 3,
          endpoints: ['/api/health', '/api/quotes'],
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (url.pathname === '/api/quotes') {
      return handleQuotesRequest(request, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
