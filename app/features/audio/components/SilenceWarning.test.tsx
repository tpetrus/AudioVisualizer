// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SilenceWarning } from './SilenceWarning';

describe('SilenceWarning', () => {
    it('announces that no signal was detected and lists the things to check', () => {
        render(<SilenceWarning />);

        expect(screen.getByRole('status')).toHaveTextContent('No audio signal detected');
        expect(screen.getAllByRole('listitem')).toHaveLength(4);
        expect(screen.getByText(/Voicemeeter Banana/)).toBeInTheDocument();
    });
});
