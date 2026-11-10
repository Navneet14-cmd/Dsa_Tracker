/**
 * Small, hand-checked LeetCode catalog used only by mock mode (no API key),
 * so offline recommendations are still real problems and respect the
 * "already solved" filter. Keyed by seeded pattern name.
 */
export interface CatalogProblem {
  number: number;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

const p = (number: number, title: string, difficulty: CatalogProblem['difficulty']): CatalogProblem => ({
  number,
  title,
  difficulty,
});

export const CATALOG: Record<string, CatalogProblem[]> = {
  'Two Pointer': [p(125, 'Valid Palindrome', 'EASY'), p(167, 'Two Sum II - Input Array Is Sorted', 'MEDIUM'), p(15, '3Sum', 'MEDIUM'), p(11, 'Container With Most Water', 'MEDIUM'), p(42, 'Trapping Rain Water', 'HARD')],
  'Sliding Window': [p(3, 'Longest Substring Without Repeating Characters', 'MEDIUM'), p(424, 'Longest Repeating Character Replacement', 'MEDIUM'), p(567, 'Permutation in String', 'MEDIUM'), p(76, 'Minimum Window Substring', 'HARD'), p(239, 'Sliding Window Maximum', 'HARD')],
  'Hash Map': [p(1, 'Two Sum', 'EASY'), p(242, 'Valid Anagram', 'EASY'), p(49, 'Group Anagrams', 'MEDIUM'), p(128, 'Longest Consecutive Sequence', 'MEDIUM')],
  'Binary Search': [p(704, 'Binary Search', 'EASY'), p(153, 'Find Minimum in Rotated Sorted Array', 'MEDIUM'), p(33, 'Search in Rotated Sorted Array', 'MEDIUM'), p(875, 'Koko Eating Bananas', 'MEDIUM'), p(4, 'Median of Two Sorted Arrays', 'HARD')],
  Backtracking: [p(78, 'Subsets', 'MEDIUM'), p(46, 'Permutations', 'MEDIUM'), p(39, 'Combination Sum', 'MEDIUM'), p(79, 'Word Search', 'MEDIUM'), p(51, 'N-Queens', 'HARD')],
  Greedy: [p(55, 'Jump Game', 'MEDIUM'), p(45, 'Jump Game II', 'MEDIUM'), p(134, 'Gas Station', 'MEDIUM'), p(763, 'Partition Labels', 'MEDIUM')],
  Trie: [p(208, 'Implement Trie (Prefix Tree)', 'MEDIUM'), p(211, 'Design Add and Search Words Data Structure', 'MEDIUM'), p(212, 'Word Search II', 'HARD')],
  'Union Find': [p(547, 'Number of Provinces', 'MEDIUM'), p(684, 'Redundant Connection', 'MEDIUM'), p(1319, 'Number of Operations to Make Network Connected', 'MEDIUM')],
  'Prefix Sum': [p(303, 'Range Sum Query - Immutable', 'EASY'), p(238, 'Product of Array Except Self', 'MEDIUM'), p(560, 'Subarray Sum Equals K', 'MEDIUM')],
  'Monotonic Stack': [p(496, 'Next Greater Element I', 'EASY'), p(739, 'Daily Temperatures', 'MEDIUM'), p(84, 'Largest Rectangle in Histogram', 'HARD')],
  'Fast/Slow Pointers': [p(141, 'Linked List Cycle', 'EASY'), p(876, 'Middle of the Linked List', 'EASY'), p(142, 'Linked List Cycle II', 'MEDIUM'), p(287, 'Find the Duplicate Number', 'MEDIUM')],
  BFS: [p(994, 'Rotting Oranges', 'MEDIUM'), p(200, 'Number of Islands', 'MEDIUM'), p(127, 'Word Ladder', 'HARD')],
  DFS: [p(200, 'Number of Islands', 'MEDIUM'), p(133, 'Clone Graph', 'MEDIUM'), p(695, 'Max Area of Island', 'MEDIUM')],
  'Topological Sort': [p(207, 'Course Schedule', 'MEDIUM'), p(210, 'Course Schedule II', 'MEDIUM')],
  Dijkstra: [p(743, 'Network Delay Time', 'MEDIUM'), p(1631, 'Path With Minimum Effort', 'MEDIUM')],
  'Top-K/Heap': [p(215, 'Kth Largest Element in an Array', 'MEDIUM'), p(347, 'Top K Frequent Elements', 'MEDIUM'), p(973, 'K Closest Points to Origin', 'MEDIUM'), p(23, 'Merge k Sorted Lists', 'HARD')],
  'Merge Intervals': [p(56, 'Merge Intervals', 'MEDIUM'), p(57, 'Insert Interval', 'MEDIUM'), p(435, 'Non-overlapping Intervals', 'MEDIUM')],
  'Cyclic Sort': [p(268, 'Missing Number', 'EASY'), p(448, 'Find All Numbers Disappeared in an Array', 'EASY'), p(41, 'First Missing Positive', 'HARD')],
  '1D DP': [p(70, 'Climbing Stairs', 'EASY'), p(198, 'House Robber', 'MEDIUM'), p(322, 'Coin Change', 'MEDIUM'), p(300, 'Longest Increasing Subsequence', 'MEDIUM')],
  '2D DP': [p(62, 'Unique Paths', 'MEDIUM'), p(1143, 'Longest Common Subsequence', 'MEDIUM'), p(72, 'Edit Distance', 'MEDIUM')],
  Knapsack: [p(416, 'Partition Equal Subset Sum', 'MEDIUM'), p(494, 'Target Sum', 'MEDIUM'), p(518, 'Coin Change II', 'MEDIUM')],
  Bitmask: [p(136, 'Single Number', 'EASY'), p(191, 'Number of 1 Bits', 'EASY'), p(338, 'Counting Bits', 'EASY')],
};

/** Broad fallback list when nothing pattern-specific is left. */
export const GENERAL: CatalogProblem[] = [
  p(1, 'Two Sum', 'EASY'), p(20, 'Valid Parentheses', 'EASY'), p(206, 'Reverse Linked List', 'EASY'),
  p(121, 'Best Time to Buy and Sell Stock', 'EASY'), p(104, 'Maximum Depth of Binary Tree', 'EASY'),
  p(3, 'Longest Substring Without Repeating Characters', 'MEDIUM'), p(200, 'Number of Islands', 'MEDIUM'),
  p(322, 'Coin Change', 'MEDIUM'), p(56, 'Merge Intervals', 'MEDIUM'), p(146, 'LRU Cache', 'MEDIUM'),
  p(102, 'Binary Tree Level Order Traversal', 'MEDIUM'), p(98, 'Validate Binary Search Tree', 'MEDIUM'),
];
