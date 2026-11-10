/**
 * Seeded taxonomy, shared by prisma/seed.ts and the curated problem dataset
 * (tests check every dataset entry only uses names from here).
 */

// The first five names predate this list and are kept as-is so existing
// databases don't end up with "Trees" and "Tree" side by side.
export const TOPICS = [
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

export type TopicName = (typeof TOPICS)[number];

// pattern -> topics it is commonly used with
export const PATTERNS = {
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
} satisfies Record<string, TopicName[]>;

export type PatternName = keyof typeof PATTERNS;
export const PATTERN_NAMES = Object.keys(PATTERNS) as PatternName[];
