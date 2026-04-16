import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {fixturePackage} from '../fixtures/package';
import {DraftPreview} from '../../components/DraftPreview';

describe('DraftPreview', () => {
  it('renders welcome, people, checklist, and tasks sections', () => {
    const html = renderToStaticMarkup(<DraftPreview pkg={fixturePackage()} />);
    expect(html).toContain('Welcome to Webflow');
    expect(html).toContain('Grace Hopper');
    expect(html).toContain('Lin Clark');
    expect(html).toContain('Week 1');
    expect(html).toContain('Migrate NavCard');
  });

  it('handles empty tasks gracefully', () => {
    const pkg = fixturePackage();
    pkg.sections.initialEngineeringTasks.tasks = [];
    const html = renderToStaticMarkup(<DraftPreview pkg={pkg} />);
    expect(html).toContain('Scanner hasn');
  });

  it('shows the personalized welcome note when present', () => {
    const pkg = fixturePackage({welcomeNote: 'Hello friend'});
    pkg.sections.welcome.personalizedNote = 'Hello friend';
    const html = renderToStaticMarkup(<DraftPreview pkg={pkg} />);
    expect(html).toContain('Hello friend');
  });
});
