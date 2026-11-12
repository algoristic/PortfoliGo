import {
  ScheduledTask,
  SchedulerState,
  TASK_ORDER,
  TaskKind,
  TaskSpec,
} from './models/scheduled-task.model';

// Scheduler of the engine (TS §3.8, §8.1): a binary min-heap in plain arrays, so that it is part
// of the snapshot. Order: tick, then the fixed rank of the kind, then the insertion sequence.

const RANKS: Readonly<Record<TaskKind, number>> = Object.fromEntries(
  TASK_ORDER.map((kind, rank) => [kind, rank]),
) as Record<TaskKind, number>;

export function createScheduler(): SchedulerState {
  return { heap: [], nextSeq: 0 };
}

export function copyScheduler(scheduler: Readonly<SchedulerState>): SchedulerState {
  // Tasks are never changed after scheduling, so the copy shares them.
  return { heap: scheduler.heap.slice(), nextSeq: scheduler.nextSeq };
}

/** Negative when `a` runs before `b`. */
export function compareTasks(a: ScheduledTask, b: ScheduledTask): number {
  return a.tick - b.tick || RANKS[a.kind] - RANKS[b.kind] || a.seq - b.seq;
}

export function scheduleTask(
  scheduler: SchedulerState,
  tick: number,
  spec: TaskSpec,
): ScheduledTask {
  const task: ScheduledTask = { ...spec, tick, seq: scheduler.nextSeq };
  scheduler.nextSeq++;
  const { heap } = scheduler;
  heap.push(task);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (compareTasks(heap[parent], task) <= 0) {
      break;
    }
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = task;
  return task;
}

export function peekTask(scheduler: Readonly<SchedulerState>): ScheduledTask | undefined {
  return scheduler.heap[0];
}

export function popTask(scheduler: SchedulerState): ScheduledTask | undefined {
  const { heap } = scheduler;
  const first = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || last === undefined) {
    return first;
  }
  let i = 0;
  for (;;) {
    const left = 2 * i + 1;
    if (left >= heap.length) {
      break;
    }
    const right = left + 1;
    const child = right < heap.length && compareTasks(heap[right], heap[left]) < 0 ? right : left;
    if (compareTasks(last, heap[child]) <= 0) {
      break;
    }
    heap[i] = heap[child];
    i = child;
  }
  heap[i] = last;
  return first;
}
