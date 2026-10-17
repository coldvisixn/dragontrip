import '@testing-library/jest-dom/vitest';

import { beforeEach } from 'vitest';
beforeEach(async () => {
  const { resetWorkspaceMemory } = await import('./workspace');
  resetWorkspaceMemory();
  localStorage.clear();
});
