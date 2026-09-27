// Minimal in-process queue so a registration submission returns to the
// attendee instantly, while WhatsApp sends happen asynchronously right
// after. This keeps the exact same call shape as a real queue library,
// so swapping in BullMQ + Redis later is a small, contained change —
// only this file needs to be replaced, not the routes that use it.
//
// In production, replace this with BullMQ: each enqueue() becomes
// `queue.add('job', payload)`, and a separate worker process consumes
// jobs — that's what lets check-in-day traffic bursts get buffered
// instead of overwhelming the WhatsApp senders directly.

const jobs = [];
let processing = false;

function enqueue(task) {
  jobs.push(task);
  processNext();
}

async function processNext() {
  if (processing) return;
  processing = true;
  while (jobs.length) {
    const task = jobs.shift();
    try {
      await task();
    } catch (err) {
      console.error('[queue] job failed:', err.message);
    }
  }
  processing = false;
}

module.exports = { enqueue };
