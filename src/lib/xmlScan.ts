const RECORD_OPEN = "<Record";

function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    const name = match[1];
    if (name) attrs[name] = decodeEntities(match[2] ?? "");
  }
  return attrs;
}

export class XmlRecordScanner {
  private buffer = "";
  private readonly decoder = new TextDecoder("utf-8");
  private readonly onRecord: (attrs: Record<string, string>) => void;
  maxBuffer = 0;
  scanned = 0;

  constructor(onRecord: (attrs: Record<string, string>) => void) {
    this.onRecord = onRecord;
  }

  push(bytes: Uint8Array, final: boolean): void {
    if (bytes.byteLength) this.buffer += this.decoder.decode(bytes, { stream: !final });
    else if (final) this.buffer += this.decoder.decode();
    this.drain(final);
  }

  private drain(final: boolean): void {
    const buf = this.buffer;
    let cursor = 0;
    while (cursor < buf.length) {
      const lt = buf.indexOf("<", cursor);
      if (lt < 0) {
        cursor = buf.length;
        break;
      }
      const rest = buf.length - lt;
      if (rest < RECORD_OPEN.length && !final) break;
      if (buf.startsWith(RECORD_OPEN, lt)) {
        const gt = buf.indexOf(">", lt);
        if (gt < 0) {
          if (final) cursor = buf.length;
          break;
        }
        const open = buf.slice(lt, gt + 1);
        const selfClosing = /\/\s*>$/.test(open);
        let end = gt + 1;
        if (!selfClosing) {
          const close = buf.indexOf("</Record>", gt);
          if (close < 0) {
            if (final) cursor = buf.length;
            break;
          }
          end = close + "</Record>".length;
        }
        this.scanned++;
        const typeAt = open.indexOf('type="');
        if (typeAt >= 0) {
          const type = open.slice(typeAt + 6, open.indexOf('"', typeAt + 6));
          if (
            type.startsWith("HKQuantityTypeIdentifier") ||
            type === "HKCategoryTypeIdentifierSleepAnalysis"
          ) {
            this.onRecord(parseAttributes(open));
          }
        }
        cursor = end;
        continue;
      }
      const head = buf.slice(lt, lt + RECORD_OPEN.length);
      if (RECORD_OPEN.startsWith(head) && head.length < RECORD_OPEN.length && !final) break;
      const gt = buf.indexOf(">", lt);
      if (gt < 0) {
        if (final) cursor = buf.length;
        break;
      }
      cursor = gt + 1;
    }
    this.buffer = buf.slice(cursor);
    if (this.buffer.length > this.maxBuffer) this.maxBuffer = this.buffer.length;
    if (this.buffer.length > 2_000_000) {
      const last = this.buffer.lastIndexOf("<");
      this.buffer = last >= 0 ? this.buffer.slice(last) : "";
    }
  }
}
