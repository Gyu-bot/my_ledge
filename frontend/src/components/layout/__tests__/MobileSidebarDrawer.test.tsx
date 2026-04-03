import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MobileSidebarDrawer } from '../MobileSidebarDrawer';

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <MemoryRouter initialEntries={['/']}>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        메뉴 열기
      </button>
      <MobileSidebarDrawer
        open={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
      />
    </MemoryRouter>
  );
}

describe('MobileSidebarDrawer', () => {
  it('renders as a dialog with an explicit close button', () => {
    render(<DrawerHarness />);

    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '메뉴 닫기' })).toBeInTheDocument();
  });

  it('closes when a route item is selected and restores focus to the trigger', () => {
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('link', { name: '지출' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and restores focus to the trigger', () => {
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: '메뉴 열기' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
