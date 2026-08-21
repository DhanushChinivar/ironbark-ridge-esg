import { app } from '../api/app.js';
import { env } from '../env.js';

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});
