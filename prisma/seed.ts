/**
 * Idempotent taxonomy seed: upserts topics, patterns and their links.
 * It never deletes anything, so re-running it is safe for existing users'
 * problems, goals and topic/pattern tags (deleting a topic would cascade to
 * them). Renaming an entry here creates a new one; rename existing rows with
 * a migration instead.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The first five names predate this list and are kept as-is so existing
// databases don't end up with "Trees" and "Tree" side by side.
const TOPICS = [
  'Array',
  'Linked List',
  'Trees',
  'Graphs',
  'DP',
  'String',
  'Hash Table',
  'Stack',
  'Queue',
  'Heap',
  'Binary Search Tree',
  'Trie',
  'Intervals',
  'Bit Manipulation',
  'Math',
  'Matrix',
  'Greedy',
  'Sorting',
  'Recursion',
] as const;

type TopicName = (typeof TOPICS)[number];

// pattern -> topics it is commonly used with
const PATTERNS: Record<string, TopicName[]> = {
  // original patterns
  'Two Pointer': ['Array', 'String', 'Linked List', 'Sorting'],
  'Sliding Window': ['Array', 'String', 'Hash Table'],
  'Hash Map': ['Array', 'String', 'Hash Table'],
  'Binary Search': ['Array', 'Binary Search Tree', 'Matrix', 'Math'],
  Backtracking: ['Array', 'String', 'Recursion', 'Matrix'],
  Greedy: ['Array', 'Greedy', 'Intervals', 'Heap', 'Sorting'],
  Trie: ['Trie', 'String', 'Trees'],
  'Union Find': ['Graphs', 'Matrix'],

  // expanded set
  'Prefix Sum': ['Array', 'Hash Table', 'Matrix'],
  'Monotonic Stack': ['Stack', 'Array'],
  'Monotonic Queue': ['Queue', 'Array'],
  'Fast/Slow Pointers': ['Linked List', 'Array', 'Math'],
  'In-place Linked List Reversal': ['Linked List'],
  BFS: ['Graphs', 'Trees', 'Queue', 'Matrix'],
  DFS: ['Graphs', 'Trees', 'Binary Search Tree', 'Matrix', 'Recursion'],
  'Topological Sort': ['Graphs'],
  Dijkstra: ['Graphs', 'Heap'],
  'Top-K/Heap': ['Heap', 'Array', 'Hash Table', 'Sorting'],
  'Two Heaps': ['Heap'],
  'Merge Intervals': ['Intervals', 'Array', 'Sorting'],
  'Cyclic Sort': ['Array', 'Sorting'],
  "Kadane's Algorithm": ['Array', 'DP'],
  '1D DP': ['DP', 'Array', 'String'],
  '2D DP': ['DP', 'String', 'Matrix'],
  Knapsack: ['DP', 'Array'],
  Bitmask: ['Bit Manipulation', 'DP'],
};

async function main() {
  const topicIds = new Map<string, string>();
  for (const name of TOPICS) {
    const topic = await prisma.topic.upsert({ where: { name }, update: {}, create: { name } });
    topicIds.set(name, topic.id);
  }

  let links = 0;
  for (const [name, topics] of Object.entries(PATTERNS)) {
    const pattern = await prisma.pattern.upsert({ where: { name }, update: {}, create: { name } });
    for (const topicName of topics) {
      const topicId = topicIds.get(topicName)!;
      await prisma.patternTopic.upsert({
        where: { topicId_patternId: { topicId, patternId: pattern.id } },
        update: {},
        create: { topicId, patternId: pattern.id },
      });
      links++;
    }
  }

  console.log(`Taxonomy seeded: ${TOPICS.length} topics, ${Object.keys(PATTERNS).length} patterns, ${links} links.`);
}

main()
  .catch((e) => {
    console.error('Error seeding taxonomy:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
