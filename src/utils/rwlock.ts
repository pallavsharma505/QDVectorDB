// Lightweight async RWLock to coordinate concurrent operations
export class RWLock {
  private readers = 0;
  private writer = false;
  private readQueue: Array<() => void> = [];
  private writeQueue: Array<() => void> = [];

  async readLock(): Promise<() => void> {
    await new Promise<void>((resolve) => {
      const attempt = () => {
        if (!this.writer && this.writeQueue.length === 0) {
          this.readers++;
          resolve();
        } else {
          this.readQueue.push(attempt);
        }
      };
      attempt();
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.readers--;
      if (this.readers === 0 && this.writeQueue.length > 0) {
        const next = this.writeQueue.shift();
        next && next();
      }
    };
  }

  async writeLock(): Promise<() => void> {
    await new Promise<void>((resolve) => {
      const attempt = () => {
        if (!this.writer && this.readers === 0) {
          this.writer = true;
          resolve();
        } else {
          this.writeQueue.push(attempt);
        }
      };
      attempt();
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.writer = false;
      if (this.writeQueue.length > 0) {
        const next = this.writeQueue.shift();
        next && next();
      } else {
        while (this.readQueue.length > 0) {
          const next = this.readQueue.shift();
          next && next();
        }
      }
    };
  }
}
