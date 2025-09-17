#!/usr/bin/env node

// Simple validation script to test the built package
import { VectorDB } from './dist/index.js';
import fs from 'fs';
import path from 'path';

async function validatePackage() {
  console.log('🧪 Validating QD VectorDB package...\n');

  try {
    // Create a temporary test directory
    const testDir = './test-data';
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }

    console.log('✅ Creating test database...');
    const db = await VectorDB.open({ 
      dir: testDir,
      memtableFlushSize: 10,
      maxSSTablesBeforeCompact: 3 
    });

    console.log('✅ Adding test vectors...');
    const id1 = await db.add([1, 0], { label: 'test1' });
    const ids = await db.addBatch([
      { vector: [0, 1], meta: { label: 'test2' } },
      { vector: [0.7, 0.7], meta: { label: 'test3' } }
    ]);

    console.log(`✅ Added vectors: ${id1}, ${ids.join(', ')}`);

    console.log('✅ Testing similarity search...');
    const similar = await db.searchSimilar([1, 0], 2);
    console.log(`   Found ${similar.length} similar vectors`);

    console.log('✅ Testing nearby search...');
    const nearby = await db.searchNearby([1, 0], 2);
    console.log(`   Found ${nearby.length} nearby vectors`);

    console.log('✅ Testing count...');
    const count = await db.count();
    console.log(`   Total vectors: ${count}`);

    console.log('✅ Testing delete...');
    await db.delete(id1);
    const newCount = await db.count();
    console.log(`   Vectors after delete: ${newCount}`);

    console.log('✅ Saving and closing...');
    await db.save();
    await db.close();

    // Cleanup
    fs.rmSync(testDir, { recursive: true });

    console.log('\n🎉 Package validation successful! Ready for NPM release.');
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

validatePackage();