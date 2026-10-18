// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Route } from './+types/root';
import App, { ErrorBoundary, Layout } from './root';
import { useAudio } from './features/audio/audioEngineContext';
import { useRhythm } from './features/rhythm/rhythmTrackerContext';

// Meta, Links, Scripts and ScrollRestoration read the framework's data-router context, which exists only in a built
// app (not in createRoutesStub or a static render). They are replaced by markers in this spec only; everything else in
// react-router stays real.
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router')>()),
    Meta: () => <meta name="meta-stand-in" />,
    Links: () => <link rel="links-stand-in" />,
    Scripts: () => <script data-stand-in="scripts" />,
    ScrollRestoration: () => <div data-stand-in="scroll-restoration" />,
}));

describe('Layout', () => {
    function Probe() {
        // Both calls throw outside their provider, so a successful render proves Layout supplies them.
        useAudio();
        useRhythm();
        return <p>probe</p>;
    }

    function renderLayout() {
        // <html> cannot be mounted inside the test's container <div>, so the document is rendered to a string.
        return new DOMParser().parseFromString(
            renderToStaticMarkup(
                <Layout>
                    <Probe />
                </Layout>,
            ),
            'text/html',
        );
    }

    it('is an English document with a charset and a responsive viewport', () => {
        const doc = renderLayout();

        expect(doc.documentElement.getAttribute('lang')).toBe('en');
        expect(doc.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
        expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(
            'width=device-width, initial-scale=1',
        );
    });

    it('puts meta and links in the head, and the scripts after the content in the body', () => {
        const doc = renderLayout();

        expect(doc.head.querySelector('meta[name="meta-stand-in"]')).not.toBeNull();
        expect(doc.head.querySelector('link[rel="links-stand-in"]')).not.toBeNull();
        const bodyOrder = Array.from(doc.body.children).map(
            (child) => child.getAttribute('data-stand-in') ?? child.tagName.toLowerCase(),
        );
        expect(bodyOrder).toEqual(['p', 'scroll-restoration', 'scripts']);
    });

    it('provides the audio engine and the rhythm tracker to its children', () => {
        const doc = renderLayout();

        expect(doc.body.textContent).toBe('probe');
    });
});

describe('App', () => {
    it('renders the matched child route', () => {
        const Stub = createRoutesStub([
            { path: '/', Component: App, children: [{ index: true, Component: () => <p>child route</p> }] },
        ]);
        render(<Stub initialEntries={['/']} />);

        expect(screen.getByText('child route')).toBeInTheDocument();
    });
});

describe('ErrorBoundary', () => {
    function renderError(error: unknown) {
        return render(<ErrorBoundary {...({ error } as Route.ErrorBoundaryProps)} />);
    }
    // The shape of a route error response, which is how React Router reports a thrown `Response`.
    const response = (status: number, statusText: string) => ({ status, statusText, internal: false, data: null });

    it('explains a missing page', () => {
        renderError(response(404, 'Not Found'));

        expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
        expect(screen.getByText('The requested page could not be found.')).toBeInTheDocument();
    });

    it('shows the status text of other error responses', () => {
        renderError(response(500, 'Server Error'));

        expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
        expect(screen.getByText('Server Error')).toBeInTheDocument();
    });

    it('falls back to a generic message when an error response has no status text', () => {
        renderError(response(503, ''));

        expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
    });

    it('shows the message and stack of a thrown Error while developing', () => {
        const error = new Error('kaboom');
        error.stack = 'Error: kaboom\n    at somewhere';
        const { container } = renderError(error);

        expect(screen.getByRole('heading', { name: 'Oops!' })).toBeInTheDocument();
        expect(screen.getByText('kaboom')).toBeInTheDocument();
        expect(container.querySelector('pre code')).toHaveTextContent('at somewhere');
    });

    it('hides the details of a thrown Error in production', () => {
        vi.stubEnv('DEV', false);
        const { container } = renderError(new Error('kaboom'));

        expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
        expect(screen.queryByText('kaboom')).not.toBeInTheDocument();
        expect(container.querySelector('pre')).not.toBeInTheDocument();
    });

    it('does not show a stack for something that is not an Error', () => {
        const { container } = renderError('a string was thrown');

        expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
        expect(container.querySelector('pre')).not.toBeInTheDocument();
    });

    it('does not fail on an undefined error', () => {
        renderError(undefined);

        expect(screen.getByRole('heading', { name: 'Oops!' })).toBeInTheDocument();
    });
});
