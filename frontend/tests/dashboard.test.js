import { describe, it, expect } from 'vitest';
import { countOpenTickets } from '../src/counter.js';

describe('countOpenTickets', () => {
  it('should return the total number of tickets with status "Abierto"', () => {
    const sampleTickets = [
      { id: 1, estado: 'Abierto' },
      { id: 2, estado: 'Cerrado' },
      { id: 3, estado: 'Abierto' },
    ];

    // We expect it to find exactly 2 open tickets
    const result = countOpenTickets(sampleTickets);
    expect(result).toBe(2);
  });

  it('should return 0 if there are no open tickets', () => {
    const sampleTickets = [
      { id: 1, estado: 'Cerrado' },
      { id: 2, estado: 'En Progreso' },
    ];

    const result = countOpenTickets(sampleTickets);
    expect(result).toBe(0);
  });
});
