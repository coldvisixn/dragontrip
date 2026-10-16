import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PrimaryNavigation, SectionTabs, sectionFor } from './WorkspaceNavigation';
afterEach(cleanup);
it('groups project pages into five links and remembers the last destination', () => {
  const navigate = vi.fn();
  render(
    <PrimaryNavigation
      page="Web applications"
      hasProject
      running={2}
      remembered={{ assets: 'Web applications' }}
      onNavigate={navigate}
    />,
  );
  expect(screen.getAllByRole('button')).toHaveLength(7);
  expect(screen.getByRole('button', { name: 'Assets' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: 'Assets' }));
  expect(navigate).toHaveBeenCalledWith('Web applications');
  expect(screen.queryByRole('button', { name: 'Findings' })).toBeNull();
});
it('tabs follow deep links and support arrow, Home and End keys', () => {
  const navigate = vi.fn();
  render(<SectionTabs page="Web applications" onNavigate={navigate} />);
  const selected = screen.getByRole('tab', { name: 'Web applications' });
  expect(selected).toHaveAttribute('aria-selected', 'true');
  selected.focus();
  fireEvent.keyDown(selected, { key: 'ArrowRight' });
  expect(navigate).toHaveBeenLastCalledWith('Network Graph');
  fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
  expect(navigate).toHaveBeenLastCalledWith('Web applications');
  expect(sectionFor('Credentials Vault')?.id).toBe('investigation');
});
it('keeps project navigation disabled until a project is selected', () => {
  render(
    <PrimaryNavigation
      page="Dashboard"
      hasProject={false}
      running={0}
      remembered={{}}
      onNavigate={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Assets' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Projects' })).toBeEnabled();
});
