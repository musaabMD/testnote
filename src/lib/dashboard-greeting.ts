export const LEARNING_QUOTES = [
  {
    text: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
    author: "Mahatma Gandhi",
  },
  {
    text: "An investment in knowledge pays the best interest.",
    author: "Benjamin Franklin",
  },
  {
    text: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.",
    author: "Malcolm X",
  },
  {
    text: "Anyone who stops learning is old, whether at twenty or eighty. Anyone who keeps learning stays young.",
    author: "Henry Ford",
  },
  {
    text: "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.",
    author: "Brian Herbert",
  },
  {
    text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.",
    author: "Dr. Seuss",
  },
  {
    text: "Learning never exhausts the mind.",
    author: "Leonardo da Vinci",
  },
] as const;

export type LearningQuote = (typeof LEARNING_QUOTES)[number];

export function getRandomLearningQuote() {
  return LEARNING_QUOTES[Math.floor(Math.random() * LEARNING_QUOTES.length)];
}

export function getTimeSalutation(hour: number) {
  if (hour < 12) {
    return { salutation: "Good morning", emoji: "☀️" };
  }
  if (hour < 17) {
    return { salutation: "Good afternoon", emoji: "🌤️" };
  }
  return { salutation: "Good evening", emoji: "🌙" };
}
