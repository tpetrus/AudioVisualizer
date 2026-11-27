// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './Field';

describe('Field', () => {
    it('labels its control and shows the hint', () => {
        render(
            <Field label="Speed" htmlFor="speed" hint="Higher is faster" className="mb-2">
                <input id="speed" />
            </Field>,
        );
        expect(screen.getByLabelText('Speed')).toHaveAttribute('id', 'speed');
        expect(screen.getByText('Higher is faster')).toBeInTheDocument();
        expect(screen.getByText('Speed').parentElement).toHaveClass('mb-2');
    });

    it('omits the hint when there is none', () => {
        render(
            <Field label="Speed" htmlFor="speed">
                <input id="speed" />
            </Field>,
        );
        expect(screen.queryByText('Higher is faster')).not.toBeInTheDocument();
        expect(document.querySelector('p')).toBeNull();
    });
});
