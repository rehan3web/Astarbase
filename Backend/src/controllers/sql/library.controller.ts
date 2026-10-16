import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Services } from '../../services/index.js';

export function sqlLibraryController(services: Services) {
  const library = services.catalog.store.sqlLibrary;
  const id = (req: Request) => z.uuid().parse(req.params.id);
  return {
    list(_req: Request, res: Response) { res.json(library.list()); },
    createFolder(req: Request, res: Response) { res.status(201).json(library.createFolder(req.body)); },
    updateFolder(req: Request, res: Response) { res.json(library.updateFolder(id(req), req.body)); },
    deleteFolder(req: Request, res: Response) { res.json(library.deleteFolder(id(req))); },
    createSnippet(req: Request, res: Response) { res.status(201).json(library.createSnippet(req.body)); },
    updateSnippet(req: Request, res: Response) { res.json(library.updateSnippet(id(req), req.body)); },
    deleteSnippet(req: Request, res: Response) { res.json(library.deleteSnippet(id(req))); },
  };
}
