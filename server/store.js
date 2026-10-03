/**
 * 服务端存储：单个 JSON 文件 + 照片目录。
 * 写操作串行执行（handle 在同一个微任务队列里 async-串行化），
 * 每次落盘用临时文件 + rename 做原子写。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, "server-data.json");
    this.photoDir = path.join(dir, "photos");
    this.state = null;
    this.chain = Promise.resolve();
  }

  async load(seed) {
    await fs.mkdir(this.photoDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.state = JSON.parse(raw);
    } catch {
      this.state = seed();
      await this.persist();
    }
    if (!this.state.appliedOpIds) this.state.appliedOpIds = [];
    this._seen = new Set(this.state.appliedOpIds);
    return this.state;
  }

  /** 把读—改—写串成队列，保证两个并发请求不会互盖。 */
  mutate(fn) {
    const run = this.chain.then(() => fn(this.state));
    this.chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  async persist() {
    const tmp = this.file + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), "utf8");
    await fs.rename(tmp, this.file);
  }

  async savePhoto(id, dataUrl) {
    const m = /^data:image\/(\w+);base64,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error("图片格式不正确");
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const name = `${id}.${ext}`;
    await fs.writeFile(path.join(this.photoDir, name), Buffer.from(m[2], "base64"));
    return `/photos/${name}`;
  }

  photoPath(url) {
    return path.join(this.photoDir, path.posix.basename(url));
  }

  rememberOp(opId) {
    this._seen.add(opId);
    if (this.state.appliedOpIds.length > 5000) {
      this.state.appliedOpIds = this.state.appliedOpIds.slice(-3000);
    }
    this.state.appliedOpIds.push(opId);
  }

  hasOp(opId) {
    return this._seen.has(opId);
  }
}
