// Vercel gives every request its own short-lived instance, so there is nothing
// to listen on: the Express app is itself the handler. vercel.json points the
// whole /api/* tree at this one function, so routing stays in app.ts and is the
// same code scripts/serve.ts runs locally.
export { app as default } from '../src/api/app.js';
