import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useForegroundRefresh from './useForegroundRefresh';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('coalesces focus and visibility events without polling', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const refresh = vi.fn();
  renderHook(() => useForegroundRefresh(refresh));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(refresh).not.toHaveBeenCalled();
  now.mockReturnValue(61000);
  expect(refresh).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('ignores hidden tabs and removes listeners on unmount', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const refresh = vi.fn();
  const { unmount } = renderHook(() => useForegroundRefresh(refresh));
  now.mockReturnValue(61000);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(refresh).toHaveBeenCalledTimes(1);
  unmount(); now.mockReturnValue(121000);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(refresh).toHaveBeenCalledTimes(1);
});
