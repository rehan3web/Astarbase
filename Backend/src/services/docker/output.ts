// Docker's non-TTY exec stream uses an eight-byte header for each output frame.
// Yield stdout incrementally so downloads respect backpressure, regardless of size.
export async function* dockerStdout(source: AsyncIterable<Buffer>, stderr: { text: string }) {
  let pending: Buffer = Buffer.alloc(0);
  let remaining = 0;
  let channel = 0;
  for await (const chunk of source) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    while (pending.length) {
      if (!remaining) {
        if (pending.length < 8) break;
        channel = pending[0];
        if (channel !== 1 && channel !== 2) throw new Error('Invalid Docker output channel');
        remaining = pending.readUInt32BE(4);
        pending = pending.subarray(8);
        if (!remaining) continue;
      }
      const length = Math.min(remaining, pending.length);
      const data = pending.subarray(0, length);
      pending = pending.subarray(length);
      remaining -= length;
      if (channel === 1) yield data;
      else if (stderr.text.length < 65536) stderr.text += data.toString('utf8').slice(0, 65536 - stderr.text.length);
    }
  }
  if (remaining || pending.length) throw new Error('Docker output was interrupted');
}
