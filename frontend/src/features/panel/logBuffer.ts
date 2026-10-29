import type { LogRecord } from "@/types/panel.type";
/** mergeLogs 保留至多 5000 行 / 5 MiB，按 ID 去重并明确报告裁剪。 */
export function mergeLogs(previous: LogRecord[], incoming: LogRecord[]) {
  const ids = new Set(previous.map((line) => line.id));
  const all = [...previous];
  for (const line of incoming) {
    if (!ids.has(line.id)) {
      ids.add(line.id);
      all.push(line);
    }
  }
  const encoder = new TextEncoder();
  let bytes = 0;
  let first = all.length;
  for (let i = all.length - 1; i >= 0 && all.length - i <= 5000; i--) {
    const size =
      encoder.encode(all[i].message).length +
      encoder.encode(all[i].id).length +
      encoder.encode(all[i].sourceId).length +
      128;
    if (bytes + size > 5 * 1024 * 1024) break;
    bytes += size;
    first = i;
  }
  return { records: all.slice(first), droppedCount: first };
}
