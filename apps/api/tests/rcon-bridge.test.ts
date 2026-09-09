import { describe, expect, it } from 'vitest';
import { RconService } from '../src/services/rcon';

describe('RCON data-pack bridge parsing', () => {
  function makeRcon() {
    return new RconService({ host: '127.0.0.1', port: 25575, password: 'x' });
  }

  it('parses plain JSON answers', () => {
    const rcon = makeRcon();
    const parsed = (rcon as unknown as { parseNbtJson(o: string): unknown }).parseNbtJson(
      'server:bank web.answer has the following entry: {ok: 1, status: "OK"}'
    );
    expect(parsed).toEqual({ ok: 1, status: 'OK' });
  });

  it('converts SNBT int arrays in link entries to JSON arrays', () => {
    const rcon = makeRcon();
    const parsed = (rcon as unknown as { parseNbtJson(o: string): unknown }).parseNbtJson(
      'server:bank web.links.ABCDEF-123456 has the following entry: {player_uuid: [I; -1806351727, -1593021975, -1843074321, -507876857], ts: 12345}'
    );
    expect(parsed).toEqual({
      player_uuid: [-1806351727, -1593021975, -1843074321, -507876857],
      ts: 12345,
    });
  });

  it('converts a 4-int SNBT uuid array to a canonical UUID string', () => {
    const rcon = makeRcon();
    const entered = (rcon as unknown as {
      uuidFromInts(ints: number[]): string;
    }).uuidFromInts([0x550e8400, 0xe29b41d4, 0xa7164466, 0x55446644]);
    expect(entered).toBe('550e8400-e29b-41d4-a716-446655446644');
  });

  it('handles negative ints (signed NBT ints) in UUID conversion', () => {
    const rcon = makeRcon();
    const entered = (rcon as unknown as {
      uuidFromInts(ints: number[]): string;
    }).uuidFromInts([-1, -2, -3, -4]);
    expect(entered).toBe('ffffffff-ffff-fffe-ffff-fffdfffffffc');
  });

  it('quotes SNBT keys like the bridge writes get_balance answers', () => {
    const rcon = makeRcon();
    const parsed = (rcon as unknown as { parseNbtJson(o: string): unknown }).parseNbtJson(
      'server:bank web.answer has the following entry: {registered: 1, account_ok: 1, balance: 5000, status: "OK"}'
    );
    expect(parsed).toEqual({ registered: 1, account_ok: 1, balance: 5000, status: 'OK' });
  });

  it('handles bool literals and byte suffixes on numeric values', () => {
    const rcon = makeRcon();
    const parsed = (rcon as unknown as { parseNbtJson(o: string): unknown }).parseNbtJson(
      'server:bank web.answer has the following entry: {ok: 1b, locked: false, money: 500}'
    );
    expect(parsed).toEqual({ ok: 1, locked: false, money: 500 });
  });
});