import { describe, it, expect } from 'vitest';
import { renderTable, type TableColumn } from './textTable';

describe('renderTable', () => {
  const columns: TableColumn[] = [
    { header: 'ID', min: 4, max: 4 },
    { header: 'NAME', flex: true, min: 6 },
    { header: 'STATUS', max: 10 },
  ];

  it('sizes columns to the widest cell and aligns rows', () => {
    const lines = renderTable(columns, [
      ['abcd', 'web', 'Up'],
      ['efgh', 'database-primary', 'Exited'],
    ], null);

    expect(lines[0]).toBe('ID    NAME              STATUS');
    expect(lines[1]).toBe('-'.repeat(4 + 2 + 16 + 2 + 6));
    expect(lines[2]).toBe('abcd  web               Up');
    expect(lines[3]).toBe('efgh  database-primary  Exited');
  });

  it('uses header width when cells are narrower', () => {
    const lines = renderTable(columns, [['ab', 'x', 'Up']], null);
    // NAME floor is min 6; header is 4
    expect(lines[0]).toBe('ID    NAME    STATUS');
  });

  it('caps columns at max and truncates overflowing cells', () => {
    const lines = renderTable(columns, [
      ['abcdefgh', 'web', 'Up 3 hours (healthy)'],
    ], null);
    expect(lines[2]).toContain('abc…');
    expect(lines[2]).toContain('Up 3 hour…');
  });

  it('shrinks flex columns down to min to fit totalWidth', () => {
    const lines = renderTable(columns, [
      ['abcd', 'a-very-long-container-name', 'Up'],
    ], 24);
    // ID(4) + NAME(shrunk 26->10) + STATUS(6) + gutters(4) = 24
    expect(lines[1]).toBe('-'.repeat(24));
    expect(lines[2]).toContain('a-very-lo…');
  });

  it('never shrinks below min even when totalWidth is tiny', () => {
    const lines = renderTable(columns, [
      ['abcd', 'a-very-long-container-name', 'Up'],
    ], 10);
    expect(lines[1]).toBe('-'.repeat(4 + 2 + 6 + 2 + 6));
  });

  it('does not shrink when totalWidth is null (piped)', () => {
    const lines = renderTable(columns, [
      ['abcd', 'a-very-long-container-name', 'Up'],
    ], null);
    expect(lines[2]).toContain('a-very-long-container-name');
  });

  it('shrinks the widest flex column first', () => {
    const cols: TableColumn[] = [
      { header: 'A', flex: true, min: 2 },
      { header: 'B', flex: true, min: 2 },
    ];
    const lines = renderTable(cols, [['aaaaaaaaaa', 'bbbb']], 12);
    // total natural = 10 + 2 + 4 = 16; deficit 4 comes out of A (widest)
    expect(lines[2]).toBe('aaaaa…  bbbb');
  });

  it('applies decorate to padded data cells but not the header', () => {
    const cols: TableColumn[] = [
      { header: 'NAME', decorate: (cell) => `<${cell}>` },
      { header: 'STATUS' },
    ];
    const lines = renderTable(cols, [['web', 'Up']], null);
    expect(lines[0]).toBe('NAME  STATUS');
    expect(lines[2]).toBe('<web >  Up');
  });

  it('treats missing cells as empty strings', () => {
    const lines = renderTable(columns, [['abcd']], null);
    expect(lines[2]).toBe('abcd');
  });
});
