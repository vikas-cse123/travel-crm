import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { queriesService } from './queries.service.js';

function auth(req: Request) {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
function context(req: Request) {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export const queriesController = {
  async list(req: Request, res: Response) {
    sendSuccess(res, await queriesService.list(auth(req), req.query));
  },
  async analytics(req: Request, res: Response) {
    sendSuccess(res, await queriesService.analytics(auth(req)));
  },
  async lookups(req: Request, res: Response) {
    sendSuccess(res, await queriesService.lookups(auth(req)));
  },
  async phone(req: Request, res: Response) {
    sendSuccess(res, await queriesService.searchByPhone(auth(req), String(req.query.phone)));
  },
  async details(req: Request, res: Response) {
    sendSuccess(res, await queriesService.details(auth(req), req.params.queryId!));
  },
  async workspace(req: Request, res: Response) {
    sendSuccess(res, await queriesService.workspace(auth(req), req.params.queryId!));
  },
  async create(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.create(auth(req), req.body, context(req)),
      'Lead created.',
      201,
    );
  },
  async update(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.update(auth(req), req.params.queryId!, req.body, context(req)),
      'Lead updated.',
    );
  },
  async archive(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.archive(auth(req), req.params.queryId!, context(req)),
      'Lead archived.',
    );
  },
  async stage(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.changeStage(auth(req), req.params.queryId!, req.body, context(req)),
      'Lead stage updated.',
    );
  },
  async assignment(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.assign(auth(req), req.params.queryId!, req.body, context(req)),
      'Lead assigned.',
    );
  },
  async notes(req: Request, res: Response) {
    sendSuccess(res, await queriesService.notes(auth(req), req.params.queryId!));
  },
  async addNote(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.addNote(auth(req), req.params.queryId!, req.body, context(req)),
      'Note added.',
      201,
    );
  },
  async updateNote(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.updateNote(
        auth(req),
        req.params.queryId!,
        req.params.noteId!,
        req.body,
        context(req),
      ),
      'Note updated.',
    );
  },
  async deleteNote(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.deleteNote(
        auth(req),
        req.params.queryId!,
        req.params.noteId!,
        context(req),
      ),
      'Note deleted.',
    );
  },
  async followUps(req: Request, res: Response) {
    sendSuccess(res, await queriesService.followUps(auth(req), req.params.queryId!));
  },
  async addFollowUp(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.addFollowUp(auth(req), req.params.queryId!, req.body, context(req)),
      'Follow-up scheduled.',
      201,
    );
  },
  async updateFollowUp(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.updateFollowUp(
        auth(req),
        req.params.queryId!,
        req.params.followUpId!,
        req.body,
        context(req),
      ),
      'Follow-up updated.',
    );
  },
  async completeFollowUp(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.closeFollowUp(
        auth(req),
        req.params.queryId!,
        req.params.followUpId!,
        'COMPLETED',
        req.body,
        context(req),
      ),
      'Follow-up completed.',
    );
  },
  async cancelFollowUp(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.closeFollowUp(
        auth(req),
        req.params.queryId!,
        req.params.followUpId!,
        'CANCELLED',
        req.body,
        context(req),
      ),
      'Follow-up cancelled.',
    );
  },
  async deleteFollowUp(req: Request, res: Response) {
    sendSuccess(
      res,
      await queriesService.deleteFollowUp(
        auth(req),
        req.params.queryId!,
        req.params.followUpId!,
        context(req),
      ),
      'Follow-up deleted.',
    );
  },
  async timeline(req: Request, res: Response) {
    sendSuccess(res, await queriesService.timeline(auth(req), req.params.queryId!, req.query));
  },
};
