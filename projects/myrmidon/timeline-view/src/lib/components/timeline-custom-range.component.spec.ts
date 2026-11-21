import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { NumericTimelineParser } from '../utils/numeric-timeline-parser';
import { TimelineCustomRangeComponent } from './timeline-custom-range.component';

async function setup(initialMin = '0', initialMax = '10') {
  const applied = vi.fn();
  const closed = vi.fn();
  await render(TimelineCustomRangeComponent, {
    inputs: { parser: new NumericTimelineParser(), initialMin, initialMax },
    on: { applied, closed },
  });
  return {
    applied,
    closed,
    user: userEvent.setup(),
    from: () => screen.getByRole('textbox', { name: 'From' }),
    to: () => screen.getByRole('textbox', { name: 'To' }),
  };
}

describe('TimelineCustomRangeComponent', () => {
  it('should prefill the bounds', async () => {
    const { from, to } = await setup('5', '15');
    expect((from() as HTMLInputElement).value).toBe('5');
    expect((to() as HTMLInputElement).value).toBe('15');
  });

  it('should apply a valid range', async () => {
    const { user, applied } = await setup();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(applied).toHaveBeenCalledWith({
      start: { label: '0', value: 0 },
      end: { label: '10', value: 10 },
    });
  });

  it('should report invalid values', async () => {
    const { user, applied, from } = await setup();
    await user.clear(from());
    await user.type(from(), 'abc');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Invalid value')).toBeTruthy();
    expect(from().getAttribute('aria-invalid')).toBe('true');
    expect(applied).not.toHaveBeenCalled();
  });

  it('should require both bounds', async () => {
    const { user, applied, to } = await setup();
    await user.clear(to());
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Enter an end value')).toBeTruthy();
    expect(applied).not.toHaveBeenCalled();
  });

  it('should reject an end preceding the start', async () => {
    const { user, applied, to } = await setup();
    await user.clear(to());
    await user.type(to(), '-5');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('End precedes start')).toBeTruthy();
    expect(applied).not.toHaveBeenCalled();
  });

  it('should emit when closed', async () => {
    const { user, closed } = await setup();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toHaveBeenCalled();
  });
});
