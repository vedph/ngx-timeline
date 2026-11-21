import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { App } from './app';

describe('App', () => {
  it('should render the demo timeline with its settings', async () => {
    await render(App);
    expect(screen.getByRole('heading', { name: 'Timeline view' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Demo timeline' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Dataset' })).toBeTruthy();
  });

  it('should log selection events', async () => {
    const user = userEvent.setup();
    await render(App);
    const timeline = screen.getByRole('group', { name: 'Demo timeline' });
    // points are toggle buttons (groups are not)
    const point = within(timeline).getAllByRole('button', { pressed: false })[0];
    await user.click(point);
    expect(await screen.findByText('selectionChange: 1 point(s)')).toBeTruthy();
  });
});
