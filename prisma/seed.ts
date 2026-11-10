/**
 * Idempotent taxonomy seed: upserts topics, patterns and their links.
 * It never deletes anything, so re-running it is safe for existing users'
 * problems, goals and topic/pattern tags (deleting a topic would cascade to
 * them). Renaming an entry here creates a new one; rename existing rows with
 * a migration instead.
 */
import { PrismaClient } from '@prisma/client';
import { PATTERNS, TOPICS } from '../src/data/taxonomy';

const prisma = new PrismaClient();

async function main() {
  const topicIds = new Map<string, string>();
  for (const name of TOPICS) {
    const topic = await prisma.topic.upsert({ where: { name }, update: {}, create: { name } });
    topicIds.set(name, topic.id);
  }

  let links = 0;
  for (const [name, topics] of Object.entries(PATTERNS) as [string, readonly string[]][]) {
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
