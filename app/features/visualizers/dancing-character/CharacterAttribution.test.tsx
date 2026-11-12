// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterAttribution } from './CharacterAttribution';
import type { CharacterEntry } from './characterRegistry';

const entry: CharacterEntry = {
    id: 'robot',
    title: 'Robot',
    author: 'Ada Maker',
    license: 'CC-BY',
    licenseVersion: '4.0',
    sourceUrl: 'https://example.test/robot',
    modifiedNote: 'Converted to glTF.',
    trademarkNote: 'Robot is a trademark of Example Inc.',
    urls: { model: 'm.glb', dances: 'd.glb' },
    bodyMaterialNames: ['Skin'],
};

describe('CharacterAttribution', () => {
    it('shows title, author, license with version, the modified note, the trademark note and a source link', () => {
        render(<CharacterAttribution character={entry} />);

        expect(screen.getByText(/Robot by Ada Maker, license CC-BY 4\.0\./)).toBeInTheDocument();
        expect(screen.getByText(/Converted to glTF\./)).toBeInTheDocument();
        expect(screen.getByText(/Robot is a trademark of Example Inc\./)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://example.test/robot');
    });

    it('leaves out the author and the trademark note when there are none', () => {
        render(<CharacterAttribution character={{ ...entry, author: '', trademarkNote: undefined }} />);

        expect(screen.getByText(/^Robot, license CC-BY 4\.0\./)).toBeInTheDocument();
        expect(screen.queryByText(/trademark/)).not.toBeInTheDocument();
    });
});
