import { Router } from 'express';
import type { Services } from '../../services/index.js';
import { sqlController } from '../../controllers/sql/sql.controller.js';
import { sqlLibraryController } from '../../controllers/sql/library.controller.js';

export function sqlRoutes(services: Services) {
  const router = Router();
  const library = sqlLibraryController(services);
  router.get('/library', library.list);
  router.post('/folders', library.createFolder);
  router.patch('/folders/:id', library.updateFolder);
  router.delete('/folders/:id', library.deleteFolder);
  router.post('/snippets', library.createSnippet);
  router.patch('/snippets/:id', library.updateSnippet);
  router.delete('/snippets/:id', library.deleteSnippet);
  router.post('/', sqlController(services).execute);
  return router;
}
