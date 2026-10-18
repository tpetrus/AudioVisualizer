import { expect, test } from './fixtures';

// Checks on how the site is served rather than on the app itself. They use plain HTTP requests (no browser page), so
// they are cheap, and they run against production after each deploy (`BASE_URL=... --grep @smoke`) as well as locally.

test('an unknown path is answered with the app, not a 404', { tag: '@smoke' }, async ({ request }) => {
    // `not_found_handling: single-page-application` in wrangler.jsonc sends unknown paths to index.html.
    const response = await request.get('/does-not-exist');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('window.__reactRouterContext');
});

test(
    'the build is served with reachable, long-cached assets and a revalidated page',
    { tag: '@smoke' },
    async ({ request }) => {
        const index = await request.get('/');
        expect(index.status()).toBe(200);
        expect(index.headers()['content-type']).toContain('text/html');
        // The page must stay revalidated, or a deploy could be hidden behind a stale copy of index.html.
        expect(index.headers()['cache-control'], '/ must not be immutable').not.toMatch(/immutable/);
        const html = await index.text();

        // The hashed file names change with every build, so read them from the page instead of hard-coding any.
        const script = /\/assets\/[^"']+\.js/.exec(html)?.[0];
        const stylesheet = /\/assets\/[^"']+\.css/.exec(html)?.[0];
        expect(script, 'index.html references a script under /assets/').toBeTruthy();
        expect(stylesheet, 'index.html references a stylesheet under /assets/').toBeTruthy();

        for (const [path, type] of [
            [script!, 'javascript'],
            [stylesheet!, 'css'],
        ]) {
            const asset = await request.get(path);
            // A missing asset would come back as index.html (the SPA fallback) with a 200, so check the type too.
            expect(asset.status(), path).toBe(200);
            expect(asset.headers()['content-type'], path).toContain(type);
            const headers = asset.headers();
            expect(headers['cache-control'], `${path} must not be uncacheable`).not.toMatch(/no-store/);
            // Hashed file names make these safe to cache for a year (public/_headers); a changed file gets a new URL.
            const cacheControl = headers['cache-control'] ?? '';
            expect(cacheControl, `${path} must be immutable`).toMatch(/immutable/);
            expect(Number(/max-age=(\d+)/.exec(cacheControl)?.[1]), `${path} max-age`).toBeGreaterThanOrEqual(31536000);
            // A validator keeps a revalidation cheap if a client ignores the long max-age.
            expect(headers['etag'] ?? headers['last-modified'], `${path} needs a validator`).toBeTruthy();
        }
    },
);
