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

test('the build is served with reachable, revalidatable assets', { tag: '@smoke' }, async ({ request }) => {
    const index = await request.get('/');
    expect(index.status()).toBe(200);
    expect(index.headers()['content-type']).toContain('text/html');
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
        // Without a long max-age the browser revalidates, which needs a validator to be cheap.
        expect(headers['etag'] ?? headers['last-modified'], `${path} needs a validator`).toBeTruthy();
    }
});
