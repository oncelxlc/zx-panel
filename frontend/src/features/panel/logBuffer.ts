import type { LogRecord } from "@/types/panel.type";
/** encoder 复用 UTF-8 编码器，保持代理字符的标准替换行为。 */
const encoder = new TextEncoder();
/** encodingBuffer 仅供同步长度计算复用，覆盖正常日志单行的 16 KiB 上限。 */
const encodingBuffer = new Uint8Array(16 * 1024);
/** utf8Size 避免为每条保留日志分配字节数组，超长字段仍按完整编码计数。 */
function utf8Size(value: string) {
  const { read, written } = encoder.encodeInto(value, encodingBuffer);
  return read === value.length ? written : encoder.encode(value).length;
}
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
  let bytes = 0;
  let first = all.length;
  for (let i = all.length - 1; i >= 0 && all.length - i <= 5000; i--) {
    const size =
      utf8Size(all[i].message) +
      utf8Size(all[i].id) +
      utf8Size(all[i].sourceId) +
      128;
    if (bytes + size > 5 * 1024 * 1024) break;
    bytes += size;
    first = i;
  }
  return { records: all.slice(first), droppedCount: first };
}
