
import { StrategicMemory } from '../../src/ai/StrategicMemory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('StrategicMemory Stress Tests', () => {
  let tempDir: string;
  let dbCounter = 0;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategic-memory-stress-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('Rapid Creation/Destruction Cycle', async () => {
    // Requirements: Verify no resource leaks or segfaults during rapid DB cycling
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const dbPath = path.join(tempDir, `test-${dbCounter++}.db`);
      
      const memory = new StrategicMemory(dbPath);
      
      // Perform minimal operations
      await memory.storeInsight("test", "test insight", 0.5);
      
      // Close explicitly
      memory.close();
    }

    // Check we survived
    expect(true).toBe(true);
  }, 30000); // 30s timeout

  test('Concurrent Access Stress', async () => {
     // Verify concurrent writes don't deadlock or crash WAL mode
     const dbPath = path.join(tempDir, `concurrent-stress.db`);
     const memory = new StrategicMemory(dbPath);
     
     const writes = Array.from({ length: 50 }).map((_, i) => 
        memory.storeInsight(`topic-${i}`, `content-${i}`, 0.5)
     );
     
     await Promise.all(writes);
     
     const count = await memory.getInsightCount();
     expect(count).toBe(50);
     
     memory.close(); 
  });
});
