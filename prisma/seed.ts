import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing taxonomy database...');
  // Delete in dependency order to prevent foreign key constraint issues
  await prisma.patternTopic.deleteMany({});
  await prisma.pattern.deleteMany({});
  await prisma.topic.deleteMany({});

  console.log('Seeding topics...');
  const topicsData = [
    { name: 'Array' },
    { name: 'Linked List' },
    { name: 'Trees' },
    { name: 'Graphs' },
    { name: 'DP' },
  ];

  const topics: Record<string, any> = {};
  for (const t of topicsData) {
    const created = await prisma.topic.create({
      data: t,
    });
    topics[created.name] = created;
  }

  console.log('Seeding patterns...');
  const patternsData = [
    { name: 'Backtracking' },
    { name: 'Greedy' },
    { name: 'Binary Search' },
    { name: 'Two Pointer' },
    { name: 'Sliding Window' },
    { name: 'Hash Map' },
    { name: 'Trie' },
    { name: 'Union Find' },
  ];

  const patterns: Record<string, any> = {};
  for (const p of patternsData) {
    const created = await prisma.pattern.create({
      data: p,
    });
    patterns[created.name] = created;
  }

  console.log('Creating topic-pattern relationships...');
  const relations = [
    // Two Pointer -> Array, Linked List
    { pattern: 'Two Pointer', topic: 'Array' },
    { pattern: 'Two Pointer', topic: 'Linked List' },

    // Sliding Window -> Array, Linked List
    { pattern: 'Sliding Window', topic: 'Array' },
    { pattern: 'Sliding Window', topic: 'Linked List' },

    // Backtracking -> Trees, Graphs, DP
    { pattern: 'Backtracking', topic: 'Trees' },
    { pattern: 'Backtracking', topic: 'Graphs' },
    { pattern: 'Backtracking', topic: 'DP' },

    // Greedy -> Array, Graphs
    { pattern: 'Greedy', topic: 'Array' },
    { pattern: 'Greedy', topic: 'Graphs' },

    // Binary Search -> Array
    { pattern: 'Binary Search', topic: 'Array' },

    // Hash Map -> Array, Linked List
    { pattern: 'Hash Map', topic: 'Array' },
    { pattern: 'Hash Map', topic: 'Linked List' },

    // Trie -> Trees
    { pattern: 'Trie', topic: 'Trees' },

    // Union Find -> Graphs
    { pattern: 'Union Find', topic: 'Graphs' },
  ];

  for (const rel of relations) {
    const topic = topics[rel.topic];
    const pattern = patterns[rel.pattern];
    
    if (topic && pattern) {
      await prisma.patternTopic.create({
        data: {
          topicId: topic.id,
          patternId: pattern.id,
        },
      });
    }
  }

  console.log('Taxonomy seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding taxonomy:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
