import type { CharacterEntry } from './characterRegistry';

// The credit a Creative Commons license asks for: what the work is, who made it, under which license, that it was
// changed, and where the original is. Plain text; the only link goes to the source.
export function CharacterAttribution({ character }: { character: CharacterEntry }) {
    const credit = character.author ? `${character.title} by ${character.author}` : character.title;
    return (
        <p className="fixed bottom-2 left-2 max-w-md rounded bg-black/60 px-3 py-2 text-xs text-white/80">
            {credit}, license {character.license} {character.licenseVersion}. {character.modifiedNote}
            {character.trademarkNote ? ` ${character.trademarkNote}` : ''}{' '}
            <a href={character.sourceUrl} className="underline" target="_blank" rel="noreferrer">
                Source
            </a>
        </p>
    );
}
