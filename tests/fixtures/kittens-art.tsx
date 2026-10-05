import { createRoot } from 'react-dom/client';
import { KittenCard } from '@/components/KittenCard';
import { kittenKinds } from '../../shared/games/exploding-kittens/types';
import '@/styles/kittens.css';
export function mountKittenArt() {
  const node = document.createElement('div');
  node.dataset.testid = 'kitten-art-gallery';
  Object.assign(node.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '100',
    background: '#101b23',
    overflow: 'auto',
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))',
    gap: '24px',
    alignContent: 'start',
  });
  document.body.append(node);
  createRoot(node).render(
    <>
      {kittenKinds.map((kind) => (
        <KittenCard key={kind} card={{ kind, id: `art-${kind}` }} />
      ))}
    </>,
  );
}
