import { expect, it } from 'vitest';
import { socketOrigin } from './socketEndpoint';

it('uses the same origin or an explicit backend origin without inventing a namespace', () => {
  expect(socketOrigin('', 'https://campus.example.edu')).toBe('https://campus.example.edu');
  expect(socketOrigin('https://api.example.edu/', 'https://campus.example.edu')).toBe('https://api.example.edu');
  expect(socketOrigin('http://localhost:6108', 'http://localhost:3108')).toBe('http://localhost:6108');
});

it.each(['/be', '/api', '/socket.io/', '/be?x=1'])('rejects namespace/path mistakes before connecting: %s', path => {
  expect(() => socketOrigin(`https://campus.example.edu${path}`, 'https://campus.example.edu')).toThrow(/only the backend origin/);
});

it('rejects unsafe and mixed-content endpoints without disclosing their values', () => {
  for (const value of ['http://backend.example.edu', 'https://localhost:6108', 'https://name:private@example.edu', 'not-a-url', 'ftp://example.edu']) {
    expect(() => socketOrigin(value, 'https://campus.example.edu')).toThrow();
  }
  try { socketOrigin('https://name:private@example.edu'); } catch (error) { expect(error.message).not.toContain('private'); }
});
