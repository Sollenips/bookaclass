// A class is full when its own record says there are no places left (capacity = 0).
// This is read from the class record itself, never guessed from the school's schedule text.
export const isClassFull = (cls: { capacity?: number | string | null }): boolean =>
  cls.capacity != null && Number(cls.capacity) <= 0;

// PostgreSQL's integer column is required. Its maximum value represents unlimited places.
export const UNLIMITED_CAPACITY = 2_147_483_647;
export const isUnlimitedCapacity = (capacity: number | string) => Number(capacity) === UNLIMITED_CAPACITY;
export const isUnlimitedAvailability = (value: string) =>
  /^(?:unlimited|απεριόριστες)$/iu.test(value.trim()) || isUnlimitedCapacity(value);
