// Test setup file for Vitest
import { vi } from 'vitest';

// Mock fetch globally for tests
global.fetch = vi.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Setup environment variables for tests
process.env.NODE_ENV = 'test';
