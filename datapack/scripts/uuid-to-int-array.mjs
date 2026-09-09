// Generates the `[I; a, b, c, d]` int array needed by
// datapack/n26/data/n26/functions/link/allowlist.mcfunction from a Minecraft
// UUID (with or without dashes, e.g. the one printed by /data get entity @s UUID
// or found in <server>/usercache.json).
//
// Usage:
//   node uuid-to-int-array.mjs 550e8400-e29b-41d4-a716-446655440000
//   node uuid-to-int-array.mjs 550e8400e29b41d4a716446655440000

const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node uuid-to-int-array.mjs <uuid>');
  process.exit(1);
}

const hex = raw.replace(/-/g, '').toLowerCase();
if (!/^[0-9a-f]{32}$/.test(hex)) {
  console.error(`'${raw}' is not a valid 32-hex-char UUID.`);
  process.exit(1);
}

const u32 = (h) => {
  // 8 hex chars -> unsigned 32-bit -> signed 32-bit int
  const n = Number.parseInt(h, 16);
  return n >= 0x80000000 ? n - 0x100000000 : n;
};

const parts = [hex.slice(0, 8), hex.slice(8, 16), hex.slice(16, 24), hex.slice(24, 32)];
const ints = parts.map(u32);

console.log(`[I; ${ints.join(', ')}]`);
console.log(
  `Copied line for link/allowlist.mcfunction:`,
  `execute if data storage server:bank tmp.link_uuid match [I; ${ints.join(', ')}] run data modify storage server:bank tmp.link_allowed set value 1b`
);